/**
 * src/server/services/phase2fasttrack/TrackBGate.ts
 *
 * Track B & B1/B2 Authorization Gate.
 * Strict Non-Authorizing Barrier for Delivery 2.1:
 * Invariant: B1 and B2 remain CLOSED by construction.
 * No operation in Delivery 2.1 can transition B1 or B2 to OPEN.
 */

import { CP21Coordinator } from './CP21Coordinator.js';

export interface GateToken {
  gate: 'CP2.1' | 'B1';
  decision: 'VERIFIED';
  evidenceHash: string;
  generatedAt: string;
  expiresAt?: string;
  tokenHash: string;
}

export interface AuthorizationState {
  readonly cp21Authorization: false;
  readonly b1Authorization: false;
  readonly b2Authorization: false;
  readonly trackBAuthorization: false;
  readonly productionAuthorization: false;
  readonly liveTradingAuthorization: false;
}

export const D21_STRICT_AUTHORIZATION_STATE: AuthorizationState = Object.freeze({
  cp21Authorization: false,
  b1Authorization: false,
  b2Authorization: false,
  trackBAuthorization: false,
  productionAuthorization: false,
  liveTradingAuthorization: false
});

export class TrackBGate {
  private readonly b1Authorized: false = false;
  private readonly b2Authorized: false = false;

  constructor(private coordinator?: CP21Coordinator) {}

  public getAuthorizationState(): AuthorizationState {
    return D21_STRICT_AUTHORIZATION_STATE;
  }

  public evaluateGate(): 'CP2.1_VERIFIED_NON_AUTHORIZING' {
    return 'CP2.1_VERIFIED_NON_AUTHORIZING';
  }

  /**
   * Run gate evaluation.
   * Invariant: In Delivery 2.1, B1 remains strictly CLOSED.
   */
  public runGate(): void {
    console.log(`\n====================================================`);
    console.log(`[GATE] Evaluating Track B Gate Conditions...`);
    console.log(`[GATE] Non-Authorizing Barrier active: B1 remains CLOSED.`);
    console.log(`====================================================\n`);
    throw new Error(
      'D2_1_NON_AUTHORIZING_BARRIER: B1 cannot transition to OPEN in Delivery 2.1. State remains CLOSED.'
    );
  }

  public authorizeB1(cp21Token?: GateToken): boolean {
    throw new Error(
      'B1_BLOCKED: D2_1_NON_AUTHORIZING_BARRIER: B1 authorization is forbidden in Delivery 2.1.'
    );
  }

  public authorizeB2(cp21Token?: GateToken, b1Token?: GateToken): boolean {
    throw new Error(
      'B2_BLOCKED: D2_1_NON_AUTHORIZING_BARRIER: B2 authorization is forbidden in Delivery 2.1.'
    );
  }

  public setB2Authorized(authorized: boolean): void {
    if (authorized) {
      throw new Error(
        'D2_1_NON_AUTHORIZING_BARRIER: Attempted to authorize B2 in Delivery 2.1.'
      );
    }
  }

  public open(): void {
    throw new Error('D2_1_NON_AUTHORIZING_BARRIER: Gate cannot be opened in Delivery 2.1.');
  }

  public authorize(): void {
    throw new Error('D2_1_NON_AUTHORIZING_BARRIER: Direct authorization forbidden in Delivery 2.1.');
  }

  public enable(): void {
    throw new Error('D2_1_NON_AUTHORIZING_BARRIER: Direct enablement forbidden in Delivery 2.1.');
  }
}
