import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { safeFetchJson } from '../lib/api';

export const PMSImportView: React.FC<{
  portfolios: string[];
  onUpload: () => Promise<any>;
  formatCurrency: (val: number) => string;
}> = ({ portfolios, onUpload, formatCurrency }) => {
  const [file, setFile] = useState<File | null>(null);
  const [portfolio, setPortfolio] = useState(portfolios[0] || '');
  const [isNewPortfolio, setIsNewPortfolio] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [type, setType] = useState('transactions');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'validating' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [valData, setValData] = useState<any>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [isins, setIsins] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [approvedDuplicateKeys, setApprovedDuplicateKeys] = useState<string[]>([]);

  React.useEffect(() => {
    if (step === 3 && valData) {
      const fetchDuplicates = async () => {
        setCheckingDuplicates(true);
        try {
          const finalPortfolio = isNewPortfolio ? newPortfolioName.trim() : portfolio;
          const finalMappings = { ...mappings };
          for (const m of valData.unmatched_mappings || []) {
            if (!finalMappings[m.file_name]) {
              finalMappings[m.file_name] = m.mapped_name || m.file_name;
            }
          }

          const { ok, data } = await safeFetchJson('/api/pms/check-duplicates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              batch_id: valData.batch_id,
              mappings: finalMappings,
              isins,
              portfolio_name: finalPortfolio
            })
          });
          if (ok && data?.success) {
            setDuplicates(data.duplicates || []);
          }
        } catch (err) {
          console.error('Error fetching duplicates:', err);
        } finally {
          setCheckingDuplicates(false);
        }
      };
      fetchDuplicates();
    } else {
      setDuplicates([]);
    }
  }, [step, valData, mappings, isins, portfolio, isNewPortfolio, newPortfolioName]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleValidate = async () => {
    const finalPortfolio = isNewPortfolio ? newPortfolioName.trim() : portfolio;
    if (!file || !finalPortfolio) return;
    setStatus('validating');
    setMessage('');
    let isError = false;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('portfolio', finalPortfolio);
      formData.append('type', type);
      formData.append('mappings', JSON.stringify(mappings));

      const { ok, data, error } = await safeFetchJson('/api/pms/validate', {
        method: 'POST',
        body: formData
      });
      if (ok && data?.success) {
        setValData(data.data);
        if (data.data.unmatched_mappings && data.data.unmatched_mappings.length > 0) {
          const initMap: Record<string, string> = {};
          const initIsins: Record<string, string> = {};
          const masterSymbols = new Map<string, any>(data.data.master_tickers?.map((t: any) => [t.symbol, t]) || []);
          data.data.unmatched_mappings.forEach((m: any) => {
            const resolvedSym = m.mapped_name || m.suggestions[0] || '';
            initMap[m.file_name] = resolvedSym;
            if (resolvedSym) {
              const matchedMaster = masterSymbols.get(resolvedSym);
              if (matchedMaster && matchedMaster.isin && matchedMaster.isin !== 'UNKNOWN') {
                initIsins[m.file_name] = matchedMaster.isin;
              }
            }
          });
          setMappings(prev => ({ ...prev, ...initMap }));
          setIsins(prev => ({ ...prev, ...initIsins }));
          setStep(2);
        } else {
          setStep(3);
        }
      } else {
        isError = true;
        setStatus('error');
        setMessage(data?.message || error || 'Validation failed');
      }
    } catch (err: any) {
      isError = true;
      setStatus('error');
      setMessage(`Validation failed: ${err.message || 'Server error'}`);
    } finally {
      if (!isError) {
        setStatus('idle');
      }
    }
  };

  const handleApplyMappings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valData) return;
    
    // Validate that custom mappings have an ISIN provided
    const masterSymbols = new Map<string, any>(valData.master_tickers?.map((t: any) => [t.symbol, t]) || []);
    
    for (const m of valData.unmatched_mappings || []) {
      const mappedSymbol = mappings[m.file_name] || m.mapped_name || m.file_name;
      if (mappedSymbol) {
        const masterData = masterSymbols.get(mappedSymbol);
        const hasDbIsin = masterData && masterData.isin && masterData.isin !== 'UNKNOWN' && masterData.isin.trim() !== '';
        
        if (!hasDbIsin) {
          if (!isins[m.file_name] || isins[m.file_name].trim() === '') {
            setMessage(`ISIN is required for symbol: ${mappedSymbol}`);
            setStatus('error');
            return;
          }
        }
      }
    }
        
    setStatus('idle');
    setStep(3);
  };

  const handleCommit = async () => {
    if (!valData) return;
    setStatus('uploading');
    try {
      const finalPortfolio = isNewPortfolio ? newPortfolioName.trim() : portfolio;
      const { ok, data, error } = await safeFetchJson('/api/pms/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_id: valData.batch_id,
          mappings: (() => {
            const finalMappings = { ...mappings };
            for (const m of valData.unmatched_mappings || []) {
              if (!finalMappings[m.file_name]) {
                finalMappings[m.file_name] = m.mapped_name || m.file_name;
              }
            }
            return finalMappings;
          })(),
          isins,
          portfolio_name: finalPortfolio,
          approved_duplicate_keys: approvedDuplicateKeys
        })
      });
      if (ok && data?.success) {
        setStatus('success');
        setMessage(data.message || 'Data saved successfully!');
        setStep(1);
        setFile(null);
        setValData(null);
        setMappings({});
        setIsins({});
        if (onUpload) { onUpload(); }
      } else {
        setStatus('error');
        setMessage(data?.message || error || 'Commit failed');
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(`Commit failed: ${err.message || 'Server error'}`);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
      <h3 className="text-lg font-bold text-slate-200">PMS Data Import</h3>

      {valData?.master_tickers && (
        <datalist id="master-tickers-list">
          {valData.master_tickers.map((t: any) => (
            <option key={t.symbol} value={t.symbol}>{t.name}</option>
          ))}
        </datalist>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <select 
                value={isNewPortfolio ? '__NEW__' : portfolio} 
                onChange={(e) => {
                  if (e.target.value === '__NEW__') {
                    setIsNewPortfolio(true);
                  } else {
                    setIsNewPortfolio(false);
                    setPortfolio(e.target.value);
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-emerald-500"
            >
              {portfolios.map(p => <option key={p} value={p}>{p}</option>)}
              <option value="__NEW__">+ Add New Portfolio</option>
            </select>
            {isNewPortfolio && (
              <input 
                type="text"
                placeholder="Enter new portfolio name..."
                value={newPortfolioName}
                onChange={(e) => setNewPortfolioName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            )}
          </div>
          
          <select 
              value={type} 
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-emerald-500"
          >
            <option value="transactions">Transactions</option>
            <option value="holdings">Holdings</option>
            <option value="bank_book">Bank Book</option>
            <option value="interest">Interest Statement</option>
            <option value="dividend">Dividend Statement</option>
          </select>

          <input 
            type="file" 
            accept=".csv,.pdf"
            onChange={handleFileChange} 
            className="w-full text-sm text-slate-400
              file:mr-4 file:py-3 file:px-4
              file:rounded-xl file:border-0
              file:text-sm file:font-semibold
              file:bg-slate-800 file:text-slate-200
              hover:file:bg-slate-700
              cursor-pointer"
          />
          
          <button 
            onClick={handleValidate}
            disabled={!file || status === 'validating'}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {status === 'validating' ? 'Validating...' : 'Validate File'} <ArrowRight size={18} />
          </button>
        </div>
      )}

      {step === 2 && valData && (
        <form onSubmit={handleApplyMappings} className="space-y-4">
          <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl flex items-start gap-3">
            <AlertTriangle className="text-yellow-500 mt-1" size={20} />
            <div>
              <h4 className="text-yellow-500 font-bold">Scrip Mappings Review</h4>
              <p className="text-sm text-slate-300 mt-1">Please review all scrip mappings. Any changes you make will be saved in the permanent memory for future imports. If a scrip is not in the master, enter a custom symbol to track it.</p>
            </div>
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {valData.unmatched_mappings.map((m: any, idx: number) => (
              <div key={idx} className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex flex-col">
                    <p className="text-sm font-bold text-slate-200">{m.file_name}</p>
                    {m.scrip_name && m.scrip_name !== m.file_name && (
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{m.scrip_name}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    m.match_type.includes('exact') || m.match_type.includes('portfolio') ? 'bg-emerald-500/20 text-emerald-400' :
                    m.match_type.includes('fuzzy') ? 'bg-blue-500/20 text-blue-400' :
                    m.match_type.includes('auto-resolved') ? 'bg-emerald-500/20 text-emerald-300' :
                    'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {m.match_type.includes('exact') ? 'Exact Match' : 
                     m.match_type.includes('portfolio') ? 'Portfolio Match' : 
                     m.match_type.includes('auto-resolved') ? 'Auto Resolved' : 
                     m.match_type.includes('fuzzy') ? 'High Confidence' : 'No Exact Match'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Select or Enter Master Symbol..."
                    value={mappings[m.file_name] || ''}
                    onChange={(e) => {
                      const sym = e.target.value.toUpperCase();
                      setMappings(prev => ({ ...prev, [m.file_name]: sym }));
                      const found = valData.master_tickers?.find((t: any) => t.symbol === sym);
                      if (found && found.isin && found.isin !== 'UNKNOWN') {
                        setIsins(prev => ({ ...prev, [m.file_name]: found.isin }));
                      }
                    }}
                    onBlur={(e) => {
                      const val = e.target.value.toUpperCase();
                      if (val) {
                        fetch('/api/mappings/save', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ mappings: { [m.file_name]: val }, isins: { [m.file_name]: isins[m.file_name] || '' } })
                        }).catch(console.error);
                      }
                    }}
                    className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-sm uppercase"
                    required
                    list="master-tickers-list"
                  />
                  <input
                    type="text"
                    placeholder="ISIN (Optional)"
                    value={isins[m.file_name] || ''}
                    onChange={(e) => setIsins({ ...isins, [m.file_name]: e.target.value.toUpperCase() })}
                    onBlur={(e) => {
                      const val = mappings[m.file_name];
                      if (val) {
                        fetch('/api/mappings/save', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ mappings: { [m.file_name]: val }, isins: { [m.file_name]: e.target.value.toUpperCase() } })
                        }).catch(console.error);
                      }
                    }}
                    className="w-1/3 bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-sm uppercase"
                  />
                </div>
                {m.suggestions && m.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {m.suggestions.map((s: string) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setMappings({ ...mappings, [m.file_name]: s });
                          fetch('/api/mappings/save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ mappings: { [m.file_name]: s }, isins: { [m.file_name]: isins[m.file_name] || '' } })
                          }).catch(console.error);
                        }}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 bg-slate-800 text-slate-200 p-3 rounded-xl font-bold"
            >
              Back
            </button>
            <button
              type="button"
              onClick={async () => {
                setStatus('validating');
                try {
                  await fetch('/api/mappings/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mappings })
                  });
                  setStatus('idle'); setMessage('Mappings saved successfully!');
                } catch(err) {
                  setStatus('error'); setMessage('Failed to save mappings');
                }
                setStatus('idle');
              }}
              disabled={status === 'validating'}
              className="bg-slate-700 text-white px-4 py-3 rounded-xl font-bold disabled:opacity-50"
            >
              Save Progress
            </button>
            <button
              type="submit"
              disabled={status === 'validating'}
              className="flex-1 bg-emerald-600 text-white p-3 rounded-xl font-bold disabled:opacity-50 flex justify-center items-center gap-2"
            >
              {status === 'validating' ? 'Re-Validating...' : 'Apply Mappings'}
            </button>
          </div>
        </form>
      )}

      {step === 3 && valData && (
        <div className="space-y-4">
           <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-3">
            <CheckCircle className="text-emerald-500 mt-1 shrink-0" size={20} />
            <div className="space-y-1">
              <h4 className="text-emerald-400 font-bold">Incremental Load Plan Ready</h4>
              <p className="text-sm text-slate-300">
                Statement contains <strong className="text-white">{valData.total_rows}</strong> total entries.
                {duplicates.length > 0 ? (
                  <> <strong className="text-amber-400">{duplicates.length}</strong> already exist in portfolio (safely skipped) and <strong className="text-emerald-400">{Math.max(0, valData.total_rows - duplicates.length)}</strong> new incremental entries will be appended.</>
                ) : (
                  <> All <strong className="text-emerald-400">{valData.total_rows}</strong> entries are new and will be appended.</>
                )}
              </p>
              <p className="text-xs text-slate-400">
                All prior historical balances, corporate actions, and transfer records will remain 100% intact.
              </p>
            </div>
          </div>

          {checkingDuplicates ? (
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-center gap-3">
              <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-slate-400">Scanning for duplicate transactions...</p>
            </div>
          ) : duplicates.length > 0 ? (
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl space-y-3 animate-fade-in">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-amber-500 mt-0.5 shrink-0" size={20} />
                <div>
                  <h4 className="text-amber-500 font-bold">Existing Transactions Detected ({duplicates.length})</h4>
                  <p className="text-sm text-slate-300 mt-1">
                    These <strong>{duplicates.length}</strong> matching transaction(s) already exist in your portfolio. To ensure data integrity, they are marked to be skipped automatically.
                  </p>
                </div>
              </div>
              
              <div className="border border-slate-800 rounded-lg overflow-hidden max-h-80 overflow-y-auto bg-slate-950 text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold">
                      <th className="p-2 w-12 text-center">Import</th>
                      <th className="p-2">Incoming Transaction</th>
                      <th className="p-2 text-right bg-slate-900/50">Conflicting DB Txn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 text-slate-300">
                    {duplicates.map((dup, i) => {
                      const isApproved = approvedDuplicateKeys.includes(dup.match_key);
                      const toggleApprove = () => {
                         if (isApproved) {
                            setApprovedDuplicateKeys(prev => prev.filter(k => k !== dup.match_key));
                         } else {
                            setApprovedDuplicateKeys(prev => [...prev, dup.match_key]);
                         }
                      };
                      return (
                      <tr key={i} className={`hover:bg-slate-900/50 ${isApproved ? 'bg-emerald-900/10' : ''}`}>
                        <td className="p-3 text-center align-middle">
                          <input 
                            type="checkbox" 
                            checked={isApproved} 
                            onChange={toggleApprove} 
                            className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 cursor-pointer" 
                          />
                        </td>
                        <td className="p-2 align-top">
                           <div className="font-bold text-slate-200 mb-1">{dup.date} | {dup.symbol}</div>
                           <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-400">
                             <div>Type: <span className="text-slate-200 font-mono">{dup.type}</span></div>
                             <div>Qty: <span className="text-slate-200 font-mono">{dup.quantity}</span></div>
                           </div>
                           <div className="mt-2">
                             {dup.is_internal_duplicate ? (
                               <span className="bg-amber-500/20 text-amber-500 px-2 py-1 rounded font-bold text-[10px]">FILE DUPLICATE</span>
                             ) : (
                               <span className={`px-2 py-1 rounded text-[10px] font-bold ${dup.is_strict_duplicate ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                 {dup.is_strict_duplicate ? 'STRICT DUPLICATE (≤1% DIFF)' : 'SOFT DUPLICATE (1-2% DIFF)'}
                               </span>
                             )}
                           </div>
                        </td>
                        <td className="p-2 align-top text-right border-l border-slate-800/50 bg-slate-900/30">
                           {dup.conflict_tx ? (
                             <div className="space-y-1">
                               <div className="font-mono text-slate-400">Date: <span className="text-slate-200">{dup.conflict_tx.date}</span></div>
                               <div className="font-mono text-slate-400">Qty: <span className="text-slate-200">{dup.conflict_tx.quantity}</span></div>
                               <div className="font-mono text-slate-400">Price: <span className="text-slate-200">{formatCurrency(dup.conflict_tx.price)}</span></div>
                               <div className="font-mono text-slate-400">Net Amt: <span className="text-slate-200">{formatCurrency(dup.conflict_tx.net_amount)}</span></div>
                             </div>
                           ) : <span className="text-slate-500 italic">No conflict details</span>}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 bg-slate-800 text-slate-200 p-3 rounded-xl font-bold"
            >
              Cancel
            </button>
            <button
              onClick={handleCommit}
              disabled={status === 'uploading'}
              className="flex-1 bg-emerald-600 text-white p-3 rounded-xl font-bold disabled:opacity-50"
            >
              {status === 'uploading' ? 'Importing...' : 'Commit Import'}
            </button>
          </div>
        </div>
      )}

      {status === 'success' && <div className="text-emerald-400 flex items-center gap-2"><CheckCircle size={16}/> {message}</div>}
      {status === 'error' && <div className="text-red-400 flex items-center gap-2"><AlertTriangle size={16}/> {message}</div>}
    </div>
  );
};
