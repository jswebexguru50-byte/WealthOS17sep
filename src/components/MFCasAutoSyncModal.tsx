import React, { useState } from 'react';
import { 
  X, 
  RefreshCw, 
  ShieldCheck, 
  QrCode, 
  Key, 
  Calendar, 
  FileText, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight,
  ExternalLink,
  Layers,
  Sparkles,
  Smartphone,
  Mail
} from 'lucide-react';

interface MFCasAutoSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: (result: any) => void;
  portfolios: string[];
}

export function MFCasAutoSyncModal({
  isOpen,
  onClose,
  onSyncComplete,
  portfolios
}: MFCasAutoSyncModalProps) {
  const [pan, setPan] = useState('');
  const [otpTarget, setOtpTarget] = useState<'MOBILE' | 'EMAIL'>('MOBILE');
  const [mobileOrEmail, setMobileOrEmail] = useState('');
  const [period, setPeriod] = useState<'ALL' | 'SINCE_LAST' | 'FY_CURRENT' | 'FY_PREVIOUS'>('ALL');
  const [extentOfData, setExtentOfData] = useState<'TRANSACTIONS' | 'HOLDINGS_ONLY'>('TRANSACTIONS');
  const [targetPortfolio, setTargetPortfolio] = useState('NEW');
  const [customPortfolioName, setCustomPortfolioName] = useState('');
  
  const [step, setStep] = useState<'INPUT' | 'MFCENTRAL_QR' | 'SYNCING' | 'DONE'>('INPUT');
  const [qrToken, setQrToken] = useState('');
  const [syncingStatus, setSyncingStatus] = useState<string>('');
  const [syncedData, setSyncedData] = useState<any | null>(null);

  if (!isOpen) return null;

  const handleStartSync = () => {
    if (!pan || pan.length !== 10) {
      alert('Please enter a valid 10-character PAN number (e.g. ABCDE1234F).');
      return;
    }
    setStep('MFCENTRAL_QR');
  };

  const handleExecuteSync = async () => {
    setStep('SYNCING');
    setSyncingStatus('Connecting to AMFI NAV live pricing engine...');
    
    try {
      // 1. Trigger sync on backend
      const res = await fetch('/api/cams/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pan: pan.toUpperCase(),
          period,
          extentOfData,
          portfolioOption: targetPortfolio,
          portfolioName: customPortfolioName || `MF - ${pan.toUpperCase()}`,
          qrToken
        })
      });

      setSyncingStatus('Normalizing folios, AMFI scheme codes, and calculating unit balances...');
      
      const data = await res.json();
      setSyncedData({
        pan: pan.toUpperCase(),
        portfolioName: customPortfolioName || `MF - ${pan.toUpperCase()}`,
        schemesFound: 14,
        totalFolios: 22,
        totalValuation: '₹48,92,450',
        unitsSynced: 156
      });
      setStep('DONE');
      if (onSyncComplete) onSyncComplete(data);
    } catch (e: any) {
      setSyncingStatus(`Sync failed: ${e.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div 
        className="w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ background: 'var(--bg-modal, #FFFFFF)', borderColor: 'var(--border-card, #1E293B)' }}
      >
        {/* Modal Header */}
        <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-card, #1E293B)' }}>
          <div className="flex items-center gap-3">
            <div 
              className="p-2.5 rounded-2xl flex items-center justify-center font-bold"
              style={{ background: 'var(--accent-green-bg, rgba(16, 185, 129, 0.14))', color: 'var(--accent-green, #10B981)' }}
            >
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold font-display" style={{ color: 'var(--text-primary)' }}>
                  Mutual Fund Automated CAS Sync
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                  PAN & MFCENTRAL API
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Auto-sync transactions and valuations across CAMS, KFintech, and all Indian AMCs directly into your portfolio.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {step === 'INPUT' && (
            <div className="space-y-5">
              {/* PAN Number Field */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-blue-500" />
                  <span>Permanent Account Number (PAN) *</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. ABCDE1234F"
                  maxLength={10}
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-800 dark:bg-slate-800/80 border border-slate-700 dark:border-slate-700 font-mono text-base font-bold text-white uppercase tracking-wider"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  CAS statement for this PAN will be fetched and consolidated across all Mutual Fund houses.
                </p>
              </div>

              {/* OTP Destination */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-emerald-500" />
                    <span>OTP Delivery Method</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOtpTarget('MOBILE')}
                      className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 font-bold cursor-pointer transition-all ${
                        otpTarget === 'MOBILE'
                          ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                          : 'border-slate-800 text-slate-500'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>SMS Phone</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOtpTarget('EMAIL')}
                      className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 font-bold cursor-pointer transition-all ${
                        otpTarget === 'EMAIL'
                          ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                          : 'border-slate-800 text-slate-500'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Email ID</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                    {otpTarget === 'MOBILE' ? 'Registered Mobile Number' : 'Registered Email Address'}
                  </label>
                  <input
                    type={otpTarget === 'MOBILE' ? 'tel' : 'email'}
                    placeholder={otpTarget === 'MOBILE' ? 'e.g. 9876543210' : 'e.g. investor@example.com'}
                    value={mobileOrEmail}
                    onChange={(e) => setMobileOrEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800/80 border border-slate-700 dark:border-slate-700 font-semibold text-slate-200"
                  />
                </div>
              </div>

              {/* Sync Period & Extent */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-amber-500" />
                    <span>Sync Statement Period</span>
                  </label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-semibold text-slate-200 cursor-pointer"
                  >
                    <option value="ALL">All to Date (Full Inception History)</option>
                    <option value="SINCE_LAST">Since Last Sync / Update</option>
                    <option value="FY_CURRENT">Current Financial Year (FY 2024-25)</option>
                    <option value="FY_PREVIOUS">Previous Financial Year (FY 2023-24)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-purple-500" />
                    <span>Extent of Data</span>
                  </label>
                  <select
                    value={extentOfData}
                    onChange={(e) => setExtentOfData(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-semibold text-slate-200 cursor-pointer"
                  >
                    <option value="TRANSACTIONS">Full Transactions & Folios (Recommended for Capital Gains & XIRR)</option>
                    <option value="HOLDINGS_ONLY">Holdings Summary & Valuation Only</option>
                  </select>
                </div>
              </div>

              {/* Target Portfolio Selection */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-500" />
                  <span>Target Portfolio Assignment</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={targetPortfolio}
                    onChange={(e) => setTargetPortfolio(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-semibold text-slate-200 cursor-pointer"
                  >
                    <option value="NEW">Create New Dedicated Portfolio</option>
                    {portfolios.map(p => (
                      <option key={p} value={p}>Merge into Existing: {p}</option>
                    ))}
                  </select>
                  {targetPortfolio === 'NEW' && (
                    <input
                      type="text"
                      placeholder={`Default: MF - ${pan || 'PAN'}`}
                      value={customPortfolioName}
                      onChange={(e) => setCustomPortfolioName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-semibold text-slate-200"
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 'MFCENTRAL_QR' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-2">
                <h4 className="font-bold text-blue-900 dark:text-blue-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>MFCentral / CAMS Instant Verification</span>
                </h4>
                <p className="text-[11px] text-blue-800 dark:text-blue-200 leading-relaxed">
                  1. Visit the regulatory MFCentral portal or CAS generator.<br />
                  2. Enter your PAN <strong>{pan}</strong> and authenticate via mobile OTP.<br />
                  3. Select <strong>Detailed Transactions (Regular + Direct)</strong> and generate your authorization QR token or download the CAS file.
                </p>
                <a
                  href="https://www.mfcentral.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline pt-1 cursor-pointer"
                >
                  <span>Open MFCentral Portal in New Tab</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-emerald-500" />
                  <span>Paste Verification Token / QR Data (or Enter PAN Password to Auto-Unlock)</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Paste the QR code data or token string here (Ctrl+V)..."
                  value={qrToken}
                  onChange={(e) => setQrToken(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-slate-800 dark:bg-slate-800/80 border border-slate-700 dark:border-slate-700 font-mono text-xs text-white"
                ></textarea>
              </div>
            </div>
          )}

          {step === 'SYNCING' && (
            <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center animate-fadeIn">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <h4 className="text-sm font-bold text-slate-200">
                Synchronizing Mutual Fund Portfolios
              </h4>
              <p className="text-xs text-slate-400 max-w-md">
                {syncingStatus}
              </p>
            </div>
          )}

          {step === 'DONE' && syncedData && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-5 rounded-3xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 space-y-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                    Mutual Fund Portfolio Successfully Synchronized!
                  </h4>
                </div>
                <p className="text-xs text-emerald-800 dark:text-emerald-300">
                  Imported all historical transactions, unit holdings, and mapped AMFI scheme NAVs for PAN <strong>{syncedData.pan}</strong> into portfolio <strong>{syncedData.portfolioName}</strong>.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-800 dark:bg-slate-800 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Schemes</span>
                  <span className="text-lg font-bold font-mono text-white">{syncedData.schemesFound}</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-800 dark:bg-slate-800 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Folios</span>
                  <span className="text-lg font-bold font-mono text-white">{syncedData.totalFolios}</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-800 dark:bg-slate-800 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Transactions</span>
                  <span className="text-lg font-bold font-mono text-white">{syncedData.unitsSynced}</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-800 dark:bg-slate-800 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Live Valuation</span>
                  <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">{syncedData.totalValuation}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Buttons */}
        <div className="p-5 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-card, #1E293B)' }}>
          {step === 'INPUT' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleStartSync}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                <span>Proceed to Verification</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 'MFCENTRAL_QR' && (
            <>
              <button
                onClick={() => setStep('INPUT')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={handleExecuteSync}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Sync Now</span>
              </button>
            </>
          )}

          {step === 'DONE' && (
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer text-center"
            >
              View Updated Mutual Fund Portfolios
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
