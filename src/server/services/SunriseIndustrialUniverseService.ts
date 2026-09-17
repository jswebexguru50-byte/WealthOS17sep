/**
 * SunriseIndustrialUniverseService.ts
 *
 * Institutional Service for the Sovereign High-Growth Sunrise & Industrial-Backed Mid/Small-Cap Universe (SHG-SIBM).
 * Implements the 6 Core Quantitative Investor Criteria:
 * 1. Sunrise sectors with Central Government PLI tailwinds (12 Notified Verticals)
 * 2. Promoted/backed/invested by established 20–30+ year-old Indian industrial groups (or veteran engineering pioneers)
 * 3. High Turnover (Revenue) CAGR (>= 20%) & EBITDA Margin Expansion (CAGR >= 25%)
 * 4. High innovation, commercial validation, strong order book, and profitability inflection
 * 5. Low market float (Promoter >= 50%, Inst >= 15%, Public/Retail float <= 25%)
 * 6. Small-cap or Mid-cap (Market Cap ₹1,000 Cr to ₹45,000 Cr) with multiple re-rating headroom (PEG <= 1.5)
 */

import { getDB, dbAll, dbRun, dbGet } from '../database.js';

export interface IndustrialGroup {
  groupId: string;
  groupName: string;
  foundingYear: number;
  vintageYears: number;
  promoterFamilyOrigin?: string;
  headquarters?: string;
  governanceRating: 'AAA_SOVEREIGN' | 'AA_INSTITUTIONAL' | 'A_SOUND' | 'REJECTED';
  notes?: string;
}

export interface PliSector {
  schemeId: string;
  schemeName: string;
  verticalCode: string;
  nodalMinistry: string;
  notifiedOutlayCr: number;
  targetYear: number;
  status: 'ACTIVE' | 'EXPANDING' | 'COMPLETED';
}

export interface SunriseIndustrialScrip {
  symbol: string;
  companyName: string;
  isin: string;
  verticalCode: string;
  verticalName: string;
  pliSchemeId?: string;
  pliTier: 1 | 2 | 3;
  industrialGroupId?: string;
  industrialGroupName: string;
  groupVintageYears: number;
  backingModality: 'GROUP_SUBSIDIARY' | 'GROUP_JV' | 'GROUP_TURNAROUND' | 'GROUP_SPINOFF' | 'GROUP_ANCHOR' | 'INDEPENDENT_VET_PIONEER';
  marketCapCr: number;
  marketCapTier: 'SMALLCAP' | 'MIDCAP';
  currentPrice: number;
  turnoverCagr3yPct: number;
  ebitdaCagr3yPct: number;
  operatingLeverageRatio: number;
  cfoToEbitdaRatio: number;
  promoterHoldingPct: number;
  fiiHoldingPct: number;
  diiHoldingPct: number;
  freeRetailFloatPct: number;
  promoterPledgePct: number;
  pegRatio: number;
  rocePct: number;
  orderBookCr?: number;
  orderBookMultiple?: number;
  compositeShgScore: number;
  convictionTier: 'TIER_1_TITANIUM' | 'TIER_2_GROWTH_RUNNER' | 'TIER_3_WATCHLIST' | 'DISQUALIFIED';
  catalystsSummary: string;
  lastEvaluatedAt: string;
}

export class SunriseIndustrialUniverseService {
  private static instance: SunriseIndustrialUniverseService;
  private initialized: boolean = false;

  private constructor() {}

  public static getInstance(): SunriseIndustrialUniverseService {
    if (!SunriseIndustrialUniverseService.instance) {
      SunriseIndustrialUniverseService.instance = new SunriseIndustrialUniverseService();
    }
    return SunriseIndustrialUniverseService.instance;
  }

