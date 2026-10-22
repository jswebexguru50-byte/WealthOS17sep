/**
 * WealthOS Universal MCP — Security Boundary & Sandbox
 * Complies with Section AN, AO of Master Developer Specification
 */

import path from 'path';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

(function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
  ];
  for (const envPath of candidates) {
    if (existsSync(envPath)) {
      readFileSync(envPath, 'utf-8').replace(/\r/g, '').split('\n').forEach(line => {
        const m = line.match(/^\s*([^#=][^=]*)=(.*)$/);
        if (m) {
          const key = m[1].trim();
          const val = m[2].trim().replace(/^["']|["']$/g, '');
          process.env[key] = val;
        }
      });
      break;
    }
  }
})();

const REPO_ROOT = process.cwd();

// Secret patterns to redact from all output (logs, diffs, file reads)
const SENSITIVE_PATTERNS = [
  /APP_PASSWORD\s*[:=]\s*["']?([^"'\s]+)["']?/gi,
  /API_KEY\s*[:=]\s*["']?([^"'\s]+)["']?/gi,
  /SECRET\s*[:=]\s*["']?([^"'\s]+)["']?/gi,
  /TOKEN\s*[:=]\s*["']?([^"'\s]+)["']?/gi,
  /PRIVATE_KEY\s*[:=]\s*["']?([^"'\s]+)["']?/gi,
  /Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi,
  /ghp_[A-Za-z0-9_]{36}/gi,
];

// Files and paths strictly forbidden from source inspection
const FORBIDDEN_FILE_PATTERNS = [
  /^\.env/i,
  /\.env\..*/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /credentials/i,
  /tokens/i,
  /secrets/i,
  /private\.key/i,
  /\.pfx$/i,
  /\.keystore$/i,
  /node_modules/i,
  /^\.git[\\/]/i,
  /^\.git$/i,
  /\.db$/i,
  /\.sqlite$/i,
  /\.parquet$/i,
];

/**
 * Validates and normalizes relative file paths, preventing directory traversal.
 * Strictly enforces that all accessed paths stay within the repository root.
 */
export function validateSafeRepoPath(requestedPath: string): string {
  // Reject absolute paths that attempt to escape or Windows drive references outside REPO_ROOT
  const normalized = path.normalize(requestedPath).replace(/^[/\\]+/, '');
  const resolved = path.resolve(REPO_ROOT, normalized);

  if (!resolved.startsWith(REPO_ROOT)) {
    throw new Error(`SECURITY_VIOLATION: Path traversal detected. Access denied outside repository root.`);
  }

  const baseName = path.basename(resolved);
  for (const forbidden of FORBIDDEN_FILE_PATTERNS) {
    if (forbidden.test(baseName) || forbidden.test(normalized)) {
      throw new Error(`SECURITY_VIOLATION: Access to sensitive file '${baseName}' is forbidden.`);
    }
  }

  return resolved;
}

/**
 * Redacts tokens, passwords, and sensitive keys from any string payload.
 */
export function redactSecrets(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let redacted = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, (match, p1) => {
      if (p1) {
        return match.replace(p1, '[REDACTED_SECRET]');
      }
      return '[REDACTED_SECRET]';
    });
  }
  return redacted;
}

/**
 * Bounds pagination and query parameters to safe limits.
 */
export function clampBounds(value: number | undefined, min: number, max: number, defaultVal: number): number {
  if (value === undefined || isNaN(value)) return defaultVal;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

/**
 * Authorization Plane Separation
 * Product MCP credential CANNOT access Dev MCP plane.
 * Dev MCP is higher privilege.
 */
export interface AuthResult {
  authorized: boolean;
  plane?: 'PRODUCT' | 'REVIEW' | 'DEVELOPMENT';
  error?: string;
}

export function validatePlaneAccess(
  requestedPlane: 'PRODUCT' | 'REVIEW' | 'DEVELOPMENT' | 'AUTO',
  authHeader?: string
): AuthResult {
  const productKey = process.env.WEALTHOS_PRODUCT_KEY;
  const reviewKey = process.env.WEALTHOS_REVIEW_KEY;
  const devKey = process.env.WEALTHOS_DEV_KEY;

  // Fail closed if required environment key is not configured
  if (requestedPlane === 'DEVELOPMENT' && !devKey) {
    return {
      authorized: false,
      error: 'SECURITY_FAIL_CLOSED: WEALTHOS_DEV_KEY is not configured in server environment'
    };
  }
  if (requestedPlane === 'REVIEW' && !reviewKey && !devKey) {
    return {
      authorized: false,
      error: 'SECURITY_FAIL_CLOSED: WEALTHOS_REVIEW_KEY is not configured in server environment'
    };
  }
  if (requestedPlane === 'PRODUCT' && !productKey && !reviewKey && !devKey) {
    return {
      authorized: false,
      error: 'SECURITY_FAIL_CLOSED: WEALTHOS_PRODUCT_KEY is not configured in server environment'
    };
  }

  // Extract token from Bearer header
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  // Fail closed on missing token
  if (!token) {
    return { authorized: false, error: 'MISSING_AUTHORIZATION_HEADER' };
  }

  // Auto-detect plane from token if requested
  if (requestedPlane === 'AUTO') {
    if (devKey && token === devKey) return { authorized: true, plane: 'DEVELOPMENT' };
    if (reviewKey && token === reviewKey) return { authorized: true, plane: 'REVIEW' };
    if (productKey && token === productKey) return { authorized: true, plane: 'PRODUCT' };
    return { authorized: false, error: 'INVALID_CREDENTIALS' };
  }

  if (requestedPlane === 'DEVELOPMENT') {
    if (devKey && token === devKey) {
      return { authorized: true, plane: 'DEVELOPMENT' };
    }
    if ((reviewKey && token === reviewKey) || (productKey && token === productKey)) {
      return {
        authorized: false,
        error: 'INSUFFICIENT_PRIVILEGES_FOR_DEV_PLANE: Review/Product credential cannot access Development plane'
      };
    }
    return { authorized: false, error: 'INVALID_CREDENTIALS' };
  }

  if (requestedPlane === 'REVIEW') {
    if (devKey && token === devKey) {
      return { authorized: true, plane: 'DEVELOPMENT' };
    }
    if (reviewKey && token === reviewKey) {
      return { authorized: true, plane: 'REVIEW' };
    }
    if (productKey && token === productKey) {
      return {
        authorized: false,
        error: 'INSUFFICIENT_PRIVILEGES_FOR_REVIEW_PLANE: Product credential cannot access Review plane'
      };
    }
    return { authorized: false, error: 'INVALID_CREDENTIALS' };
  }

  // requestedPlane === 'PRODUCT'
  if (devKey && token === devKey) {
    return { authorized: true, plane: 'DEVELOPMENT' };
  }
  if (reviewKey && token === reviewKey) {
    return { authorized: true, plane: 'REVIEW' };
  }
  if (productKey && token === productKey) {
    return { authorized: true, plane: 'PRODUCT' };
  }

  return { authorized: false, error: 'INVALID_CREDENTIALS' };
}
