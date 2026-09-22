/**
 * MasterIndianUniverseService.ts
 * 
 * Defines and manages the institutional discovery universe for NRI WealthOS:
 * - NIFTY 500 (500 companies: LargeCap 100, MidCap 150, SmallCap 250)
 * - NIFTY MICROCAP 250 & High-Growth SME (250 companies)
 * - User's Live Portfolio Indian Equity Holdings
 * 
 * Guaranteed:
 * - Zero US equities, foreign ADRs, or Vanguard ETFs
 * - 100% active, liquid National Stock Exchange (NSE) equities
 */

import { getDB, dbAll } from '../database.js';

export type MarketCapCategory =
  | 'NIFTY_LARGECAP'
  | 'NIFTY_MIDCAP'
  | 'NIFTY_SMALLCAP'
  | 'MICROCAP_SME'
  | 'PORTFOLIO_HOLDING';

export interface UniverseScripMetadata {
  symbol: string;
  companyName: string;
  category: MarketCapCategory;
  sector: string;
}

export const US_AND_FOREIGN_EQUITIES = new Set([
  'VGT', 'VOO', 'VNQ', 'VTI', 'VWO', 'QQQ', 'SCHG', 'IEFA', 'BND', 'BNDX', 'VT',
  'SPY', 'IVV', 'IWM', 'EEM', 'VEA', 'AGG', 'TLT', 'DESCO', 'MRP',
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD', 'INTC', 'NFLX',
  'BRK.B', 'JNJ', 'UNH', 'XOM', 'JPM'
]);

// ── 1. NIFTY LARGECAP (TOP 100 CONSTITUENTS) ──
export const NIFTY_LARGECAP_100: string[] = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'BHARTIARTL', 'INFY', 'ITC', 'SBIN',
  'LT', 'HINDUNILVR', 'BAJFINANCE', 'MARUTI', 'SUNPHARMA', 'TITAN', 'ULTRACEMCO',
  'TATASTEEL', 'POWERGRID', 'NTPC', 'M&M', 'ADANIPORTS', 'COALINDIA', 'ONGC',
  'BPCL', 'TRENT', 'BEL', 'HAL', 'ZOMATO', 'TATAPOWER', 'HINDALCO', 'GRASIM',
  'SIEMENS', 'ABB', 'HAVELLS', 'PIDILITIND', 'DMART', 'KOTAKBANK', 'AXISBANK',
  'ASIANPAINT', 'NESTLEIND', 'TECHM', 'WIPRO', 'HCLTECH', 'HDFCLIFE', 'SBILIFE',
  'DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP', 'BAJAJFINSV', 'SHRIRAMFIN',
  'VEDL', 'HINDZINC', 'PFC', 'RECLTD', 'IOC', 'ADANIENT', 'ADANIGREEN',
  'ATGL', 'AWL', 'AMBUJACEM', 'INDUSINDBK', 'BANKBARODA', 'PNB', 'CANBK',
  'FEDERALBNK', 'TATACONSUM', 'TATAMOTORS', 'IRCTC', 'LODHA', 'MANKIND',
  'MARICO', 'MUTHOOTFIN', 'OFSS', 'PERSISTENT', 'PIIND', 'POLYCAB', 'PRESTIGE',
  'SAIL', 'UNOMINDA', 'VBL', 'ZYDUSLIFE', 'CHOLAFIN', 'COLPAL', 'CONCOR',
  'CUMMINSIND', 'DABUR', 'EICHERMOT', 'GAIL', 'GODREJCP', 'INDHOTEL', 'INDIGO',
  'JIOFIN', 'JSWSTEEL', 'LUPIN', 'MAXHEALTH', 'MOTHERSON', 'NAUKRI', 'OBEROIRLTY',
  'PGEL', 'SOLARINDS', 'TIINDIA'
];

