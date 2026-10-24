/** Metadata only. JWT expiry is a display hint, not signature verification. */
export function credentialMetadata(secret: unknown): { status: 'SET' | 'NOT_SET'; expiresAt: string | null } {
 const token=typeof secret==='string' ? secret.trim() : '';
 let expiresAt: string | null=null;
 if(token) try {
  const payload=JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8'));
  if(typeof payload.exp==='number' && Number.isFinite(payload.exp)) {
   const date=new Date(payload.exp*1000);if(!isNaN(date.getTime()))expiresAt=date.toISOString();
  }
 } catch { /* Opaque tokens have no readable expiry. */ }
 return {status:token?'SET':'NOT_SET',expiresAt};
}
export function isCredentialConfigKey(key: string): boolean {
 return /token|secret|password|private.?key|api.?key|access.?key/i.test(key);
}
