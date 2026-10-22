/**
 * CompanyDriverRegistry.ts — Custom & Analyst-Confirmed Driver Registry
 *
 * Stores analyst-confirmed and custom company-specific driver definitions.
 * Zero hardcoded golden-company drivers: generic sector driver templates
 * are provided by SectorArchetypeRegistry.
 *
 * Architecture Invariant:
 * - No company-specific hardcoded production drivers in this repository.
 * - Dynamic registrations via registerDrivers() are used by tests or analyst input.
 */

import { BusinessDriverDefinition, DriverCategory } from '../contracts/BusinessDriverContracts.js';

export interface CompanyDriverDefinition {
  securityId: string;
  symbol: string;
  driverId: string;
  name: string;
  description: string;
  category: DriverCategory;
  materiality: 'PRIMARY' | 'SECONDARY';
  linkedMetrics: string[];
  linkedSegments?: string[];
  thesisPillarIds?: string[];
  source: 'SYSTEM_TEMPLATE' | 'COMPANY_SPECIFIC' | 'ANALYST_CONFIRMED';
}

export class CompanyDriverRegistry {
  private static instance: CompanyDriverRegistry;
  private readonly customDrivers: Map<string, CompanyDriverDefinition[]> = new Map();

  private constructor() {
    // Zero hardcoded acceptance-company definitions.
    // Generic templates come from SectorArchetypeRegistry.
  }

  public static getInstance(): CompanyDriverRegistry {
    if (!CompanyDriverRegistry.instance) {
      CompanyDriverRegistry.instance = new CompanyDriverRegistry();
    }
    return CompanyDriverRegistry.instance;
  }

  public getDriversForSymbol(symbol: string): CompanyDriverDefinition[] | null {
    const clean = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    return this.customDrivers.get(clean) || null;
  }

  /**
   * Registers company-specific drivers from external sources (analyst input, test fixtures).
   */
  public registerDrivers(symbol: string, drivers: CompanyDriverDefinition[]): void {
    const clean = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const existing = this.customDrivers.get(clean) || [];
    this.customDrivers.set(clean, [...existing, ...drivers]);
  }

  public hasDrivers(symbol: string): boolean {
    const clean = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    return this.customDrivers.has(clean) && (this.customDrivers.get(clean)?.length ?? 0) > 0;
  }

  public getRegisteredSymbols(): string[] {
    return Array.from(this.customDrivers.keys());
  }

  public static hasDrivers(symbol: string): boolean {
    return CompanyDriverRegistry.getInstance().hasDrivers(symbol);
  }

  public static getDriversForSymbol(symbol: string): CompanyDriverDefinition[] | null {
    return CompanyDriverRegistry.getInstance().getDriversForSymbol(symbol);
  }

  public static getRegisteredSymbols(): string[] {
    return CompanyDriverRegistry.getInstance().getRegisteredSymbols();
  }

  public static clear(): void {
    CompanyDriverRegistry.getInstance().clear();
  }

  /**
   * Clear custom registrations (useful for test isolation).
   */
  public clear(): void {
    this.customDrivers.clear();
  }
}