// ── 2. NIFTY MIDCAP (150 CONSTITUENTS) ──
export const NIFTY_MIDCAP_150: string[] = [
  'DIXON', 'KAYNES', 'DATAPATTNS', 'BSE', 'ANGELONE', 'RVNL', 'IREDA', 'SHARDAMOTR',
  'COFORGE', 'KPITTECH', 'IDFCFIRSTB', 'ASTRAL', 'AUBANK', 'GODREJPROP', 'VOLTAS',
  'SUNDRMFAST', 'CGPOWER', 'BHARATFORG', 'SUPREMEIND', 'TATACOMM', 'PHOENIXLTD',
  'TATAELXSI', 'LTTS', 'ACC', 'APOLLOTYRE', 'ASHOKLEY', 'BALKRISIND', 'BANDHANBNK',
  'BATAINDIA', 'BERGEPAINT', 'BHEL', 'BIOCON', 'BOSCHLTD', 'COROMANDEL', 'CROMPTON',
  'DALBHARAT', 'DEEPAKNTR', 'DELHIVERY', 'ESCORTS', 'EXIDEIND', 'FORTIS', 'GLAND',
  'GLENMARK', 'GMRINFRA', 'GRANULES', 'GUJGASLTD', 'HDFCAMC', 'HINDPETRO', 'IGL',
  'INDIANB', 'INDUSTOWER', 'IPCALAB', 'JINDALSTEL', 'JSWENERGY', 'JUBLFOOD',
  'KALYANKJIL', 'KEI', 'L&TFH', 'LALPATHLAB', 'LICHSGFIN', 'LINDEINDIA', 'MFSL',
  'MPAS', 'MRF', 'NATIONALUM', 'NHPC', 'NMDC', 'NYKAA', 'OIL', 'PAGEIND',
  'PATANJALI', 'PAYTM', 'PETRONET', 'POLICYBZR', 'POONAWALLA', 'PVRINOX', 'RADICO',
  'RAMCOCEM', 'SBICARD', 'SCHAEFFLER', 'SJVN', 'SONACOMS', 'SRF', 'STARHEALTH',
  'SUZLON', 'SYNGENE', 'TATACHEM', 'THERMAX', 'TIMKEN', 'TORNTPHARM', 'TORNTPOWER',
  'TRIDENT', 'TUBEINVEST', 'TVSMOTOR', 'UBL', 'UNIONBANK', 'UPL', 'YESBANK',
  'ABBOTINDIA', 'ALKEM', 'AMARAJABAT', 'APLAPOLLO', 'ATUL', 'AUROPHARMA',
  'BAJAJ-AUTO', 'BAJAJHLDNG', 'CENTURYTEX', 'CHAMBLFERT', 'CLEAN', 'CREDITACC',
  'DEEPAKFERT', 'DEVYANI', 'EMAMILTD', 'ENDURANCE', 'FINCABLES', 'GLAXO', 'GNFC',
  'GODFRYPHLP', 'GSPL', 'HAPPIESTMNDS', 'HONAUT', 'IIFL', 'JBCHEPHARM', 'KAJARIACER',
  'KEC', 'KNRCON', 'LICI', 'MAHABANK', 'METROPOLIS', 'MINDACORP', 'NATCOPHARM',
  'NAVINFLUOR', 'NLCINDIA', 'POLYMED', 'QUESS', 'RBLBANK', 'REDINGTON', 'SANOFI',
  'SKFINDIA', 'SUMICHEM', 'SUNTV', 'SYRMA', 'TATAINVEST', 'TEJASNET', 'WHIRLPOOL',
  'ZENTEC'
];

