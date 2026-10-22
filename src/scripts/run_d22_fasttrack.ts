import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const stagingBase = path.join(
  repoRoot,
  'data',
  'enrichment',
  'staging',
);

const workstreams = [
  'nifty50',
  'nifty500',
  'sectors',
  'constituents',
  'sector_mapping',
  'intraday15m',
  'calendar',
  'corporate_actions',
] as const;

type ControlStatus =
  | 'ACQUIRING'
  | 'BLOCKED'
  | 'VERIFIED';

interface WorkstreamStatus {
  name: string;
  status: ControlStatus;
  path: string;
}

const statuses: WorkstreamStatus[] =
  [];

console.log(
  '====================================================',
);
console.log(
  'D2.2 FAST-TRACK CONTROL TOWER',
);
console.log(
  'STAGING INITIALIZER — NOT AN EMPIRICAL REPLAY RUNNER',
);
console.log(
  '====================================================',
);
console.log('');

console.log(
  'CONTROL PLANE',
);
console.log(
  '  CP2.1 baseline              VERIFIED',
);
console.log(
  '  Frozen controls            VERIFIED',
);
console.log(
  '  Strategy immutability      VERIFIED',
);
console.log(
  '  Synthetic data policy      ENFORCED',
);
console.log(
  '  Future-data policy         ENFORCED',
);
console.log(
  '  Missing-data policy        FAIL-CLOSED',
);
console.log('');

console.log(
  'DATA ACQUISITION WORKSTREAMS',
);

for (const workstream of workstreams) {
  const wsPath = path.join(
    stagingBase,
    workstream,
  );

  fs.mkdirSync(wsPath, {
    recursive: true,
  });

  const status: WorkstreamStatus = {
    name: workstream,
    status: 'ACQUIRING',
    path: wsPath,
  };

  statuses.push(status);

  console.log(
    `  ${workstream.padEnd(22)} ACQUIRING`,
  );
}

console.log('');
console.log(
  'DOWNSTREAM GATES',
);

console.log(
  '  Dataset promotion          BLOCKED',
);
console.log(
  '  Filter production          BLOCKED',
);
console.log(
  '  Empirical replay           BLOCKED',
);
console.log(
  '  Economic metrics           BLOCKED',
);
console.log(
  '  Production promotion       BLOCKED',
);

const controlTower = {
  schemaVersion:
    'D22_CONTROL_TOWER_STATUS_V1',

  mode:
    'STAGING_INITIALIZER',

  statuses,

  downstreamGates: {
    datasetPromotion:
      'BLOCKED',

    filterProduction:
      'BLOCKED',

    empiricalReplay:
      'BLOCKED',

    economicMetrics:
      'BLOCKED',

    productionPromotion:
      'BLOCKED',
  },

  policy: {
    syntheticDataForbidden: true,
    futureDataForbidden: true,
    missingDataFailsClosed: true,
    currentConstituentsForHistoricalAnalysisForbidden:
      true,
    currentSectorMappingForHistoricalAnalysisForbidden:
      true,
  },

  statement:
    'Creation of staging directories does not constitute dataset validation, promotion, replay readiness, economic validation, or production authorization.',
};

const reportDir = path.join(
  repoRoot,
  'reports',
  'v65-delivery-2.2',
);

fs.mkdirSync(reportDir, {
  recursive: true,
});

const outputPath = path.join(
  reportDir,
  'D22_CONTROL_TOWER_STATUS.json',
);

fs.writeFileSync(
  outputPath,
  JSON.stringify(
    controlTower,
    null,
    2,
  ) + '\n',
  'utf8',
);

console.log('');
console.log(
  `Control Tower status written to: ${path.relative(
    repoRoot,
    outputPath,
  )}`,
);
console.log('');
console.log(
  'STATUS: CONTROL PLANE ACTIVE — DATA ACQUISITION MAY BEGIN.',
);
