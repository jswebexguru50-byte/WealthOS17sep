#!/usr/bin/env tsx
/**
 * scripts/data_quality/run_data_refresh_daemon.ts
 *
 * WealthOS — Simple Deterministic Data Refresh Orchestrator
 *
 * Thin wrapper/scheduler layer that reuses existing WealthOS acquisition, ingestion,
 * and audit scripts based on data_refresh_schedule.json.
 *
 * Invariants:
 * - Does NOT duplicate fetching, ingestion, or audit logic.
 * - Distinguishes between REFRESH, INGEST, AUDIT, and BACKFILL.
 * - Marks SCRIPT_MISSING jobs transparently instead of pretending refresh occurred.
 * - Dry-run returns DRY_RUN (never returns SUCCESS).
 * - Safe command execution via structured command + args array.
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

export type JobType = 'REFRESH' | 'INGEST' | 'AUDIT' | 'BACKFILL';
export type ImplementationStatus = 'READY' | 'SCRIPT_MISSING' | 'AUDIT_ONLY';

export type JobRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'DRY_RUN'
  | 'SCRIPT_MISSING'
  | 'AUDIT_ONLY'
  | 'SKIPPED_FRESH'
  | 'SKIPPED_LOCKED'
  | 'FAILED'
  | 'DATA_INSUFFICIENT'
  | 'BLOCKED_AUTH'
  | 'BLOCKED_NETWORK';

export interface RefreshJobConfig {
  name: string;
  description: string;
  command: string;
  args?: string[];
  scriptPath?: string;
  frequencyHours: number;
  staleThresholdHours: number;
  lockFile: string;
  progressFile: string;
  logFile: string;
  jobType: JobType;
  implementationStatus: ImplementationStatus;
  invokesExistingScript: boolean;
  existingScriptPath: string | null;
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
    'frequencyHours',
    'staleThresholdHours',
    'lockFile',
    'progressFile',
    'logFile',
    'jobType',
    'implementationStatus',
    'invokesExistingScript',
    'mutatesProductionData'
  ];

  const validJobTypes: JobType[] = ['REFRESH', 'INGEST', 'AUDIT', 'BACKFILL'];
  const validImplStatuses: ImplementationStatus[] = ['READY', 'SCRIPT_MISSING', 'AUDIT_ONLY'];

  for (const [key, job] of Object.entries(config.jobs)) {
    if (!job.name) errors.push(`Job ${key} is missing name`);
    for (const f of requiredFields) {
      if (job[f] === undefined || job[f] === null || job[f] === '') {
        errors.push(`Job ${key} is missing required field: ${String(f)}`);
      }
    }

    if (job.jobType && !validJobTypes.includes(job.jobType)) {
      errors.push(`Job ${key} has invalid jobType: '${job.jobType}'. Allowed: ${validJobTypes.join(', ')}`);
    }

    if (job.implementationStatus && !validImplStatuses.includes(job.implementationStatus)) {
      errors.push(`Job ${key} has invalid implementationStatus: '${job.implementationStatus}'. Allowed: ${validImplStatuses.join(', ')}`);
    }

    if ((job.jobType === 'AUDIT' || job.implementationStatus === 'AUDIT_ONLY') && job.mutatesProductionData) {
      errors.push(`Job ${key} is marked AUDIT / AUDIT_ONLY but has mutatesProductionData=true`);
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
      jobType: job.jobType,
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

  // If job is SCRIPT_MISSING, do not spawn child process
  if (job.implementationStatus === 'SCRIPT_MISSING') {
    logDaemon(`[-] Job '${job.name}' is marked SCRIPT_MISSING. No child process spawned.`);
    updateJobProgress(job, 'SCRIPT_MISSING', startTimeIso, startTimeIso, 'SCRIPT_MISSING: No implementation script available');
    return { status: 'SCRIPT_MISSING', durationMs: 0, error: 'SCRIPT_MISSING: No implementation script available' };
  }

  // Dry-run mode: do not spawn child process, return DRY_RUN
  if (options.dryRun) {
    const cmdDisplay = job.args && Array.isArray(job.args) ? `${job.command} ${job.args.join(' ')}` : job.command;
    logDaemon(`[DRY_RUN] Would execute job '${job.name}': ${cmdDisplay}`);
    return { status: 'DRY_RUN', durationMs: 0 };
  }

  const locked = !acquireLock(job);
  if (locked) {
    logDaemon(`[-] Job '${job.name}' is actively locked by another process. Skipping.`);
    return { status: 'SKIPPED_LOCKED', durationMs: 0, error: 'Job is actively locked' };
  }

  updateJobProgress(job, 'RUNNING', startTimeIso);

  // Build command execution args safely
  let spawnCmd = job.command;
  let spawnArgs: string[] = [];

  if (job.args && Array.isArray(job.args)) {
    spawnArgs = [...job.args];
  } else if (typeof job.command === 'string' && job.command.includes(' ')) {
    const parts = job.command.split(' ');
    spawnCmd = parts[0];
    spawnArgs = parts.slice(1);
  }

  if (options.maxSymbols && !spawnArgs.includes('--max-symbols')) {
    spawnArgs.push('--max-symbols', String(options.maxSymbols));
  }
  if (options.batchSize && !spawnArgs.includes('--batch-size')) {
    spawnArgs.push('--batch-size', String(options.batchSize));
  }

  const cmdLineDisplay = `${spawnCmd} ${spawnArgs.join(' ')}`.trim();
  logDaemon(`[>] Running job '${job.name}' (${cmdLineDisplay})...`);

  const logFilePath = path.isAbsolute(job.logFile) ? job.logFile : path.join(root, job.logFile);
  fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
  fs.appendFileSync(logFilePath, `\n=== ORCHESTRATOR EXECUTION START: ${startTimeIso} ===\nCommand: ${cmdLineDisplay}\n`);

  try {
    let execBinary = spawnCmd;
    let execArgs = spawnArgs;
    let useShell = false;

    const tsxDistCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    if (spawnCmd === 'npx' && spawnArgs[0] === 'tsx' && fs.existsSync(tsxDistCli)) {
      execBinary = process.execPath;
      execArgs = [tsxDistCli, ...spawnArgs.slice(1)];
      useShell = false;
    } else if (process.platform === 'win32' && (spawnCmd.endsWith('.cmd') || spawnCmd.endsWith('.bat') || spawnCmd === 'npx')) {
      useShell = true;
    }

    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(execBinary, execArgs, {
        cwd: root,
        shell: useShell,
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

    // Inspect child progress file if available
    const childProg = readJobProgress(job);
    const childStatus = childProg?.status;

    if (exitCode === 0) {
      const finalStatus: JobRunStatus =
        childStatus === 'DATA_INSUFFICIENT'
          ? 'DATA_INSUFFICIENT'
          : childStatus === 'BLOCKED_AUTH'
          ? 'BLOCKED_AUTH'
          : childStatus === 'AUDIT_ONLY' || job.implementationStatus === 'AUDIT_ONLY'
          ? 'AUDIT_ONLY'
          : 'SUCCESS';

      logDaemon(`[+] Job '${job.name}' completed with status ${finalStatus} in ${(durationMs / 1000).toFixed(1)}s.`);
      updateJobProgress(job, finalStatus, startTimeIso, completedIso);
      return { status: finalStatus, durationMs };
    } else {
      const finalStatus: JobRunStatus =
        childStatus === 'DATA_INSUFFICIENT'
          ? 'DATA_INSUFFICIENT'
          : childStatus === 'BLOCKED_AUTH'
          ? 'BLOCKED_AUTH'
          : 'FAILED';

      const err = childProg?.error || `Child process exited with code ${exitCode}`;
      logDaemon(`[x] Job '${job.name}' failed with status ${finalStatus} (code ${exitCode}) after ${(durationMs / 1000).toFixed(1)}s.`);
      updateJobProgress(job, finalStatus, startTimeIso, completedIso, err);
      return { status: finalStatus, durationMs, error: err };
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
      `${'Job Name'.padEnd(38)} ${'Type'.padEnd(10)} ${'Impl'.padEnd(14)} ${'Status'.padEnd(16)} ${'Frequency'.padEnd(10)} ${'Last Run'.padEnd(20)} ${'Locked'}`
    );
    console.log('-'.repeat(120));

    for (const job of jobs) {
      const prog = readJobProgress(job);
      const dueCheck = isJobDue(job);
      const lockCheck = isJobLocked(job);
      const lastRun = prog?.completedTime ? prog.completedTime.replace('T', ' ').slice(0, 19) : 'NEVER';
      const status = prog?.status || (job.implementationStatus === 'SCRIPT_MISSING' ? 'SCRIPT_MISSING' : 'NOT_STARTED');
      const lockedStr = lockCheck.locked ? `YES (PID: ${lockCheck.pid})` : 'NO';

      console.log(
        `${job.name.padEnd(38)} ${job.jobType.padEnd(10)} ${job.implementationStatus.padEnd(14)} ${status.padEnd(16)} ${(job.frequencyHours + 'h').padEnd(10)} ${lastRun.padEnd(20)} ${lockedStr}`
      );
    }
    console.log('-'.repeat(120) + '\n');
    return { plannedJobs, executedJobs, summary: 'STATUS_DISPLAYED' };
  }

  // MODE: PLAN
  if (options.mode === 'plan') {
    console.log(`\n--- REFRESH SCHEDULE EXECUTION PLAN ---`);
    console.log(
      `${'Job Name'.padEnd(38)} ${'Type'.padEnd(10)} ${'Impl'.padEnd(14)} ${'Action Plan'.padEnd(18)} ${'Frequency'.padEnd(10)} ${'Due Reason'.padEnd(30)}`
    );
    console.log('-'.repeat(126));

    for (const job of jobs) {
      const dueCheck = isJobDue(job);
      const lockCheck = isJobLocked(job);
      let planState = 'SKIP (FRESH)';

      if (job.implementationStatus === 'SCRIPT_MISSING') {
        planState = 'SKIP (SCRIPT_MISSING)';
      } else if (lockCheck.locked) {
        planState = 'SKIP (LOCKED)';
      } else if (dueCheck.isDue) {
        planState = job.implementationStatus === 'AUDIT_ONLY' ? 'RUN AUDIT (DUE)' : 'RUN (DUE)';
        plannedJobs.push(job.name);
      }

      console.log(
        `${job.name.padEnd(38)} ${job.jobType.padEnd(10)} ${job.implementationStatus.padEnd(14)} ${planState.padEnd(18)} ${(job.frequencyHours + 'h').padEnd(10)} ${dueCheck.reason.padEnd(30)}`
      );
    }
    console.log('-'.repeat(126));
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
      if (job.implementationStatus === 'SCRIPT_MISSING') {
        logDaemon(`Job '${job.name}' is marked SCRIPT_MISSING. Skipping.`);
        executedJobs[job.name] = 'SCRIPT_MISSING';
        continue;
      }

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

    const successful = Object.values(executedJobs).filter((s) => s === 'SUCCESS' || s === 'AUDIT_ONLY').length;
    const failed = Object.values(executedJobs).filter((s) => s === 'FAILED').length;
    return {
      plannedJobs,
      executedJobs,
      summary: `RUN-DUE: ${successful} succeeded/audited, ${failed} failed, ${jobs.length - plannedJobs.length} skipped`
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
