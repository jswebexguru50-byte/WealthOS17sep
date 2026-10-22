# WealthOS Universal MCP — Resources Reference Catalog
**Version:** 2.0.0

---

## Static & Dynamic Resources

WealthOS Universal MCP exposes stable read-only URIs conforming to the standard Model Context Protocol Resource specifications:

### 1. Requirements Registry Resource
- **URI:** `wealthos://requirements`
- **MIME Type:** `application/json`
- **Description:** Ground-truth registry of all formal WealthOS product requirements, acceptance criteria, test mappings, and compliance rules.
- **Classification:** `USER_SPECIFIED`, `REPOSITORY_DOCUMENTED`, `IMPLEMENTATION_CONTRACT`.

### 2. Active Portfolios Resource
- **URI:** `wealthos://portfolios`
- **MIME Type:** `application/json`
- **Description:** Live listing of all family office and investor portfolios registered in WealthOS.

### 3. Canonical Security Profile (Template)
- **URI Pattern:** `wealthos://security/{symbol}`
- **MIME Type:** `application/json`
- **Description:** Direct canonical identity metadata, ISIN, company name, listing exchange, and sector classification for any security.

### 4. Company Intelligence Dossier (Template)
- **URI Pattern:** `wealthos://company/{symbol}/intelligence`
- **MIME Type:** `application/json`
- **Description:** Point-in-time multi-module research dossier (fundamentals, QGLP, management commitments, and valuation).

### 5. Development Session Trace (Template)
- **URI Pattern:** `wealthos://development/{sessionId}`
- **MIME Type:** `application/json`
- **Description:** Complete audit record of developer actions, baseline commit, modified files, diff summary, and remediation history.
