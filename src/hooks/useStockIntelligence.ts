import { useState, useEffect } from 'react';
import { WealthOSApiClient, RemoteResponse } from '../lib/apiClient';

export interface StockIntelligenceState {
  data: any | null;
  loading: boolean;
  error: string | null;
  status: 'AVAILABLE' | 'DATA_INSUFFICIENT' | 'SOURCE_UNAVAILABLE' | 'REMOTE_MISSING' | 'UNAUTHORIZED' | null;
}

export function useStockIntelligence(symbol: string, isOpen: boolean, candidateId?: string, signalIds?: string[]) {
  const [state, setState] = useState<StockIntelligenceState>({
    data: null,
    loading: true,
    error: null,
    status: null
  });

  useEffect(() => {
    if (!isOpen || !symbol) return;
    if (candidateId) return; // Managed by Analyze360View separately
    
    let isMounted = true;
    setState(prev => ({ ...prev, loading: true, error: null, status: null }));

    async function fetchData() {
      try {
        const response: RemoteResponse = await WealthOSApiClient.request(`/api/v2/company-intelligence/${encodeURIComponent(symbol)}`);
        
        if (!isMounted) return;

        if (response.status === 'AVAILABLE' && response.data) {
          const intelJson = response.data;
          
          if (intelJson.success || intelJson.modules || intelJson.overview) {
            setState({
              data: intelJson.data || intelJson,
              loading: false,
              error: null,
              status: 'AVAILABLE'
            });
          } else {
            setState({
              data: null,
              loading: false,
              error: intelJson.message || intelJson.error || 'Scrip intelligence error.',
              status: 'DATA_INSUFFICIENT'
            });
          }
        } else {
          setState({
            data: null,
            loading: false,
            error: response.error || 'Failed to fetch company intelligence',
            status: response.status
          });
        }
      } catch (err: any) {
        if (isMounted) {
          setState({
            data: null,
            loading: false,
            error: err.message || 'An error occurred while fetching company intelligence',
            status: 'SOURCE_UNAVAILABLE'
          });
        }
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [symbol, isOpen]);

  return state;
}
