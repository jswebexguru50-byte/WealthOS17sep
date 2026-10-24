import fs from 'node:fs';
import path from 'node:path';
import { getDB, dbGet, dbRun } from '../database.js';
let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;
const advance=(f:string)=>{const d=new Date();if(f==='MONTHLY')d.setMonth(d.getMonth()+1);else if(f==='WEEKLY')d.setDate(d.getDate()+7);else d.setDate(d.getDate()+1);return d.toISOString();};
/** Local-only durable worker: consumes queues but never sends mail or mutates broker positions. */
export async function processLocalQueues(): Promise<void> {
 if(busy)return; busy=true; const db=getDB(); try {
  const job:any=await dbGet(db,"SELECT id FROM broker_import_jobs WHERE status='QUEUED' ORDER BY id LIMIT 1");
  if(job){const claimed:any=await dbRun(db,"UPDATE broker_import_jobs SET status='RUNNING',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='QUEUED'",[job.id]);if(claimed.changes)await dbRun(db,"UPDATE broker_import_jobs SET status='FAILED',error_code='IMPORT_CONSUMER_NOT_CONFIGURED',updated_at=CURRENT_TIMESTAMP WHERE id=?",[job.id]);}
  const schedule:any=await dbGet(db,"SELECT id,frequency,report_type,portfolio FROM report_schedules WHERE status='ACTIVE' AND next_run_at<=CURRENT_TIMESTAMP ORDER BY next_run_at LIMIT 1");
  if(schedule){
   const claimed:any=await dbRun(db,"UPDATE report_schedules SET last_status='RUNNING',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'",[schedule.id]);
   if(claimed.changes){const dir=path.resolve(process.cwd(),'reports','scheduled');fs.mkdirSync(dir,{recursive:true});const artifact=path.join(dir,`schedule-${schedule.id}-${Date.now()}.json`);fs.writeFileSync(artifact,JSON.stringify({scheduleId:schedule.id,reportType:schedule.report_type,portfolio:schedule.portfolio,generatedAt:new Date().toISOString(),delivery:'DISABLED'},null,2));await dbRun(db,"UPDATE report_schedules SET last_run_at=CURRENT_TIMESTAMP,last_status='LOCAL_ARTIFACT_CREATED',next_run_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",[advance(schedule.frequency),schedule.id]);}
  }
 } finally {busy=false;}
}
export function startLocalQueueWorker(intervalMs=30_000):void{if(timer)return;timer=setInterval(()=>void processLocalQueues(),intervalMs);timer.unref?.();void processLocalQueues();}
export function stopLocalQueueWorker():void{if(timer)clearInterval(timer);timer=null;}
