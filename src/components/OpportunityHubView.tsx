import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Compass,
  TrendingUp,
  Target,
  Shield,
  Activity,
  Layers,
  Sparkles,
  Crosshair,
  GitMerge,
  Cpu,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  Flame,
  Zap,
  DollarSign,
  Youtube,
  BarChart3
} from 'lucide-react';
import { OpportunityEngineMasterView } from './OpportunityEngineMasterView.js';
import { OpportunitiesRebalancingHub } from './OpportunitiesRebalancingHub.js';
import { GreenfieldInvestmentPortal } from './GreenfieldInvestmentPortal.js';
import { IndependentTechnicalStrategiesView } from './IndependentTechnicalStrategiesView.js';
import { KnowledgeLabView } from './KnowledgeLabView.js';
import { RegimeBacktestComparisonView } from './RegimeBacktestComparisonView.js';

interface OpportunityHubViewProps {
  selectedPortfolio?: string;
  onSelectScrip?: (symbol: string) => void;
  onNavigateToOrder?: (symbol: string) => void;
}

export type OpportunitySubTab = 'MARKET_RADAR' | 'PORTFOLIO_DIAGNOSIS' | 'GREENFIELD_DEPLOY' | 'TECHNICAL_SETUPS' | 'KNOWLEDGE_INTELLIGENCE' | 'REGIME_BACKTEST';

interface CalibrationTelemetry {
  regime: string;
  weights: {
    convictionFundamental: number;
    convictionTechnical: number;
    smartMoney: number;
    sectorRS: number;
  };
  lastCalibrated?: string;
  activeDriftAlertsCount: number;
}

