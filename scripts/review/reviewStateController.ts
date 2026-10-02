/**
 * WealthOS Universal Review State Controller & Authority Validator
 * Authoritative shared transition logic for reports/review/control/REVIEW_STATE.json
 * Satisfies: Codex Finding FRAMEWORK_AUTHORITY_001
 */

import fs from 'fs';
import path from 'path';

export type ReviewActor = 'ANTIGRAVITY' | 'CODEX';

export type ReviewState =
  | 'IDLE'
  | 'CODEX_REVIEWING'
  | 'REMEDIATION_READY'
  | 'ANTIGRAVITY_WORKING'
  | 'AWAITING_CODEX_VERIFICATION'
  | 'REMEDIATION_REQUIRED'
  | 'PASS'
  | 'HUMAN_APPROVAL_REQUIRED'
  | 'BLOCKED';

export interface StateHistoryEntry {
  state: ReviewState;
  setBy: ReviewActor;
  timestamp: string;
  reason?: string;
  requestId?: string;
  reviewId?: string;
}

export interface ReviewStateData {
  state: ReviewState;
  program: string;
  reviewId?: string;
  requestId?: string;
  iteration: number;
  setBy: ReviewActor;
  reason: string;
  activeOwner: ReviewActor;
  nextArtifact?: string;
  timestamp: string;
  stateHistory?: StateHistoryEntry[];
}

export interface TransitionRule {
  from: ReviewState | ReviewState[];
  to: ReviewState;
  authorizedActor: ReviewActor;
  nextOwner: ReviewActor;
}

export const TRANSITION_RULES: TransitionRule[] = [
  { from: 'IDLE', to: 'CODEX_REVIEWING', authorizedActor: 'CODEX', nextOwner: 'CODEX' },
  { from: 'CODEX_REVIEWING', to: 'PASS', authorizedActor: 'CODEX', nextOwner: 'CODEX' },
  { from: 'CODEX_REVIEWING', to: 'REMEDIATION_READY', authorizedActor: 'CODEX', nextOwner: 'ANTIGRAVITY' },
  { from: 'CODEX_REVIEWING', to: 'REMEDIATION_REQUIRED', authorizedActor: 'CODEX', nextOwner: 'ANTIGRAVITY' },
  { from: 'CODEX_REVIEWING', to: 'HUMAN_APPROVAL_REQUIRED', authorizedActor: 'CODEX', nextOwner: 'CODEX' },
  { from: 'REMEDIATION_READY', to: 'ANTIGRAVITY_WORKING', authorizedActor: 'ANTIGRAVITY', nextOwner: 'ANTIGRAVITY' },
  { from: 'REMEDIATION_REQUIRED', to: 'ANTIGRAVITY_WORKING', authorizedActor: 'ANTIGRAVITY', nextOwner: 'ANTIGRAVITY' },
  { from: 'ANTIGRAVITY_WORKING', to: 'AWAITING_CODEX_VERIFICATION', authorizedActor: 'ANTIGRAVITY', nextOwner: 'CODEX' },
  { from: 'ANTIGRAVITY_WORKING', to: 'BLOCKED', authorizedActor: 'ANTIGRAVITY', nextOwner: 'ANTIGRAVITY' },
  { from: 'AWAITING_CODEX_VERIFICATION', to: 'CODEX_REVIEWING', authorizedActor: 'CODEX', nextOwner: 'CODEX' },
  { from: 'BLOCKED', to: 'HUMAN_APPROVAL_REQUIRED', authorizedActor: 'ANTIGRAVITY', nextOwner: 'CODEX' },
  { from: 'BLOCKED', to: 'HUMAN_APPROVAL_REQUIRED', authorizedActor: 'CODEX', nextOwner: 'CODEX' },
  { from: 'HUMAN_APPROVAL_REQUIRED', to: 'IDLE', authorizedActor: 'CODEX', nextOwner: 'CODEX' },
  { from: 'PASS', to: 'IDLE', authorizedActor: 'CODEX', nextOwner: 'CODEX' }
];

