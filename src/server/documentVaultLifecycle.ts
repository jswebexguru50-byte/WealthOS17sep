import crypto from 'node:crypto';
const SHA256=/^[a-f0-9]{64}$/i; const SAFE_REF=/^(?:[a-zA-Z0-9][a-zA-Z0-9._-]*)(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/;
export function validateStorageReference(value:unknown):string|null { if(typeof value!=='string')return null; const ref=value.trim(); return !ref||ref.length>512||ref.includes('\\')||ref.includes('..')||ref.startsWith('/')||!SAFE_REF.test(ref)?null:ref; }
export function validateSha256(value:unknown):string|null { if(value==null||value==='')return null; return typeof value==='string'&&SHA256.test(value.trim())?value.trim().toLowerCase():null; }
export function expiryStatus(expiresOn:string|null|undefined, reminderDays=30, today=new Date()):'NO_EXPIRY'|'EXPIRED'|'EXPIRING_SOON'|'CURRENT' { if(!expiresOn)return 'NO_EXPIRY'; const d=new Date(`${expiresOn}T00:00:00Z`); if(Number.isNaN(d.getTime()))return 'EXPIRED'; const now=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()); const expiry=d.getTime(); const threshold=now+Math.max(0,Math.min(3650,reminderDays))*86400000; if(expiry<now)return 'EXPIRED'; if(expiry<=threshold)return 'EXPIRING_SOON'; return 'CURRENT'; }
export function sha256Hex(data:Uint8Array|string):string{return crypto.createHash('sha256').update(data).digest('hex');}

