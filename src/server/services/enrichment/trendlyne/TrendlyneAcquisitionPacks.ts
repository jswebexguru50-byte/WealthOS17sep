import { TrendlyneMetricDefinition } from './TrendlyneContracts.js';
import { TrendlyneMetricCatalog } from './TrendlyneMetricCatalog.js';

export class TrendlyneAcquisitionPacks {
  public static validatePackSize(pack: TrendlyneMetricDefinition[], packName: string): void {
    if (pack.length > 50) {
      throw new Error(`Trendlyne pack '${packName}' exceeds the maximum allowed token count of 50 (contains ${pack.length})`);
    }
  }

  /**
   * Pack 1: Snapshot / Valuation / Ownership / Governance
   * Fetches latest state, valuation ratios, and ownership details.
   */
  public static getPack1Metrics(catalog: TrendlyneMetricCatalog): TrendlyneMetricDefinition[] {
    const requiredCanonical = [
      'current_price', 'market_cap', 'pe', 'pb', 'book_value', 'roe', 'roce',
      'roic', 'roa', 'debt_to_equity', 'net_debt', 'current_ratio', 'dividend_payout',
      'promoter_holding', 'promoter_pledge', 'fii_holding', 'fii_change',
      'dii_holding', 'public_holding', 'delivery_average', 'insider_sell_indicator',
      'piotroski_score', 'contingent_liabilities', 'order_book'
    ];
    
    // We get Trendlyne metrics that match these canonical metrics
    const pack = catalog.getAllMetrics().filter(m => 
      m.canonicalMetric && requiredCanonical.includes(m.canonicalMetric)
    ).slice(0, 50); // Ensure exactly 50 or less
    this.validatePackSize(pack, 'Pack1_Snapshot');
    return pack;
  }

  /**
   * Pack 2: Dated Statement History
   * Fetches trailing history for financial statements.
   */
  public static getPack2Metrics(catalog: TrendlyneMetricCatalog): TrendlyneMetricDefinition[] {
    const requiredCanonical = [
      'revenue_q1', 'revenue_q2', 'revenue_q3', 'revenue_q4', 'revenue_q5', 'revenue_q6', 'revenue_q7', 'revenue_q8',
      'operating_profit_q1', 'operating_profit_q2', 'operating_profit_q3', 'operating_profit_q4',
      'pat_q1', 'pat_q2', 'pat_q3', 'pat_q4', 'pat_q5', 'pat_q6', 'pat_q7', 'pat_q8',
      'revenue_annual', 'operating_profit_annual', 'pat_annual', 'cfo_annual', 'capex_annual',
      'borrowings_annual', 'interest_annual', 'working_capital', 'inventories', 'receivables',
      'cfi_annual', 'cff_annual', 'cwip_annual'
    ];
    
    const statementRelatedForPack2 = ['growth', 'profitability', 'cash_flow', 'working_capital', 'leverage', 'capex', 'growth_depth'];
    const pack1 = this.getPack1Metrics(catalog);
    
    const pack2 = catalog.getAllMetrics().filter(m => 
      m.usefulFor.some(u => statementRelatedForPack2.includes(u)) &&
      !pack1.includes(m)
    ).slice(0, 50);
    this.validatePackSize(pack2, 'Pack2_Statements');
    
    return pack2;
  }

  /**
   * Pack 3: Qualitative / Events / Documents
   * Fetches qualitative data endpoints.
   */
  public static getPack3Endpoints(): string[] {
    return [
      'get_overview_news_corp_events',
      'get_ownership_deals_insider_sast',
      'get_document_search_results'
    ];
  }
}
