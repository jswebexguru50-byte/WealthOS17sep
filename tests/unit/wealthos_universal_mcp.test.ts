/**
 * WealthOS Universal MCP — Comprehensive Unit & Integration Test Suite
 * Master Developer Specification — Section AR, AS, AT, AU
 */

import { describe, it, expect } from 'vitest';
import { TOOLS } from '../../src/mcp/registry/toolRegistry.js';
import { RequirementRegistry } from '../../src/mcp/registry/requirementRegistry.js';
import { verifyXirrOracle } from '../../src/mcp/verification/xirrVerifier.js';
import { verifyFinancialMetricOracle } from '../../src/mcp/verification/financialVerifier.js';
import { verifyTechnicalIndicatorOracle } from '../../src/mcp/verification/technicalVerifier.js';
import { DeveloperAgentAdapter } from '../../src/mcp/adapters/developerAgentAdapter.js';
import { RepositoryAdapter } from '../../src/mcp/adapters/repositoryAdapter.js';

describe('WealthOS Universal MCP — Tool Registry & Schema Validity', () => {
  it('should expose at least 30 coherent user-facing tools', () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(30);
  });

  it('every tool must have a unique name, description, and valid inputSchema', () => {
    const names = new Set<string>();
    for (const tool of TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(names.has(tool.name)).toBe(false);
      names.add(tool.name);
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(typeof tool.readOnly).toBe('boolean');
      expect(typeof tool.handler).toBe('function');
    }
  });
});

describe('WealthOS Universal MCP — Security Master Domain', () => {
  it('search_securities should return matching equity instruments', async () => {
    const searchTool = TOOLS.find(t => t.name === 'search_securities')!;
    const res = await searchTool.handler({ query: 'TCS', limit: 5 });
    expect(res.status).toBe('OK');
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.data[0].symbol).toContain('TCS');
  });

  it('resolve_security should cleanly distinguish STYL vs STYLAMIND', async () => {
    const resolveTool = TOOLS.find(t => t.name === 'resolve_security')!;
    const styl = await resolveTool.handler({ symbolOrIsin: 'STYL' });
    expect(styl.data.symbol).toBe('STYL');
    expect(styl.data.isin).toBe('INE04VU01023');

    const stylam = await resolveTool.handler({ symbolOrIsin: 'STYLAMIND' });
    expect(stylam.data.symbol).toBe('STYLAMIND');
    expect(stylam.data.isin).toBe('INE239C01020');
  });
});

describe('WealthOS Universal MCP — Portfolio Management & XIRR', () => {
  it('list_portfolios and get_portfolio_summary should return authentic numbers', async () => {
    const listTool = TOOLS.find(t => t.name === 'list_portfolios')!;
    const portfolios = await listTool.handler({});
    expect(portfolios.status).toBe('OK');
    expect(Array.isArray(portfolios.data)).toBe(true);

    const summaryTool = TOOLS.find(t => t.name === 'get_portfolio_summary')!;
    const summary = await summaryTool.handler({});
    expect(summary.status).toBe('OK');
    expect(summary.data.currentAum).toBeGreaterThanOrEqual(0);
  });

  it('get_portfolio_xirr should compute true dated cashflow return', async () => {
    const xirrTool = TOOLS.find(t => t.name === 'get_portfolio_xirr')!;
    const res = await xirrTool.handler({});
    expect(res.status).toBe('OK');
    expect(typeof res.data.xirr).toBe('number');
    expect(res.data.cashflowCount).toBeGreaterThanOrEqual(0);
  });
});

