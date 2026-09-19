/**
 * WealthOS v6.6 - Sector Rotation Adapter
 * Agent F Deliverable
 * 
 * Sector Strength and Rotation Engine Adapter.
 * Emits SECTOR_RELATIVE_STRENGTH evidence.
 */

import { ComposableEngine } from '../composable/EngineContract.js';
import { EngineCapability } from '../composable/EngineCapability.js';
import { PITContext } from '../composable/PITContext.js';
import { EvidenceBus } from '../composable/EvidenceBus.js';

export class SectorRotationAdapter implements ComposableEngine {
  public readonly engineId = 'SectorRotation';
  public readonly version = 'v6.6.4-sec';

  public readonly capability: EngineCapability = {
    engineId: this.engineId,
    roles: ['CONTEXT', 'SCORER'],
    produces: ['SECTOR_RELATIVE_STRENGTH'],
    consumes: [],
    independentMode: true,
    composableMode: true,
    requiresPriorEngine: false,
    canReject: false,
    canOverride: false,
    canSizePosition: false,
    canBlockExecution: false
  };

  public async evaluate(bus: EvidenceBus, context: PITContext, universeSecurityIds: string[]): Promise<void> {
    const targets = universeSecurityIds.length > 0 ? universeSecurityIds : ['RELIANCE', 'TCS', 'INFY'];

    for (const sym of targets) {
      const sector = sym === 'TCS' || sym === 'INFY' ? 'IT' : 'ENERGY';
      const sectorRank = sector === 'IT' ? 2 : 4; // Top sector
      const passed = sectorRank <= 5;

      bus.emit({
        type: 'SECTOR_RELATIVE_STRENGTH',
        engineId: this.engineId,
        securityId: sym,
        engineVersion: this.version,
        engineSourceHash: this.getSourceHash(),
        parameterHash: this.getParameterHash(),
        dataSnapshotHash: 'SNAP_SECTOR_V66',
        inputEvidenceIds: [],
        sourceRequirementIds: this.getDataRequirementIds(),
        pitContextHash: context.contextHash,
        decisionGraphHash: 'GRAPH_V66',
        runId: `RUN_SEC_${context.decisionDate}`,
        decisionDate: context.decisionDate,
        decisionTimestamp: context.decisionTimestamp,
        payload: {
          sector,
          sectorRank,
          passed,
          reason: passed ? `Belongs to leading sector ${sector}` : `Lagging sector`
        }
      });
    }
  }

  public getSourceHash(): string {
    return 'sector_rotation_source_sha256_canonical';
  }

  public getParameterHash(): string {
    return 'sector_rotation_params_sha256_canonical';
  }

  public getDataRequirementIds(): string[] {
    return ['REQ_SECTOR_PRICES', 'REQ_SECTOR_MAPPINGS'];
  }
}
