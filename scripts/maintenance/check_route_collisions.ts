import fs from 'node:fs';
import path from 'node:path';

/**
 * WealthOS Route Collision & Integrity Checker
 * Analyzes route definitions across server.ts and src/server/routes/*.ts
 * Detects duplicate (METHOD, PATH) registrations and potential shadowing.
 */

export interface RouteOccurrence {
  sourceFile: string;
  lineNumber: number;
  rawPath: string;
  routerVar?: string;
}

export interface RouteCollision {
  method: string;
  fullPath: string;
  occurrences: RouteOccurrence[];
}

export interface RouteCheckResult {
  totalRoutes: number;
  uniqueEndpoints: number;
  collisionCount: number;
  collisions: RouteCollision[];
  routes: Array<{
    method: string;
    fullPath: string;
    sourceFile: string;
    lineNumber: number;
  }>;
}

interface RouterMount {
  routerVar: string;
  prefix: string;
  lineNumber: number;
}

/**
 * Normalizes an Express route path by stripping trailing slashes and ensuring leading slash.
 */
export function normalizePath(p: string): string {
  let clean = p.trim();
  if (!clean.startsWith('/')) clean = '/' + clean;
  clean = clean.replace(/\/+/g, '/');
  if (clean.length > 1 && clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

/**
 * Scans server.ts and src/server/routes/*.ts for route definitions and collisions.
 */
export function checkRouteCollisions(rootDir = process.cwd()): RouteCheckResult {
  const serverTsPath = path.resolve(rootDir, 'server.ts');
  const routesDir = path.resolve(rootDir, 'src/server/routes');

  const allRoutes: Array<{
    method: string;
    fullPath: string;
    sourceFile: string;
    lineNumber: number;
    rawPath: string;
    routerVar?: string;
  }> = [];

  // 1. Parse server.ts for direct routes and router imports/mounts
  if (fs.existsSync(serverTsPath)) {
    const serverContent = fs.readFileSync(serverTsPath, 'utf8');
    const serverLines = serverContent.split('\n');

    // Extract imports of routers (e.g. import portfoliosRouter from './src/server/routes/portfolios.js';)
    const routerVarToFile = new Map<string, string>();
    const importRegex = /import\s+(?:\{?\s*([a-zA-Z0-9_]+)\s*\}?|([a-zA-Z0-9_]+))\s+from\s+['"]\.\/src\/server\/routes\/([a-zA-Z0-9_]+)(?:\.js)?['"]/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(serverContent)) !== null) {
      const varName = match[1] || match[2];
      const filename = match[3];
      routerVarToFile.set(varName, filename);
    }

    // Extract app.use mounts (e.g. app.use('/api/portfolios', portfoliosRouter);)
    const mountsByRouterVar = new Map<string, RouterMount[]>();
    const mountRegex = /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*([a-zA-Z0-9_]+)\s*\)/;

    serverLines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const m = mountRegex.exec(line);
      if (m) {
        const prefix = m[1];
        const rVar = m[2];
        const current = mountsByRouterVar.get(rVar) || [];
        current.push({ routerVar: rVar, prefix, lineNumber: lineNum });
        mountsByRouterVar.set(rVar, current);
      }

      // Also detect direct routes on app in server.ts (e.g. app.get('/api/...', ...))
      const appRouteMatch = /app\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/i.exec(line);
      if (appRouteMatch) {
        const method = appRouteMatch[1].toUpperCase();
        const rawPath = appRouteMatch[2];
        allRoutes.push({
          method,
          fullPath: normalizePath(rawPath),
          sourceFile: 'server.ts',
          lineNumber: lineNum,
          rawPath
        });
      }
    });

    // 2. Parse individual router files in src/server/routes/
    if (fs.existsSync(routesDir)) {
      const routerFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));

      for (const rFile of routerFiles) {
        const fullRPath = path.join(routesDir, rFile);
        const rContent = fs.readFileSync(fullRPath, 'utf8');
        const rLines = rContent.split('\n');
        const baseName = rFile.replace(/\.ts$/, '');

        // Find which mounts point to this router
        let matchingMounts: RouterMount[] = [];
        for (const [rVar, fileName] of routerVarToFile.entries()) {
          if (fileName === baseName) {
            const mounts = mountsByRouterVar.get(rVar);
            if (mounts) {
              matchingMounts.push(...mounts);
            }
          }
        }

        // If no direct import found in server.ts, fallback to prefix from filename
        if (matchingMounts.length === 0) {
          // Check common naming or default /api/<baseName>
          matchingMounts = [{ routerVar: baseName, prefix: `/api/${baseName}`, lineNumber: 0 }];
        }

        rLines.forEach((line, idx) => {
          const lineNum = idx + 1;
          const routeMatch = /(?:router|app)\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/i.exec(line);
          if (routeMatch) {
            const method = routeMatch[1].toUpperCase();
            const subPath = routeMatch[2];

            for (const mount of matchingMounts) {
              const combinedPath = normalizePath(mount.prefix + '/' + subPath);
              allRoutes.push({
                method,
                fullPath: combinedPath,
                sourceFile: path.relative(rootDir, fullRPath).replace(/\\/g, '/'),
                lineNumber: lineNum,
                rawPath: subPath,
                routerVar: mount.routerVar
              });
            }
          }
        });
      }
    }
  }

  // 3. Aggregate and detect duplicate (method, fullPath) pairs
  const endpointMap = new Map<string, RouteOccurrence[]>();

  for (const r of allRoutes) {
    const key = `${r.method} ${r.fullPath}`;
    const occurrences = endpointMap.get(key) || [];
    occurrences.push({
      sourceFile: r.sourceFile,
      lineNumber: r.lineNumber,
      rawPath: r.rawPath,
      routerVar: r.routerVar
    });
    endpointMap.set(key, occurrences);
  }

  const collisions: RouteCollision[] = [];
  for (const [endpointKey, occurrences] of endpointMap.entries()) {
    if (occurrences.length > 1) {
      const [method, ...pathParts] = endpointKey.split(' ');
      collisions.push({
        method,
        fullPath: pathParts.join(' '),
        occurrences
      });
    }
  }

  return {
    totalRoutes: allRoutes.length,
    uniqueEndpoints: endpointMap.size,
    collisionCount: collisions.length,
    collisions,
    routes: allRoutes.map((r) => ({
      method: r.method,
      fullPath: r.fullPath,
      sourceFile: r.sourceFile,
      lineNumber: r.lineNumber
    }))
  };
}

// CLI Execution
if (process.argv[1] && (process.argv[1].endsWith('check_route_collisions.ts') || process.argv[1].endsWith('check_route_collisions.cjs'))) {
  console.log('=== WealthOS Route Collision & Integrity Audit ===\n');
  const result = checkRouteCollisions();

  console.log(`Total Registered Route Declarations: ${result.totalRoutes}`);
  console.log(`Unique Canonical Endpoints:         ${result.uniqueEndpoints}`);
  console.log(`Detected Collision Points:           ${result.collisionCount}\n`);

  if (result.collisionCount > 0) {
    console.warn('⚠️  ROUTE COLLISIONS DETECTED:\n');
    result.collisions.forEach((col, idx) => {
      console.warn(`[${idx + 1}] ${col.method} ${col.fullPath}`);
      col.occurrences.forEach((occ) => {
        console.warn(`    - ${occ.sourceFile}:${occ.lineNumber} (raw: "${occ.rawPath}")`);
      });
      console.warn('');
    });
    throw new Error(`Route collision check failed: Found ${result.collisionCount} unresolved route collision(s).`);
  } else {
    console.log('✅ No route collisions detected! All endpoint declarations are distinct and safe.');
    process.exit(0);
  }
}
