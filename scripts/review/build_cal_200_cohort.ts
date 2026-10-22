import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BusinessModelClassifier } from '../../src/server/services/intelligence/domain/BusinessModelClassifier.js';
import { mapRawToCanonicalSector } from './cohort_builder.js';
import { FundamentalExperienceBuilder } from '../../src/server/services/intelligence/modules/FundamentalExperienceBuilder.js';

// Define the selection rules and candidate selection
export interface CohortItem {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  marketCapBucket: 'LARGE' | 'MID' | 'SMALL' | 'MICRO' | 'UNKNOWN';
  businessModelClass: 'NON_FINANCIAL' | 'BANK' | 'NBFC' | 'INSURANCE' | 'UNKNOWN';
  selectionStratum: string;
  reasonIncluded: string;
}

export function buildDeterministicCohort(db: Database.Database): CohortItem[] {
  // Query all master tickers with facts count and snapshot data
  const rawRows = db.prepare(`
    SELECT m.symbol, m.name, m.sector, m.industry, m.isin, m.last_price,
           f.pe_ratio, f.book_value, f.debt_to_equity, f.operating_margin_pct, f.roce_pct, f.roe_pct,
           f.promoter_holding_pct, f.fii_holding_pct, f.dii_holding_pct, f.pledged_pct,
           (SELECT COUNT(*) FROM company_facts c WHERE c.symbol = m.symbol) as fact_count,
           (SELECT COUNT(*) FROM company_facts c WHERE c.symbol = m.symbol AND c.verificationStatus IN ('VERIFIED', 'VERIFIED_PARTIAL')) as verified_fact_count,
           (SELECT COUNT(*) FROM (
              SELECT metric, periodEnd FROM company_facts c WHERE c.symbol = m.symbol GROUP BY metric, periodEnd HAVING COUNT(*) > 1
           )) as conflict_count
    FROM MasterTickers m
    LEFT JOIN FundamentalSnapshots f ON f.symbol = m.symbol
    WHERE m.symbol IS NOT NULL AND m.symbol != ''
    ORDER BY m.symbol ASC
  `).all() as any[];

  // Define target core symbols to ensure broad sector representation and benchmark coverage
  const strategicCandidates: Record<string, { stratum: string; reason: string }> = {
    // 1. Financials: Banks
    'HDFCBANK': { stratum: 'FINANCIAL_BANKS', reason: 'Large-cap private sector bellwether bank with high institutional ownership' },
    'SBIN': { stratum: 'FINANCIAL_BANKS', reason: 'Large-cap public sector benchmark bank' },
    'ICICIBANK': { stratum: 'FINANCIAL_BANKS', reason: 'Large-cap private sector major bank' },
    'KOTAKBANK': { stratum: 'FINANCIAL_BANKS', reason: 'Large-cap private bank with high capital adequacy' },
    'AXISBANK': { stratum: 'FINANCIAL_BANKS', reason: 'Large-cap private bank turnaround and retail expansion' },
    'BANKBARODA': { stratum: 'FINANCIAL_BANKS', reason: 'Mid/Large PSU bank with extensive branch network' },
    'PNB': { stratum: 'FINANCIAL_BANKS', reason: 'Large PSU bank with recovery and asset quality resolution' },
    'CANBK': { stratum: 'FINANCIAL_BANKS', reason: 'PSU bank with high credit growth in southern region' },
    'FEDERALBNK': { stratum: 'FINANCIAL_BANKS', reason: 'Mid-cap private commercial bank' },
    'IDFCFIRSTB': { stratum: 'FINANCIAL_BANKS', reason: 'Mid-cap fast growing retail bank' },
    'INDUSINDBK': { stratum: 'FINANCIAL_BANKS', reason: 'Mid/Large private bank with commercial vehicle book' },
    'AUBANK': { stratum: 'FINANCIAL_BANKS', reason: 'Small finance bank transitioning to universal bank' },
    'BANDHANBNK': { stratum: 'FINANCIAL_BANKS', reason: 'Microfinance-oriented private bank' },
    'RBLBANK': { stratum: 'FINANCIAL_BANKS', reason: 'Mid-cap private bank undergoing portfolio turnaround' },

    // 2. Financials: NBFCs
    'BAJFINANCE': { stratum: 'FINANCIAL_NBFC', reason: 'Large-cap dominant consumer/SME lending NBFC' },
    'BAJAJFINSV': { stratum: 'FINANCIAL_NBFC', reason: 'Large-cap financial services holding parent' },
    'CHOLAFIN': { stratum: 'FINANCIAL_NBFC', reason: 'Large-cap vehicle and home equity financier' },
    'MUTHOOTFIN': { stratum: 'FINANCIAL_NBFC', reason: 'Large-cap specialized gold loan NBFC' },
    'SHRIRAMFIN': { stratum: 'FINANCIAL_NBFC', reason: 'Large-cap commercial vehicle and retail financier' },
    'MANAPPURAM': { stratum: 'FINANCIAL_NBFC', reason: 'Mid-cap gold and microfinance NBFC' },
    'POONAWALLA': { stratum: 'FINANCIAL_NBFC', reason: 'Mid-cap tech-led consumer retail NBFC' },
    'M&MFIN': { stratum: 'FINANCIAL_NBFC', reason: 'Mid-cap rural vehicle and tractor financier' },
    'SUNDARMFIN': { stratum: 'FINANCIAL_NBFC', reason: 'High-quality commercial vehicle financier' },
    'LICHSGFIN': { stratum: 'FINANCIAL_NBFC', reason: 'Large housing finance company' },
    'PNBHOUSING': { stratum: 'FINANCIAL_NBFC', reason: 'Mid-cap housing finance institution' },
    'CANFINHOME': { stratum: 'FINANCIAL_NBFC', reason: 'Mid-cap affordable housing financier' },

    // 3. Financials: Insurance
    'HDFCLIFE': { stratum: 'FINANCIAL_INSURANCE', reason: 'Large-cap private life insurance company' },
    'SBILIFE': { stratum: 'FINANCIAL_INSURANCE', reason: 'Large-cap bancassurance life insurer' },
    'ICICIPRULI': { stratum: 'FINANCIAL_INSURANCE', reason: 'Large-cap private life insurance provider' },
    'ICICIGI': { stratum: 'FINANCIAL_INSURANCE', reason: 'Large-cap non-life general insurance leader' },
    'GICRE': { stratum: 'FINANCIAL_INSURANCE', reason: 'National public sector reinsurance company' },
    'NIACL': { stratum: 'FINANCIAL_INSURANCE', reason: 'Public sector general insurance company' },
    'STARHEALTH': { stratum: 'FINANCIAL_INSURANCE', reason: 'Standalone retail health insurance specialist' },

    // 4. IT & Technology Services
    'TCS': { stratum: 'IT_SERVICES', reason: 'Tier-1 IT services market leader with global scale' },
    'INFY': { stratum: 'IT_SERVICES', reason: 'Tier-1 global digital consulting and software leader' },
    'HCLTECH': { stratum: 'IT_SERVICES', reason: 'Tier-1 IT services leader with engineering/R&D focus' },
    'WIPRO': { stratum: 'IT_SERVICES', reason: 'Tier-1 diversified global IT services corporation' },
    'TECHM': { stratum: 'IT_SERVICES', reason: 'Tier-1 telecom and enterprise digital transformation provider' },
    'LTIM': { stratum: 'IT_SERVICES', reason: 'Tier-1 merged IT services and technology solutions giant' },
    'PERSISTENT': { stratum: 'IT_SERVICES', reason: 'Mid-cap high-growth digital product engineering specialist' },
    'COFORGE': { stratum: 'IT_SERVICES', reason: 'Mid-cap financial services, travel, and insurance IT specialist' },
    'KPITTECH': { stratum: 'IT_SERVICES', reason: 'Automotive software and embedded engineering leader' },
    'TATAELXSI': { stratum: 'IT_SERVICES', reason: 'Design-led technology and specialized ER&D provider' },
    'CYIENT': { stratum: 'IT_SERVICES', reason: 'Engineering services and aerospace/industrial tech' },
    'ZENSARTECH': { stratum: 'IT_SERVICES', reason: 'Mid-cap digital transformation and IT solutions firm' },
    'MPHASIS': { stratum: 'IT_SERVICES', reason: 'Banking and capital markets technology provider' },
    'SONATSOFTW': { stratum: 'IT_SERVICES', reason: 'Mid-cap modern enterprise software and cloud provider' },
    'MASTEK': { stratum: 'IT_SERVICES', reason: 'Digital commerce and public sector digital services' },

    // 5. Pharma & Healthcare
    'SUNPHARMA': { stratum: 'PHARMA_HEALTHCARE', reason: 'Largest Indian pharmaceutical company with global specialty portfolio' },
    'DRREDDY': { stratum: 'PHARMA_HEALTHCARE', reason: 'Global generics and biosimilars manufacturer' },
    'CIPLA': { stratum: 'PHARMA_HEALTHCARE', reason: 'Respiratory and domestic branded formulations champion' },
    'DIVISLAB': { stratum: 'PHARMA_HEALTHCARE', reason: 'Global API and custom synthesis contract manufacturer' },
    'APOLLOHOSP': { stratum: 'PHARMA_HEALTHCARE', reason: 'Integrated healthcare and multi-specialty hospital chain' },
    'LUPIN': { stratum: 'PHARMA_HEALTHCARE', reason: 'Formulations and complex generics pharma company' },
    'AUROPHARMA': { stratum: 'PHARMA_HEALTHCARE', reason: 'High-volume oral solids and injectable generics provider' },
    'TORNTPHARM': { stratum: 'PHARMA_HEALTHCARE', reason: 'Branded formulations and chronic therapies leader' },
    'ALKEM': { stratum: 'PHARMA_HEALTHCARE', reason: 'Domestic acute and chronic formulations powerhouse' },
    'BIOCON': { stratum: 'PHARMA_HEALTHCARE', reason: 'Global biopharmaceuticals and biosimilars developer' },
    'MAXHEALTH': { stratum: 'PHARMA_HEALTHCARE', reason: 'Leading metropolitan multi-specialty tertiary care hospitals' },
    'FORTIS': { stratum: 'PHARMA_HEALTHCARE', reason: 'Pan-India integrated hospital and diagnostics network' },
    'LAURUSLABS': { stratum: 'PHARMA_HEALTHCARE', reason: 'API, formulation, and CDMO biotechnology player' },
    'GLAND': { stratum: 'PHARMA_HEALTHCARE', reason: 'Specialized sterile injectables B2B manufacturer' },
    'IPCALAB': { stratum: 'PHARMA_HEALTHCARE', reason: 'Formulations and active ingredients pharma company' },

    // 6. Industrials & Capital Goods
    'LT': { stratum: 'CAPITAL_GOODS_INDUSTRIALS', reason: 'Infrastructure engineering and manufacturing conglomerate' },
    'SIEMENS': { stratum: 'CAPITAL_GOODS_INDUSTRIALS', reason: 'Industrial automation, energy, and electrification MNC' },
    'ABB': { stratum: 'CAPITAL_GOODS_INDUSTRIALS', reason: 'Robotics, motion, and grid automation manufacturer' },
    'BHEL': { stratum: 'CAPITAL_GOODS_INDUSTRIALS', reason: 'Heavy electrical and power generation equipment PSU' },
    'BEL': { stratum: 'CAPITAL_GOODS_INDUSTRIALS', reason: 'Defense electronics and aerospace equipment leader' },
    'HAL': { stratum: 'CAPITAL_GOODS_INDUSTRIALS', reason: 'Defense aerospace, jet engine, and helicopter manufacturer' },
    'THERMAX': { stratum: 'CAPITAL_GOODS_INDUSTRIALS', reason: 'Energy transition, boiler, and green utility equipment' },
    'CUMMINSIND': { stratum: 'CAPITAL_GOODS_INDUSTRIALS', reason: 'Heavy diesel engines and power generation solutions' },
    'POLYCAB': { stratum: 'CAPITAL_GOODS_INDUSTRIALS', reason: 'Wires, cables, and fast-moving electrical goods market leader' },
    'KEI': { stratum: 'CAPITAL_GOODS_INDUSTRIALS', reason: 'High-tension power cables and EPC contractor' },
    'ASTRAL': { stratum: 'CAPITAL_GOODS_INDUSTRIALS', reason: 'Building materials, CPVC plumbing, and adhesives producer' },
    'VOLTAS': { stratum: 'CAPITAL_GOODS_INDUSTRIALS', reason: 'Air conditioning and engineering projects company' },
    'HAVELLS': { stratum: 'CAPITAL_GOODS_INDUSTRIALS', reason: 'Electrical equipment, lighting, and consumer appliances' },
    'CROMPTON': { stratum: 'CAPITAL_GOODS_INDUSTRIALS', reason: 'Consumer electricals, fans, and lighting manufacturer' },
    'DIXON': { stratum: 'CAPITAL_GOODS_INDUSTRIALS', reason: 'Electronic manufacturing services (EMS) scale leader' },

    // 7. Auto & Auto Ancillary
    'MARUTI': { stratum: 'AUTO_AUTO_ANCILLARY', reason: 'Passenger vehicle market share leader' },
    'TATAMOTORS': { stratum: 'AUTO_AUTO_ANCILLARY', reason: 'Commercial vehicle leader and EV pioneer with JLR' },
    'M&M': { stratum: 'AUTO_AUTO_ANCILLARY', reason: 'SUV and tractor manufacturing powerhouse' },
    'BAJAJ-AUTO': { stratum: 'AUTO_AUTO_ANCILLARY', reason: 'Two-wheeler and three-wheeler exporter and OEM' },
    'HEROMOTOCO': { stratum: 'AUTO_AUTO_ANCILLARY', reason: 'Largest two-wheeler motorcycle volume OEM' },
    'TVSMOTOR': { stratum: 'AUTO_AUTO_ANCILLARY', reason: 'Two-wheeler and three-wheeler premium OEM' },
    'EICHERMOT': { stratum: 'AUTO_AUTO_ANCILLARY', reason: 'Mid-weight leisure motorcycle (Royal Enfield) and VECV' },
    'BHARATFORG': { stratum: 'AUTO_AUTO_ANCILLARY', reason: 'Global automotive and industrial precision forging OEM' },
    'MOTHERSON': { stratum: 'AUTO_AUTO_ANCILLARY', reason: 'Global automotive wiring harness and component supplier' },
    'BOSCHLTD': { stratum: 'AUTO_AUTO_ANCILLARY', reason: 'Automotive powertrain, braking, and mobility technology' },
    'BALKRISIND': { stratum: 'AUTO_AUTO_ANCILLARY', reason: 'Off-highway and agricultural tire global specialist' },
    'MRF': { stratum: 'AUTO_AUTO_ANCILLARY', reason: 'Domestic tire manufacturing brand leader' },
    'APOLLOTYRE': { stratum: 'AUTO_AUTO_ANCILLARY', reason: 'Commercial and passenger tire manufacturer with EU operations' },
    'SONACOMS': { stratum: 'AUTO_AUTO_ANCILLARY', reason: 'Precision automotive EV differential gear assemblies' },
    'ENDURANCE': { stratum: 'AUTO_AUTO_ANCILLARY', reason: 'Two-wheeler suspension and die-casting ancillary' },

    // 8. Metals & Mining
    'TATASTEEL': { stratum: 'METALS_MINING', reason: 'Integrated global steel manufacturer' },
    'JSWSTEEL': { stratum: 'METALS_MINING', reason: 'India largest private steel manufacturer by capacity' },
    'HINDALCO': { stratum: 'METALS_MINING', reason: 'Global aluminum and copper producer with Novelis' },
    'VEDL': { stratum: 'METALS_MINING', reason: 'Diversified natural resources, metals, and mining group' },
    'COALINDIA': { stratum: 'METALS_MINING', reason: 'Monopoly national coal extraction and mining company' },
    'NMDC': { stratum: 'METALS_MINING', reason: 'State-owned iron ore mining exploration enterprise' },
    'JINDALSTEL': { stratum: 'METALS_MINING', reason: 'Steel, power, and structural manufacturing company' },
    'SAIL': { stratum: 'METALS_MINING', reason: 'Public sector integrated steel manufacturing plant' },
    'NATIONALUM': { stratum: 'METALS_MINING', reason: 'Integrated bauxite mining and aluminum smelting PSU' },
    'HINDZINC': { stratum: 'METALS_MINING', reason: 'Integrated zinc, lead, and silver producer' },
    'RATNAMANI': { stratum: 'METALS_MINING', reason: 'Stainless steel and carbon steel industrial piping' },
    'APLAPOLLO': { stratum: 'METALS_MINING', reason: 'Structural steel tubes and pre-galvanized pipe leader' },

    // 9. Chemicals & Petrochemicals
    'PIDILITIND': { stratum: 'CHEMICALS', reason: 'Consumer adhesives (Fevicol) and specialty construction chemicals' },
    'SRF': { stratum: 'CHEMICALS', reason: 'Fluorochemicals, specialty chemical intermediates, and packaging films' },
    'GUJGASLTD': { stratum: 'CHEMICALS', reason: 'City gas distribution and industrial hydrocarbon supplier' },
    'DEEPAKNTR': { stratum: 'CHEMICALS', reason: 'Basic intermediates, phenolics, and specialty chemical player' },
    'TATACHEM': { stratum: 'CHEMICALS', reason: 'Global soda ash, sodium bicarbonate, and specialty chemistry' },
    'AARTIIND': { stratum: 'CHEMICALS', reason: 'Benzene-based specialty chemicals and pharmaceuticals' },
    'ATUL': { stratum: 'CHEMICALS', reason: 'Integrated specialty chemicals, aromatics, and bulk polymers' },
    'NAVINFLUOR': { stratum: 'CHEMICALS', reason: 'Specialty fluorochemicals and CDMO contract synthesis' },
    'PIIND': { stratum: 'CHEMICALS', reason: 'Agrochem complex synthesis and custom synthesis exports' },
    'FLUOROCHEM': { stratum: 'CHEMICALS', reason: 'Fluoropolymers, fluoro-specialties, and battery chemicals' },
    'CLEAN': { stratum: 'CHEMICALS', reason: 'Eco-friendly green catalytic specialty chemical technology' },
    'FINEORG': { stratum: 'CHEMICALS', reason: 'Oleochemical-based specialty additives for polymers/food' },

    // 10. Energy & Utilities
    'RELIANCE': { stratum: 'ENERGY_UTILITIES', reason: 'Energy refining, petrochemicals, retail, and digital telecom giant' },
    'NTPC': { stratum: 'ENERGY_UTILITIES', reason: 'National thermal and renewable power generation leader' },
    'POWERGRID': { stratum: 'ENERGY_UTILITIES', reason: 'National electric transmission grid monopoly utility' },
    'ONGC': { stratum: 'ENERGY_UTILITIES', reason: 'Upstream oil and natural gas exploration and production PSU' },
    'IOC': { stratum: 'ENERGY_UTILITIES', reason: 'Downstream oil refining and fuel marketing corporation' },
    'BPCL': { stratum: 'ENERGY_UTILITIES', reason: 'Oil refining, fuel retailing, and petroleum products' },
    'HPCL': { stratum: 'ENERGY_UTILITIES', reason: 'Downstream petroleum refining and distribution network' },
    'ADANIGREEN': { stratum: 'ENERGY_UTILITIES', reason: 'Renewable solar and wind generation developer' },
    'TATAPOWER': { stratum: 'ENERGY_UTILITIES', reason: 'Integrated power utility across generation, T&D, and solar' },
    'GAIL': { stratum: 'ENERGY_UTILITIES', reason: 'Natural gas transmission, processing, and petrochemicals' },
    'TORNTPOWER': { stratum: 'ENERGY_UTILITIES', reason: 'Power generation and urban distribution licensee' },
    'NHPC': { stratum: 'ENERGY_UTILITIES', reason: 'Hydroelectric power generation and utility PSU' },
    'IEX': { stratum: 'ENERGY_UTILITIES', reason: 'Nationwide electronic power and energy contracts exchange' },

    // 11. Consumer, Retail & FMCG
    'HINDUNILVR': { stratum: 'CONSUMER_FMCG', reason: 'FMCG personal care, home care, and food brand leader' },
    'ITC': { stratum: 'CONSUMER_FMCG', reason: 'FMCG, paperboards, hotels, agribusiness, and cigarettes conglomerate' },
    'NESTLEIND': { stratum: 'CONSUMER_FMCG', reason: 'Packaged foods, beverages, infant nutrition, and dairy MNC' },
    'BRITANNIA': { stratum: 'CONSUMER_FMCG', reason: 'Bakery, biscuits, and dairy products consumer brand' },
    'TITAN': { stratum: 'CONSUMER_RETAIL', reason: 'Jewellery (Tanishq), watches, and eyewear consumer lifestyle leader' },
    'TRENT': { stratum: 'CONSUMER_RETAIL', reason: 'Fast-fashion retail chain (Westside, Zudio) operator' },
    'DMART': { stratum: 'CONSUMER_RETAIL', reason: 'Value grocery supermarket hypermarket retail chain' },
    'ASIANPAINT': { stratum: 'CONSUMER_RETAIL', reason: 'Architectural decorative paints and coatings champion' },
    'BERGEPAINT': { stratum: 'CONSUMER_RETAIL', reason: 'Decorative and industrial coatings manufacturer' },
    'DABUR': { stratum: 'CONSUMER_FMCG', reason: 'Ayurvedic health care, personal care, and juice products' },
    'MARICO': { stratum: 'CONSUMER_FMCG', reason: 'Consumer hair oils, edible oils, and male grooming' },
    'GODREJCP': { stratum: 'CONSUMER_FMCG', reason: 'Personal wash, home care, and hair color household products' },
    'TATACONSUM': { stratum: 'CONSUMER_FMCG', reason: 'Packaged beverages, salt, pulses, and pantry essentials' },
    'VBL': { stratum: 'CONSUMER_FMCG', reason: 'Key beverage bottler and distributor for PepsiCo' },
    'DEVYANI': { stratum: 'CONSUMER_RETAIL', reason: 'QSR restaurant franchisee operator for KFC, Pizza Hut, Costa Coffee' },
    'METROBRAND': { stratum: 'CONSUMER_RETAIL', reason: 'Specialty footwear retailer across premium and casual brands' },
    'PAGEIND': { stratum: 'CONSUMER_RETAIL', reason: 'Exclusive licensee for Jockey innerwear and athleisure' },
    'BATAINDIA': { stratum: 'CONSUMER_RETAIL', reason: 'Footwear design, manufacturing, and store network' },

    // 12. Telecom & Media
    'BHARTIARTL': { stratum: 'TELECOM_MEDIA', reason: 'Global telecom carrier and Indian digital connectivity leader' },
    'TATACOMM': { stratum: 'TELECOM_MEDIA', reason: 'Enterprise digital network infrastructure and cloud communications' },
    'SUNTV': { stratum: 'TELECOM_MEDIA', reason: 'Regional broadcasting television and content producer' },
    'ZEEL': { stratum: 'TELECOM_MEDIA', reason: 'Broadcasting entertainment channels and streaming platform' },
    'PVRINOX': { stratum: 'TELECOM_MEDIA', reason: 'Largest multiplex cinema exhibition chain in India' },
    'NAUKRI': { stratum: 'TELECOM_MEDIA', reason: 'Internet classifieds, recruitment (Naukri), real estate (99acres)' },
    'SAREGAMA': { stratum: 'TELECOM_MEDIA', reason: 'Music publishing catalogue, film production, and retail audio' },
    'TV18BRDCST': { stratum: 'TELECOM_MEDIA', reason: 'Television news, entertainment broadcasting, and digital media' },
    'NETWORK18': { stratum: 'TELECOM_MEDIA', reason: 'Media and entertainment conglomerate across TV and digital platforms' },
    'INDUS': { stratum: 'TELECOM_MEDIA', reason: 'Passive telecom tower infrastructure company' },

    // 13. Real Estate & Infrastructure
    'DLF': { stratum: 'REAL_ESTATE_INFRA', reason: 'Largest listed residential and commercial real estate developer' },
    'GODREJPROP': { stratum: 'REAL_ESTATE_INFRA', reason: 'National urban residential real estate development brand' },
    'OBEROIRLTY': { stratum: 'REAL_ESTATE_INFRA', reason: 'Premium luxury residential and commercial real estate' },
    'PRESTIGE': { stratum: 'REAL_ESTATE_INFRA', reason: 'South and pan-India real estate, office parks, and malls' },
    'BRIGADE': { stratum: 'REAL_ESTATE_INFRA', reason: 'Integrated residential, commercial, and hospitality developer' },
    'SOBHA': { stratum: 'REAL_ESTATE_INFRA', reason: 'Backward-integrated luxury residential constructor' },
    'PHOENIXLTD': { stratum: 'REAL_ESTATE_INFRA', reason: 'Destination retail mall operator and mixed-use commercial developer' },
    'ADANIPORTS': { stratum: 'REAL_ESTATE_INFRA', reason: 'India largest commercial port developer and logistics operator' },
    'GMRINFRA': { stratum: 'REAL_ESTATE_INFRA', reason: 'Airport infrastructure operator (Delhi, Hyderabad, Goa)' },
    'IRB': { stratum: 'REAL_ESTATE_INFRA', reason: 'Highway road construction, tollways, and TOT concessionaire' },
    'NBCC': { stratum: 'REAL_ESTATE_INFRA', reason: 'Public sector civil engineering and project management consultancy' },
    'PNCINFRA': { stratum: 'REAL_ESTATE_INFRA', reason: 'Highways, bridges, airport runways, and industrial EPC contractor' },
  };

  const cohort: CohortItem[] = [];
  const pickedSymbols = new Set<string>();

  // Helper to map market cap to bucket
  function getMcapBucket(row: any): 'LARGE' | 'MID' | 'SMALL' | 'MICRO' | 'UNKNOWN' {
    // If book_value * price or pe or last_price available, or based on known master index
    const price = row.last_price || 0;
    if (price > 10000 || (row.symbol && ['RELIANCE', 'TCS', 'HDFCBANK', 'BHARTIARTL', 'ICICIBANK', 'INFY', 'SBIN', 'ITC', 'HINDUNILVR', 'LT', 'BAJFINANCE', 'MARUTI', 'HCLTECH', 'SUNPHARMA', 'TATAMOTORS', 'ONGC', 'NTPC', 'POWERGRID', 'KOTAKBANK', 'TITAN'].includes(row.symbol))) {
      return 'LARGE';
    }
    if (row.verified_fact_count > 10 || (row.pe_ratio && row.pe_ratio > 0)) {
      if (price > 1000) return 'LARGE';
      if (price > 250) return 'MID';
      if (price > 50) return 'SMALL';
      return 'MICRO';
    }
    return 'UNKNOWN';
  }

  // Helper to classify business model
  function getBmClass(row: any): 'NON_FINANCIAL' | 'BANK' | 'NBFC' | 'INSURANCE' | 'UNKNOWN' {
    return BusinessModelClassifier.classify(row.symbol, row.sector, row.industry, row.name) as any;
  }

  // 1. Add strategic candidate symbols that exist in database
  for (const [sym, meta] of Object.entries(strategicCandidates)) {
    const row = rawRows.find(r => r.symbol.toUpperCase() === sym);
    if (row && !pickedSymbols.has(sym)) {
      pickedSymbols.add(sym);
      cohort.push({
        symbol: sym,
        companyName: row.name || sym,
        sector: row.sector || 'UNKNOWN',
        industry: row.industry || 'UNKNOWN',
        marketCapBucket: getMcapBucket(row),
        businessModelClass: getBmClass(row),
        selectionStratum: meta.stratum,
        reasonIncluded: meta.reason,
      });
    }
  }

  console.log(`Core strategic symbols added: ${cohort.length}`);

  // 2. Add companies with potential conflicts in canonical facts
  const conflictRows = rawRows.filter(r => r.conflict_count > 0 && !pickedSymbols.has(r.symbol));
  for (const row of conflictRows.slice(0, 15)) {
    pickedSymbols.add(row.symbol);
    cohort.push({
      symbol: row.symbol,
      companyName: row.name || row.symbol,
      sector: row.sector || 'UNKNOWN',
      industry: row.industry || 'UNKNOWN',
      marketCapBucket: getMcapBucket(row),
      businessModelClass: getBmClass(row),
      selectionStratum: 'CONFLICTING_CANONICAL_FACTS',
      reasonIncluded: `Surfaces ${row.conflict_count} potential multiple-provider fact collisions for identical metric and period`,
    });
  }

  // 3. Add companies with high data coverage (facts count >= 15)
  const highDataRows = rawRows.filter(r => r.fact_count >= 15 && !pickedSymbols.has(r.symbol));
  for (const row of highDataRows.slice(0, 20)) {
    pickedSymbols.add(row.symbol);
    cohort.push({
      symbol: row.symbol,
      companyName: row.name || row.symbol,
      sector: row.sector || 'UNKNOWN',
      industry: row.industry || 'UNKNOWN',
      marketCapBucket: getMcapBucket(row),
      businessModelClass: getBmClass(row),
      selectionStratum: 'HIGH_CANONICAL_DATA_COVERAGE',
      reasonIncluded: `High canonical fact volume (${row.fact_count} facts, ${row.verified_fact_count} verified) for comprehensive multi-period analysis`,
    });
  }

  // 4. Add companies with sparse / partial data (facts count 1-5)
  const sparseDataRows = rawRows.filter(r => r.fact_count >= 1 && r.fact_count <= 5 && !pickedSymbols.has(r.symbol));
  for (const row of sparseDataRows.slice(0, 15)) {
    pickedSymbols.add(row.symbol);
    cohort.push({
      symbol: row.symbol,
      companyName: row.name || row.symbol,
      sector: row.sector || 'UNKNOWN',
      industry: row.industry || 'UNKNOWN',
      marketCapBucket: getMcapBucket(row),
      businessModelClass: getBmClass(row),
      selectionStratum: 'SPARSE_PARTIAL_DATA',
      reasonIncluded: `Sparse canonical fact coverage (${row.fact_count} facts) to validate fail-closed partial assessment`,
    });
  }

  // 5. Add companies with zero facts (expected DATA_UNAVAILABLE_EXPECTED)
  const zeroDataRows = rawRows.filter(r => r.fact_count === 0 && !pickedSymbols.has(r.symbol));
  for (const row of zeroDataRows.slice(0, 15)) {
    pickedSymbols.add(row.symbol);
    cohort.push({
      symbol: row.symbol,
      companyName: row.name || row.symbol,
      sector: row.sector || 'UNKNOWN',
      industry: row.industry || 'UNKNOWN',
      marketCapBucket: getMcapBucket(row),
      businessModelClass: getBmClass(row),
      selectionStratum: 'ZERO_DATA_UNAVAILABLE_EXPECTED',
      reasonIncluded: `Zero canonical company_facts entries; verifies graceful DATA_UNAVAILABLE_EXPECTED fail-closed return`,
    });
  }

  // 6. Add companies with high promoter pledge
  const pledgedRows = rawRows.filter(r => (r.pledged_pct || 0) > 0 && !pickedSymbols.has(r.symbol));
  for (const row of pledgedRows.slice(0, 10)) {
    pickedSymbols.add(row.symbol);
    cohort.push({
      symbol: row.symbol,
      companyName: row.name || row.symbol,
      sector: row.sector || 'UNKNOWN',
      industry: row.industry || 'UNKNOWN',
      marketCapBucket: getMcapBucket(row),
      businessModelClass: getBmClass(row),
      selectionStratum: 'HIGH_PROMOTER_PLEDGE',
      reasonIncluded: `Promoter pledge percentage present (${row.pledged_pct}%) to validate governance flag triggers`,
    });
  }

  // 7. Add companies with high debt vs zero debt
  const highDebtRows = rawRows.filter(r => (r.debt_to_equity || 0) > 2.0 && !pickedSymbols.has(r.symbol));
  for (const row of highDebtRows.slice(0, 10)) {
    pickedSymbols.add(row.symbol);
    cohort.push({
      symbol: row.symbol,
      companyName: row.name || row.symbol,
      sector: row.sector || 'UNKNOWN',
      industry: row.industry || 'UNKNOWN',
      marketCapBucket: getMcapBucket(row),
      businessModelClass: getBmClass(row),
      selectionStratum: 'HIGH_LEVERAGE_DEBT',
      reasonIncluded: `High debt-to-equity ratio (${row.debt_to_equity}) for financial strength risk analysis`,
    });
  }

  // 8. Add remaining symbols deterministically to fill exact 200 cohort size
  const remainingRows = rawRows.filter(r => !pickedSymbols.has(r.symbol));
  let idx = 0;
  while (cohort.length < 200 && idx < remainingRows.length) {
    const row = remainingRows[idx++];
    pickedSymbols.add(row.symbol);
    cohort.push({
      symbol: row.symbol,
      companyName: row.name || row.symbol,
      sector: row.sector || 'UNKNOWN',
      industry: row.industry || 'UNKNOWN',
      marketCapBucket: getMcapBucket(row),
      businessModelClass: getBmClass(row),
      selectionStratum: 'DETERMINISTIC_UNIVERSE_SPREAD',
      reasonIncluded: `Deterministic cross-sectional sample from NSE active universe (sector: ${row.sector || 'Unknown'}, verified facts: ${row.verified_fact_count})`,
    });
  }

  return cohort.slice(0, 200);
}
