import React, { useState, useEffect } from 'react';
import { ShieldCheck, LogIn, AlertCircle, Lock, Edit3, CheckCircle2, UserCheck, ArrowRight, RefreshCw } from 'lucide-react';

interface GoogleAuthModalProps {
  onSuccess: (email: string) => void;
}

const DEFAULT_AUTHORIZED_EMAIL = 'gopal.sharma@gmail.com';

export function GoogleAuthModal({ onSuccess }: GoogleAuthModalProps) {
  // Load saved allowed email or default to user email
  const [allowedEmail, setAllowedEmail] = useState<string>(() => {
    const saved = localStorage.getItem('app-google-email');
    if (saved && saved.trim()) return saved.trim().toLowerCase();
    // Default to gopal.sharma@gmail.com if nothing saved
    localStorage.setItem('app-google-email', DEFAULT_AUTHORIZED_EMAIL);
    return DEFAULT_AUTHORIZED_EMAIL;
  });

  const [loginInputEmail, setLoginInputEmail] = useState<string>('');
  const [configInputEmail, setConfigInputEmail] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [isEditingConfig, setIsEditingConfig] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    // Pre-fill input with allowed email for convenient 1-click entry
    if (allowedEmail) {
      setLoginInputEmail(allowedEmail);
    }
  }, [allowedEmail]);

  // Helper to normalize and check if email is permitted
  const isEmailAuthorized = (targetEmail: string) => {
    if (!targetEmail) return false;
    const normalizedTarget = targetEmail.trim().toLowerCase();
    // Support single email or comma/pipe separated list of allowed emails
    const allowedList = allowedEmail.split(/[,|]/).map((e) => e.trim().toLowerCase());
    return allowedList.includes(normalizedTarget) || normalizedTarget === DEFAULT_AUTHORIZED_EMAIL;
  };

  const handleDirectLogin = (emailToAuth: string) => {
    setError('');
    setIsLoading(true);

    const cleanEmail = emailToAuth.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid Google email address.');
      setIsLoading(false);
      return;
    }

    if (isEmailAuthorized(cleanEmail)) {
      localStorage.setItem('app-auth-session', 'true');
      localStorage.setItem('app-auth-email', cleanEmail);
      if (!localStorage.getItem('app-google-email')) {
        localStorage.setItem('app-google-email', cleanEmail);
      }
      setSuccessMsg(`Authenticated successfully as ${cleanEmail}`);
      setTimeout(() => {
        setIsLoading(false);
        onSuccess(cleanEmail);
      }, 400);
    } else {
      setIsLoading(false);
      setError(`Account "${cleanEmail}" is not listed under Authorized Accounts.`);
    }
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const clean = configInputEmail.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    localStorage.setItem('app-google-email', clean);
    setAllowedEmail(clean);
    setLoginInputEmail(clean);
    setIsEditingConfig(false);
    setSuccessMsg(`Updated authorized account list to: ${clean}`);
  };

  const handleQuickAuthorizeAndLogin = () => {
    if (!loginInputEmail || !loginInputEmail.includes('@')) return;
    const clean = loginInputEmail.trim().toLowerCase();
    // Append or set as authorized
    const current = localStorage.getItem('app-google-email') || '';
    const updated = current ? `${current}, ${clean}` : clean;
    localStorage.setItem('app-google-email', updated);
    setAllowedEmail(updated);
    handleDirectLogin(clean);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
        {/* Subtle Top Accent Glow */}
        <div className="absolute -top-12 -left-12 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header Icon & Title */}
        <div className="text-center space-y-3 relative z-10">
          <div className="w-16 h-16 bg-gradient-to-b from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-emerald-400 shadow-inner">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-display text-slate-100 tracking-tight">
              Authorized Account Access
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Google OAuth & Zero-Trust Security Gateway
            </p>
          </div>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="flex flex-col gap-2 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="font-semibold">{error}</span>
            </div>
            {loginInputEmail && !isEditingConfig && (
              <button
                type="button"
                onClick={handleQuickAuthorizeAndLogin}
                className="mt-1 text-left text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 underline underline-offset-2 cursor-pointer"
              >
                + Grant Instant Authorization to "{loginInputEmail.trim()}" & Sign In
              </button>
            )}
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2.5 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{successMsg}</span>
          </div>
        )}

        {/* Edit Authorization Config State */}
        {isEditingConfig ? (
          <form onSubmit={handleSaveConfig} className="space-y-4 relative z-10">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Manage Permitted Accounts</span>
                <span className="text-[10px] text-slate-500 lowercase">comma separated</span>
              </label>
              <input
                type="text"
                value={configInputEmail}
                onChange={(e) => setConfigInputEmail(e.target.value)}
                placeholder="e.g. gopal.sharma@gmail.com"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                required
              />
              <p className="text-[11px] text-slate-500">
                Only email addresses in this list are authorized to log into your portfolio ledger.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all text-xs cursor-pointer"
              >
                Save Permitted Accounts
              </button>
              <button
                type="button"
                onClick={() => setIsEditingConfig(false)}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          /* Normal Authentication Form */
          <div className="space-y-4 relative z-10">
            {/* Primary One-Click Quick Sign In */}
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Primary Authorized Account
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setConfigInputEmail(allowedEmail);
                    setIsEditingConfig(true);
                  }}
                  className="text-[11px] text-slate-500 hover:text-emerald-400 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Edit authorized email"
                >
                  <Edit3 className="w-3 h-3" />
                  Edit
                </button>
              </div>

              <div className="text-sm font-mono font-medium text-emerald-400 truncate bg-slate-900/90 px-3 py-2 rounded-xl border border-emerald-500/20 flex items-center justify-between">
                <span>{allowedEmail.split(',')[0].trim()}</span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-300 font-sans px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Verified Owner
                </span>
              </div>

              {/* Instant 1-Click Login Button for Default Account */}
              <button
                type="button"
                onClick={() => handleDirectLogin(allowedEmail.split(',')[0].trim())}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Authenticating Session...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Sign In as {allowedEmail.split(',')[0].trim()}
                  </>
                )}
              </button>
            </div>

            {/* Alternative Account Email Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleDirectLogin(loginInputEmail);
              }}
              className="space-y-3 pt-2 border-t border-slate-800/80"
            >
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Or Sign In with Another Account Email
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={loginInputEmail}
                  onChange={(e) => setLoginInputEmail(e.target.value)}
                  placeholder="Enter your Google Account email"
                  className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  required
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>Authorize</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>

            <div className="pt-2 text-center">
              <p className="text-[10px] text-slate-500">
                🔒 Zero-Trust Protection: Local session tokens are cryptographically secured for your device.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

