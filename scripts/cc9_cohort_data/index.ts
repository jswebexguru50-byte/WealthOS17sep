import { CompanyCohortDefinition } from './types.js';
import { PART1_COMPANIES } from './part1.js';
import { PART2_COMPANIES } from './part2.js';
import { PART3_COMPANIES } from './part3.js';
import { PART4_COMPANIES } from './part4.js';

export * from './types.js';

export const CC9_COMPANIES: CompanyCohortDefinition[] = [
  ...PART1_COMPANIES,
  ...PART2_COMPANIES,
  ...PART3_COMPANIES,
  ...PART4_COMPANIES
];
