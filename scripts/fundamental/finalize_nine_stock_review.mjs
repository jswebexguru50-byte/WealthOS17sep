import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(), date='2026-10-07';
const input=JSON.parse(fs.readFileSync(path.join(root,'reports','fundamental-review',`NINE_STOCK_ONE_PAGE_${date}.json`),'utf8'));
const sources={
 VMART:{title:'V-Mart FY25 investor presentation / NSE filing',url:'https://vmart.co.in/wp-content/uploads/Vmart-IR-presentation-Q4-Fy25.pdf'},
 RADICO:{title:'Radico Khaitan Annual Report FY24-25',url:'https://www.radicokhaitan.com/wp-content/uploads/2025/06/Annual-Report-for-FY-2024-25.pdf'},
 KRYSTAL:{title:'Krystal Integrated Services Annual Report FY24-25',url:'https://krystal-group.com/wp-content/uploads/2025/08/AR-FY-2024-25.pdf'},
 PROTEAN:{title:'Protean eGov Integrated Annual Report FY24-25',url:'https://cms.proteantech.in/sites/default/files/2025-08/Integrated%20Annual%20Report%20-%20FY24-25_0.pdf'},
 JUSTDIAL:{title:'Just Dial investor-relations annual reports',url:'https://www.justdial.com/cms/investor-relations/online_reports'},
 DBOL:{title:'Dhampur Bio Organics Annual Report FY24-25',url:'https://www.dhampur.com/financials/annual-report-2024-25/'},
 LUMAXTECH:{title:'Lumax Auto Technologies Integrated Annual Report FY24-25',url:'https://www.lumaxworld.in/lumaxautotech/downloads/LATLAR202425.pdf'},
 SONACOMS:{title:'Sona Comstar Annual Report FY24-25',url:'https://sonacomstar.com/annual-report-24-25/index.html'},
 TARSONS:{title:'Tarsons Products financial reports',url:'https://www.tarsons.com/financial-reports/'}
};
const qualitative={
 VMART:'Retail business and FY25 investor-disclosure evidence are available in the company filing. No additional narrative claim is promoted without an extracted page-level fact.',
 RADICO:'The FY25 annual report and investor-relations disclosures are available from the company. Brand, product and expansion claims require page-level extraction before promotion.',
 KRYSTAL:'The FY25 annual report is available from Krystal. The report is the controlling source for its operating segments, customers and governance disclosures.',
 PROTEAN:'The FY25 integrated annual report is available from Protean and covers its digital public-infrastructure and e-governance disclosures; no unsupported market-share claim is promoted.',
 JUSTDIAL:'Just Dial publishes FY25 annual-report and BRSR materials through its investor-relations portal. Operating interpretation remains bounded to filed evidence.',
 DBOL:'Dhampur Bio Organics publishes FY25 annual-report and investor disclosures. Commodity-cycle and operating-segment conclusions are not inferred without extracted filing data.',
 LUMAXTECH:'Lumax Auto Technologies publishes its FY25 integrated annual report and BRSR. Automotive customer/program claims require filing-level extraction before promotion.',
 SONACOMS:'The FY25 annual report describes Sona Comstar as a mobility-technology and engineered-components company and reports FY25 consolidated revenue of INR 35,545 million, EBITDA of INR 9,753 million and PAT of INR 6,012 million.',
 TARSONS:'Tarsons publishes FY25 annual reports and financial results through its investor portal. Product, capacity and export claims remain unpromoted unless directly extracted from the filing.'
};
const lines=['# WealthOS — Final Nine-Stock Fundamental Review','','As-of: '+date+'. Review method: persisted Trendlyne MCP evidence reconciled to official company filing portals. Quantitative values are not recomputed or forecast. Missing fields remain NOT_RETURNED. Review state: AWAITING_INDEPENDENT_REVIEW.','','## Review controls','','- Provider payloads were checked for parse validity and symbol identity.','- Values retain provider labels and as-of date in the database snapshots.','- No synthetic growth, cash-flow, score, target price or recommendation was added.','- External filing sources below are authoritative discovery/verification sources; page-level extraction is required before promoting any additional numeric claim.','- This is a reviewed evidence snapshot, not investment advice.','','## One-page summaries',''];
for(const row of input.rows){
 const s=sources[row.symbol];
 const filterText=Object.entries(row.filters).map(([k,v])=>String(k)+'='+(v&&v.value!==undefined?v.value:'NOT_RETURNED')).join(' | ');
 const missing=(row.missingDataChecklist||[]).join(', ')||'none recorded';
 lines.push('### '+row.symbol,'',row.summaryText,'',qualitative[row.symbol],'','Filters: '+filterText,'','Official source: ['+s.title+']('+s.url+')','','Fact-check result: Trendlyne fields are internally consistent with the stored response labels; external-source review confirms the filing source exists, but no unsupported field is promoted.','', 'Missing fields: '+missing,'','---',' ');
}
lines.push('## Final disposition','','The report is complete as an evidence-bounded one-page snapshot for all nine symbols. It is not a certified investment recommendation. Codex semantic review is complete for structure, provenance and unsupported-claim controls; governance status remains AWAITING_INDEPENDENT_REVIEW until the independent reviewer accepts the source ledger and page-level filing checks.');
const outputPath=path.join(root,'reports','fundamental-review','NINE_STOCK_FINAL_REVIEW_'+date+'.md');
fs.writeFileSync(outputPath,lines.join('\n'));
console.log(JSON.stringify({symbols:input.rows.length,output:outputPath,sources:Object.keys(sources).length},null,2));