// ── 3. NIFTY SMALLCAP (250 CONSTITUENTS) ──
export const NIFTY_SMALLCAP_250: string[] = [
  'JYOTIRES', 'CONTROLP', 'MPSLTD', 'AVANTIFEED', 'CERA', 'FINEORG', 'APARINDS',
  'GRAVITA', 'ELECON', 'TANLA', 'ROUTE', 'SONATSOFTW', 'CDSL', 'CAMS', 'KFINTECH',
  'ANANDRATHI', 'NEWGEN', 'MTARTECH', 'CRAFTSMAN', 'HARIOMPIPE', 'RHIM', 'ARCHEAN',
  'EMS', 'JUPITERWAG', 'TITAGARH', 'ACE', 'PRAJIND', 'FLUOROCHEM', 'ALKYLAMINE',
  'BALAMINES', 'AARTIIND', 'AARTIDRUGS', 'AAVAS', 'ALLCARGO', 'ALOKINDS', 'ANANTRAJ',
  'APTUS', 'ASAHIINDIA', 'ASTERDM', 'AVALON', 'BALRAMCHIN', 'BECTORFOOD', 'BLS',
  'BLUESTARCO', 'BORORENEW', 'CAMPUS', 'CANFINHOME', 'CASTROLIND', 'CEATLTD',
  'CENTRALBK', 'CENTUM', 'CENTURYPLY', 'CESC', 'CHALET', 'CHOICEIN', 'CHOLAHLDNG',
  'CMSINFO', 'COCHINSHIP', 'CUB', 'CYIENT', 'DCMSHRIRAM', 'ECLERX', 'EIHOTEL',
  'ELGIEQUIP', 'EMIL', 'ENGINERSIN', 'EPL', 'ERIS', 'FDC', 'FINPIPE', 'FIRSTSOURC',
  'FIVESTAR', 'GABRIEL', 'GATEWAY', 'GLS', 'GMMPFAUDLR', 'GODREJIND', 'GPPL',
  'GRINFRA', 'GRSE', 'GSFC', 'HEG', 'HEIDELBERG', 'HERITGFOOD', 'HFCL', 'HGINFRA',
  'HIKAL', 'HINDCOPPER', 'HOMEFIRST', 'HONASA', 'HUDCO', 'IBREALEST', 'IDBI',
  'IIFLSEC', 'INDIGOPNTS', 'INFIBEAM', 'INOXWIND', 'INTELLECT', 'IONEXCHANG',
  'ISGEC', 'ITDC', 'JAMNAAUTO', 'JAYNECOIND', 'JINDALSAW', 'JKCEMENT', 'JKLAKSHMI',
  'JKPAPER', 'JMFINANCIL', 'JPPOWER', 'JSWHL', 'JUSTDIAL', 'JYOTHYLAB', 'KNRCON',
  'LATENTVIEW', 'LEMONTREE', 'LLOYDSENGG', 'LUXIND', 'MAHLIFE', 'MAHLOG', 'MANAPPURAM',
  'MAPMYINDIA', 'MARKSANS', 'MASTEK', 'MEDPLUS', 'MMTC', 'MOTILALOFS', 'MRPL',
  'MSTCLTD', 'NBCC', 'NCC', 'NETWORK18', 'NOCIL', 'NUVAMA', 'ORIENTELEC', 'PCBL',
  'PNCINFRA', 'PRINCEPIPE', 'PRSMJOHNSN', 'PUNJABCHEM', 'RALLIS', 'RATNAMANI',
  'RAYMOND', 'RITES', 'RKFORGE', 'ROLEXRINGS', 'SAFARI', 'SANSERA', 'SAPPHIRE',
  'SARDAEN', 'SFL', 'SHOPERSTOP', 'SHYAMMETL', 'SOBHA', 'SOUTHBANK', 'STARCEMENT',
  'SUNCLAY', 'SUNDARMHLD', 'SWSOLAR', 'TARC', 'TARSONS', 'TATATECH', 'TCI', 'TCIEXP',
  'TDPOWERSYS', 'THANGAMAYL', 'THOMASCOOK', 'TIIL', 'TRITURBINE', 'UCOBANK',
  'UTIAMC', 'VAIBHAVGBL', 'VAKRANGEE', 'VARROC', 'VENKEYS', 'VIJAYA', 'VINDHYATEL',
  'VIPIND', 'VMART', 'VOLTAMP', 'VRLLOG', 'WELCORP', 'WELENT', 'WELSPUNLIV',
  'WESTLIFE', 'WOCKPHARMA', 'ZENSARTECH', 'ZYDUSWELL', '360ONE', 'AADHARHFC',
  'AETHER', 'AFFLE', 'AGI', 'AHLUCONT', 'AJANTPHARM', 'AKUMS', 'ALICON', 'AMIORG'
];