export const OpportunityHubView: React.FC<OpportunityHubViewProps> = ({
  selectedPortfolio = 'Combined',
  onSelectScrip,
  onNavigateToOrder
}) => {
  const [activeTab, setActiveTab] = useState<OpportunitySubTab>('MARKET_RADAR');
  const [telemetry, setTelemetry] = useState<CalibrationTelemetry | null>(null);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationNotice, setCalibrationNotice] = useState<string | null>(null);

  const fetchTelemetry = async () => {
    try {
      const [wRes, dRes] = await Promise.all([
        fetch('/api/strategy-calibration/weights'),
        fetch('/api/strategy-calibration/drift-alerts')
      ]);
      const wJson = await wRes.json();
      const dJson = await dRes.json();

      if (wJson.success && wJson.data) {
        setTelemetry({
          regime: wJson.regime || 'CONSTRUCTIVE_STOCK_PICKING',
          weights: wJson.data,
          lastCalibrated: wJson.lastCalibrated,
          activeDriftAlertsCount: dJson?.count || 0
        });
      }
    } catch (err) {
      console.warn('[OpportunityHubView] Telemetry load notice:', err);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, []);

  const triggerCalibrationCycle = async () => {
    setIsCalibrating(true);
    setCalibrationNotice('Executing self-healing calibration cycle with Wilson Score CI...');
    try {
      const res = await fetch('/api/strategy-calibration/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      });
      const data = await res.json();
      if (data.success) {
        setCalibrationNotice(`✅ Calibration ${data.data?.status || 'COMPLETED'}: ${data.data?.changeRationale?.slice(0, 80)}...`);
        fetchTelemetry();
      } else {
        setCalibrationNotice(`Notice: ${data.message || 'Calibration evaluation ran without weight changes'}`);
      }
    } catch (err: any) {
      setCalibrationNotice(`Calibration error: ${err.message}`);
    } finally {
      setIsCalibrating(false);
      setTimeout(() => setCalibrationNotice(null), 7000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Self-Healing Strategy Calibration Telemetry Header Bar */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-xl backdrop-blur-md">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
                  Institutional Opportunity Engine
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    PHASE 1-4 COMPLIANT
                  </span>
                </h2>
                <span className="text-xs font-mono text-slate-400">
                  Regime: <strong className="text-emerald-400">{telemetry?.regime || 'CONSTRUCTIVE_STOCK_PICKING'}</strong>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Dynamic 5-Pillar Convergence • Live Wilson Score Calibration • Zero Fabricated Metrics
              </p>
            </div>
          </div>

          {/* Calibrated Weights Pill Display */}
          <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
            {telemetry?.weights && (
              <div className="flex items-center gap-1.5 bg-slate-950/70 border border-slate-800 px-3 py-1.5 rounded-xl">
                <span className="text-slate-400 text-[11px]">Dynamic Weights:</span>
                <span className="text-emerald-400 font-bold" title="Fundamental Conviction">
                  F:{telemetry.weights.convictionFundamental}%
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-cyan-400 font-bold" title="Technical Confluence">
                  T:{telemetry.weights.convictionTechnical}%
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-blue-400 font-bold" title="Smart Money Flow">
                  SM:{telemetry.weights.smartMoney}%
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-purple-400 font-bold" title="Sector Relative Strength">
                  RS:{telemetry.weights.sectorRS}%
                </span>
              </div>
            )}

            <button
              onClick={triggerCalibrationCycle}
              disabled={isCalibrating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition active:scale-95 text-xs font-semibold cursor-pointer disabled:opacity-50"
              title="Run live Wilson Score CI calibration cycle over recent recommendations"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCalibrating ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{isCalibrating ? 'Calibrating...' : 'Self-Heal Weights'}</span>
            </button>
          </div>
        </div>

        {calibrationNotice && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-xs text-cyan-200 flex items-center gap-2 font-mono"
          >
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{calibrationNotice}</span>
          </motion.div>
        )}
      </div>

      {/* Primary Sub-Hub Navigation Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin border-b border-slate-800/80">
        {[
          { id: 'MARKET_RADAR', label: '1. Market Radar', sub: 'Macro + Top 5/10/25 + Sell Radar', icon: Compass, color: 'text-cyan-400' },
          { id: 'PORTFOLIO_DIAGNOSIS', label: '2. Portfolio Diagnosis', sub: 'Redeployment & Switch Matrix', icon: GitMerge, color: 'text-amber-400' },
          { id: 'GREENFIELD_DEPLOY', label: '3. New Capital Deployment', sub: 'Greenfield Allocation Engine', icon: DollarSign, color: 'text-emerald-400' },
          { id: 'TECHNICAL_SETUPS', label: '4. Technical Setups', sub: 'Pure VPA, FVG & Trend Scanning', icon: Crosshair, color: 'text-purple-400' },
          { id: 'KNOWLEDGE_INTELLIGENCE', label: '5. Knowledge Lab', sub: 'YouTube AI & Debate Matrix', icon: Youtube, color: 'text-red-400' },
          { id: 'REGIME_BACKTEST', label: '6. Strategy Backtester', sub: '750-Stock 3-Regime Matrix', icon: BarChart3, color: 'text-emerald-400' }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as OpportunitySubTab)}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl transition text-left shrink-0 cursor-pointer font-sans ${
                isActive
                  ? 'bg-slate-800 text-white border border-cyan-500/40 shadow-lg shadow-cyan-950/30'
                  : 'bg-slate-900/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${tab.color}`} />
              <div>
                <span className="block text-xs font-bold leading-tight">{tab.label}</span>
                <span className="block text-[10px] text-slate-500 font-normal mt-0.5">{tab.sub}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Primary Hub Content View */}
      <div className="min-h-[600px]">
        {activeTab === 'MARKET_RADAR' && (
          <OpportunityEngineMasterView
            selectedPortfolio={selectedPortfolio}
            onSelectScrip={onSelectScrip}
          />
        )}

        {activeTab === 'PORTFOLIO_DIAGNOSIS' && (
          <OpportunitiesRebalancingHub
            selectedPortfolio={selectedPortfolio}
            onNavigateToOrder={onNavigateToOrder}
          />
        )}

        {activeTab === 'GREENFIELD_DEPLOY' && (
          <GreenfieldInvestmentPortal
            selectedPortfolio={selectedPortfolio}
            onNavigateToOrder={onNavigateToOrder}
          />
        )}

        {activeTab === 'TECHNICAL_SETUPS' && (
          <IndependentTechnicalStrategiesView
            onSelectScrip={onSelectScrip}
          />
        )}

        {activeTab === 'KNOWLEDGE_INTELLIGENCE' && (
          <KnowledgeLabView />
        )}

        {activeTab === 'REGIME_BACKTEST' && (
          <RegimeBacktestComparisonView />
        )}
      </div>
    </div>
  );
};