export class ReviewStateController {
  private stateFilePath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.stateFilePath = customPath;
    } else {
      this.stateFilePath = path.resolve(process.cwd(), 'reports/review/control/REVIEW_STATE.json');
    }
  }

  public readState(): ReviewStateData {
    if (!fs.existsSync(this.stateFilePath)) {
      throw new Error(`State file does not exist: ${this.stateFilePath}`);
    }
    const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
    return JSON.parse(raw);
  }

  public validateTransition(
    currentState: ReviewState,
    targetState: ReviewState,
    actor: ReviewActor
  ): { valid: boolean; error?: string; rule?: TransitionRule } {
    // 1. Strict Developer Prohibition: Antigravity can NEVER set PASS
    if (actor === 'ANTIGRAVITY' && targetState === 'PASS') {
      return {
        valid: false,
        error: `AUTHORITY_VIOLATION: Actor ANTIGRAVITY cannot transition to reviewer-owned state PASS. Only CODEX possesses independent acceptance authority.`
      };
    }

    // 2. Strict Developer Prohibition: Antigravity cannot declare REMEDIATION_READY or REMEDIATION_REQUIRED
    if (actor === 'ANTIGRAVITY' && (targetState === 'REMEDIATION_READY' || targetState === 'REMEDIATION_REQUIRED')) {
      return {
        valid: false,
        error: `AUTHORITY_VIOLATION: Actor ANTIGRAVITY cannot issue review findings (${targetState}). Only CODEX can issue review requests.`
      };
    }

    // 3. Find matching transition rule
    const matchingRule = TRANSITION_RULES.find(r => {
      const fromMatch = Array.isArray(r.from) ? r.from.includes(currentState) : r.from === currentState;
      return fromMatch && r.to === targetState;
    });

    if (!matchingRule) {
      return {
        valid: false,
        error: `INVALID_STATE_TRANSITION: No valid transition exists from ${currentState} to ${targetState}.`
      };
    }

    if (matchingRule.authorizedActor !== actor) {
      return {
        valid: false,
        error: `UNAUTHORIZED_ACTOR: Transition from ${currentState} to ${targetState} requires actor ${matchingRule.authorizedActor}, but was attempted by ${actor}.`
      };
    }

    return { valid: true, rule: matchingRule };
  }

  public executeTransition(
    targetState: ReviewState,
    actor: ReviewActor,
    options: {
      reason: string;
      requestId?: string;
      reviewId?: string;
      program?: string;
      iteration?: number;
    }
  ): ReviewStateData {
    const current = this.readState();
    const check = this.validateTransition(current.state, targetState, actor);

    if (!check.valid || !check.rule) {
      throw new Error(check.error || 'Transition validation failed');
    }

    const now = new Date().toISOString();
    const historyEntry: StateHistoryEntry = {
      state: targetState,
      setBy: actor,
      timestamp: now,
      reason: options.reason,
      requestId: options.requestId || current.requestId,
      reviewId: options.reviewId || current.reviewId
    };

    const updated: ReviewStateData = {
      state: targetState,
      program: options.program || current.program || 'FUNDAMENTAL_CALIBRATION',
      reviewId: options.reviewId || current.reviewId,
      requestId: options.requestId || current.requestId,
      iteration: options.iteration !== undefined ? options.iteration : current.iteration,
      setBy: actor,
      reason: options.reason,
      activeOwner: check.rule.nextOwner,
      nextArtifact: check.rule.nextOwner === 'CODEX' ? 'reports/review/control/VERIFICATION_RECORD.json' : 'reports/review/control/REMEDIATION_COMPLETE.json',
      timestamp: now,
      stateHistory: [...(current.stateHistory || []), historyEntry]
    };

    fs.writeFileSync(this.stateFilePath, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  }

  public validateStateFileIntegrity(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!fs.existsSync(this.stateFilePath)) {
      errors.push(`File missing: ${this.stateFilePath}`);
      return { valid: false, errors };
    }

    let data: ReviewStateData;
    try {
      data = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf-8'));
    } catch (e: any) {
      errors.push(`Invalid JSON: ${e.message}`);
      return { valid: false, errors };
    }

    const validStates: ReviewState[] = [
      'IDLE', 'CODEX_REVIEWING', 'REMEDIATION_READY', 'ANTIGRAVITY_WORKING',
      'AWAITING_CODEX_VERIFICATION', 'REMEDIATION_REQUIRED', 'PASS',
      'HUMAN_APPROVAL_REQUIRED', 'BLOCKED'
    ];

    if (!validStates.includes(data.state)) {
      errors.push(`Invalid state value: ${data.state}`);
    }

    if (!['ANTIGRAVITY', 'CODEX'].includes(data.setBy)) {
      errors.push(`Invalid setBy actor: ${data.setBy}`);
    }

    if (data.state === 'PASS' && data.setBy !== 'CODEX') {
      errors.push(`AUTHORITY_VIOLATION: state PASS cannot be set by ${data.setBy}`);
    }

    if (data.stateHistory && Array.isArray(data.stateHistory)) {
      for (let i = 1; i < data.stateHistory.length; i++) {
        const prev = data.stateHistory[i - 1];
        const curr = data.stateHistory[i];
        const stepCheck = this.validateTransition(prev.state, curr.state, curr.setBy);
        if (!stepCheck.valid) {
          errors.push(`History transition error at step ${i} (${prev.state} -> ${curr.state} by ${curr.setBy}): ${stepCheck.error}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