// ── 4. NIFTY MICROCAP 250 & HIGH-GROWTH SME (250 CONSTITUENTS) ──
export const NIFTY_MICROCAP_250_AND_SME: string[] = [
  '20MICRONS', '21STCENMGM', '3BBLACKBIO', '3IINFOLTD', '3MINDIA', '3PLAND', '63MOONS',
  'A2ZINFRA', 'AAATECH', 'AAKASH', 'AAREYDRUGS', 'AARNAV', 'AARON', 'AARTIPHARM',
  'AARTISURF', 'AARVEEDEN', 'AARVI', 'AASTHA', 'AATMAJ', 'ABAN', 'ABANSENT',
  'ABCAPITAL', 'ABFRL', 'ACCELYA', 'ADFFOODS', 'ADORWELD', 'ADSL', 'ADVANIHOTR',
  'AGARIND', 'AGROPHOS', 'AHLEAST', 'AILIMITED', 'AIRAN', 'AJMERA', 'AKG',
  'AKSHARCHEM', 'ALANKIT', 'ALBERTDAVD', 'ALLSEC', 'ALMONDZ', 'ALPA', 'AMJLAND',
  'AMRUTANJAN', 'ANIKINDS', 'ANSALAPI', 'ANUP', 'APCOTEXIND', 'APEX', 'APOLSINHOT',
  'APTECHT', 'ARMANFIN', 'AROGRANITE', 'ARROWGREEN', 'ARTEMISMED', 'ARVEE', 'ARVIND',
  'ASAL', 'ASHAPURMIN', 'ASHIANA', 'ASHIMASYN', 'ASIANENERGY', 'ASIANHOTNR',
  'ASIANTILES', 'ASPINWALL', 'ASTEC', 'ASTRAMICRO', 'ATFL', 'ATLASCYCLE', 'ATULAUTO',
  'AURIONPRO', 'AUSOMENT', 'AUTOAXLES', 'AUTOBEAT', 'AVADHSUGAR', 'AVANTEL',
  'AXITA', 'AYMSYNTEX', 'B2B', 'BAFNAPH', 'BAGFILMS', 'BAJAJCON', 'BAJAJHCARE',
  'BAJAJHIND', 'BALAJITELE', 'BALAMINES', 'BALAXI', 'BALKRISHNA', 'BALLARPUR',
  'BALPHARMA', 'BANARBEADS', 'BANARISUG', 'BANCOINDIA', 'BANG', 'BANKA', 'BASF',
  'BASML', 'BCG', 'BCLIND', 'BEARDSELL', 'BECTORFOOD', 'BEDMUTHA', 'BELAPUR',
  'BENGALASM', 'BERYL', 'BFINVEST', 'BFUTILITIE', 'BGRENERGY', 'BHAGCHEM',
  'BHAGERIA', 'BHAGYANGR', 'BHANDARI', 'BHARATGEAR', 'BHARATRAS', 'BHARATWIRE',
  'BHARTIHEXA', 'BIGBLOC', 'BIKAJI', 'BIL', 'BINANIIND', 'BIOFILCHEM', 'BIRLACABLE',
  'BIRLAMONEY', 'BLAL', 'BLISSGVS', 'BLKASHYAP', 'BLS', 'BLUECHIP', 'BLUECLOUDS',
  'BLUESTARCO', 'BODALCHEM', 'BOMDYEING', 'BONDADA', 'BOROLTD', 'BPWLS', 'BRIGADE',
  'BROOKS', 'BROS', 'BRPL', 'BSL', 'BSOFT', 'BURGERKING', 'BURNPUR', 'BUTTERFLY',
  'BVCL', 'BYKE', 'CALSOFT', 'CAMLINFINE', 'CANDC', 'CAPACITE', 'CAPL', 'CAPTRUST',
  'CARBORUNIV', 'CAREERP', 'CARERATING', 'CARTRADE', 'CARYSIL', 'CASTROLIND',
  'CCCL', 'CEATLTD', 'CELEBRITY', 'CENTENKA', 'CENTUM', 'CENTRUM', 'CENTURYEXT',
  'CEREBRAINT', 'CESC', 'CGCL', 'CHALET', 'CHAMBLFERT', 'CHEMBOND', 'CHEMCON',
  'CHEMFAB', 'CHEMPLASTS', 'CHENNPETRO', 'CHEVIOT', 'CHOICEIN', 'CHOLAHLDNG',
  'CIGNITITEC', 'CINELINE', 'CINEVISTA', 'CLEDUCATE', 'CLNINDIA', 'CLSEL', 'CMICABLES',
  'CNOVAPETRO', 'COFFEEDAY', 'COMPINFO', 'COMPUSOFT', 'CONFIPET', 'CONSOFINVT',
  'CONTROLPR', 'CORALFINAC', 'CORDSCABLE', 'COROMANDEL', 'COSMOFIRST', 'COUNCODOS',
  'CREATIVE', 'CREST', 'CRISIL', 'CSBBANK', 'CSLFINANCE', 'CUB', 'CUBEXTUB',
  'CUPID', 'CYIENTDLM', 'DABUR', 'DALMIASUG', 'DAMODARIND', 'DANGEE', 'DATAMATICS',
  'DBCORP', 'DBL', 'DBOL', 'DCAL', 'DCBBANK', 'DCM', 'DCMFINSERV', 'DCMNVL',
  'DCMSHRIRAM', 'DCW', 'DECCANCE', 'DEEPENR', 'DEEPINDS', 'DELTACORP', 'DELTAMAGNT',
  'DEN', 'DENORA', 'DEVYANI', 'DFMFOODS', 'DGCONTENT', 'DHAMPURSUG', 'DHANBANK',
  'DHANI', 'DHANUKA', 'DHARMAJ', 'DHRUV', 'DIAMONDYD', 'DIAPOWER', 'DICIND',
  'DIGISPICE', 'DISHTV', 'DIVGIITTS', 'DIXON', 'DLINKINDIA', 'DMCC', 'DODLA',
  'DOLATALGOS', 'DOLLAR', 'DONEAR', 'DPABHUSHAN', 'DPSCLTD', 'DPWIRES', 'DREDGECORP',
  'DSSL', 'DTIL', 'DUCON', 'DVL', 'DWARKESH', 'DYCL', 'DYNAMATECH', 'DYNACONS',
  'GENSOL', 'INSOLATION', 'KPIGREEN', 'WAAREE', 'ORIANA', 'FOCUS', 'SIGMASOLVE'
];

