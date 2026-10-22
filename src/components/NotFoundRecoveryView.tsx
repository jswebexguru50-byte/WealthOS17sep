// NotFoundRecoveryView.tsx
// Agent A — Route Compatibility: Explicit Not Found / Recovery page
//
// CONSTRAINT: Unknown/unmapped routes must produce this explicit view.
// Do NOT silently redirect to OVERVIEW. Show the unknown route and all available workspaces.

import React from 'react';
import { AlertTriangle, ArrowRight, Hash } from 'lucide-react';

interface WorkspaceEntry {
  id: string;
  label: string;
  sub: string;
}

interface NotFoundRecoveryViewProps {
  unknownRoute: string;
  availableWorkspaces: WorkspaceEntry[];
  onNavigate: (workspaceId: string) => void;
}

export function NotFoundRecoveryView({
  unknownRoute,
  availableWorkspaces,
  onNavigate
}: NotFoundRecoveryViewProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 px-4 text-center space-y-8">
      {/* Warning badge */}
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-amber-500/10 border border-amber-500/30">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
      </div>

      {/* Unknown route display */}
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-white tracking-tight">Route Not Found</h1>
        <p className="text-sm text-slate-400 max-w-md">
          The route <code className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-amber-300">#{unknownRoute}</code> is not mapped to any known workspace.
        </p>
        <p className="text-xs text-slate-500 font-mono">
          Deep links must be updated to use the new canonical routes.
        </p>
      </div>

      {/* Available workspaces */}
      <div className="w-full max-w-md space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 text-left mb-3">
          Available Workspaces
        </div>
        {availableWorkspaces.map(ws => (
          <button
            key={ws.id}
            onClick={() => onNavigate(ws.id)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer group text-left hover:brightness-110"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border-card)',
              color: 'var(--text-primary)'
            }}
          >
            <div className="flex items-center gap-3">
              <Hash className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <div>
                <div className="font-bold text-sm text-white">{ws.label}</div>
                <div className="text-[10px] text-slate-400 font-mono">{ws.sub}</div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
          </button>
        ))}
      </div>

      {/* Evidence note */}
      <div className="text-[10px] font-mono text-slate-600 max-w-md">
        If you followed a deep link from a bookmark or external source, update it to use the new workspace route.
        All legacy route parameters are preserved in the new IA.
      </div>
    </div>
  );
}
