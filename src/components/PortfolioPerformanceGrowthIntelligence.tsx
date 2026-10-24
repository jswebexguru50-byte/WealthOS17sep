import React from 'react';
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,Tooltip,Legend} from 'recharts';
import {ANALYTICS_UNAVAILABLE} from '../types/Analytics';
interface Props {
 growthHistory?: any[];annualFyData?:any[];currentPortfolioValue?:number;
 totalInvested?:number;portfolioXirr?:number;
}
/** Never substitutes portfolio values or fixed multipliers for benchmark observations. */
export function PortfolioPerformanceGrowthIntelligence({growthHistory=[]}:Props) {
 const verified=growthHistory.filter(row=>row.date && row.benchmark_source && row.ledger_revision &&
   Number.isFinite(row.market_value) && Number.isFinite(row.benchmark_value));
 if(!verified.length) return <section className="glass-card rounded-2xl p-6" aria-label="Benchmark analytics unavailable">
  <h3>Cash-Flow Matched Benchmark Intelligence</h3>
  <p title={ANALYTICS_UNAVAILABLE.reason}>— Unavailable: verified cash-flow-matched benchmark history and calculation provenance are required.</p>
 </section>;
 const points=verified.map(row=>({date:row.date,actual:row.market_value,nifty:row.benchmark_value,
   excess:row.market_value-row.benchmark_value}));
 return <section className="glass-card rounded-2xl p-6">
  <h3>Cash-Flow Matched Benchmark Intelligence</h3>
  <p>Observed values only · through {points.at(-1)?.date} · negative excess returns retained</p>
  <ResponsiveContainer width="100%" height={300}><LineChart data={points}>
   <XAxis dataKey="date"/><YAxis/><Tooltip/><Legend/>
   <Line dataKey="actual" name="Portfolio" stroke="#10b981" dot={false}/>
   <Line dataKey="nifty" name="Benchmark" stroke="#3b82f6" dot={false}/>
   <Line dataKey="excess" name="Excess wealth" stroke="#a78bfa" dot={false}/>
  </LineChart></ResponsiveContainer>
 </section>;
}
