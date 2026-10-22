import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(); const outDir=path.join(root,'outputs/fundamental_dossiers/pilot_25');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const azad=read('outputs/fundamental_dossiers/deep/AZAD_deep_fundamental.md');
const kabel=read('outputs/fundamental_dossiers/deep/RRKABEL_deep_fundamental.md');
const institutional=read('outputs/fundamental_dossiers/pilot_25/Combined_Institutional_Due_Diligence_AZAD_RRKABEL.md');
const benchmark=read('docs/fundamental/THREE_TOOL_AZAD_RRKABEL_BENCHMARK.md');
const executive=`# Comprehensive Institutional Research Report — AZAD and RRKABEL

## Executive comparison

AZAD is presented in the supplied institutional context as a specialist aerospace, defence and precision-manufacturing growth company. The app’s canonical data adds an important caution: current reported cash flow is materially weaker than PAT and capex is substantial, so growth optionality must be evaluated alongside working-capital execution and plant utilisation. Its valuation is sensitive to the selected provider/period and must be reconciled before decision use.

RRKABEL is presented as a scaled wires, cables and electrical-products compounder. The app’s canonical data shows positive current CFO relative to PAT, low debt/equity, strong interest cover and higher ROCE than AZAD in the current snapshot. Its principal analytical questions are margin durability, commodity pass-through, FMEG execution and peer-relative valuation.

The supplied business narrative is retained in full later in this report. App figures are authoritative for dated quantitative decisions; supplied qualitative context is preserved unless a direct dated conflict is identified.

## Decision-ready comparison

| Dimension | AZAD | RRKABEL |
|---|---|---|
| Business profile | Specialist manufacturing growth thesis | Core electricals and distribution thesis |
| Current CFO/PAT read-through | Weak/negative in current snapshot; monitor working capital | Positive in current snapshot; verify multi-year consistency |
| Leverage | Debt/equity 0.30; interest cover 8.79x | Debt/equity 0.09; interest cover 11.16x |
| Returns | ROE 8.69%; ROCE 11.49% | ROE 19.11%; ROCE 27.32% |
| Valuation caution | Conflicting P/E values require date/provider reconciliation | Peer-normalised valuation still required |
| Main monitoring focus | Order-book conversion, customer concentration, capex utilisation and cash conversion | Copper pass-through, FMEG margin recovery, channel inventory and competitive pricing |

## WealthOS deep quantitative notes

### AZAD

${azad}

### RRKABEL

${kabel}

## Full institutional due-diligence matrix and supplied context

${institutional}

## Benchmark against the three referenced approaches

${benchmark}

## Final interpretation

The strongest production design is a hybrid: WealthOS remains the canonical point-in-time store and deterministic calculation layer; the supplied institutional narrative remains visible as research context; the Aaryan-Nakhat-style source and forensic architecture improves breadth; the Ramit-style report contract improves readability; and Tapetide-style tools can be considered optional discovery inputs rather than authoritative storage. No external LLM is required for the quantitative layer. If an LLM is later enabled, it should only synthesize already-cited facts and preserve every source, period, conflict and missingness marker.
`;
const out=path.join(outDir,'Comprehensive_Institutional_Research_AZAD_RRKABEL.md'); fs.writeFileSync(out,executive); console.log(out);
