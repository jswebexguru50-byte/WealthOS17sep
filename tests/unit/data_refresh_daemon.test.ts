import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadScheduleConfig,
  validateScheduleConfig,
  isJobDue,
  isJobLocked,
  acquireLock,
  releaseLock,
  updateJobProgress,
  readJobProgress,
  executeJob,
  runDaemon,
  RefreshJobConfig,
  DataRefreshScheduleConfig
} from '../../scripts/data_quality/run_data_refresh_daemon.js';

describe('Data Refresh Orchestrator Daemon', () => {
  const testDir = path.resolve('tests', 'scratch_daemon_test');
  const testConfigPath = path.join(testDir, 'test_schedule.json');
  const testLockPath = path.join(testDir, 'test_job.lock');
  const testProgressPath = path.join(testDir, 'test_job_progress.json');
  const testLogPath = path.join(testDir, 'test_job.log');

  const mockJob: RefreshJobConfig = {
    name: 'test_job',
    description: 'Test job for orchestrator unit tests',
    command: 'node',
    args: ['-e', 'process.exit(0)'],
    scriptPath: 'scripts/mock/test.ts',
    frequencyHours: 24,
    staleThresholdHours: 24,
    lockFile: path.relative(process.cwd(), testLockPath),
    progressFile: path.relative(process.cwd(), testProgressPath),
    logFile: path.relative(process.cwd(), testLogPath),
    jobType: 'REFRESH',
    implementationStatus: 'READY',
    invokesExistingScript: false,
    existingScriptPath: null,
    mutatesProductionData: false,
    requiresNetwork: false,
    category: 'TEST'
  };

  const mockSchedule: DataRefreshScheduleConfig = {
    version: '1.1.0',
    updatedAt: new Date().toISOString(),
    jobs: {
      test_job: mockJob
    }
  };

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testConfigPath, JSON.stringify(mockSchedule, null, 2));
    if (fs.existsSync(testLockPath)) fs.unlinkSync(testLockPath);
    if (fs.existsSync(testProgressPath)) fs.unlinkSync(testProgressPath);
    if (fs.existsSync(testLogPath)) fs.unlinkSync(testLogPath);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testLockPath)) fs.unlinkSync(testLockPath);
      if (fs.existsSync(testProgressPath)) fs.unlinkSync(testProgressPath);
      if (fs.existsSync(testLogPath)) fs.unlinkSync(testLogPath);
      if (fs.existsSync(testConfigPath)) fs.unlinkSync(testConfigPath);
      if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
    } catch {}
  });

  describe('1. Schedule Config Validation', () => {
    it('validates a complete, correctly formed schedule config', () => {
      const res = validateScheduleConfig(mockSchedule);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects a config with missing version or missing required job properties', () => {
      const invalidConfig: any = {
        version: '',
        jobs: {
          bad_job: {
            name: 'bad_job'
            // missing command, scriptPath, frequencyHours, lockFile, etc.
          }
        }
      };
      const res = validateScheduleConfig(invalidConfig);
      expect(res.valid).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.some(e => e.includes('Missing version'))).toBe(true);
      expect(res.errors.some(e => e.includes('missing required field'))).toBe(true);
    });

    it('successfully loads existing production data_refresh_schedule.json', () => {
      const prodConfig = loadScheduleConfig();
      expect(prodConfig.version).toBeDefined();
      expect(Object.keys(prodConfig.jobs).length).toBe(8);

      const validation = validateScheduleConfig(prodConfig);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('2. Due-Job Selection & Freshness', () => {
    it('determines a job is due if it has never run', () => {
      const dueCheck = isJobDue(mockJob);
      expect(dueCheck.isDue).toBe(true);
      expect(dueCheck.reason).toContain('NEVER_RUN');
    });

    it('determines a job is fresh and skips it if last run was recent', () => {
      const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
      updateJobProgress(mockJob, 'SUCCESS', recentDate, recentDate);

      const dueCheck = isJobDue(mockJob);
      expect(dueCheck.isDue).toBe(false);
      expect(dueCheck.reason).toContain('FRESH');
    });

    it('determines a job is due if last run exceeds frequencyHours', () => {
      const staleDate = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(); // 30 hours ago (freq = 24h)
      updateJobProgress(mockJob, 'SUCCESS', staleDate, staleDate);

      const dueCheck = isJobDue(mockJob);
      expect(dueCheck.isDue).toBe(true);
      expect(dueCheck.reason).toContain('STALE');
    });
  });

  describe('3. Locking Behavior', () => {
    it('acquires lock, detects active lock, and releases lock cleanly', () => {
      expect(isJobLocked(mockJob).locked).toBe(false);

      const acquired = acquireLock(mockJob);
      expect(acquired).toBe(true);
      expect(fs.existsSync(testLockPath)).toBe(true);

      const secondAcquire = acquireLock(mockJob);
      expect(secondAcquire).toBe(false);

      releaseLock(mockJob);
      expect(fs.existsSync(testLockPath)).toBe(false);
      expect(isJobLocked(mockJob).locked).toBe(false);
    });

    it('breaks stale locks where process is dead', () => {
      // Write a lock file with a non-existent PID
      const fakePid = 9999999;
      fs.writeFileSync(testLockPath, JSON.stringify({
        jobName: mockJob.name,
        pid: fakePid,
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() // 3 hours ago
      }));

      const check = isJobLocked(mockJob);
      expect(check.locked).toBe(false);
      expect(check.staleBroken).toBe(true);
      expect(fs.existsSync(testLockPath)).toBe(false);
    });

    it('skips execution when a job is actively locked', async () => {
      acquireLock(mockJob);

      const result = await executeJob(mockJob, {
        mode: 'run-job',
        targetJob: mockJob.name
      });

      expect(result.status).toBe('SKIPPED_LOCKED');
      releaseLock(mockJob);
    });
  });

  describe('4. Execution & Status Tracking', () => {
    it('dry-run returns DRY_RUN without spawning child process', async () => {
      const result = await executeJob(mockJob, {
        mode: 'run-job',
        targetJob: mockJob.name,
        dryRun: true
      });

      expect(result.status).toBe('DRY_RUN');
      expect(result.durationMs).toBe(0);
      expect(fs.existsSync(testLockPath)).toBe(false);
    });

    it('marks SCRIPT_MISSING without spawning process', async () => {
      const missingJob: RefreshJobConfig = {
        ...mockJob,
        name: 'missing_job',
        implementationStatus: 'SCRIPT_MISSING'
      };

      const result = await executeJob(missingJob, {
        mode: 'run-job',
        targetJob: missingJob.name
      });

      expect(result.status).toBe('SCRIPT_MISSING');
      expect(result.durationMs).toBe(0);
      expect(result.error).toContain('SCRIPT_MISSING');

      const progress = readJobProgress(missingJob);
      expect(progress.status).toBe('SCRIPT_MISSING');
    });

    it('records AUDIT_ONLY status when audit job succeeds', async () => {
      const auditJob: RefreshJobConfig = {
        ...mockJob,
        name: 'audit_job',
        jobType: 'AUDIT',
        implementationStatus: 'AUDIT_ONLY',
        mutatesProductionData: false
      };

      const result = await executeJob(auditJob, {
        mode: 'run-job',
        targetJob: auditJob.name
      });

      expect(result.status).toBe('AUDIT_ONLY');

      const progress = readJobProgress(auditJob);
      expect(progress.status).toBe('AUDIT_ONLY');
    });

    it('records FAILED status and error message when child process fails', async () => {
      const failingJob: RefreshJobConfig = {
        ...mockJob,
        name: 'failing_job',
        command: 'node',
        args: ['-e', 'process.exit(2)']
      };

      const result = await executeJob(failingJob, {
        mode: 'run-job',
        targetJob: failingJob.name
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Child process exited with code 2');

      const progress = readJobProgress(failingJob);
      expect(progress.status).toBe('FAILED');
      expect(progress.error).toContain('Child process exited with code 2');
    });

    it('records SUCCESS status and timestamps when child process exits 0', async () => {
      const result = await executeJob(mockJob, {
        mode: 'run-job',
        targetJob: mockJob.name
      });

      expect(result.status).toBe('SUCCESS');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      const progress = readJobProgress(mockJob);
      expect(progress.status).toBe('SUCCESS');
      expect(progress.completedTime).toBeDefined();
      expect(progress.error).toBeNull();
    });

    it('records DATA_INSUFFICIENT when child progress indicates DATA_INSUFFICIENT or PARTIAL_BATCH_NOT_EXECUTED', async () => {
      // Create a test job that writes child progress as DATA_INSUFFICIENT and exits 0
      const partialBatchJob: RefreshJobConfig = {
        ...mockJob,
        name: 'partial_batch_job',
        command: 'node',
        args: [
          '-e',
          `const fs = require('fs'); fs.writeFileSync('${testProgressPath.replace(/\\/g, '\\\\')}', JSON.stringify({ status: 'DATA_INSUFFICIENT', error: 'Partial batch not executed' })); process.exit(0);`
        ]
      };

      const result = await executeJob(partialBatchJob, {
        mode: 'run-job',
        targetJob: partialBatchJob.name
      });

      expect(result.status).toBe('DATA_INSUFFICIENT');
      const progress = readJobProgress(partialBatchJob);
      expect(progress.status).toBe('DATA_INSUFFICIENT');
    });

    it('records DATA_INSUFFICIENT when child progress indicates SUCCESS_WITH_NO_FACTS and never leaves RUNNING', async () => {
      const zeroFactsJob: RefreshJobConfig = {
        ...mockJob,
        name: 'zero_facts_job',
        command: 'node',
        args: [
          '-e',
          `const fs = require('fs'); fs.writeFileSync('${testProgressPath.replace(/\\/g, '\\\\')}', JSON.stringify({ status: 'SUCCESS_WITH_NO_FACTS', executedCalls: 1, factsPersisted: 0, error: 'Provider returned no usable facts' })); process.exit(0);`
        ]
      };

      const result = await executeJob(zeroFactsJob, {
        mode: 'run-job',
        targetJob: zeroFactsJob.name
      });

      expect(result.status).toBe('DATA_INSUFFICIENT');
      const progress = readJobProgress(zeroFactsJob);
      expect(progress.status).toBe('DATA_INSUFFICIENT');
      expect(progress.status).not.toBe('SUCCESS');
      expect(progress.status).not.toBe('RUNNING');
      expect(progress.completedAt).toBeDefined();
    });

    it('passes --allow-partial-final-batch through to child job arguments when enabled', async () => {
      // Child script asserts that --allow-partial-final-batch is present in process.argv
      const flagCheckJob: RefreshJobConfig = {
        ...mockJob,
        name: 'flag_check_job',
        command: 'node',
        args: [
          '-e',
          `if (!process.argv.includes('--allow-partial-final-batch')) process.exit(1); else process.exit(0);`,
          '--'
        ]
      };

      const result = await executeJob(flagCheckJob, {
        mode: 'run-job',
        targetJob: flagCheckJob.name,
        allowPartialFinalBatch: true
      });

      expect(result.status).toBe('SUCCESS');
    });
  });

  describe('5. Orchestrator Plan & Run Modes', () => {
    it('--plan does not mutate data or spawn jobs and outputs planned jobs', async () => {
      const planRes = await runDaemon({
        mode: 'plan',
        configPath: testConfigPath
      });

      expect(planRes.plannedJobs).toContain('test_job');
      expect(Object.keys(planRes.executedJobs)).toHaveLength(0);
      expect(planRes.summary).toContain('PLAN: 1 jobs due');
    });

    it('--status displays status overview without executing jobs', async () => {
      const statusRes = await runDaemon({
        mode: 'status',
        configPath: testConfigPath
      });

      expect(statusRes.summary).toBe('STATUS_DISPLAYED');
      expect(Object.keys(statusRes.executedJobs)).toHaveLength(0);
    });
  });

  describe('6. Production Schedule & Invariant Audits', () => {
    it('1. Production schedule has no stale ohlcv_daily_refresh job', () => {
      const prodConfig = loadScheduleConfig();
      expect(prodConfig.jobs['ohlcv_daily_refresh']).toBeUndefined();
      expect(prodConfig.jobs['ohlcv_daily_audit']).toBeDefined();
    });

    it('2. No job in schedule references scripts/data_quality/jobs/ohlcv_daily_refresh.ts', () => {
      const prodConfig = loadScheduleConfig();
      for (const [name, job] of Object.entries(prodConfig.jobs)) {
        expect(job.scriptPath || '').not.toContain('ohlcv_daily_refresh');
        expect(job.existingScriptPath || '').not.toContain('ohlcv_daily_refresh');
        const argsStr = Array.isArray(job.args) ? job.args.join(' ') : '';
        expect(argsStr).not.toContain('ohlcv_daily_refresh');
      }
      const oldFilePath = path.resolve('scripts', 'data_quality', 'jobs', 'ohlcv_daily_refresh.ts');
      expect(fs.existsSync(oldFilePath)).toBe(false);
    });

    it('3. No job script contains hardcoded market date 2026-09-30', () => {
      const jobsDir = path.resolve('scripts', 'data_quality', 'jobs');
      const files = fs.readdirSync(jobsDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(jobsDir, file), 'utf8');
        expect(content).not.toContain('2026-09-30');
      }
    });

    it('4. No job script contains arbitrary LIMIT 100 unless string also contains max-symbols', () => {
      const jobsDir = path.resolve('scripts', 'data_quality', 'jobs');
      const files = fs.readdirSync(jobsDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(jobsDir, file), 'utf8');
        if (content.includes('LIMIT 100')) {
          expect(content.toLowerCase()).toContain('max-symbols');
        }
      }
    });

    it('5. SCRIPT_MISSING jobs do not get planned for execution in --plan and do not spawn a child in run-job', async () => {
      const prodConfig = loadScheduleConfig();
      const planRes = await runDaemon({
        mode: 'plan'
      });
      // SCRIPT_MISSING jobs must never be in plannedJobs
      for (const [name, job] of Object.entries(prodConfig.jobs)) {
        if (job.implementationStatus === 'SCRIPT_MISSING') {
          expect(planRes.plannedJobs).not.toContain(name);
        }
      }

      // Executing a SCRIPT_MISSING job returns SCRIPT_MISSING with 0 child process duration
      const missingJob = prodConfig.jobs['corporate_events_deals_refresh'];
      expect(missingJob.implementationStatus).toBe('SCRIPT_MISSING');
      const runRes = await executeJob(missingJob, {
        mode: 'run-job',
        targetJob: missingJob.name
      });
      expect(runRes.status).toBe('SCRIPT_MISSING');
      expect(runRes.durationMs).toBe(0);
    });

    it('6. AUDIT_ONLY jobs have mutatesProductionData: false', () => {
      const prodConfig = loadScheduleConfig();
      for (const [name, job] of Object.entries(prodConfig.jobs)) {
        if (job.implementationStatus === 'AUDIT_ONLY' || job.jobType === 'AUDIT') {
          expect(job.mutatesProductionData).toBe(false);
        }
      }
    });

    it('7. READY jobs either invoke existing script with valid path or declare canonical local implementation', () => {
      const prodConfig = loadScheduleConfig();
      for (const [name, job] of Object.entries(prodConfig.jobs)) {
        if (job.implementationStatus === 'READY') {
          if (job.invokesExistingScript) {
            expect(job.existingScriptPath).toBeDefined();
            expect(typeof job.existingScriptPath).toBe('string');
            const fullScriptPath = path.resolve(job.existingScriptPath!);
            expect(fs.existsSync(fullScriptPath)).toBe(true);
          } else {
            // Must clearly declare itself as canonical local implementation/backfill
            const descLower = job.description.toLowerCase();
            expect(descLower).toContain('canonical');
            expect(descLower.includes('backfill') || descLower.includes('script')).toBe(true);
          }
        }
      }
    });
  });
});
