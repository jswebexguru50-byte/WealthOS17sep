/**
 * src/components/ScripIntelligencePortal.tsx
 *
 * Route adapter / search launcher for canonical StockIntelligenceView (#analyze/:symbol).
 * Eliminates duplicate analysis implementation and forwards to canonical destination.
 */

import React, { useEffect } from 'react';
import { StockIntelligenceView } from './StockIntelligenceView.js';

export interface ScripIntelligencePortalProps {
  initialSymbol?: string;
  selectedPortfolio?: string;
  onClose?: () => void;
}

export function ScripIntelligencePortal({
  initialSymbol = 'RELIANCE',
  selectedPortfolio,
  onClose
}: ScripIntelligencePortalProps) {
  const cleanSymbol = initialSymbol.toUpperCase().replace('.NS', '').replace('.BO', '').trim();

  useEffect(() => {
    if (typeof window !== 'undefined' && cleanSymbol) {
      window.history.replaceState(null, '', `#analyze/${cleanSymbol}`);
    }
  }, [cleanSymbol]);

  return (
    <StockIntelligenceView
      symbol={cleanSymbol}
      isOpen={true}
      onClose={onClose || (() => {
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', '#discover');
        }
      })}
    />
  );
}
