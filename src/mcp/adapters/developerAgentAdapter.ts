/**
 * Developer Agent Adapter & Review Loop Contract
 * Master Developer Specification — Section AD, AE, AF, AG, AH, AI, AJ
 *
 * Implements the session model, change protection tracking, test integrity guard,
 * and targeted remediation dispatching between independent reviewer and developer bot.
 */

import fs from 'fs';
import path from 'path';
import { RepositoryAdapter } from './repositoryAdapter.js';

export type SessionStatus =
  | 'CREATED'
  | 'BASELINED'
  | 'DEVELOPER_WORKING'
  | 'DEVELOPER_COMPLETE'
  | 'REVIEW_PENDING'
  | 'REVIEWING'
  | 'PASS'
  | 'REMEDIATION_REQUIRED'
  | 'HUMAN_REVIEW_REQUIRED'
  | 'CANCELLED';

export interface DevelopmentSession {
  sessionId: string;
  objective: string;
  constraints: string[];
  createdAt: string;
  baselineBranch: string;
  baselineCommit: string;
  status: SessionStatus;
  repairCycle: number;
  maxRepairCycles: number;
  changes?: {
    filesModified: string[];
    productionFiles: string[];
    testFiles: string[];
    diffSummary: string;
  };
  integrityFlags: string[];
  remediationHistory: Array<{
    cycle: number;
    timestamp: string;
    observedFailure: string;
    severity: string;
    allowedScope: string[];
    forbiddenChanges: string[];
    acceptanceTests: string[];
  }>;
}

export interface RemediationTask {
  taskId: string;
  sessionId: string;
  title: string;
  observedFailure: string;
  severity: string;
  allowedScope: string[];
  forbiddenChanges: string[];
  acceptanceTests: string[];
  status: 'QUEUED' | 'CLAIMED' | 'COMPLETE' | 'PASS' | 'REMEDIATION_REQUIRED';
  createdAt: string;
  claimedBy?: string;
  claimedAt?: string;
  completedAt?: string;
  resultArtifact?: {
    commitSha: string;
    diffSummary: string;
    testsPassed: boolean;
  };
  reviewVerdict?: 'PASS' | 'REMEDIATION_REQUIRED';
  reviewExplanation?: string;
}

const SESSIONS_FILE = path.join(process.cwd(), 'scratch', 'mcp_development_sessions.json');
const TASKS_FILE = path.join(process.cwd(), 'scratch', 'mcp_remediation_tasks.json');

