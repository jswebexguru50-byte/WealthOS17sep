import React, { useLayoutEffect, useState } from 'react';
import { apiFetch, registerApiPrompts, setApiCredential } from '../lib/apiTransport';

export function ApiPrompts() {
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const [confirmation, setConfirmation] = useState<{ phrase: string; path: string; resolve: (value: string | null) => void } | null>(null);
  useLayoutEffect(() => {
    let pending: ((value: string | null) => void) | null = null;
    const unregister = registerApiPrompts(() => setNeedsPassword(true), request => new Promise(resolve => {
      if (pending || request.signal?.aborted) return resolve(null);
      const finish = (value: string | null) => { request.signal?.removeEventListener('abort', abort); pending = null; setConfirmation(null); resolve(value); };
      const abort = () => finish(null);
      pending = finish; request.signal?.addEventListener('abort', abort, { once: true });
      setTyped(''); setConfirmation({ phrase: request.phrase, path: request.path, resolve: finish });
    }));
    return () => { pending?.(null); unregister(); };
  }, []);
  if (!needsPassword && !confirmation) return null;
  return <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 10000, background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
    <form role="dialog" aria-modal="true" aria-labelledby="api-prompt-title" className="max-w-md w-full rounded-xl p-6 text-sm space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }} onSubmit={async event => {
      event.preventDefault(); setError('');
      if (!needsPassword) { if (typed === confirmation?.phrase) confirmation.resolve(typed); return; }
      setBusy(true); setApiCredential(password);
      try {
        const response = await apiFetch('/api/auth/password-check', { method: 'HEAD' });
        if (!response.ok) throw new Error(response.status === 401 ? 'Incorrect application password.' : 'Unable to verify access.');
        setPassword(''); setNeedsPassword(false);
        // Read-only screens reload with credentials; cancelled writes are never replayed.
        window.location.reload();
      } catch (failure) { setApiCredential(''); setError(failure instanceof Error ? failure.message : 'Sign-in failed.'); }
      finally { setBusy(false); }
    }}>
      <h2 id="api-prompt-title" className="text-xl font-semibold">{needsPassword ? 'Application password required' : 'Confirm destructive action'}</h2>
      {needsPassword ? <><p>Your API session needs the configured application password.</p><label className="block">Password<input autoFocus type="password" autoComplete="current-password" className="block w-full p-3 mt-1 rounded border" value={password} onChange={event => setPassword(event.target.value)} /></label></> : <><p>This action changes financial data. The server must complete its backup before proceeding.</p><p className="break-all">{confirmation?.path}</p><label className="block">Type {confirmation?.phrase}<input autoFocus autoComplete="off" className="block w-full p-3 mt-1 rounded border" value={typed} onChange={event => setTyped(event.target.value)} /></label></>}
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-4">{!needsPassword && <button type="button" onClick={() => confirmation?.resolve(null)}>Cancel</button>}<button disabled={busy || (needsPassword ? !password : typed !== confirmation?.phrase)}>{needsPassword ? 'Sign in' : 'Confirm action'}</button></div>
    </form>
  </div>;
}
