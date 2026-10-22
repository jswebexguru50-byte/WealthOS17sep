import React, { useState } from 'react';
import {
  FlaskConical,
  CheckCircle,
  XCircle,
  Play,
  RotateCcw,
  Clock,
  Terminal,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { TestResultItem } from '../../types.js';

interface TestSuiteViewProps {
  testResults: TestResultItem[];
  onRunTests: () => void;
  isRunning: boolean;
  testSummary: {
    passed: number;
    failed: number;
    total: number;
  };
}

export const TestSuiteView: React.FC<TestSuiteViewProps> = ({
  testResults,
  onRunTests,
  isRunning,
  testSummary,
}) => {
  const [expandedTests, setExpandedTests] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedTests((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'Unit':
        return 'bg-blue-950/60 text-blue-300 border-blue-800/40';
      case 'Integration':
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40';
      case 'Cost':
        return 'bg-amber-950/60 text-amber-300 border-amber-800/40';
      case 'Backtest':
        return 'bg-purple-950/60 text-purple-300 border-purple-800/40';
      case 'Regression':
        return 'bg-cyan-950/60 text-cyan-300 border-cyan-800/40';
      case 'Manual':
        return 'bg-slate-800 text-slate-300 border-slate-700';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Test Runner Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <FlaskConical className="w-6 h-6 text-emerald-400" />
              <h2 className="text-xl font-bold text-white tracking-tight">
                §7 Institutional Testing & Verification Suite
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              Deterministic verification suite covering mathematical accuracy, schema enforcement, token budget ceilings
              (T-COST-01), funnel threshold gating, catalyst deduplication, and historical valuation backtests.
            </p>
          </div>

          <button
            onClick={onRunTests}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold tracking-wide transition-colors shadow-sm disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>Executing Test Suite...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Run All 11 Tests (§7)</span>
              </>
            )}
          </button>
        </div>

        {/* Results Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
            <span className="text-[11px] font-mono text-slate-400">Total Test Cases</span>
            <div className="text-xl font-bold font-mono text-white mt-1">{testSummary.total}</div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
            <span className="text-[11px] font-mono text-slate-400">Passed</span>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-1">{testSummary.passed}</div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
            <span className="text-[11px] font-mono text-slate-400">Failed</span>
            <div className="text-xl font-bold font-mono text-rose-400 mt-1">{testSummary.failed}</div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
            <span className="text-[11px] font-mono text-slate-400">Compliance Rate</span>
            <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
              {testSummary.total > 0 ? ((testSummary.passed / testSummary.total) * 100).toFixed(0) : 0}%
            </div>
          </div>
        </div>
      </div>

      {/* Test Cases List */}
      <div className="space-y-3">
        {testResults.map((test) => {
          const isPassed = test.status === 'PASSED';
          const isExpanded = !!expandedTests[test.testId];

          return (
            <div
              key={test.testId}
              className={`bg-slate-900 border rounded-xl overflow-hidden transition-colors ${
                isPassed ? 'border-slate-800 hover:border-slate-700' : 'border-rose-900/60'
              }`}
            >
              <div
                onClick={() => toggleExpand(test.testId)}
                className="p-4 flex items-center justify-between gap-4 cursor-pointer select-none"
              >
                <div className="flex items-center gap-3">
                  {isPassed ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white">{test.testId}</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${getTypeBadge(test.type)}`}>
                        {test.type}
                      </span>
                      <span className="text-xs text-slate-300 font-medium">{test.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{test.assertion}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono text-slate-500">{test.durationMs}ms</span>
                  <span
                    className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
                      isPassed ? 'bg-emerald-950/60 text-emerald-400' : 'bg-rose-950/60 text-rose-400'
                    }`}
                  >
                    {test.status}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="bg-slate-950/60 p-4 border-t border-slate-800/80 text-xs font-mono text-slate-300 space-y-2">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Execution Trace & Assertion Details:</span>
                  </div>
                  <pre className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {test.details}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
