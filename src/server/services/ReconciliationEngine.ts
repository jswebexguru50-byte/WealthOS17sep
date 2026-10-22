export interface ReconciliationItem {
  id: string;
  date: string;
  symbol: string;
  systemQuantity: number;
  importedQuantity: number;
  difference: number;
  status: 'MATCHED' | 'DISCREPANCY' | 'MISSING_IN_SYSTEM' | 'MISSING_IN_IMPORT';
}

export class ReconciliationEngine {
  /**
   * Reconcile system holdings/transactions against external import report
   */
  public static reconcileHoldings(systemHoldings: any[], importedHoldings: any[]): ReconciliationItem[] {
    const results: ReconciliationItem[] = [];
    const importedMap = new Map<string, any>();

    for (const item of importedHoldings) {
      const key = (item.symbol || item.isin || 'UNKNOWN').toUpperCase();
      importedMap.set(key, item);
    }

    const systemKeys = new Set<string>();

    for (const sys of systemHoldings) {
      const key = (sys.symbol || sys.isin || 'UNKNOWN').toUpperCase();
      systemKeys.add(key);

      const imported = importedMap.get(key);
      const sysQty = Number(sys.quantity || 0);

      if (imported) {
        const impQty = Number(imported.quantity || 0);
        const diff = Math.abs(sysQty - impQty);

        results.push({
          id: `recon_${key}`,
          date: new Date().toISOString().split('T')[0],
          symbol: key,
          systemQuantity: sysQty,
          importedQuantity: impQty,
          difference: diff,
          status: diff < 0.001 ? 'MATCHED' : 'DISCREPANCY'
        });
      } else {
        results.push({
          id: `recon_${key}`,
          date: new Date().toISOString().split('T')[0],
          symbol: key,
          systemQuantity: sysQty,
          importedQuantity: 0,
          difference: sysQty,
          status: 'MISSING_IN_IMPORT'
        });
      }
    }

    for (const [impKey, imp] of importedMap.entries()) {
      if (!systemKeys.has(impKey)) {
        const impQty = Number(imp.quantity || 0);
        results.push({
          id: `recon_${impKey}`,
          date: new Date().toISOString().split('T')[0],
          symbol: impKey,
          systemQuantity: 0,
          importedQuantity: impQty,
          difference: impQty,
          status: 'MISSING_IN_SYSTEM'
        });
      }
    }

    return results;
  }
}