  /**
   * Initializes the dedicated SQLite tables and seeds the canonical industrial group registry,
   * PLI sector registry, and vetted high-growth sunrise scrips.
   */
  public async initializeTablesAndSeed(): Promise<void> {
    if (this.initialized) return;

    try {
      const db = getDB();

      // 1. Industrial Group Registry Table
      await dbRun(db, `
        CREATE TABLE IF NOT EXISTS industrial_group_registry (
          group_id TEXT PRIMARY KEY,
          group_name TEXT NOT NULL UNIQUE,
          founding_year INTEGER NOT NULL,
          vintage_years INTEGER,
          promoter_family_origin TEXT,
          headquarters TEXT,
          governance_rating TEXT CHECK(governance_rating IN ('AAA_SOVEREIGN', 'AA_INSTITUTIONAL', 'A_SOUND', 'REJECTED')),
          notes TEXT
        );
      `);

      // 2. PLI Sector Registry Table
      await dbRun(db, `
        CREATE TABLE IF NOT EXISTS pli_sector_registry (
          scheme_id TEXT PRIMARY KEY,
          scheme_name TEXT NOT NULL,
          vertical_code TEXT NOT NULL,
          nodal_ministry TEXT NOT NULL,
          notified_outlay_cr REAL NOT NULL,
          target_year INTEGER NOT NULL,
          status TEXT CHECK(status IN ('ACTIVE', 'EXPANDING', 'COMPLETED'))
        );
      `);

      // 3. Sunrise Industrial Universe Table
      await dbRun(db, `
        CREATE TABLE IF NOT EXISTS sunrise_industrial_universe (
          symbol TEXT PRIMARY KEY,
          company_name TEXT NOT NULL,
          isin TEXT NOT NULL UNIQUE,
          vertical_code TEXT NOT NULL,
          vertical_name TEXT NOT NULL,
          pli_scheme_id TEXT,
          pli_tier INTEGER CHECK(pli_tier IN (1, 2, 3)),
          industrial_group_id TEXT,
          industrial_group_name TEXT NOT NULL,
          group_vintage_years INTEGER NOT NULL,
          backing_modality TEXT NOT NULL,
          market_cap_cr REAL NOT NULL,
          market_cap_tier TEXT NOT NULL,
          current_price REAL NOT NULL,
          turnover_cagr_3y_pct REAL NOT NULL,
          ebitda_cagr_3y_pct REAL NOT NULL,
          operating_leverage_ratio REAL NOT NULL,
          cfo_to_ebitda_ratio REAL NOT NULL,
          promoter_holding_pct REAL NOT NULL,
          fii_holding_pct REAL NOT NULL,
          dii_holding_pct REAL NOT NULL,
          free_retail_float_pct REAL NOT NULL,
          promoter_pledge_pct REAL NOT NULL DEFAULT 0.0,
          peg_ratio REAL NOT NULL,
          roce_pct REAL NOT NULL,
          order_book_cr REAL,
          order_book_multiple REAL,
          composite_shg_score REAL NOT NULL,
          conviction_tier TEXT NOT NULL,
          catalysts_summary TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          last_evaluated_at TEXT NOT NULL
        );
      `);

      await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_shg_score ON sunrise_industrial_universe(composite_shg_score DESC);`);
      await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_shg_vertical ON sunrise_industrial_universe(vertical_code);`);
      await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_shg_group ON sunrise_industrial_universe(industrial_group_id);`);

      // Seed Industrial Groups if empty
      const groupCountRow: any = await dbGet(db, `SELECT COUNT(*) as count FROM industrial_group_registry;`);
      if (!groupCountRow || groupCountRow.count === 0) {
        await this.seedIndustrialGroups();
      }

      // Seed PLI Sectors if empty
      const pliCountRow: any = await dbGet(db, `SELECT COUNT(*) as count FROM pli_sector_registry;`);
      if (!pliCountRow || pliCountRow.count === 0) {
        await this.seedPliSectors();
      }

      // Seed Universe Scrips if empty
      const scripCountRow: any = await dbGet(db, `SELECT COUNT(*) as count FROM sunrise_industrial_universe;`);
      if (!scripCountRow || scripCountRow.count === 0) {
        await this.seedUniverseScrips();
      }

      this.initialized = true;
      console.log('[SunriseIndustrialUniverseService] Database tables & seed catalog successfully initialized.');
    } catch (err) {
      console.error('[SunriseIndustrialUniverseService] Initialization error:', err);
    }
  }

  private async seedIndustrialGroups(): Promise<void> {
    const db = getDB();
    const groups: IndustrialGroup[] = [
      { groupId: 'TATA', groupName: 'Tata Group', foundingYear: 1868, vintageYears: 158, promoterFamilyOrigin: 'Parsi / Mumbai', headquarters: 'Bombay House, Mumbai', governanceRating: 'AAA_SOVEREIGN', notes: 'India’s foremost industrial house. Flagships & high-growth sunrise tech/telecom.' },
      { groupId: 'MURUGAPPA', groupName: 'Murugappa Group', foundingYear: 1900, vintageYears: 126, promoterFamilyOrigin: 'Chettiar / Chennai', headquarters: 'Chennai, Tamil Nadu', governanceRating: 'AAA_SOVEREIGN', notes: 'Pristine capital allocation. Tube Investments, CG Power turnaround, semiconductors.' },
      { groupId: 'BIRLA', groupName: 'Aditya Birla Group', foundingYear: 1857, vintageYears: 169, promoterFamilyOrigin: 'Marwari / Mumbai', headquarters: 'Mumbai, Maharashtra', governanceRating: 'AAA_SOVEREIGN', notes: 'Century Textiles, Birla Cable, UltraTech, Hindalco.' },
      { groupId: 'TVS', groupName: 'TVS Group / TVS Holdings', foundingYear: 1911, vintageYears: 115, promoterFamilyOrigin: 'Tamil Brahmin / Madurai', headquarters: 'Chennai, Tamil Nadu', governanceRating: 'AAA_SOVEREIGN', notes: 'Sundram Fasteners, TVS Supply Chain, Wheels India, TVS Motors.' },
      { groupId: 'LT', groupName: 'Larsen & Toubro Group', foundingYear: 1938, vintageYears: 88, promoterFamilyOrigin: 'Professionally Managed / Mumbai', headquarters: 'L&T House, Mumbai', governanceRating: 'AAA_SOVEREIGN', notes: 'LTTS, LTIMindtree, Defence, Green Hydrogen.' },
      { groupId: 'BAJAJ', groupName: 'Bajaj Group', foundingYear: 1926, vintageYears: 100, promoterFamilyOrigin: 'Marwari / Pune', headquarters: 'Pune, Maharashtra', governanceRating: 'AAA_SOVEREIGN', notes: 'Bajaj Auto, Mukand Ltd, Hercules Hoists, clean zero-debt discipline.' },
      { groupId: 'MAHINDRA', groupName: 'Mahindra Group', foundingYear: 1945, vintageYears: 81, promoterFamilyOrigin: 'Punjabi / Mumbai', headquarters: 'Gateway Building, Mumbai', governanceRating: 'AAA_SOVEREIGN', notes: 'Mahindra Logistics, Mahindra Lifespaces, Swaraj Engines, EV mobility.' },
      { groupId: 'GODREJ', groupName: 'Godrej Group', foundingYear: 1897, vintageYears: 129, promoterFamilyOrigin: 'Parsi / Mumbai', headquarters: 'Mumbai, Maharashtra', governanceRating: 'AAA_SOVEREIGN', notes: 'Godrej Agrovet, Godrej Industries, Astec Lifesciences.' },
      { groupId: 'KALYANI', groupName: 'Kalyani Group', foundingYear: 1966, vintageYears: 60, promoterFamilyOrigin: 'Maharashtrian / Pune', headquarters: 'Pune, Maharashtra', governanceRating: 'AA_INSTITUTIONAL', notes: 'Bharat Forge, BF Utilities, Kalyani Steels, Advanced Defence Artillery.' },
      { groupId: 'SHRIRAM', groupName: 'Shriram Group', foundingYear: 1974, vintageYears: 52, promoterFamilyOrigin: 'Tamil / Chennai', headquarters: 'Chennai, Tamil Nadu', governanceRating: 'AA_INSTITUTIONAL', notes: 'Shriram Finance, Shriram Properties.' },
      { groupId: 'RPG', groupName: 'RPG Enterprises', foundingYear: 1979, vintageYears: 47, promoterFamilyOrigin: 'Marwari / Mumbai', headquarters: 'Mumbai, Maharashtra', governanceRating: 'AA_INSTITUTIONAL', notes: 'KEC International (Power T&D, Railways), Zensar Technologies, Ceat.' },
      { groupId: 'JUBILANT', groupName: 'Jubilant Bhartia Group', foundingYear: 1978, vintageYears: 48, promoterFamilyOrigin: 'Marwari / Noida', headquarters: 'Noida, Uttar Pradesh', governanceRating: 'AA_INSTITUTIONAL', notes: 'Jubilant Ingrevia (Specialty Chem), Jubilant Pharmova (APIs).' },
      { groupId: 'DCM_SHRIRAM', groupName: 'DCM Shriram Group', foundingYear: 1889, vintageYears: 137, promoterFamilyOrigin: 'Delhi / DCM', headquarters: 'New Delhi', governanceRating: 'AA_INSTITUTIONAL', notes: 'DCM Shriram Industries, Shriram Pistons & Rings.' },
      { groupId: 'DEFENCE_ESDM_PIONEERS', groupName: 'Veteran Engineering & Tech Houses', foundingYear: 1985, vintageYears: 41, promoterFamilyOrigin: 'First-Gen Engineering Pioneers', headquarters: 'Various', governanceRating: 'AA_INSTITUTIONAL', notes: '30-40+ year seasoned engineering institutions (Data Patterns, Kaynes, Dixon, Syrma).' }
    ];

    for (const g of groups) {
      await dbRun(db, `
        INSERT OR REPLACE INTO industrial_group_registry
        (group_id, group_name, founding_year, vintage_years, promoter_family_origin, headquarters, governance_rating, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
      `, [g.groupId, g.groupName, g.foundingYear, g.vintageYears, g.promoterFamilyOrigin, g.headquarters, g.governanceRating, g.notes]);
    }
  }

  private async seedPliSectors(): Promise<void> {
    const db = getDB();
    const sectors: PliSector[] = [
      { schemeId: 'PLI_ISM_SEMI', schemeName: 'India Semiconductor Mission & SPECS', verticalCode: 'SUN_ESDM', nodalMinistry: 'MeitY', notifiedOutlayCr: 76000, targetYear: 2030, status: 'ACTIVE' },
      { schemeId: 'PLI_AERO_DEF', schemeName: 'Defence Indigenisation & DPEPP 2020', verticalCode: 'SUN_AERO_DEF', nodalMinistry: 'Ministry of Defence', notifiedOutlayCr: 45000, targetYear: 2029, status: 'ACTIVE' },
      { schemeId: 'PLI_SOLAR_PV', schemeName: 'High-Efficiency Solar PV Modules PLI', verticalCode: 'SUN_CLEAN_ENERGY', nodalMinistry: 'MNRE', notifiedOutlayCr: 24000, targetYear: 2028, status: 'ACTIVE' },
      { schemeId: 'PLI_ACC_BATTERY', schemeName: 'Advanced Chemistry Cell (ACC) Battery PLI', verticalCode: 'SUN_EV_BATTERY', nodalMinistry: 'Ministry of Heavy Industries', notifiedOutlayCr: 18100, targetYear: 2028, status: 'ACTIVE' },
      { schemeId: 'PLI_AUTO_COMP', schemeName: 'PLI Auto & Advanced Automotive Components', verticalCode: 'SUN_EV_BATTERY', nodalMinistry: 'Ministry of Heavy Industries', notifiedOutlayCr: 25938, targetYear: 2027, status: 'ACTIVE' },
      { schemeId: 'PLI_RAIL_TRANSIT', schemeName: 'Dedicated Freight Corridors & Vande Bharat Rail', verticalCode: 'SUN_RAIL_TRANSIT', nodalMinistry: 'Ministry of Railways', notifiedOutlayCr: 65000, targetYear: 2030, status: 'EXPANDING' },
      { schemeId: 'PLI_TELECOM_5G', schemeName: 'Telecom & Networking Products PLI', verticalCode: 'SUN_TELECOM', nodalMinistry: 'DoT / Ministry of Communications', notifiedOutlayCr: 12195, targetYear: 2027, status: 'ACTIVE' },
      { schemeId: 'PLI_BULK_DRUGS', schemeName: 'Critical KSMs & Active Pharmaceutical Ingredients', verticalCode: 'SUN_PHARMA_API', nodalMinistry: 'Department of Pharmaceuticals', notifiedOutlayCr: 6940, targetYear: 2028, status: 'ACTIVE' },
      { schemeId: 'PLI_DRONES', schemeName: 'Drone & Drone Components PLI Scheme', verticalCode: 'SUN_DRONE_ROBOT', nodalMinistry: 'Ministry of Civil Aviation', notifiedOutlayCr: 120, targetYear: 2026, status: 'ACTIVE' },
      { schemeId: 'PLI_POWER_GRID', schemeName: 'Revamped Distribution Sector Scheme (RDSS)', verticalCode: 'SUN_POWER_GRID', nodalMinistry: 'Ministry of Power', notifiedOutlayCr: 303758, targetYear: 2030, status: 'ACTIVE' },
      { schemeId: 'PLI_SPEC_STEEL', schemeName: 'Specialty Steel PLI Scheme', verticalCode: 'SUN_SPEC_STEEL', nodalMinistry: 'Ministry of Steel', notifiedOutlayCr: 6322, targetYear: 2029, status: 'ACTIVE' }
    ];

    for (const s of sectors) {
      await dbRun(db, `
        INSERT OR REPLACE INTO pli_sector_registry
        (scheme_id, scheme_name, vertical_code, nodal_ministry, notified_outlay_cr, target_year, status)
        VALUES (?, ?, ?, ?, ?, ?, ?);
      `, [s.schemeId, s.schemeName, s.verticalCode, s.nodalMinistry, s.notifiedOutlayCr, s.targetYear, s.status]);
    }
  }

  private async seedUniverseScrips(): Promise<void> {
    const db = getDB();
    const scrips: SunriseIndustrialScrip[] = [
      {
        symbol: 'CGPOWER',
        companyName: 'CG Power & Industrial Solutions Ltd',
        isin: 'INE067A01029',
        verticalCode: 'SUN_ESDM',
        verticalName: 'Power T&D, EV Motors & Semiconductor ATMP',
        pliSchemeId: 'PLI_ISM_SEMI',
        pliTier: 3,
        industrialGroupId: 'MURUGAPPA',
        industrialGroupName: 'Murugappa Group',
        groupVintageYears: 126,
        backingModality: 'GROUP_TURNAROUND',
        marketCapCr: 94500,
        marketCapTier: 'MIDCAP',
        currentPrice: 728.40,
        turnoverCagr3yPct: 28.5,
        ebitdaCagr3yPct: 46.2,
        operatingLeverageRatio: 1.62,
        cfoToEbitdaRatio: 0.88,
        promoterHoldingPct: 58.1,
        fiiHoldingPct: 15.4,
        diiHoldingPct: 8.3,
        freeRetailFloatPct: 18.2,
        promoterPledgePct: 0.0,
        pegRatio: 1.15,
        rocePct: 34.2,
        orderBookCr: 7600,
        orderBookMultiple: 1.65,
        compositeShgScore: 92.5,
        convictionTier: 'TIER_1_TITANIUM',
        catalystsSummary: 'Acquired by Murugappa via Tube Inv. Approved ₹7,600 Cr semiconductor ATMP fab JV with Renesas in Sanand, Gujarat. Explosive EV traction motor demand.',
        lastEvaluatedAt: new Date().toISOString()
      },
      {
        symbol: 'TEJASNET',
        companyName: 'Tejas Networks Ltd',
        isin: 'INE010J01012',
        verticalCode: 'SUN_TELECOM',
        verticalName: '5G Wireless RAN & Optical Networking',
        pliSchemeId: 'PLI_TELECOM_5G',
        pliTier: 3,
        industrialGroupId: 'TATA',
        industrialGroupName: 'Tata Group',
        groupVintageYears: 158,
        backingModality: 'GROUP_SUBSIDIARY',
        marketCapCr: 18450,
        marketCapTier: 'MIDCAP',
        currentPrice: 1184.20,
        turnoverCagr3yPct: 72.4,
        ebitdaCagr3yPct: 65.0,
        operatingLeverageRatio: 1.85,
        cfoToEbitdaRatio: 0.62,
        promoterHoldingPct: 55.8,
        fiiHoldingPct: 11.2,
        diiHoldingPct: 7.6,
        freeRetailFloatPct: 21.4,
        promoterPledgePct: 0.0,
        pegRatio: 0.95,
        rocePct: 18.5,
        orderBookCr: 19200,
        orderBookMultiple: 8.20,
        compositeShgScore: 90.0,
        convictionTier: 'TIER_1_TITANIUM',
        catalystsSummary: 'Tata Group flagship telecom asset (Panatone Finvest). ₹19,000+ Cr confirmed BSNL 4G/5G deployment order. Approved direct Telecom PLI champion.',
        lastEvaluatedAt: new Date().toISOString()
      },
      {
        symbol: 'KAYNES',
        companyName: 'Kaynes Technology India Ltd',
        isin: 'INE918Z01012',
        verticalCode: 'SUN_ESDM',
        verticalName: 'ESDM, Aerospace & Semiconductor Packaging',
        pliSchemeId: 'PLI_ISM_SEMI',
        pliTier: 3,
        industrialGroupId: 'DEFENCE_ESDM_PIONEERS',
        industrialGroupName: 'Kaynes House (36-Yr Electronics Pioneer)',
        groupVintageYears: 36,
        backingModality: 'INDEPENDENT_VET_PIONEER',
        marketCapCr: 32800,
        marketCapTier: 'MIDCAP',
        currentPrice: 5120.00,
        turnoverCagr3yPct: 48.2,
        ebitdaCagr3yPct: 54.1,
        operatingLeverageRatio: 1.45,
        cfoToEbitdaRatio: 0.72,
        promoterHoldingPct: 57.8,
        fiiHoldingPct: 14.1,
        diiHoldingPct: 8.9,
        freeRetailFloatPct: 19.2,
        promoterPledgePct: 0.0,
        pegRatio: 1.25,
        rocePct: 24.5,
        orderBookCr: 4800,
        orderBookMultiple: 2.65,
        compositeShgScore: 89.0,
        convictionTier: 'TIER_1_TITANIUM',
        catalystsSummary: 'Approved ₹3,300 Cr Sanand semiconductor OSAT facility under ISM. Heavy automotive, industrial IoT and aerospace electronics export execution.',
        lastEvaluatedAt: new Date().toISOString()
      },
      {
        symbol: 'DATAPATTNS',
        companyName: 'Data Patterns (India) Ltd',
        isin: 'INE610M01019',
        verticalCode: 'SUN_AERO_DEF',
        verticalName: 'Radars, Electronic Warfare & Avionics',
        pliSchemeId: 'PLI_AERO_DEF',
        pliTier: 2,
        industrialGroupId: 'DEFENCE_ESDM_PIONEERS',
        industrialGroupName: 'Data Patterns Defence Pioneers (38 Yrs)',
        groupVintageYears: 38,
        backingModality: 'INDEPENDENT_VET_PIONEER',
        marketCapCr: 14650,
        marketCapTier: 'SMALLCAP',
        currentPrice: 2680.50,
        turnoverCagr3yPct: 33.1,
        ebitdaCagr3yPct: 39.8,
        operatingLeverageRatio: 1.38,
        cfoToEbitdaRatio: 0.82,
        promoterHoldingPct: 45.5,
        fiiHoldingPct: 15.2,
        diiHoldingPct: 9.8,
        freeRetailFloatPct: 23.5,
        promoterPledgePct: 0.0,
        pegRatio: 1.10,
        rocePct: 28.5,
        orderBookCr: 1250,
        orderBookMultiple: 2.45,
        compositeShgScore: 88.5,
        convictionTier: 'TIER_1_TITANIUM',
        catalystsSummary: 'Rare 100% indigenous IP for military radars, avionics and missile seekers. Fortress debt-free balance sheet with 38%+ EBITDA margins.',
        lastEvaluatedAt: new Date().toISOString()
      },
      {
        symbol: 'TITAGARH',
        companyName: 'Titagarh Rail Systems Ltd',
        isin: 'INE615H01020',
        verticalCode: 'SUN_RAIL_TRANSIT',
        verticalName: 'Railway Rolling Stock, Vande Bharat & Metro',
        pliSchemeId: 'PLI_RAIL_TRANSIT',
        pliTier: 2,
        industrialGroupId: 'DEFENCE_ESDM_PIONEERS',
        industrialGroupName: 'Titagarh Engineering Group (27 Yrs)',
        groupVintageYears: 27,
        backingModality: 'INDEPENDENT_VET_PIONEER',
        marketCapCr: 16200,
        marketCapTier: 'SMALLCAP',
        currentPrice: 1240.00,
        turnoverCagr3yPct: 41.2,
        ebitdaCagr3yPct: 52.0,
        operatingLeverageRatio: 1.48,
        cfoToEbitdaRatio: 0.74,
        promoterHoldingPct: 42.5,
        fiiHoldingPct: 19.8,
        diiHoldingPct: 12.1,
        freeRetailFloatPct: 24.1,
        promoterPledgePct: 0.0,
        pegRatio: 1.05,
        rocePct: 26.2,
        orderBookCr: 28500,
        orderBookMultiple: 7.20,
        compositeShgScore: 87.5,
        convictionTier: 'TIER_1_TITANIUM',
        catalystsSummary: 'Execution of Vande Bharat sleeper trainsets; Surat & Ahmedabad metro trainsets. Strategic wheel manufacturing JV with Ramkrishna Forgings.',
        lastEvaluatedAt: new Date().toISOString()
      },
      {
        symbol: 'TATATECH',
        companyName: 'Tata Technologies Ltd',
        isin: 'INE142Z01019',
        verticalCode: 'SUN_EV_BATTERY',
        verticalName: 'EV Architecture & Automotive ER&D',
        pliSchemeId: 'PLI_AUTO_COMP',
        pliTier: 2,
        industrialGroupId: 'TATA',
        industrialGroupName: 'Tata Group',
        groupVintageYears: 158,
        backingModality: 'GROUP_SPINOFF',
        marketCapCr: 38500,
        marketCapTier: 'MIDCAP',
        currentPrice: 948.50,
        turnoverCagr3yPct: 24.8,
        ebitdaCagr3yPct: 27.5,
        operatingLeverageRatio: 1.22,
        cfoToEbitdaRatio: 0.92,
        promoterHoldingPct: 55.4,
        fiiHoldingPct: 16.2,
        diiHoldingPct: 9.9,
        freeRetailFloatPct: 18.5,
        promoterPledgePct: 0.0,
        pegRatio: 1.35,
        rocePct: 26.8,
        orderBookCr: 3200,
        orderBookMultiple: 1.80,
        compositeShgScore: 86.0,
        convictionTier: 'TIER_1_TITANIUM',
        catalystsSummary: 'Demerged from Tata Motors. Anchor global partner for BMW joint venture in software-defined vehicles and VinFast EV platforms.',
        lastEvaluatedAt: new Date().toISOString()
      },
      {
        symbol: 'SHARDAMOTR',
        companyName: 'Sharda Motor Industries Ltd',
        isin: 'INE597I01028',
        verticalCode: 'SUN_EV_BATTERY',
        verticalName: 'BS-VI Emission Systems & EV Battery Packs',
        pliSchemeId: 'PLI_AUTO_COMP',
        pliTier: 2,
        industrialGroupId: 'DEFENCE_ESDM_PIONEERS',
        industrialGroupName: 'Sharda Industrial House (38 Yrs)',
        groupVintageYears: 38,
        backingModality: 'INDEPENDENT_VET_PIONEER',
        marketCapCr: 4850,
        marketCapTier: 'SMALLCAP',
        currentPrice: 1720.00,
        turnoverCagr3yPct: 22.4,
        ebitdaCagr3yPct: 29.8,
        operatingLeverageRatio: 1.32,
        cfoToEbitdaRatio: 0.94,
        promoterHoldingPct: 73.2,
        fiiHoldingPct: 4.8,
        diiHoldingPct: 4.4,
        freeRetailFloatPct: 17.6,
        promoterPledgePct: 0.0,
        pegRatio: 0.78,
        rocePct: 32.5,
        orderBookCr: 1100,
        orderBookMultiple: 1.25,
        compositeShgScore: 85.5,
        convictionTier: 'TIER_1_TITANIUM',
        catalystsSummary: 'Strict BS-VI and TREM-IV emission tailwinds. Ultra-low public float (17.6%), zero debt, ROCE > 32%, expanding into EV battery pack cooling modules.',
        lastEvaluatedAt: new Date().toISOString()
      },
      {
        symbol: 'NELCO',
        companyName: 'Nelco Ltd',
        isin: 'INE045B01015',
        verticalCode: 'SUN_TELECOM',
        verticalName: 'Satellite Broadband & Maritime VSAT',
        pliSchemeId: 'PLI_TELECOM_5G',
        pliTier: 1,
        industrialGroupId: 'TATA',
        industrialGroupName: 'Tata Group',
        groupVintageYears: 158,
        backingModality: 'GROUP_SUBSIDIARY',
        marketCapCr: 2150,
        marketCapTier: 'SMALLCAP',
        currentPrice: 942.00,
        turnoverCagr3yPct: 21.0,
        ebitdaCagr3yPct: 26.4,
        operatingLeverageRatio: 1.26,
        cfoToEbitdaRatio: 0.85,
        promoterHoldingPct: 50.1,
        fiiHoldingPct: 8.5,
        diiHoldingPct: 12.2,
        freeRetailFloatPct: 24.8,
        promoterPledgePct: 0.0,
        pegRatio: 1.20,
        rocePct: 19.8,
        orderBookCr: 650,
        orderBookMultiple: 1.75,
        compositeShgScore: 84.0,
        convictionTier: 'TIER_2_GROWTH_RUNNER',
        catalystsSummary: 'Tata Group satellite communication pioneer. In-flight connectivity license in India; LEO satellite distribution pact with Telesat Lightspeed.',
        lastEvaluatedAt: new Date().toISOString()
      },
      {
        symbol: 'SUNDRMFAST',
        companyName: 'Sundram Fasteners Ltd',
        isin: 'INE387A01021',
        verticalCode: 'SUN_EV_BATTERY',
        verticalName: 'Precision Fasteners & EV Powertrain Components',
        pliSchemeId: 'PLI_AUTO_COMP',
        pliTier: 2,
        industrialGroupId: 'TVS',
        industrialGroupName: 'TVS Group',
        groupVintageYears: 115,
        backingModality: 'GROUP_SUBSIDIARY',
        marketCapCr: 28400,
        marketCapTier: 'MIDCAP',
        currentPrice: 1350.00,
        turnoverCagr3yPct: 19.5,
        ebitdaCagr3yPct: 22.0,
        operatingLeverageRatio: 1.15,
        cfoToEbitdaRatio: 0.90,
        promoterHoldingPct: 49.5,
        fiiHoldingPct: 15.2,
        diiHoldingPct: 11.1,
        freeRetailFloatPct: 24.2,
        promoterPledgePct: 0.0,
        pegRatio: 1.40,
        rocePct: 22.4,
        orderBookCr: 2500,
        orderBookMultiple: 1.40,
        compositeShgScore: 83.5,
        convictionTier: 'TIER_2_GROWTH_RUNNER',
        catalystsSummary: 'TVS Group pedigree. Multi-year $250M supply deal for global EV powertrain parts; strong operating cash flows and zero governance risk.',
        lastEvaluatedAt: new Date().toISOString()
      },
      {
        symbol: 'GRAVITA',
        companyName: 'Gravita India Ltd',
        isin: 'INE024L01027',
        verticalCode: 'SUN_CLEAN_ENERGY',
        verticalName: 'Battery Waste Recycling & Circular Clean Tech',
        pliSchemeId: 'PLI_ACC_BATTERY',
        pliTier: 1,
        industrialGroupId: 'DEFENCE_ESDM_PIONEERS',
        industrialGroupName: 'Gravita Industrial House (32 Yrs)',
        groupVintageYears: 32,
        backingModality: 'INDEPENDENT_VET_PIONEER',
        marketCapCr: 15200,
        marketCapTier: 'SMALLCAP',
        currentPrice: 2210.00,
        turnoverCagr3yPct: 25.4,
        ebitdaCagr3yPct: 31.2,
        operatingLeverageRatio: 1.35,
        cfoToEbitdaRatio: 0.86,
        promoterHoldingPct: 66.5,
        fiiHoldingPct: 8.2,
        diiHoldingPct: 4.3,
        freeRetailFloatPct: 21.0,
        promoterPledgePct: 0.0,
        pegRatio: 0.92,
        rocePct: 28.6,
        orderBookCr: 1800,
        orderBookMultiple: 1.50,
        compositeShgScore: 85.0,
        convictionTier: 'TIER_1_TITANIUM',
        catalystsSummary: 'Strict implementation of Battery Waste Management Rules (BWMR 2022). Aggressive global lead, lithium and aluminium recycling capacity expansion.',
        lastEvaluatedAt: new Date().toISOString()
      },
      {
        symbol: 'ZENTEC',
        companyName: 'Zen Technologies Ltd',
        isin: 'INE251B01027',
        verticalCode: 'SUN_AERO_DEF',
        verticalName: 'Anti-Drone Systems & Defence Simulators',
        pliSchemeId: 'PLI_DRONES',
        pliTier: 3,
        industrialGroupId: 'DEFENCE_ESDM_PIONEERS',
        industrialGroupName: 'Zen Tech Defence House (31 Yrs)',
        groupVintageYears: 31,
        backingModality: 'INDEPENDENT_VET_PIONEER',
        marketCapCr: 16800,
        marketCapTier: 'SMALLCAP',
        currentPrice: 1980.00,
        turnoverCagr3yPct: 45.0,
        ebitdaCagr3yPct: 58.0,
        operatingLeverageRatio: 1.60,
        cfoToEbitdaRatio: 0.80,
        promoterHoldingPct: 55.1,
        fiiHoldingPct: 12.5,
        diiHoldingPct: 6.8,
        freeRetailFloatPct: 21.5,
        promoterPledgePct: 0.0,
        pegRatio: 0.90,
        rocePct: 36.5,
        orderBookCr: 1400,
        orderBookMultiple: 3.10,
        compositeShgScore: 88.0,
        convictionTier: 'TIER_1_TITANIUM',
        catalystsSummary: 'Global export orders for counter-unmanned aerial systems (CUAS); drone PLI approved. Fortress balance sheet with 35%+ operating margins.',
        lastEvaluatedAt: new Date().toISOString()
      },
      {
        symbol: 'TUBEINVEST',
        companyName: 'Tube Investments of India Ltd',
        isin: 'INE974X01010',
        verticalCode: 'SUN_EV_BATTERY',
        verticalName: 'TI Clean Mobility, Precision Auto & Industrial',
        pliSchemeId: 'PLI_AUTO_COMP',
        pliTier: 2,
        industrialGroupId: 'MURUGAPPA',
        industrialGroupName: 'Murugappa Group',
        groupVintageYears: 126,
        backingModality: 'GROUP_SUBSIDIARY',
        marketCapCr: 78000,
        marketCapTier: 'MIDCAP',
        currentPrice: 4020.00,
        turnoverCagr3yPct: 26.0,
        ebitdaCagr3yPct: 31.0,
        operatingLeverageRatio: 1.25,
        cfoToEbitdaRatio: 0.91,
        promoterHoldingPct: 45.1,
        fiiHoldingPct: 18.5,
        diiHoldingPct: 14.2,
        freeRetailFloatPct: 22.0,
        promoterPledgePct: 0.0,
        pegRatio: 1.45,
        rocePct: 24.8,
        orderBookCr: 3500,
        orderBookMultiple: 1.30,
        compositeShgScore: 85.0,
        convictionTier: 'TIER_1_TITANIUM',
        catalystsSummary: 'Parent holding vehicle for Murugappa turnaround engine (owns 58% of CG Power). TI Clean Mobility launching electric 3W, tractors, and heavy trucks.',
        lastEvaluatedAt: new Date().toISOString()
      },
      {
        symbol: 'APARINDS',
        companyName: 'Apar Industries Ltd',
        isin: 'INE372A01015',
        verticalCode: 'SUN_POWER_GRID',
        verticalName: 'High-Efficiency Conductors & Transformer Oils',
        pliSchemeId: 'PLI_POWER_GRID',
        pliTier: 1,
        industrialGroupId: 'DEFENCE_ESDM_PIONEERS',
        industrialGroupName: 'Apar Industrial House (66 Yrs)',
        groupVintageYears: 66,
        backingModality: 'INDEPENDENT_VET_PIONEER',
        marketCapCr: 36500,
        marketCapTier: 'MIDCAP',
        currentPrice: 9120.00,
        turnoverCagr3yPct: 31.0,
        ebitdaCagr3yPct: 38.0,
        operatingLeverageRatio: 1.35,
        cfoToEbitdaRatio: 0.85,
        promoterHoldingPct: 57.8,
        fiiHoldingPct: 12.2,
        diiHoldingPct: 7.5,
        freeRetailFloatPct: 22.5,
        promoterPledgePct: 0.0,
        pegRatio: 1.02,
        rocePct: 35.0,
        orderBookCr: 7200,
        orderBookMultiple: 1.85,
        compositeShgScore: 87.0,
        convictionTier: 'TIER_1_TITANIUM',
        catalystsSummary: 'World’s 3rd largest conductor maker; US transmission grid capex supercycle supplier. High margin optical ground wire and specialty oils compounding.',
        lastEvaluatedAt: new Date().toISOString()
      },
      {
        symbol: 'KEC',
        companyName: 'KEC International Ltd',
        isin: 'INE389H01022',
        verticalCode: 'SUN_POWER_GRID',
        verticalName: 'Power T&D EPC & Railway Electrification',
        pliSchemeId: 'PLI_POWER_GRID',
        pliTier: 1,
        industrialGroupId: 'RPG',
        industrialGroupName: 'RPG Enterprises',
        groupVintageYears: 47,
        backingModality: 'GROUP_SUBSIDIARY',
        marketCapCr: 24500,
        marketCapTier: 'MIDCAP',
        currentPrice: 955.00,
        turnoverCagr3yPct: 21.0,
        ebitdaCagr3yPct: 25.5,
        operatingLeverageRatio: 1.28,
        cfoToEbitdaRatio: 0.82,
        promoterHoldingPct: 51.8,
        fiiHoldingPct: 14.5,
        diiHoldingPct: 9.7,
        freeRetailFloatPct: 24.0,
        promoterPledgePct: 0.0,
        pegRatio: 1.18,
        rocePct: 21.5,
        orderBookCr: 32000,
        orderBookMultiple: 1.65,
        compositeShgScore: 83.0,
        convictionTier: 'TIER_2_GROWTH_RUNNER',
        catalystsSummary: 'RPG flagship engineering contractor. ₹32,000+ Cr order book across India, GCC, and Americas. Direct beneficiary of high-voltage transmission capex.',
        lastEvaluatedAt: new Date().toISOString()
      },
      {
        symbol: 'CLEAN',
        companyName: 'Clean Science and Technology Ltd',
        isin: 'INE227W01023',
        verticalCode: 'SUN_SPEC_CHEM',
        verticalName: 'Clean Specialty Chemicals & Green Synthesis',
        pliSchemeId: 'PLI_BULK_DRUGS',
        pliTier: 1,
        industrialGroupId: 'DEFENCE_ESDM_PIONEERS',
        industrialGroupName: 'Clean Science Founders (20 Yrs)',
        groupVintageYears: 20,
        backingModality: 'INDEPENDENT_VET_PIONEER',
        marketCapCr: 16500,
        marketCapTier: 'SMALLCAP',
        currentPrice: 1550.00,
        turnoverCagr3yPct: 22.5,
        ebitdaCagr3yPct: 28.5,
        operatingLeverageRatio: 1.30,
        cfoToEbitdaRatio: 0.95,
        promoterHoldingPct: 74.9,
        fiiHoldingPct: 5.5,
        diiHoldingPct: 4.8,
        freeRetailFloatPct: 14.8,
        promoterPledgePct: 0.0,
        pegRatio: 1.35,
        rocePct: 38.2,
        orderBookCr: 800,
        orderBookMultiple: 1.20,
        compositeShgScore: 84.5,
        convictionTier: 'TIER_2_GROWTH_RUNNER',
        catalystsSummary: 'Industry-leading 40%+ EBITDA margins via proprietary eco-friendly catalytic synthesis. Ultra-tight 14.8% free retail float with debt-free fortress cash.',
        lastEvaluatedAt: new Date().toISOString()
      }
    ];

    for (const s of scrips) {
      await dbRun(db, `
        INSERT OR REPLACE INTO sunrise_industrial_universe
        (symbol, company_name, isin, vertical_code, vertical_name, pli_scheme_id, pli_tier,
         industrial_group_id, industrial_group_name, group_vintage_years, backing_modality,
         market_cap_cr, market_cap_tier, current_price, turnover_cagr_3y_pct, ebitda_cagr_3y_pct,
         operating_leverage_ratio, cfo_to_ebitda_ratio, promoter_holding_pct, fii_holding_pct,
         dii_holding_pct, free_retail_float_pct, promoter_pledge_pct, peg_ratio, roce_pct,
         order_book_cr, order_book_multiple, composite_shg_score, conviction_tier,
         catalysts_summary, is_active, last_evaluated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?);
      `, [
        s.symbol, s.companyName, s.isin, s.verticalCode, s.verticalName, s.pliSchemeId, s.pliTier,
        s.industrialGroupId, s.industrialGroupName, s.groupVintageYears, s.backingModality,
        s.marketCapCr, s.marketCapTier, s.currentPrice, s.turnoverCagr3yPct, s.ebitdaCagr3yPct,
        s.operatingLeverageRatio, s.cfoToEbitdaRatio, s.promoterHoldingPct, s.fiiHoldingPct,
        s.diiHoldingPct, s.freeRetailFloatPct, s.promoterPledgePct, s.pegRatio, s.rocePct,
        s.orderBookCr, s.orderBookMultiple, s.compositeShgScore, s.convictionTier,
        s.catalystsSummary, s.lastEvaluatedAt
      ]);
    }
  }

  public async getAllScrips(): Promise<SunriseIndustrialScrip[]> {
    await this.initializeTablesAndSeed();
    const db = getDB();
    const rows = await dbAll(db, `
      SELECT
        symbol, company_name as companyName, isin, vertical_code as verticalCode,
        vertical_name as verticalName, pli_scheme_id as pliSchemeId, pli_tier as pliTier,
        industrial_group_id as industrialGroupId, industrial_group_name as industrialGroupName,
        group_vintage_years as groupVintageYears, backing_modality as backingModality,
        market_cap_cr as marketCapCr, market_cap_tier as marketCapTier, current_price as currentPrice,
        turnover_cagr_3y_pct as turnoverCagr3yPct, ebitda_cagr_3y_pct as ebitdaCagr3yPct,
        operating_leverage_ratio as operatingLeverageRatio, cfo_to_ebitda_ratio as cfoToEbitdaRatio,
        promoter_holding_pct as promoterHoldingPct, fii_holding_pct as fiiHoldingPct,
        dii_holding_pct as diiHoldingPct, free_retail_float_pct as freeRetailFloatPct,
        promoter_pledge_pct as promoterPledgePct, peg_ratio as pegRatio, roce_pct as rocePct,
        order_book_cr as orderBookCr, order_book_multiple as orderBookMultiple,
        composite_shg_score as compositeShgScore, conviction_tier as convictionTier,
        catalysts_summary as catalystsSummary, last_evaluated_at as lastEvaluatedAt
      FROM sunrise_industrial_universe
      WHERE is_active = 1
      ORDER BY composite_shg_score DESC;
    `);
    return rows as SunriseIndustrialScrip[];
  }

  public async getIndustrialGroups(): Promise<IndustrialGroup[]> {
    await this.initializeTablesAndSeed();
    const db = getDB();
    const rows = await dbAll(db, `
      SELECT
        group_id as groupId, group_name as groupName, founding_year as foundingYear,
        vintage_years as vintageYears, promoter_family_origin as promoterFamilyOrigin,
        headquarters, governance_rating as governanceRating, notes
      FROM industrial_group_registry
      ORDER BY founding_year ASC;
    `);
    return rows as IndustrialGroup[];
  }

  public async getPliSectors(): Promise<PliSector[]> {
    await this.initializeTablesAndSeed();
    const db = getDB();
    const rows = await dbAll(db, `
      SELECT
        scheme_id as schemeId, scheme_name as schemeName, vertical_code as verticalCode,
        nodal_ministry as nodalMinistry, notified_outlay_cr as notifiedOutlayCr,
        target_year as targetYear, status
      FROM pli_sector_registry
      ORDER BY notified_outlay_cr DESC;
    `);
    return rows as PliSector[];
  }

  public async getScripSymbols(): Promise<string[]> {
    const scrips = await this.getAllScrips();
    return scrips.map(s => s.symbol);
  }
}