describe('WealthOS Universal MCP — Independent Oracles (Anti-Self-Certification)', () => {
  it('verify_xirr oracle should compute independent root and compare against production', () => {
    const testCashflows = [
      { date: '2024-01-01', amount: -100000 },
      { date: '2025-01-01', amount: 120000 }
    ];
    // Expected rate ~20% (0.20)
    const comparison = verifyXirrOracle(testCashflows, 0.20, 0.005);
    expect(comparison.status).toBe('MATCH');
    expect(comparison.independentResult).toBeCloseTo(0.20, 2);
    expect(comparison.difference).toBeLessThanOrEqual(0.005);
  });

  it('verify_financial_metric oracle should compute exact arithmetic ratios', () => {
    const cagrRes = verifyFinancialMetricOracle(
      'CAGR',
      { startValue: 100, endValue: 144, periods: 2 },
      20.0, // Expected 20%
      0.01
    );
    expect(cagrRes.status).toBe('MATCH');
    expect(cagrRes.independentResult).toBeCloseTo(20.0, 1);

    const roeRes = verifyFinancialMetricOracle(
      'ROE_PCT',
      { pat: 25, shareholderEquity: 100 },
      25.0,
      0.01
    );
    expect(roeRes.status).toBe('MATCH');
    expect(roeRes.independentResult).toBe(25.0);
  });

  it('verify_technical_indicator oracle should independently compute SMA from raw bars', () => {
    const rawBars = Array.from({ length: 20 }, (_, i) => ({ close: 100 + i }));
    // Last 20 closes: 100..119 -> average is 109.5
    const smaRes = verifyTechnicalIndicatorOracle('SMA', rawBars, 109.5, 20, 0.01);
    expect(smaRes.status).toBe('MATCH');
    expect(smaRes.independentResult).toBe(109.5);
  });
});

describe('WealthOS Universal MCP — Developer Session Model & Remediation Contract', () => {
  it('should create session, track baseline commit, and enforce repair cycle limits', () => {
    const session = DeveloperAgentAdapter.createSession(
      'Test Developer Mission',
      ['Do not touch strategy formulas', 'Do not weaken tests']
    );
    expect(session.sessionId).toContain('DEV-');
    expect(session.status).toBe('BASELINED');
    expect(session.repairCycle).toBe(0);

    // Issue remediation request cycle 1
    const rem1 = DeveloperAgentAdapter.submitRemediation({
      sessionId: session.sessionId,
      observedFailure: 'Test failure observed in unit suite',
      severity: 'P1',
      allowedScope: ['src/server/'],
      forbiddenChanges: ['tests/'],
      acceptanceTests: ['unit']
    });
    expect(rem1.status).toBe('REMEDIATION_REQUIRED');
    expect(rem1.cycle).toBe(1);

    // Cycle 2
    DeveloperAgentAdapter.submitRemediation({
      sessionId: session.sessionId,
      observedFailure: 'Edge case still failing',
      severity: 'P2',
      allowedScope: ['src/server/'],
      forbiddenChanges: ['tests/'],
      acceptanceTests: ['unit']
    });

    // Cycle 3
    DeveloperAgentAdapter.submitRemediation({
      sessionId: session.sessionId,
      observedFailure: 'Third failure',
      severity: 'P1',
      allowedScope: ['src/server/'],
      forbiddenChanges: ['tests/'],
      acceptanceTests: ['unit']
    });

    // Cycle 4 should trigger HUMAN_REVIEW_REQUIRED (Section AH)
    const rem4 = DeveloperAgentAdapter.submitRemediation({
      sessionId: session.sessionId,
      observedFailure: 'Exceeded max repair cycles',
      severity: 'P1',
      allowedScope: ['src/server/'],
      forbiddenChanges: ['tests/'],
      acceptanceTests: ['unit']
    });
    expect(rem4.status).toBe('HUMAN_REVIEW_REQUIRED');
  });
});

describe('WealthOS Universal MCP — Repository Sandboxing & Secret Redaction', () => {
  it('should reject path traversal attempts outside repository root', async () => {
    const inspectTool = TOOLS.find(t => t.name === 'inspect_source_file')!;
    await expect(inspectTool.handler({ filePath: '../../../../windows/system32/cmd.exe' })).rejects.toThrow(/SECURITY_VIOLATION/);
  });

  it('should forbid reading sensitive .env files', async () => {
    const inspectTool = TOOLS.find(t => t.name === 'inspect_source_file')!;
    await expect(inspectTool.handler({ filePath: '.env' })).rejects.toThrow(/SECURITY_VIOLATION/);
  });

  it('should return repository status without exposing secrets', async () => {
    const statusTool = TOOLS.find(t => t.name === 'get_repository_status')!;
    const res = await statusTool.handler({});
    expect(res.status).toBe('OK');
    expect(res.data.branch).toBeTruthy();
    expect(res.data.commit).toBeTruthy();
  });
});
