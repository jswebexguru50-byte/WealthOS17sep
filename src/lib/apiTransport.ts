type ConfirmRequest = { phrase: string; path: string; signal?: AbortSignal };
type CredentialPrompt = () => void;
type ConfirmPrompt = (request: ConfirmRequest) => Promise<string | null>;
let credential = '';
let authPrompt: CredentialPrompt = () => {};
let confirmPrompt: ConfirmPrompt = async () => null;
const nativeFetch = globalThis.fetch.bind(globalThis);

export const ADMIN_CONFIRMATIONS: Record<string, string> = {
  '/api/pms/purge-bank-book': 'PURGE_BANK_BOOK',
  '/api/admin/purge-transactions': 'PURGE_TRANSACTIONS',
  '/api/admin/purge-everything': 'PURGE_EVERYTHING',
  '/api/purge-data': 'PURGE_DATA',
  '/api/purge-master-tickers': 'PURGE_MASTER_TICKERS',
  '/api/restore-database': 'RESTORE_DATABASE',
  '/api/restore-database/chunk/complete': 'RESTORE_DATABASE',
};
export function confirmationFor(path: string, method: string): string | undefined {
  if (method === 'DELETE' && /^\/api\/portfolios\/[^/]+$/.test(path)) return 'DELETE_PORTFOLIO';
  return method === 'POST' ? ADMIN_CONFIRMATIONS[path] : undefined;
}
export function setApiCredential(value: string) {
  credential = value;
  if (typeof sessionStorage !== 'undefined') {
    try { if (value) sessionStorage.setItem('app-session-token', value); else { sessionStorage.removeItem('app-session-token'); sessionStorage.removeItem('app-password'); } } catch { /* memory-only session */ }
  }
}
export function getApiCredential(): string {
  if (credential) return credential;
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('app-session-token') || sessionStorage.getItem('app-password') || '' : ''; }
  catch { return ''; }
}
export function registerApiPrompts(auth: CredentialPrompt, confirm: ConfirmPrompt): () => void {
  authPrompt = auth; confirmPrompt = confirm;
  return () => { authPrompt = () => {}; confirmPrompt = async () => null; };
}

export function createApiTransport(
  fetcher: typeof fetch, origin: () => string, password: () => string,
  unauthorized: CredentialPrompt, confirm: ConfirmPrompt,
): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, origin());
    const request = new Request(input instanceof Request ? input : url, init);
    const isApi = url.origin === origin() && /^\/api(?:\/|$)/.test(url.pathname);
    if (!isApi) return fetcher(input, init); // Never attach credentials to another origin.
    const headers = new Headers(request.headers);
    const secret = password(); if (secret) headers.set('x-app-password', secret);
    const phrase = confirmationFor(url.pathname, request.method);
    let body: BodyInit | undefined;
    if (phrase) {
      const entered = await confirm({ phrase, path: url.pathname, signal: request.signal });
      if (entered !== phrase || request.signal.aborted) return new Response(JSON.stringify({ success: false, message: 'Action cancelled.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      if (headers.get('Content-Type')?.includes('multipart/form-data')) {
        const form = await request.formData(); form.set('confirmPhrase', entered); body = form; headers.delete('Content-Type');
      } else {
        const text = await request.clone().text();
        const data: unknown = text ? JSON.parse(text) : {};
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid admin request body.');
        body = JSON.stringify({ ...data, confirmPhrase: entered }); headers.set('Content-Type', 'application/json');
      }
    }
    const response = await fetcher(new Request(request, { headers, ...(body ? { body } : {}) }));
    if (response.status === 401) unauthorized();
    return response; // Never automatically replay a mutation after a password prompt.
  };
}
export const apiFetch = createApiTransport(nativeFetch,
  () => typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
  getApiCredential, () => { setApiCredential(''); authPrompt(); }, request => confirmPrompt(request));

/** Compatibility boundary for existing calls while components migrate to apiFetch. */
export function installApiTransport() { if (typeof window !== 'undefined') window.fetch = apiFetch; }
