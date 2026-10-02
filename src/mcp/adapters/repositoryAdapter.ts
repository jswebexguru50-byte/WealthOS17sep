/**
 * Repository Review Plane Adapter
 * Master Developer Specification — Section Y
 *
 * Implements read-only, sandboxed inspection of the git repository, commits, diffs,
 * and source code with automatic secret redaction and path-traversal prevention.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import { validateSafeRepoPath, redactSecrets } from '../security.js';

export class RepositoryAdapter {
  private static runGit(cmd: string): string {
    try {
      const out = execSync(`git ${cmd}`, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });
      return out.trim();
    } catch (err: any) {
      return `GIT_ERROR: ${err.message || String(err)}`;
    }
  }

  static getStatus() {
    const branch = this.runGit('branch --show-current');
    const commit = this.runGit('rev-parse HEAD');
    const rawStatus = this.runGit('status -s');

    const lines = rawStatus ? rawStatus.split('\n') : [];
    const modifiedFiles: string[] = [];
    const untrackedFiles: string[] = [];

    for (const l of lines) {
      const code = l.slice(0, 2);
      const file = l.slice(3).trim();
      if (code === '??') {
        untrackedFiles.push(file);
      } else {
        modifiedFiles.push(file);
      }
    }

    return {
      branch,
      commit,
      isClean: lines.length === 0,
      modifiedCount: modifiedFiles.length,
      untrackedCount: untrackedFiles.length,
      modifiedFiles: modifiedFiles.slice(0, 50),
      untrackedFiles: untrackedFiles.slice(0, 50),
    };
  }

  static getCommitHistory(limit: number = 10) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const logOut = this.runGit(`log -n ${safeLimit} --pretty=format:"%H|%an|%ad|%s" --date=iso`);
    if (!logOut || logOut.startsWith('GIT_ERROR')) return [];

    return logOut.split('\n').map(l => {
      const [hash, author, date, message] = l.split('|');
      return { hash, author, date, message };
    });
  }

  static getFileDiff(filePath?: string) {
    let cmd = 'diff';
    if (filePath) {
      const safePath = validateSafeRepoPath(filePath);
      const relative = safePath.replace(process.cwd(), '').replace(/^[/\\]+/, '');
      cmd += ` -- "${relative}"`;
    }
    const rawDiff = this.runGit(cmd);
    return redactSecrets(rawDiff);
  }

  static inspectSourceFile(filePath: string, startLine?: number, endLine?: number) {
    const safePath = validateSafeRepoPath(filePath);
    if (!fs.existsSync(safePath)) {
      throw new Error(`FILE_NOT_FOUND: ${filePath} does not exist.`);
    }

    const content = fs.readFileSync(safePath, 'utf-8');
    const lines = content.split('\n');

    const start = Math.max(1, startLine || 1);
    const end = Math.min(lines.length, endLine || lines.length);

    if (start > end) {
      throw new Error(`INVALID_RANGE: startLine ${start} > endLine ${end}`);
    }

    const sliced = lines.slice(start - 1, end).join('\n');
    return {
      filePath,
      totalLines: lines.length,
      startLine: start,
      endLine: end,
      content: redactSecrets(sliced)
    };
  }

  static searchSource(query: string, filePattern?: string) {
    if (!query || query.trim().length < 2) {
      throw new Error('INVALID_QUERY: Search term must be at least 2 characters.');
    }
    // Clean query of dangerous characters for git grep
    const sanitized = query.replace(/["$`\\]/g, '');
    let gitCmd = `grep -n -I -i --max-count=50 -e "${sanitized}"`;
    if (filePattern) {
      // Validate pattern does not target forbidden directories
      if (filePattern.includes('node_modules') || filePattern.includes('.git') || filePattern.includes('.env')) {
        throw new Error('SECURITY_VIOLATION: Search in forbidden directory.');
      }
      gitCmd += ` -- "${filePattern}"`;
    }
    const rawMatches = this.runGit(gitCmd);
    if (!rawMatches || rawMatches.startsWith('GIT_ERROR')) {
      return { query, count: 0, matches: [] };
    }

    const lines = rawMatches.split('\n').filter(Boolean);
    const matches = lines.slice(0, 50).map(line => {
      const parts = line.split(':');
      const file = parts[0];
      const lineNum = parseInt(parts[1], 10);
      const text = parts.slice(2).join(':').trim();
      return { file, line: isNaN(lineNum) ? 0 : lineNum, snippet: redactSecrets(text) };
    });

    return {
      query,
      count: matches.length,
      matches
    };
  }

  static runTypecheck() {
    const start = Date.now();
    try {
      execSync('npx tsc --noEmit', {
        cwd: process.cwd(),
        encoding: 'utf-8',
        maxBuffer: 5 * 1024 * 1024
      });
      return {
        passed: true,
        durationMs: Date.now() - start,
        errors: []
      };
    } catch (err: any) {
      const output = err.stdout || err.stderr || err.message;
      const errorLines = String(output).split('\n').filter(l => l.includes('error TS')).slice(0, 20);
      return {
        passed: false,
        durationMs: Date.now() - start,
        errorCount: errorLines.length,
        errors: errorLines
      };
    }
  }

  static runBuild() {
    const start = Date.now();
    try {
      const out = execSync('npm run build', {
        cwd: process.cwd(),
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
      });
      return {
        passed: true,
        durationMs: Date.now() - start,
        outputSummary: out.split('\n').slice(-5).join('\n')
      };
    } catch (err: any) {
      return {
        passed: false,
        durationMs: Date.now() - start,
        error: redactSecrets(err.message || String(err))
      };
    }
  }

  static async getSystemHealth() {
    const mem = process.memoryUsage();
    const health = {
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      memoryMb: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024)
      },
      devServerStatus: 'UNKNOWN' as string
    };

    try {
      const res = await fetch('http://127.0.0.1:3000/api/health', { signal: AbortSignal.timeout(1000) });
      health.devServerStatus = res.ok ? 'HEALTHY' : `HTTP_${res.status}`;
    } catch {
      health.devServerStatus = 'OFFLINE_OR_UNREACHABLE';
    }

    return health;
  }

  static async runBrowserJourney(journey: string = 'portfolio') {
    const routes: Record<string, string> = {
      portfolio: '/portfolio',
      intelligence: '/stock/TCS',
      opportunity: '/opportunities',
      overview: '/'
    };

    const routePath = routes[journey] || routes.overview;
    const start = Date.now();

    const hosts = ['http://127.0.0.1:3000', 'http://localhost:3000'];
    let lastError: any = null;

    for (const host of hosts) {
      const targetUrl = `${host}${routePath}`;
      try {
        const res = await fetch(targetUrl, { signal: AbortSignal.timeout(8000) });
        return {
          journey,
          targetUrl,
          statusCode: res.status,
          passed: res.ok,
          durationMs: Date.now() - start,
          consoleErrors: [],
          networkErrors: res.ok ? [] : [`HTTP ${res.status} returned by route`]
        };
      } catch (err: any) {
        lastError = err;
      }
    }

    return {
      journey,
      targetUrl: `http://127.0.0.1:3000${routePath}`,
      passed: false,
      durationMs: Date.now() - start,
      consoleErrors: [],
      networkErrors: [`Fetch failed: ${lastError?.message || 'Connection refused'}`]
    };
  }
}