function loadSessions(): Record<string, DevelopmentSession> {
  if (fs.existsSync(SESSIONS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveSessions(sessions: Record<string, DevelopmentSession>) {
  const dir = path.dirname(SESSIONS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

function loadTasks(): Record<string, RemediationTask> {
  if (fs.existsSync(TASKS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveTasks(tasks: Record<string, RemediationTask>) {
  const dir = path.dirname(TASKS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

export class DeveloperAgentAdapter {
  static createSession(objective: string, constraints: string[] = []): DevelopmentSession {
    const sessions = loadSessions();
    const repoStatus = RepositoryAdapter.getStatus();
    const sessionId = `DEV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Object.keys(sessions).length + 1).padStart(3, '0')}`;

    const session: DevelopmentSession = {
      sessionId,
      objective,
      constraints,
      createdAt: new Date().toISOString(),
      baselineBranch: repoStatus.branch,
      baselineCommit: repoStatus.commit,
      status: 'BASELINED',
      repairCycle: 0,
      maxRepairCycles: 3,
      integrityFlags: [],
      remediationHistory: []
    };

    sessions[sessionId] = session;
    saveSessions(sessions);
    return session;
  }

  static getSession(sessionId: string): DevelopmentSession {
    const sessions = loadSessions();
    const s = sessions[sessionId];
    if (!s) {
      throw new Error(`SESSION_NOT_FOUND: Development session '${sessionId}' does not exist.`);
    }

    // Refresh active status from current git state
    const repoStatus = RepositoryAdapter.getStatus();
    const modified = repoStatus.modifiedFiles;
    const prodFiles = modified.filter(f => f.startsWith('src/server') || f.startsWith('src/lib') || f === 'server.ts');
    const testFiles = modified.filter(f => f.startsWith('tests/'));

    // Check test integrity guard against baseline diff
    const integrityFlags: string[] = [];
    const diff = RepositoryAdapter.getFileDiff();

    // 1. Deleted tests or assertions
    if (diff.includes('-  it(') || diff.includes('-  test(')) {
      integrityFlags.push('TEST_INTEGRITY_FLAG: Deletion of test cases detected (- it/test)');
    }
    if (diff.includes('-    expect(') || diff.includes('-    assert(')) {
      integrityFlags.push('TEST_INTEGRITY_FLAG: Deletion of test assertions detected (- expect/assert)');
    }

    // 2. Added skip or only
    if (diff.includes('.skip(') || diff.includes('.only(')) {
      integrityFlags.push('TEST_INTEGRITY_FLAG: Test skip or only modifier introduced (.skip / .only)');
    }

    // 3. Hard-coded pass / bypass patterns
    if (diff.includes('expect(true).toBe(true)') || diff.includes('// bypass') || diff.includes('/* bypass */')) {
      integrityFlags.push('TEST_INTEGRITY_FLAG: Hardcoded trivial pass or explicit test bypass detected');
    }

    // 4. Fixture injection / mock overriding real production database
    if (diff.includes('vi.mock(') && (diff.includes('better-sqlite3') || diff.includes('DuckDB'))) {
      integrityFlags.push('TEST_INTEGRITY_FLAG: Production database engine mock introduced in tests');
    }

    s.changes = {
      filesModified: modified,
      productionFiles: prodFiles,
      testFiles: testFiles,
      diffSummary: `Total modified: ${modified.length} (${prodFiles.length} production, ${testFiles.length} tests)`
    };
    s.integrityFlags = integrityFlags;

    sessions[sessionId] = s;
    saveSessions(sessions);
    return s;
  }

  static listSessions(): DevelopmentSession[] {
    const sessions = loadSessions();
    return Object.values(sessions);
  }

  static submitRemediation(req: {
    sessionId: string;
    observedFailure: string;
    severity: string;
    allowedScope: string[];
    forbiddenChanges: string[];
    acceptanceTests: string[];
  }) {
    const session = this.getSession(req.sessionId);

    if (session.repairCycle >= session.maxRepairCycles) {
      session.status = 'HUMAN_REVIEW_REQUIRED';
      const sessions = loadSessions();
      sessions[req.sessionId] = session;
      saveSessions(sessions);

      return {
        status: 'HUMAN_REVIEW_REQUIRED',
        cycle: session.repairCycle,
        maxCycles: session.maxRepairCycles,
        message: 'Maximum autonomous repair cycles (3) reached. Escalating to human reviewer.'
      };
    }

    session.repairCycle += 1;
    session.status = 'REMEDIATION_REQUIRED';
    session.remediationHistory.push({
      cycle: session.repairCycle,
      timestamp: new Date().toISOString(),
      observedFailure: req.observedFailure,
      severity: req.severity,
      allowedScope: req.allowedScope,
      forbiddenChanges: req.forbiddenChanges,
      acceptanceTests: req.acceptanceTests
    });

    const sessions = loadSessions();
    sessions[req.sessionId] = session;
    saveSessions(sessions);

    // Enqueue task into remediation task queue
    const tasks = loadTasks();
    const taskId = `TASK-${req.sessionId}-${String(session.repairCycle).padStart(3, '0')}`;
    const task: RemediationTask = {
      taskId,
      sessionId: req.sessionId,
      title: `Remediation Cycle ${session.repairCycle}: ${req.observedFailure.slice(0, 60)}`,
      observedFailure: req.observedFailure,
      severity: req.severity,
      allowedScope: req.allowedScope,
      forbiddenChanges: req.forbiddenChanges,
      acceptanceTests: req.acceptanceTests,
      status: 'QUEUED',
      createdAt: new Date().toISOString()
    };
    tasks[taskId] = task;
    saveTasks(tasks);

    return {
      status: 'REMEDIATION_REQUIRED',
      cycle: session.repairCycle,
      maxCycles: session.maxRepairCycles,
      taskId,
      taskStatus: 'QUEUED',
      session
    };
  }

  static getTask(taskId: string): RemediationTask {
    const tasks = loadTasks();
    const task = tasks[taskId];
    if (!task) throw new Error(`TASK_NOT_FOUND: Remediation task '${taskId}' does not exist.`);
    return task;
  }

  static listTasks(sessionId?: string): RemediationTask[] {
    const tasks = loadTasks();
    const all = Object.values(tasks);
    if (sessionId) return all.filter(t => t.sessionId === sessionId);
    return all;
  }

  static claimTask(taskId: string, developerId: string = 'antigravity-dev'): RemediationTask {
    const tasks = loadTasks();
    const task = tasks[taskId];
    if (!task) throw new Error(`TASK_NOT_FOUND: Remediation task '${taskId}' does not exist.`);
    if (task.status !== 'QUEUED') {
      throw new Error(`INVALID_STATE_TRANSITION: Cannot claim task in status '${task.status}'. Expected 'QUEUED'.`);
    }
    task.status = 'CLAIMED';
    task.claimedBy = developerId;
    task.claimedAt = new Date().toISOString();
    tasks[taskId] = task;
    saveTasks(tasks);
    return task;
  }

  static completeTask(taskId: string, resultArtifact: {
    commitSha: string;
    diffSummary: string;
    testsPassed: boolean;
  }): RemediationTask {
    const tasks = loadTasks();
    const task = tasks[taskId];
    if (!task) throw new Error(`TASK_NOT_FOUND: Remediation task '${taskId}' does not exist.`);
    if (task.status !== 'CLAIMED' && task.status !== 'QUEUED') {
      throw new Error(`INVALID_STATE_TRANSITION: Cannot complete task in status '${task.status}'. Expected 'CLAIMED'.`);
    }
    // Developer marks task COMPLETE — developer CANNOT mark it PASS
    task.status = 'COMPLETE';
    task.completedAt = new Date().toISOString();
    task.resultArtifact = resultArtifact;
    tasks[taskId] = task;
    saveTasks(tasks);

    // Update parent session to REVIEW_PENDING
    const sessions = loadSessions();
    const session = sessions[task.sessionId];
    if (session) {
      session.status = 'REVIEW_PENDING';
      saveSessions(sessions);
    }

    return task;
  }

  static evaluateTask(taskId: string, verdict: 'PASS' | 'REMEDIATION_REQUIRED', explanation: string): RemediationTask {
    const tasks = loadTasks();
    const task = tasks[taskId];
    if (!task) throw new Error(`TASK_NOT_FOUND: Remediation task '${taskId}' does not exist.`);
    if (task.status !== 'COMPLETE') {
      throw new Error(`INVALID_STATE_TRANSITION: Reviewer can only evaluate tasks in 'COMPLETE' status, current is '${task.status}'.`);
    }
    task.status = verdict;
    task.reviewVerdict = verdict;
    task.reviewExplanation = explanation;
    tasks[taskId] = task;
    saveTasks(tasks);

    // Update parent session to reviewer verdict
    const sessions = loadSessions();
    const session = sessions[task.sessionId];
    if (session) {
      session.status = verdict;
      saveSessions(sessions);
    }

    return task;
  }

  /**
   * Section N: Structured Antigravity Handoff Package
   * Generates a complete, structured prompt package ready to be handed off to Antigravity
   */
  static createDevelopmentTaskPackage(sessionId: string) {
    const session = this.getSession(sessionId);
    const latestRemediation = session.remediationHistory.slice(-1)[0];

    session.status = 'DEVELOPER_WORKING';
    const sessions = loadSessions();
    sessions[sessionId] = session;
    saveSessions(sessions);

    const taskPackage = {
      sessionId: session.sessionId,
      status: session.status,
      baselineSHA: session.baselineCommit,
      objective: session.objective,
      repairCycle: session.repairCycle,
      maxRepairCycles: session.maxRepairCycles,
      observedFailure: latestRemediation?.observedFailure || 'Initial task implementation',
      severity: latestRemediation?.severity || 'P1',
      allowedScope: latestRemediation?.allowedScope || session.constraints,
      forbiddenChanges: [
        'Do NOT edit test files to weaken assertions or hardcode passes',
        'Do NOT modify production database schemas without approval',
        'Do NOT bypass existing WealthOS business engines',
        ...(latestRemediation?.forbiddenChanges || [])
      ],
      acceptanceTests: latestRemediation?.acceptanceTests || ['tests/unit/wealthos_universal_mcp.test.ts'],
      handoffInstructions: `Paste this structured package into Antigravity IDE. Once work is complete, invoke resume_development_session('${session.sessionId}') to initiate independent review.`
    };

    return taskPackage;
  }

  /**
   * Section N: Resume Development Session
   * Detects changes in repository working tree and transitions to REVIEWING
   */
  static resumeDevelopmentSession(sessionId: string) {
    const session = this.getSession(sessionId);
    const repoStatus = RepositoryAdapter.getStatus();

    session.status = 'REVIEWING';
    session.changes = {
      filesModified: repoStatus.modifiedFiles,
      productionFiles: repoStatus.modifiedFiles.filter(f => f.startsWith('src/server') || f.startsWith('src/lib') || f === 'server.ts'),
      testFiles: repoStatus.modifiedFiles.filter(f => f.startsWith('tests/')),
      diffSummary: `Modified: ${repoStatus.modifiedCount} files, Untracked: ${repoStatus.untrackedCount} files`
    };

    const sessions = loadSessions();
    sessions[sessionId] = session;
    saveSessions(sessions);

    return {
      sessionId: session.sessionId,
      status: session.status,
      changesDetected: repoStatus.modifiedCount > 0 || repoStatus.untrackedCount > 0,
      modifiedFiles: repoStatus.modifiedFiles,
      integrityFlags: session.integrityFlags,
      nextStep: 'Execute run_tests and independent verification oracles before approving session.'
    };
  }

  static cancelRemediation(sessionId: string, reason: string) {
    const session = this.getSession(sessionId);
    session.status = 'CANCELLED';
    const sessions = loadSessions();
    sessions[sessionId] = session;
    saveSessions(sessions);
    return { sessionId, status: 'CANCELLED', reason };
  }
}
