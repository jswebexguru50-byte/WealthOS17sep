#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'; import Database from 'better-sqlite3';
const root=process.cwd(), args=process.argv.slice(2), symbol=(args[0]||'').toUpperCase(), asOf=args[1]||new Date().toISOString().slice(0,10);
if(!symbol) throw new Error('Usage: node scripts/readiness/verify_unified_pipeline.mjs SYMBOL [YYYY-MM-DD]');
const db=new Database((process.env.DATABASE_URL||path.join(root,'portfolio.db')).replace(/^sqlite:\/\//,''),{readonly:true});
const count=(sql,p=[])=>db.prepare(sql).get(...p).n;
const facts=count(`SELECT count(*) n FROM company_facts WHERE upper(symbol)=? AND verificationStatus IN ('VERIFIED','VERIFIED_PARTIAL') AND availabilityStatus IN ('AVAILABLE','AVAILABLE_FROM_PROVIDER')`,[symbol]);
const fere=count(`SELECT count(*) n FROM company_facts WHERE upper(symbol)=? AND provider='FERE_NSE_XBRL' AND verificationStatus='VERIFIED'`,[symbol]);
const bundle=path.join(root,'outputs','institutional29',symbol,'evidence_bundle.json');
const handoff=path.join(root,'reports','fundamental',`${symbol}_investment_dossier_${asOf}_chat_handoff.md`);
const report=path.join(root,'reports','fundamental',`${symbol}_investment_dossier_${asOf}.md`);
const result={symbol,asOf,canonicalFacts:facts,fereFacts:fere,evidenceBundle:fs.existsSync(bundle),deliverable:fs.existsSync(report)?'REPORT':fs.existsSync(handoff)?'CHAT_LLM_HANDOFF':'MISSING'};
db.close(); console.log(JSON.stringify(result,null,2));
if(!facts||!result.evidenceBundle||result.deliverable==='MISSING') process.exitCode=2;
