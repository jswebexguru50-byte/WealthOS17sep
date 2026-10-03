#!/usr/bin/env tsx
/**
 * scripts/data_quality/run_data_refresh_daemon.ts
 *
 * WealthOS — Simple Deterministic Data Refresh Orchestrator
 *
 * Wrapper/scheduler layer that reuses existing WealthOS acquisition, ingestion,
 * and audit scripts based on data_refresh_schedule.json.
 *
 * Modes:
 *   --plan                 Show what jobs are due/fresh without executing or mutating data
 *   --status               Display current status of all scheduled refresh jobs
 *   --run-due              Execute all currently due jobs sequentially
 *   --run-job <jobName>    Force execution of a specific job (respects active locks)
 *   --dry-run              Simulate execution without spawning child processes
 *   --max-symbols <n>      Pass through symbol ceiling to worker jobs
 *   --batch-size <n>       Pass through batch size to worker jobs
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export type JobRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'SKIPPED_FRESH'
  | 'SKIPPED_LOCKED'
  | 'BLOCKED_AUTH'
  | 'BLOCKED_NETWORK'
  | 'DATA_INSUFFICIENT';

export interface RefreshJobConfig {
  name: string;
  description: string;
  command: string;
  scriptPath: string;
  frequencyHours: number;
  staleThresholdHours: number;
  lockFile: string;
  progressFile: string;
  logFile: string;
  mutatesProductionData: boolean;
  requiresNetwork: boolean;
  category: string;
}

export interface DataRefreshScheduleConfig {
  version: string;
  updatedAt: string;
  jobs: Record<string, RefreshJobConfig>;
}

export interface DaemonOptions {
  mode: 'plan' | 'status' | 'run-due' | 'run-job';
  targetJob?: string;
  dryRun?: boolean;
  maxSymbols?: number;
  batchSize?: number;
  configPath?: string;
}

export interface DueCheckResult {
  isDue: boolean;
  reason: string;
  lastRun?: string;
  nextDue?: string;
  hoursSinceLastRun?: number;
}

export interface LockCheckResult {
  locked: boolean;
  pid?: number;
  timestamp?: string;
  staleBroken?: boolean;
}

const root = path.resolve(process.cwd());
const defaultConfigPath = path.join(root, 'scripts', 'data_quality', 'data_refresh_schedule.json');
const daemonLogPath = path.join(root, 'reports', 'data_quality', 'jobs', 'data_refresh_daemon.log');

export function logDaemon(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.mkdirSync(path.dirname(daemonLogPath), { recursive: true });
    fs.appendFileSync(daemonLogPath, line);
  } catch {}
}

export function loadScheduleConfig(configPath?: string): DataRefreshScheduleConfig {
  const targetPath = configPath ? path.resolve(configPath) : defaultConfigPath;
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Schedule config not found: ${targetPath}`);
  }
  const raw = fs.readFileSync(targetPath, 'utf8');
  return JSON.parse(raw) as DataRefreshScheduleConfig;
}

export function validateScheduleConfig(config: DataRefreshScheduleConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config.version) errors.push('Missing version in schedule config');
  if (!config.jobs || typeof config.jobs !== 'object' || Object.keys(config.jobs).length === 0) {
    errors.push('No jobs defined in schedule config');
    return { valid: false, errors };
  }

  const requiredFields: (keyof RefreshJobConfig)[] = [
    'name',
    'description',
    'command',
    'scriptPath',
    'frequencyHours',
    'staleThresholdHours',
    'lockFile',
    'progressFile',
    'logFile'
  ];

  for (const [key, job] of Object.entries(config.jobs)) {
    if (!job.name) errors.push(`Job ${key} is missing name`);
    for (const f of requiredFields) {
      if (job[f] === undefined || job[f] === null || job[f] === '') {
        errors.push(`Job ${key} is missing required field: ${String(f)}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function readJobProgress(job: RefreshJobConfig): any {
  const fullPath = path.isAbsolute(job.progressFile) ? job.progressFile : path.join(root, job.progressFile);
  if (!fs.existsSync(fullPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch {
    return null;
  }
}

export function isJobDue(job: RefreshJobConfig, now: Date = new Date()): DueCheckResult {
  const progress = readJobProgress(job);
  if (!progress) {
    return { isDue: true, reason: 'NEVER_RUN (no progress record found)' };
  }

  const lastTimeStr = progress.completedTime || progress.startTime;
  if (!lastTimeStr) {
    return { isDue: true, reason: 'NO_TIMESTAMP in previous progress record' };
  }

  const lastTime = new Date(lastTimeStr);
  if (isNaN(lastTime.getTime())) {
    return { isDue: true, reason: 'INVALID_TIMESTAMP in previous progress record' };
  }

  const diffMs = now.getTime() - lastTime.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const nextDueDate = new Date(lastTime.getTime() + job.frequencyHours * 60 * 60 * 1000);

  if (diffHours >= job.frequencyHours) {
    return {
      isDue: true,
      reason: `STALE (${diffHours.toFixed(1)}h elapsed >= ${job.frequencyHours}h frequency)`,
      lastRun: lastTime.toISOString(),
      nextDue: nextDueDate.toISOString(),
      hoursSinceLastRun: diffHours
    };
  }

  return {
    isDue: false,
    reason: `FRESH (${diffHours.toFixed(1)}h elapsed < ${job.frequencyHours}h frequency)`,
    lastRun: lastTime.toISOString(),
    nextDue: nextDueDate.toISOString(),
    hoursSinceLastRun: diffHours
  };
}

export function isJobLocked(job: RefreshJobConfig): LockCheckResult {
  const lockPath = path.isAbsolute(job.lockFile) ? job.lockFile : path.join(root, job.lockFile);
  if (!fs.existsSync(lockPath)) {
    return { locked: false };
  }

  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const data = JSON.parse(raw);
    const pid = data.pid;
    const timestamp = data.timestamp;

    // Check if process is still alive
    let isAlive = false;
    if (pid && typeof pid === 'number') {
      try {
        process.kill(pid, 0); // signal 0 tests existence
        isAlive = true;
      } catch {
        isAlive = false;
      }
    }

    // Check stale threshold (2 hours lock timeout)
    const lockAgeHours = timestamp ? (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60) : 999;
    if (!isAlive || lockAgeHours > 2) {
      logDaemon(`Breaking stale/dead lock for ${job.name} (PID: ${pid}, Age: ${lockAgeHours.toFixed(2)}h)`);
      try {
        fs.unlinkSync(lockPath);
      } catch {}
      return { locked: false, staleBroken: true };
    }

    return { locked: true, pid, timestamp };
  } catch {
    // Corrupt lock file -> remove it
    try {
      fs.unlinkSync(lockPath);
    } catch {}
    return { locked: false, staleBroken: true };
  }
}

export function acquireLock(job: RefreshJobConfig): boolean {
  const check = isJobLocked(job);
  if (check.locked) return false;

  const lockPath = path.isAbsolute(job.lockFile) ? job.lockFile : path.join(root, job.lockFile);
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    const payload = {
      jobName: job.name,
      pid: process.pid,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2));
    return true;
  } catch (err: any) {
    logDaemon(`Failed to acquire lock for ${job.name}: ${err?.message || err}`);
    return false;
  }
}

export function releaseLock(job: RefreshJobConfig): void {
  const lockPath = path.isAbsolute(job.lockFile) ? job.lockFile : path.join(root, job.lockFile);
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  } catch (err: any) {
    logDaemon(`Error removing lock for ${job.name}: ${err?.message || err}`);
  }
}

export function updateJobProgress(
  job: RefreshJobConfig,
  status: JobRunStatus,
  startTime: string,
  completedTime?: string,
  error?: string
) {
  const fullPath = path.isAbsolute(job.progressFile) ? job.progressFile : path.join(root, job.progressFile);
  try {
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const existing = readJobProgress(job) || {};
    const updated = {
      ...existing,
      jobName: job.name,
      status,
      startTime: startTime || existing.startTime || new Date().toISOString(),
      completedTime: completedTime || (status === 'RUNNING' ? null : new Date().toISOString()),
      error: error || null
    };
    fs.writeFileSync(fullPath, JSON.stringify(updated, null, 2));
  } catch (err: any) {
    logDaemon(`Failed to write progress for ${job.name}: ${err?.message || err}`);
  }
}

export async function executeJob(
  job: RefreshJobConfig,
  options: DaemonOptions
): Promise<{ status: JobRunStatus; durationMs: number; error?: string }> {
  const start = Date.now();
  const startTimeIso = new Date().toISOString();

  if (options.dryRun) {
    logDaemon(`[DRY_RUN] Would execute job '${job.name}': ${job.command}`);
    return { status: 'SUCCESS', durationMs: 0 };
  }

  const locked = !acquireLock(job);
  if (locked) {
    logDaemon(`[-] Job '${job.name}' is actively locked by another process. Skipping.`);
    return { status: 'SKIPPED_LOCKED', durationMs: 0, error: 'Job is actively locked' };
  }

  updateJobProgress(job, 'RUNNING', startTimeIso);
  logDaemon(`[>] Running job '${job.name}' (${job.command})...`);

  // Build command and arguments
  let cmdLine = job.command;
  if (options.maxSymbols && !cmdLine.includes('--max-symbols')) {
    cmdLine += ` --max-symbols ${options.maxSymbols}`;
  }
  if (options.batchSize && !cmdLine.includes('--batch-size')) {
    cmdLine += ` --batch-size ${options.batchSize}`;
  }

  const logFilePath = path.isAbsolute(job.logFile) ? job.logFile : path.join(root, job.logFile);
  fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
  fs.appendFileSync(logFilePath, `\n=== ORCHESTRATOR EXECUTION START: ${startTimeIso} ===\nCommand: ${cmdLine}\n`);

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(cmdLine, {
        cwd: root,
        shell: true,
        env: { ...process.env }
      });

      child.stdout.on('data', (d) => {
        fs.appendFileSync(logFilePath, d);
      });

      child.stderr.on('data', (d) => {
        fs.appendFileSync(logFilePath, `[STDERR] ${d}`);
      });

      child.on('error', (err) => reject(err));
      child.on('close', (code) => resolve(code ?? 0));
    });

    const durationMs = Date.now() - start;
    const completedIso = new Date().toISOString();

    if (exitCode === 0) {
      logDaemon(`[+] Job '${job.name}' completed successfully in ${(durationMs / 1000).toFixed(1)}s.`);
      updateJobProgress(job, 'SUCCESS', startTimeIso, completedIso);
      return { status: 'SUCCESS', durationMs };
    } else {
      const err = `Child process exited with code ${exitCode}`;
      logDaemon(`[x] Job '${job.name}' failed with code ${exitCode} after ${(durationMs / 1000).toFixed(1)}s.`);
      updateJobProgress(job, 'FAILED', startTimeIso, completedIso, err);
      return { status: 'FAILED', durationMs, error: err };
    }
  } catch (err: any) {
    const durationMs = Date.now() - start;
    const errMsg = err?.message || String(err);
    logDaemon(`[x] Job '${job.name}' error: ${errMsg}`);
    updateJobProgress(job, 'FAILED', startTimeIso, new Date().toISOString(), errMsg);
    return { status: 'FAILED', durationMs, error: errMsg };
  } finally {
    releaseLock(job);
  }
}

export async function runDaemon(options: DaemonOptions): Promise<{
  plannedJobs: string[];
  executedJobs: Record<string, JobRunStatus>;
  summary: string;
}> {
  const config = loadScheduleConfig(options.configPath);
  const { valid, errors } = validateScheduleConfig(config);
  if (!valid) {
    throw new Error(`Invalid schedule configuration:\n - ${errors.join('\n - ')}`);
  }

  const jobs = Object.values(config.jobs);
  const plannedJobs: string[] = [];
  const executedJobs: Record<string, JobRunStatus> = {};

  logDaemon(`\n=============================================================`);
  logDaemon(`WealthOS Data Refresh Orchestrator — Mode: ${options.mode.toUpperCase()}`);
  if (options.dryRun) logDaemon(`[FLAG: DRY-RUN ENABLED - NO CHILD SCRIPTS SPAWNED]`);
  logDaemon(`Total Scheduled Jobs: ${jobs.length}`);
  logDaemon(`=============================================================\n`);

  // MODE: STATUS
  if (options.mode === 'status') {
    console.log(`\n--- REFRESH SCHEDULE STATUS OVERVIEW ---`);
    console.log(
      `${'Job Name'.padEnd(40)} ${'Status'.padEnd(16)} ${'Frequency'.padEnd(12)} ${'Last Run'.padEnd(24)} ${'Locked'}`
    );
    console.log('-'.repeat(105));

    for (const job of jobs) {
      const prog = readJobProgress(job);
      const dueCheck = isJobDue(job);
      const lockCheck = isJobLocked(job);
      const lastRun = prog?.completedTime ? prog.completedTime.replace('T', ' ').slice(0, 19) : 'NEVER';
      const status = prog?.status || 'NOT_STARTED';
      const lockedStr = lockCheck.locked ? `YES (PID: ${lockCheck.pid})` : 'NO';

      console.log(
        `${job.name.padEnd(40)} ${status.padEnd(16)} ${(job.frequencyHours + 'h').padEnd(12)} ${lastRun.padEnd(24)} ${lockedStr}`
      );
    }
    console.log('-'.repeat(105) + '\n');
    return { plannedJobs, executedJobs, summary: 'STATUS_DISPLAYED' };
  }

  // MODE: PLAN
  if (options.mode === 'plan') {
    console.log(`\n--- REFRESH SCHEDULE EXECUTION PLAN ---`);
    console.log(
      `${'Job Name'.padEnd(40)} ${'Action Plan'.padEnd(16)} ${'Frequency'.padEnd(12)} ${'Due Reason'.padEnd(36)}`
    );
    console.log('-'.repeat(108));

    for (const job of jobs) {
      const dueCheck = isJobDue(job);
      const lockCheck = isJobLocked(job);
      let planState = 'SKIP (FRESH)';
      if (lockCheck.locked) planState = 'SKIP (LOCKED)';
      else if (dueCheck.isDue) {
        planState = 'RUN (DUE)';
        plannedJobs.push(job.name);
      }

      console.log(
        `${job.name.padEnd(40)} ${planState.padEnd(16)} ${(job.frequencyHours + 'h').padEnd(12)} ${dueCheck.reason.padEnd(36)}`
      );
    }
    console.log('-'.repeat(108));
    console.log(`Total Due Jobs to Run: ${plannedJobs.length} / ${jobs.length}\n`);
    return { plannedJobs, executedJobs, summary: `PLAN: ${plannedJobs.length} jobs due` };
  }

  // MODE: RUN-JOB
  if (options.mode === 'run-job') {
    if (!options.targetJob) {
      throw new Error('Must specify job name with --run-job <jobName>');
    }
    const target = config.jobs[options.targetJob];
    if (!target) {
      throw new Error(`Unknown job name: '${options.targetJob}'. Available: ${Object.keys(config.jobs).join(', ')}`);
    }

    plannedJobs.push(target.name);
    const res = await executeJob(target, options);
    executedJobs[target.name] = res.status;
    return { plannedJobs, executedJobs, summary: `RUN-JOB: ${target.name} -> ${res.status}` };
  }

  // MODE: RUN-DUE
  if (options.mode === 'run-due') {
    for (const job of jobs) {
      const dueCheck = isJobDue(job);
      if (!dueCheck.isDue) {
        logDaemon(`Job '${job.name}' is FRESH (${dueCheck.reason}). Skipping.`);
        executedJobs[job.name] = 'SKIPPED_FRESH';
        continue;
      }

      const lockCheck = isJobLocked(job);
      if (lockCheck.locked) {
        logDaemon(`Job '${job.name}' is LOCKED by PID ${lockCheck.pid}. Skipping.`);
        executedJobs[job.name] = 'SKIPPED_LOCKED';
        continue;
      }

      plannedJobs.push(job.name);
      const res = await executeJob(job, options);
      executedJobs[job.name] = res.status;
    }

    const successful = Object.values(executedJobs).filter((s) => s === 'SUCCESS').length;
    const failed = Object.values(executedJobs).filter((s) => s === 'FAILED').length;
    return {
      plannedJobs,
      executedJobs,
      summary: `RUN-DUE: ${successful} succeeded, ${failed} failed, ${jobs.length - plannedJobs.length} skipped`
    };
  }

  return { plannedJobs, executedJobs, summary: 'NOOP' };
}

// CLI entrypoint
async function main() {
  const args = process.argv.slice(2);
  let mode: 'plan' | 'status' | 'run-due' | 'run-job' = 'plan';
  let targetJob: string | undefined;
  let dryRun = false;
  let maxSymbols: number | undefined;
  let batchSize: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--plan') mode = 'plan';
    else if (a === '--status') mode = 'status';
    else if (a === '--run-due') mode = 'run-due';
    else if (a === '--run-job') {
      mode = 'run-job';
      targetJob = args[i + 1];
      i++;
    } else if (a === '--dry-run') dryRun = true;
    else if (a === '--max-symbols') {
      maxSymbols = Number(args[i + 1]);
      i++;
    } else if (a === '--batch-size') {
      batchSize = Number(args[i + 1]);
      i++;
    }
  }

  try {
    const res = await runDaemon({
      mode,
      targetJob,
      dryRun,
      maxSymbols,
      batchSize
    });

    const failedCount = Object.values(res.executedJobs).filter((s) => s === 'FAILED').length;
    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Fatal daemon error:', err?.message || err);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('run_data_refresh_daemon.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
