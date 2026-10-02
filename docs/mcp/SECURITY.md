# WealthOS Universal MCP — Security Architecture & Boundaries
**Master Developer Specification — Section AN, AO**

---

## 1. Zero-Trust Security Invariants

The Universal MCP Control Plane enforces strict security guarantees to protect repository integrity, confidential financial data, and credentials:

1. **NO Arbitrary Code Execution:** The MCP server does not expose `eval`, `shell_exec`, `child_process.exec` with arbitrary arguments, or remote code runners.
2. **NO Arbitrary SQL Execution:** All database queries are strictly parameterized and routed through production repositories and services (`better-sqlite3` and `database.ts`).
3. **NO Arbitrary Filesystem Mutation:** File reads are bounded and strictly sandboxed to the repository root. Path traversal (`../`, absolute paths outside workspace) is actively rejected.
4. **NO Force Pushes or Destructive Git Operations:** Git operations exposed through the repository review plane are strictly read-only (`git status`, `git log`, `git diff`).
5. **Automatic Secret Redaction:** All output streams (diffs, logs, file inspections) pass through regex sanitization filters removing passwords, tokens, API keys, and private keys (`.env`, `APP_PASSWORD`, `API_KEY`, `Bearer`, `ghp_`).
6. **Mutation Annotations & Guardrails:** Mutation tools (`add_transaction`, `create_development_session`, `submit_remediation_request`) explicitly declare `readOnly: false` and describe side effects.

---

## 2. Path Traversal & File Protection

```typescript
// Enforced in src/mcp/security.ts
export function validateSafeRepoPath(requestedPath: string): string {
  const normalized = path.normalize(requestedPath).replace(/^[/\\]+/, '');
  const resolved = path.resolve(REPO_ROOT, normalized);

  if (!resolved.startsWith(REPO_ROOT)) {
    throw new Error('SECURITY_VIOLATION: Path traversal detected.');
  }

  const forbidden = ['.env', 'credentials', 'id_rsa', 'private.key'];
  if (forbidden.some(f => path.basename(resolved).toLowerCase().includes(f))) {
    throw new Error('SECURITY_VIOLATION: Access to sensitive file is forbidden.');
  }

  return resolved;
}
```

---

## 3. Sandboxed Allowlisted Test Execution

Testing tools can only execute pre-approved test suites:
- `unit` -> `npx vitest run tests/unit`
- `integration` -> `npx vitest run tests/integration`
- `strategies` -> `npx vitest run tests/unit/seven_strategies_candidates.test.ts`
- `xirr` -> `npx vitest run tests/unit/xirr.test.ts`
- `verification` -> `npx tsx scripts/readiness/independent_verification/run_product_verification.ts`

Any attempt to run unapproved commands will result in an immediate `UNKNOWN_SUITE` error.
