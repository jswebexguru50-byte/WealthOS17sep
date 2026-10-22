/**
 * OperatingKpiService.ts — Section 4 Operating KPI Intelligence
 *
 * Query and synthesis service for non-accounting operating KPIs.
 * Uses OperatingKpiRegistry and CompanyKpiProfiles to provide rich operational visibility.
 *
 * Constitution invariants:
 * - C8: Strict Point-In-Time (PIT) boundary enforcement
 * - C2: No fake data — absent metric → null, not zero
 * - C3: Direction requires ≥2 periods
 */

import { getDB, dbAll } from '../../../database.js';
import { OperatingKpiRegistry, OperatingKpiDefinition } from './OperatingKpiRegistry.js';
import { CompanyKpiProfiles, CompanyKpiProfile } from './CompanyKpiProfiles.js';
import { EvidenceReference } from '../contracts/Provenance.js';

export interface OperatingKpiFact {
  metricKey: string;
  displayName: string;
  unit: string;
  directionality: 'HIGHER_BETTER' | 'LOWER_BETTER' | 'CONTEXTUAL';
  currentValue: number | null;
  currentPeriod: string;
  priorValue: number | null;
  priorPeriod: string | null;
  changePct: number | null;
  direction: 'IMPROVING' | 'DETERIORATING' | 'STABLE' | 'UNKNOWN';
  evidence: EvidenceReference[];
  asOfDate: string;
}

export interface CompanyKpiReport {
  symbol: string;
  businessModel: string;
  kpis: OperatingKpiFact[];
  coveredCount: number;
  totalProfileKpis: number;
  coveragePct: number;
  asOfDate: string;
}

export class OperatingKpiService {
  private static instance: OperatingKpiService;
  private readonly registry: OperatingKpiRegistry;
  private readonly profiles: CompanyKpiProfiles;

  private constructor() {
    this.registry = OperatingKpiRegistry.getInstance();
    this.profiles = CompanyKpiProfiles.getInstance();
  }

  public static getInstance(): OperatingKpiService {
    if (!OperatingKpiService.instance) {
      OperatingKpiService.instance = new OperatingKpiService();
    }
    return OperatingKpiService.instance;
  }

  /**
   * Fetches operating KPI facts for a company, strictly filtered by asOfDate.
   */
  public async getKpisForCompany(
    symbol: string,
    asOfDate?: string | null
  ): Promise<CompanyKpiReport> {
    const clean = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const effectiveAsOf = asOfDate || new Date().toISOString().split('T')[0];

    const profile = this.profiles.getProfile(clean);
    const kpiKeys = profile ? [...profile.primaryKpis, ...profile.secondaryKpis] : [];

    const db = getDB();
    const kpiFacts: OperatingKpiFact[] = [];

    if (db && kpiKeys.length > 0) {
      for (const key of kpiKeys) {
        const def = this.registry.get(key) || {
          metricKey: key,
          displayName: key.replace(/_/g, ' ').toUpperCase(),
          businessModels: ['*'],
          unit: 'UNITS',
          frequency: 'QUARTERLY',
          directionality: 'CONTEXTUAL',
          sourcePreference: ['company_facts'],
        };

        try {
          const sql = `
            SELECT value, periodEnd, provider, sourceType, asOfDate
            FROM company_facts
            WHERE (symbol = ? OR isin = ?) AND metric = ?
              AND (
                (asOfDate IS NOT NULL AND asOfDate <= ?) OR
                (asOfDate IS NULL AND (periodEnd <= ? OR fetchedAt <= ?))
              )
            ORDER BY COALESCE(asOfDate, periodEnd) DESC, periodEnd DESC
            LIMIT 2
          `;
          const rows = await dbAll<any>(db, sql, [clean, clean, key, effectiveAsOf, effectiveAsOf, effectiveAsOf]);

          if (rows && rows.length > 0) {
            const current = rows[0];
            const prior = rows.length > 1 ? rows[1] : null;

            const currVal = current.value !== null && current.value !== undefined ? parseFloat(current.value) : null;
            const priorVal = prior && prior.value !== null && prior.value !== undefined ? parseFloat(prior.value) : null;

            let changePct: number | null = null;
            let direction: OperatingKpiFact['direction'] = 'UNKNOWN';

            if (currVal !== null && priorVal !== null && priorVal !== 0) {
              changePct = parseFloat((((currVal - priorVal) / Math.abs(priorVal)) * 100).toFixed(2));
              if (Math.abs(changePct) < 2.0) {
                direction = 'STABLE';
              } else if (changePct > 0) {
                direction = def.directionality === 'LOWER_BETTER' ? 'DETERIORATING' : 'IMPROVING';
              } else {
                direction = def.directionality === 'LOWER_BETTER' ? 'IMPROVING' : 'DETERIORATING';
              }
            }

            const evidence: EvidenceReference[] = [{
              evidenceId: `kpi_${key}_${current.periodEnd}`,
              sourceType: 'CANONICAL_FACT',
              sourceId: current.provider || current.sourceType || 'company_facts',
              timestamp: current.asOfDate || current.periodEnd || effectiveAsOf,
              field: key,
              asOfDate: current.asOfDate || current.periodEnd || effectiveAsOf,
            }];

            kpiFacts.push({
              metricKey: key,
              displayName: def.displayName,
              unit: def.unit,
              directionality: def.directionality,
              currentValue: currVal,
              currentPeriod: current.periodEnd || 'LATEST',
              priorValue: priorVal,
              priorPeriod: prior?.periodEnd || null,
              changePct,
              direction,
              evidence,
              asOfDate: effectiveAsOf,
            });
          }
        } catch {
          // Continue to next metric
        }
      }
    }

    const totalProfileKpis = kpiKeys.length;
    const coveredCount = kpiFacts.length;
    const coveragePct = totalProfileKpis > 0 ? parseFloat(((coveredCount / totalProfileKpis) * 100).toFixed(1)) : 0;

    return {
      symbol: clean,
      businessModel: profile?.businessModel || 'UNKNOWN',
      kpis: kpiFacts,
      coveredCount,
      totalProfileKpis,
      coveragePct,
      asOfDate: effectiveAsOf,
    };
  }
}
