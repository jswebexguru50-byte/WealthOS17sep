import { describe, expect, it } from 'vitest';

import {
  canonicalNumber,
  canonicalizeObservation,
  hashObservation,
} from '../../src/server/services/dataenrichment/DataStagingContract';

const observation = {
  securityId: 'RELIANCE',
  exchange: 'NSE',
  segment: 'EQUITY',
  timeframe: '15m',

  barStartTime:
    '2025-01-02T09:15:00+05:30',

  barEndTime:
    '2025-01-02T09:30:00+05:30',

  open: 100,
  high: 101,
  low: 99,
  close: 100.5,
  volume: 100000,

  providerTimestamp:
    '2025-01-02T09:30:00+05:30',

  observationTimestamp:
    '2025-01-02T09:30:00+05:30',

  dataAcquisitionTimestamp:
    '2025-01-02T09:31:00+05:30',

  source: 'TEST_PROVIDER',
  datasetId: 'TEST_DATASET',
};

describe(
  'canonical market observation',
  () => {
    it(
      'canonicalizes finite numbers',
      () => {
        expect(
          canonicalNumber(
            100,
            'open',
          ),
        ).toBe('100');
      },
    );

    it(
      'rejects NaN',
      () => {
        expect(() =>
          canonicalNumber(
            Number.NaN,
            'open',
          ),
        ).toThrow(
          'CANONICAL_NUMBER_INVALID:open',
        );
      },
    );

    it(
      'rejects positive infinity',
      () => {
        expect(() =>
          canonicalNumber(
            Number.POSITIVE_INFINITY,
            'open',
          ),
        ).toThrow();
      },
    );

    it(
      'rejects negative infinity',
      () => {
        expect(() =>
          canonicalNumber(
            Number.NEGATIVE_INFINITY,
            'open',
          ),
        ).toThrow();
      },
    );

    it(
      'normalizes negative zero',
      () => {
        expect(
          canonicalNumber(
            -0,
            'open',
          ),
        ).toBe('0');
      },
    );

    it(
      'produces deterministic canonical serialization',
      () => {
        const a =
          canonicalizeObservation(
            observation,
          );

        const b =
          canonicalizeObservation({
            ...observation,
          });

        expect(a).toBe(b);
      },
    );

    it(
      'produces deterministic observation hash',
      () => {
        expect(
          hashObservation(
            observation,
          ),
        ).toBe(
          hashObservation({
            ...observation,
          }),
        );
      },
    );

    it(
      'changes hash when evidence changes',
      () => {
        const original =
          hashObservation(
            observation,
          );

        const changed =
          hashObservation({
            ...observation,
            close: 100.51,
          });

        expect(
          changed,
        ).not.toBe(original);
      },
    );
  },
);
