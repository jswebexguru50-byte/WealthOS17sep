import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const db = new Database('portfolio.db', { readonly: true });

// 1. Sector mapping function to map raw sector/industry to the 15 canonical sectors
export const CANONICAL_SECTORS = [
  'IT_SERVICES',
  'BANKS_NBFC_INSURANCE',
  'PHARMA_HEALTHCARE',
  'CAPITAL_GOODS_INDUSTRIALS',
  'AUTO_AUTO_ANCILLARY',
  'ENERGY_UTILITIES',
  'METALS_MINING',
  'CHEMICALS',
  'CONSUMER_RETAIL',
  'FMCG',
  'REAL_ESTATE',
  'TELECOM_MEDIA',
  'INFRASTRUCTURE_LOGISTICS',
  'TEXTILES',
  'AGRICULTURE_COMMODITIES'
] as const;

export type CanonicalSector = typeof CANONICAL_SECTORS[number];

export function mapToCanonicalSector(sector?: string | null, industry?: string | null): CanonicalSector | null {
  const text = `${sector || ''} ${industry || ''}`.toUpperCase();

  if (text.includes('SOFTWARE') || text.includes('TECHNOLOGY') || text.includes('IT ') || text.includes('SERVICES - IT')) {
    return 'IT_SERVICES';
  }
  if (text.includes('BANK') || text.includes('FINANCIAL') || text.includes('NBFC') || text.includes('INSURANCE') || text.includes('HOUSING FINANCE')) {
    return 'BANKS_NBFC_INSURANCE';
  }
  if (text.includes('PHARMA') || text.includes('HEALTHCARE') || text.includes('BIOTECH') || text.includes('HOSPITAL') || text.includes('DRUGS')) {
    return 'PHARMA_HEALTHCARE';
  }
  if (text.includes('AUTO') || text.includes('AUTOMOBILE') || text.includes('VEHICLE')) {
    return 'AUTO_AUTO_ANCILLARY';
  }
  if (text.includes('POWER') || text.includes('ENERGY') || text.includes('UTILITIES') || text.includes('OIL') || text.includes('GAS') || text.includes('PETROLEUM')) {
    return 'ENERGY_UTILITIES';
  }
  if (text.includes('METAL') || text.includes('MINING') || text.includes('STEEL') || text.includes('ALUMINIUM') || text.includes('COPPER') || text.includes('ZINC') || text.includes('IRON')) {
    return 'METALS_MINING';
  }
  if (text.includes('CHEMICAL') || text.includes('PETROCHEM') || text.includes('SPECIALITY CHEM')) {
    return 'CHEMICALS';
  }
  if (text.includes('FMCG') || text.includes('FOOD') || text.includes('BEVERAGE') || text.includes('TOBACCO') || text.includes('CONSUMER DEFENSIVE')) {
    return 'FMCG';
  }
  if (text.includes('REAL ESTATE') || text.includes('REALTY') || text.includes('CONSTRUCTION - RESIDENTIAL')) {
    return 'REAL_ESTATE';
  }
  if (text.includes('TELECOM') || text.includes('MEDIA') || text.includes('COMMUNICATION') || text.includes('BROADCAST') || text.includes('ENTERTAINMENT')) {
    return 'TELECOM_MEDIA';
  }
  if (text.includes('INFRASTRUCTURE') || text.includes('LOGISTICS') || text.includes('TRANSPORT') || text.includes('PORTS') || text.includes('SHIPPING') || text.includes('ROAD') || text.includes('AIRPORT')) {
    return 'INFRASTRUCTURE_LOGISTICS';
  }
  if (text.includes('TEXTILE') || text.includes('APPAREL') || text.includes('GARMENT') || text.includes('FABRIC') || text.includes('COTTON')) {
    return 'TEXTILES';
  }
  if (text.includes('AGRICULTURE') || text.includes('AGRO') || text.includes('FERTILIZER') || text.includes('SUGAR') || text.includes('COMMODIT') || text.includes('SEED')) {
    return 'AGRICULTURE_COMMODITIES';
  }
  if (text.includes('CAPITAL GOODS') || text.includes('INDUSTRIAL') || text.includes('ENGINEERING') || text.includes('MACHINERY') || text.includes('ELECTRICAL EQUIPMENT')) {
    return 'CAPITAL_GOODS_INDUSTRIALS';
  }
  if (text.includes('RETAIL') || text.includes('CONSUMER CYCLICAL') || text.includes('CONSUMER DURABLES') || text.includes('CONSUMER GOODS') || text.includes('FOOTWEAR') || text.includes('JEWELLERY')) {
    return 'CONSUMER_RETAIL';
  }

  return null;
}

console.log('Testing sector mapping across portfolio...');
const tickers = db.prepare('SELECT symbol, name, sector, industry FROM MasterTickers').all() as any[];
const mappedCounts: Record<string, number> = {};
let unmapped = 0;
for (const t of tickers) {
  const canSec = mapToCanonicalSector(t.sector, t.industry);
  if (canSec) {
    mappedCounts[canSec] = (mappedCounts[canSec] || 0) + 1;
  } else {
    unmapped++;
  }
}
console.log('Mapped canonical sector counts:', mappedCounts);
console.log('Unmapped count:', unmapped);
