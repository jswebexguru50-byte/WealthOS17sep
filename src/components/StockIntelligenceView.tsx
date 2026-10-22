import React from 'react';
import { Analyze360View } from './Analyze360View.js';
import { LegacyCompanyIntelligenceModal } from './LegacyCompanyIntelligenceModal.js';

export interface StockIntelligenceViewProps {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
  formatCurrency?: (val: number) => string;
  candidateId?: string;
  signalIds?: string[];
  recommendedDate?: string;
  strategyIds?: string[];
  mode?: 'analyze360' | 'legacy';
}

/**
 * StockIntelligenceView
 *
 * Canonical wrapper for stock analysis view.
 * Default: opens Analyze360View directly with complete candidate & strategy context.
 * Legacy: accessible via mode="legacy".
 *
 * Guarantees:
 * - No conditional hook execution.
 * - Passes candidateId, signalIds, recommendedDate, and strategyIds to Analyze360View.
 * - Closes cleanly via onClose callback.
 */
export function StockIntelligenceView({
  symbol,
  isOpen,
  onClose,
  formatCurrency,
  candidateId,
  signalIds,
  recommendedDate,
  strategyIds,
  mode = 'analyze360'
}: StockIntelligenceViewProps) {
  if (!isOpen) return null;

  if (mode === 'legacy') {
    return (
      <LegacyCompanyIntelligenceModal
        symbol={symbol}
        isOpen={isOpen}
        onClose={onClose}
        formatCurrency={formatCurrency}
        candidateId={candidateId}
        signalIds={signalIds}
        recommendedDate={recommendedDate}
        strategyIds={strategyIds}
      />
    );
  }

  return (
    <Analyze360View
      symbol={symbol}
      candidateId={candidateId}
      signalIds={signalIds}
      recommendedDate={recommendedDate}
      strategyIds={strategyIds}
      onClose={onClose}
    />
  );
}
