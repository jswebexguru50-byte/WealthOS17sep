import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export type TaskStatus =
  | 'QUEUED'
  | 'ACQUIRING'
  | 'RAW_STORED'
  | 'NORMALIZED'
  | 'PIT_VALIDATING'
  | 'COVERAGE_VALIDATING'
  | 'RESEARCH_READY'
  | 'FAILED'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'SOURCE_UNAVAILABLE'
  | 'RATE_LIMITED';

export interface AcquisitionTask {
  taskId: string;
  securityId: string;
  symbol: string;
  domain: string;
  startDate: string | null;
  endDate: string | null;
  sourceId: string;
  priority: number; // 0=P0 (Highest), 5=P5 (Lowest)
  attemptCount: number;
  maxAttempts: number;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  inputHash: string;
  recordsCount?: number;
  errorMessage?: string;
}

export class AcquisitionQueue {
  private tasks: Map<string, AcquisitionTask> = new Map();
  private stateFilePath: string;

  constructor(customStatePath?: string) {
    this.stateFilePath = customStatePath || path.resolve('reports/data-acquisition/QUEUE_STATE.json');
    this.loadState();
  }

  public enqueue(
    securityId: string,
    symbol: string,
    domain: string,
    sourceId: string,
    priority: number = 2,
    startDate: string | null = null,
    endDate: string | null = null
  ): AcquisitionTask {
    const inputKey = `${securityId}:${domain}:${startDate}:${endDate}:${sourceId}`;
    const inputHash = crypto.createHash('sha256').update(inputKey).digest('hex');
    const taskId = `TSK_${inputHash.substring(0, 16)}`;

    if (this.tasks.has(taskId)) {
      return this.tasks.get(taskId)!;
    }

    const task: AcquisitionTask = {
      taskId,
      securityId,
      symbol,
      domain,
      startDate,
      endDate,
      sourceId,
      priority,
      attemptCount: 0,
      maxAttempts: 5,
      status: 'QUEUED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      inputHash
    };

    this.tasks.set(taskId, task);
    return task;
  }

  public getNextTask(): AcquisitionTask | null {
    // Find highest priority queued task (lowest priority number = P0)
    let bestTask: AcquisitionTask | null = null;

    for (const t of this.tasks.values()) {
      if (t.status === 'QUEUED') {
        if (!bestTask || t.priority < bestTask.priority || (t.priority === bestTask.priority && t.createdAt < bestTask.createdAt)) {
          bestTask = t;
        }
      }
    }

    if (bestTask) {
      bestTask.status = 'ACQUIRING';
      bestTask.attemptCount++;
      bestTask.updatedAt = new Date().toISOString();
    }

    return bestTask;
  }

  public updateTaskStatus(taskId: string, status: TaskStatus, details?: { recordsCount?: number; error?: string }): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      task.updatedAt = new Date().toISOString();
      if (details?.recordsCount !== undefined) task.recordsCount = details.recordsCount;
      if (details?.error !== undefined) task.errorMessage = details.error;
    }
  }

  public getQueueDepth(): number {
    let count = 0;
    for (const t of this.tasks.values()) {
      if (t.status === 'QUEUED' || t.status === 'ACQUIRING') count++;
    }
    return count;
  }

  public getCompletedCount(): number {
    let count = 0;
    for (const t of this.tasks.values()) {
      if (t.status === 'RESEARCH_READY') count++;
    }
    return count;
  }

  public getFailedCount(): number {
    let count = 0;
    for (const t of this.tasks.values()) {
      if (t.status === 'FAILED' || t.status === 'BLOCKED') count++;
    }
    return count;
  }

  public saveState(): void {
    fs.mkdirSync(path.dirname(this.stateFilePath), { recursive: true });
    const all = Array.from(this.tasks.values());
    fs.writeFileSync(this.stateFilePath, JSON.stringify(all, null, 2));
  }

  private loadState(): void {
    if (!fs.existsSync(this.stateFilePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf-8'));
      for (const t of data) {
        this.tasks.set(t.taskId, t);
      }
    } catch {
      // Ignore
    }
  }
}
