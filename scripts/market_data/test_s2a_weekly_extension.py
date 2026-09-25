"""Boundary checks for the S2A weekly swing extension exclusion."""
import unittest
from dataclasses import replace

import pandas as pd

from s2a_institutional_fvg_ce import (S2AConfig, detect_candlestick_pattern, detect_s2a_at, prepare_indicators,
                                       synthetic_ohlcv, weekly_swing_extension)


class WeeklySwingExtensionTests(unittest.TestCase):
    def setUp(self):
        self.data = prepare_indicators(synthetic_ohlcv(), S2AConfig())
        self.config = S2AConfig()

    def test_existing_fixture_remains_within_fifty_percent(self):
        allowed, low, advance, peak = weekly_swing_extension(self.data, 41, self.config)
        self.assertTrue(allowed)
        self.assertLessEqual(advance, 0.50)
        self.assertGreater(low, 0)
        self.assertGreaterEqual(peak, float(self.data.at[41, 'high']))

    def test_more_than_fifty_percent_is_excluded(self):
        changed = self.data.copy()
        changed.at[41, 'high'] = 1.501 * weekly_swing_extension(self.data, 41, self.config)[1]
        allowed, _, advance, _ = weekly_swing_extension(changed, 41, self.config)
        self.assertFalse(allowed)
        self.assertGreater(advance, 0.50)

    def test_close_cannot_hide_a_peak_above_fifty_percent(self):
        changed = self.data.copy()
        low = weekly_swing_extension(self.data, 41, self.config)[1]
        changed.at[41, 'high'] = low * 1.51
        changed.at[41, 'close'] = low * 1.40
        self.assertFalse(weekly_swing_extension(changed, 41, self.config)[0])

    def test_upper_wick_close_more_than_quarter_range_is_rejected(self):
        changed = self.data.copy()
        changed.at[41, 'high'] = 110.0
        valid, reason = detect_candlestick_pattern(changed, 41, self.config)
        self.assertFalse(valid)
        self.assertEqual(reason, 'CLOSE_TOO_FAR_BELOW_HIGH')

    def test_exact_quarter_range_close_is_allowed(self):
        changed = self.data.copy()
        changed.at[41, 'close'] = 105.2  # (106 - 105.2) / (106 - 102.8) = 0.25
        valid, reason = detect_candlestick_pattern(changed, 41, self.config)
        self.assertTrue(valid, reason)

    def test_detector_enforces_configured_limit(self):
        self.assertIsNotNone(detect_s2a_at(self.data, 41, self.config))
        self.assertIsNone(detect_s2a_at(self.data, 41,
            replace(self.config, weekly_swing_max_advance_pct=0.30)))

    def test_current_week_low_cannot_change_anchor(self):
        changed = self.data.copy()
        changed.at[41, 'low'] = 0.01
        _, anchor_before, _, _ = weekly_swing_extension(self.data, 41, self.config)
        _, anchor_after, _, _ = weekly_swing_extension(changed, 41, self.config)
        self.assertEqual(anchor_before, anchor_after)

    def test_missing_weekly_history_fails_closed(self):
        allowed, _, _, _ = weekly_swing_extension(self.data, 41,
            replace(self.config, weekly_swing_min_completed_weeks=100))
        self.assertFalse(allowed)


if __name__ == '__main__':
    unittest.main()