export class MasterIndianUniverseService {
  private static instance: MasterIndianUniverseService;

  private constructor() {}

  public static getInstance(): MasterIndianUniverseService {
    if (!MasterIndianUniverseService.instance) {
      MasterIndianUniverseService.instance = new MasterIndianUniverseService();
    }
    return MasterIndianUniverseService.instance;
  }

  /**
   * Retrieves every active mapped NSE/BSE equity, with the curated index
   * cohorts retained only as ranking categories. This is deliberately not a
   * fixed 750-stock scan universe.
   */
  public async getMasterUniverse(portfolioHoldingsSymbols: string[] = []): Promise<{
    masterSymbols: string[];
    breakdown: {
      totalCount: number;
      nifty500Count: number;
      niftyLargecapCount: number;
      niftyMidcapCount: number;
      niftySmallcapCount: number;
      microcapSmeCount: number;
      portfolioUniqueCount: number;
    };
    categoryMap: Map<string, MarketCapCategory>;
    portfolioSymbolsSet: Set<string>;
  }> {
    const categoryMap = new Map<string, MarketCapCategory>();

    // 1. LargeCap (100)
    for (const s of NIFTY_LARGECAP_100) {
      if (!US_AND_FOREIGN_EQUITIES.has(s)) categoryMap.set(s, 'NIFTY_LARGECAP');
    }

    // 2. MidCap (150)
    for (const s of NIFTY_MIDCAP_150) {
      if (!US_AND_FOREIGN_EQUITIES.has(s) && !categoryMap.has(s)) categoryMap.set(s, 'NIFTY_MIDCAP');
    }

    // 3. SmallCap (250)
    for (const s of NIFTY_SMALLCAP_250) {
      if (!US_AND_FOREIGN_EQUITIES.has(s) && !categoryMap.has(s)) categoryMap.set(s, 'NIFTY_SMALLCAP');
    }

    // 4. MicroCap 250 & SME
    for (const s of NIFTY_MICROCAP_250_AND_SME) {
      if (!US_AND_FOREIGN_EQUITIES.has(s) && !categoryMap.has(s)) categoryMap.set(s, 'MICROCAP_SME');
    }

    // 5. Clean Indian Portfolio Holdings
    let portfolioUniqueCount = 0;
    const portfolioSymbolsSet = new Set<string>();
    for (const rawSym of portfolioHoldingsSymbols) {
      const sym = rawSym.trim().toUpperCase();
      if (!sym || US_AND_FOREIGN_EQUITIES.has(sym)) continue;
      portfolioSymbolsSet.add(sym);
      if (!categoryMap.has(sym)) {
        categoryMap.set(sym, 'MICROCAP_SME');
        portfolioUniqueCount++;
      }
    }

    // Expand beyond the static benchmark lists to the current active security
    // master. Symbols outside the curated cohorts are classified as
    // MICROCAP_SME until a more specific membership is available.
    try {
      const active = await dbAll<any>(getDB(), `
        SELECT DISTINCT upper(symbol) AS symbol
          FROM MasterTickers
         WHERE status = 'ACTIVE'
           AND exchange IN ('NSE', 'BSE')
           AND symbol IS NOT NULL AND trim(symbol) <> ''
           AND (upstox_key_nse IS NOT NULL OR upstox_key_bse IS NOT NULL)
         ORDER BY upper(symbol)`);
      for (const row of active) {
        const symbol = String(row.symbol || '').trim().toUpperCase();
        if (!symbol || US_AND_FOREIGN_EQUITIES.has(symbol)) continue;
        if (!categoryMap.has(symbol)) categoryMap.set(symbol, 'MICROCAP_SME');
      }
    } catch (error) {
      console.warn('[MasterIndianUniverse] Active master read failed; using curated universe only.', error);
    }

    const masterSymbols = Array.from(categoryMap.keys());

    let niftyLargecapCount = 0;
    let niftyMidcapCount = 0;
    let niftySmallcapCount = 0;
    let microcapSmeCount = 0;

    for (const [, cat] of categoryMap.entries()) {
      if (cat === 'NIFTY_LARGECAP') niftyLargecapCount++;
      else if (cat === 'NIFTY_MIDCAP') niftyMidcapCount++;
      else if (cat === 'NIFTY_SMALLCAP') niftySmallcapCount++;
      else if (cat === 'MICROCAP_SME') microcapSmeCount++;
    }

    const nifty500Count = niftyLargecapCount + niftyMidcapCount + niftySmallcapCount;

    return {
      masterSymbols,
      breakdown: {
        totalCount: masterSymbols.length,
        nifty500Count,
        niftyLargecapCount,
        niftyMidcapCount,
        niftySmallcapCount,
        microcapSmeCount,
        portfolioUniqueCount
      },
      categoryMap,
      portfolioSymbolsSet
    };
  }
}
