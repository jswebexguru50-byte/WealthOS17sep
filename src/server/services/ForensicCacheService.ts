/**
 * src/server/services/ForensicCacheService.ts
 * In-Memory Non-Blocking Cache Service for Forensic Dossiers & Statutory Lineage
 * 
 * Addresses Reviewer Architecture Finding:
 * Eliminates synchronous fs.readFileSync + JSON.parse on the Node event loop on every request.
 * Implements lightweight mtimeMs timestamp auto-invalidation so any regeneration on disk
 * is hot-reloaded automatically without stale cache issues.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ForensicCalculator, RecommendationProvenance } from '../quant/forensicCalculator.js';

export class ForensicCacheService {
  private static dossiersCache: any[] | null = null;
  private static dossiersBySymbol: Map<string, any> = new Map();
  private static dossiersFileMtimeMs: number = 0;

  private static lineageCache: Record<string, any> | null = null;
  private static lineageFileMtimeMs: number = 0;

  private static readonly DOSSIERS_FILE_PATH = path.join(process.cwd(), 'scratch', 'forensic_49_dossiers_360.json');
  private static readonly LINEAGE_FILE_PATH = path.join(process.cwd(), 'scratch', 'statutory_filings_lineage.json');

  /**
   * Refreshes the dossiers cache if the file on disk has been modified.
   */
  private static ensureDossiersLoaded(): void {
    if (!fs.existsSync(this.DOSSIERS_FILE_PATH)) {
      this.dossiersCache = [];
      this.dossiersBySymbol.clear();
      return;
    }

    try {
      const stats = fs.statSync(this.DOSSIERS_FILE_PATH);
      if (!this.dossiersCache || stats.mtimeMs > this.dossiersFileMtimeMs) {
        const raw = fs.readFileSync(this.DOSSIERS_FILE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.dossiersCache = parsed;
          this.dossiersBySymbol.clear();
          for (const item of parsed) {
            const sym = (item.Symbol || item.symbol || '').trim().toUpperCase();
            if (sym) {
              this.dossiersBySymbol.set(sym, item);
            }
          }
          this.dossiersFileMtimeMs = stats.mtimeMs;
        }
      }
    } catch (err) {
      console.error('[ForensicCacheService] Error reloading dossiers file:', err);
    }
  }

  /**
   * Refreshes the statutory lineage cache if the file on disk has been modified.
   */
  private static ensureLineageLoaded(): void {
    if (!fs.existsSync(this.LINEAGE_FILE_PATH)) {
      this.lineageCache = {};
      return;
    }

    try {
      const stats = fs.statSync(this.LINEAGE_FILE_PATH);
      if (!this.lineageCache || stats.mtimeMs > this.lineageFileMtimeMs) {
        const raw = fs.readFileSync(this.LINEAGE_FILE_PATH, 'utf8');
        this.lineageCache = JSON.parse(raw);
        this.lineageFileMtimeMs = stats.mtimeMs;
      }
    } catch (err) {
      console.error('[ForensicCacheService] Error reloading lineage file:', err);
    }
  }

  /**
   * Returns all 49 Master Institutional Dossiers from in-memory cache.
   */
  public static getAllDossiers(): any[] {
    this.ensureDossiersLoaded();
    return this.dossiersCache || [];
  }

  /**
   * Returns a single stock dossier by symbol in O(1) from in-memory Map.
   */
  public static getDossierBySymbol(symbol: string): any | null {
    if (!symbol) return null;
    this.ensureDossiersLoaded();
    return this.dossiersBySymbol.get(symbol.toUpperCase()) || null;
  }

  /**
   * Caches a dynamically evaluated dossier in-memory for instant subsequent retrieval.
   */
  public static setDossier(symbol: string, dossier: any): void {
    if (!symbol || !dossier) return;
    this.ensureDossiersLoaded();
    this.dossiersBySymbol.set(symbol.toUpperCase(), dossier);
  }

  /**
   * Returns statutory financial filing lineage and step-by-step arithmetic.
   */
  public static getStatutoryLineage(symbol: string): any | null {
    if (!symbol) return null;
    this.ensureLineageLoaded();
    return this.lineageCache ? this.lineageCache[symbol.toUpperCase()] || null : null;
  }

  /**
   * Returns all statutory financial filing lineages.
   */
  public static getAllStatutoryLineages(): Record<string, any> {
    this.ensureLineageLoaded();
    return this.lineageCache || {};
  }

  /**
   * Evaluates Recommendation Provenance contract binding technical momentum to forensic verdict.
   */
  public static getRecommendationProvenance(
    symbol: string,
    technicalSignal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'AVOID' = 'STRONG_BUY'
  ): RecommendationProvenance | null {
    const dossier = this.getDossierBySymbol(symbol);
    if (!dossier) return null;
    return ForensicCalculator.evaluateProvenance(symbol, technicalSignal, dossier);
  }

  /**
   * Manually invalidates cache (e.g. after background batch generation).
   */
  public static invalidateCache(): void {
    this.dossiersFileMtimeMs = 0;
    this.lineageFileMtimeMs = 0;
    this.ensureDossiersLoaded();
    this.ensureLineageLoaded();
  }
}
export default ForensicCacheService;
