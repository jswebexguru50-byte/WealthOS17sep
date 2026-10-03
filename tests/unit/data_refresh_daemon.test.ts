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
    command: 'node -e "process.exit(0)"',
    scriptPath: 'scripts/mock/test.ts',
    frequencyHours: 24,
    staleThresholdHours: 24,
    lockFile: path.relative(process.cwd(), testLockPath),
    progressFile: path.relative(process.cwd(), testProgressPath),
    logFile: path.relative(process.cwd(), testLogPath),
    mutatesProductionData: false,
    requiresNetwork: false,
    category: 'TEST'
  };

  const mockSchedule: DataRefreshScheduleConfig = {
    version: '1.0.0',
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
    it('dry-run simulates execution without spawning child process', async () => {
      const result = await executeJob(mockJob, {
        mode: 'run-job',
        targetJob: mockJob.name,
        dryRun: true
      });

      expect(result.status).toBe('SUCCESS');
      expect(result.durationMs).toBe(0);
      expect(fs.existsSync(testLockPath)).toBe(false);
    });

    it('records FAILED status and error message when child process fails', async () => {
      const failingJob: RefreshJobConfig = {
        ...mockJob,
        name: 'failing_job',
        command: 'node -e "process.exit(2)"'
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
});
