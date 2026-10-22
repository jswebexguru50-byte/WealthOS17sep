/**
 * WealthOS v6.6–v6.7 - PKScreener Capability Mapper
 * External Reference Acceleration Layer
 * 
 * SPEC MANDATE:
 * Maps PKScreener capabilities to WealthOS strategies and generates:
 *   - reports/reference_capability_matrix.json
 *   - reports/reference_capability_matrix.md
 */

import fs from 'fs';
import path from 'path';
import { ReferenceCapabilityRegistry, ReferenceCapability } from '../ReferenceCapabilityRegistry.js';

export type CapabilityClassification =
  | 'EXISTING_EQUIVALENT'
  | 'REFERENCE_ONLY'
  | 'DUPLICATE'
  | 'CANDIDATE'
  | 'DATA_BLOCKED'
  | 'REJECTED';

export interface MappedCapabilityRecord {
  capabilityId: string;
  provider: 'PKSCREENER';
  category: string;
  wealthOSMapping: string[];
  classification: CapabilityClassification;
  parityStatus: 'PENDING' | 'MATCH' | 'MISMATCH';
  promotionStatus: 'NOT_AUTHORIZED'; // HARD INVARIANT
}

export class PKScreenerCapabilityMapper {
  private registry = ReferenceCapabilityRegistry.getInstance();

  public generateMappingMatrix(): MappedCapabilityRecord[] {
    const caps = this.registry.getAll().filter(c => c.referenceProvider === 'PKSCREENER');

    return caps.map(c => {
      let classification: CapabilityClassification = 'CANDIDATE';
      if (['VCP', '52W_HIGH_BREAKOUT', 'VOLUME_BREAKOUT', 'HIGHER_HIGH_LOWER_LOW', 'RSI_REVERSAL', 'VSA'].includes(c.capabilityId)) {
        classification = 'EXISTING_EQUIVALENT';
      } else if (c.requiresIntraday) {
        classification = 'DATA_BLOCKED';
      }

      return {
        capabilityId: c.capabilityId,
        provider: 'PKSCREENER',
        category: c.category,
        wealthOSMapping: c.wealthOSMappings,
        classification,
        parityStatus: 'PENDING',
        promotionStatus: 'NOT_AUTHORIZED'
      };
    });
  }

  public exportReports(): void {
    const root = process.cwd();
    const reportsDir = path.join(root, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const matrix = this.generateMappingMatrix();
    const jsonPath = path.join(reportsDir, 'reference_capability_matrix.json');
    fs.writeFileSync(jsonPath, JSON.stringify(matrix, null, 2), 'utf8');

    // Generate Markdown report
    let md = `# WealthOS v6.6–v6.7 Reference Capability Matrix\n\n`;
    md += `**Generated At**: ${new Date().toISOString()}\n`;
    md += `**Governance Assertion**: \`productionPromotionAuthorized = false\` (ALL candidates NOT_AUTHORIZED)\n\n`;
    md += `| Capability ID | Category | WealthOS Mapping | Classification | Parity Status | Promotion Status |\n`;
    md += `|---|---|---|---|---|---|\n`;

    for (const r of matrix) {
      const mappings = r.wealthOSMapping.length > 0 ? r.wealthOSMapping.join(', ') : '—';
      md += `| \`${r.capabilityId}\` | ${r.category} | ${mappings} | \`${r.classification}\` | ${r.parityStatus} | **${r.promotionStatus}** |\n`;
    }

    const mdPath = path.join(reportsDir, 'reference_capability_matrix.md');
    fs.writeFileSync(mdPath, md, 'utf8');
  }
}
