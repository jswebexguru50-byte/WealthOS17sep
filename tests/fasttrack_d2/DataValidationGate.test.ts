import { describe, expect, it } from 'vitest';

import {
  validatePIT,
  pitAllowsPromotion,
} from '../../src/server/services/dataenrichment/DataValidationGate';

const EVALUATION =
  Date.parse(
    '2025-01-02T10:00:00Z',
  );

describe(
  'D2.2 Point-in-Time validation',
  () => {
    it(
      'verifies complete PIT evidence',
      () => {
        const result =
          validatePIT(
            {
              observationTimestamp:
                Date.parse(
                  '2025-01-02T09:00:00Z',
                ),

              publicationTimestamp:
                Date.parse(
                  '2025-01-02T09:30:00Z',
                ),

              acquisitionTimestamp:
                Date.parse(
                  '2025-01-02T09:35:00Z',
                ),

              requiresPublication: true,

              requiresAcquisitionTimestamp: true,
            },
            EVALUATION,
          );

        expect(result).toBe(
          'PIT_VERIFIED',
        );
      },
    );

    it(
      'blocks missing publication evidence',
      () => {
        const result =
          validatePIT(
            {
              observationTimestamp:
                Date.parse(
                  '2025-01-02T09:00:00Z',
                ),

              requiresPublication: true,
            },
            EVALUATION,
          );

        expect(result).toBe(
          'PIT_NOT_VERIFIABLE',
        );

        expect(
          pitAllowsPromotion(result),
        ).toBe(false);
      },
    );

    it(
      'rejects future observation',
      () => {
        const result =
          validatePIT(
            {
              observationTimestamp:
                Date.parse(
                  '2025-01-02T11:00:00Z',
                ),

              requiresPublication: false,
            },
            EVALUATION,
          );

        expect(result).toBe(
          'PIT_INVALID',
        );
      },
    );

    it(
      'rejects future publication',
      () => {
        const result =
          validatePIT(
            {
              observationTimestamp:
                Date.parse(
                  '2025-01-02T09:00:00Z',
                ),

              publicationTimestamp:
                Date.parse(
                  '2025-01-02T11:00:00Z',
                ),

              requiresPublication: true,
            },
            EVALUATION,
          );

        expect(result).toBe(
          'PIT_INVALID',
        );
      },
    );

    it(
      'supports explicit NOT_APPLICABLE',
      () => {
        const result =
          validatePIT(
            {
              requiresPublication: false,
              notApplicable: true,
            },
            EVALUATION,
          );

        expect(result).toBe(
          'NOT_APPLICABLE',
        );

        expect(
          pitAllowsPromotion(result),
        ).toBe(true);
      },
    );
  },
);
