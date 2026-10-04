import io
import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from contextlib import redirect_stdout

import pandas as pd
import numpy as np

from history_features import personal_context_probability, stats_for_subset
import preview_odds
from preview_odds import general_category_supported, local_challenge_date
from train_personal import (
    FEATURES,
    build_training_data,
    personal_features_for_challenge,
)


class LocalChallengeDateTests(unittest.TestCase):
    def test_uses_nlp_event_time_in_user_timezone(self):
        row = {
            "occurred_at": datetime(2026, 10, 4, 8),
            "deadline_at": datetime(2026, 10, 5, 14),
            "user_input_json": {"timezone": "America/Los_Angeles"},
            "analysis_json": {
                "data": {
                    "context": {"timezone": "America/Los_Angeles"},
                    "actions": [
                        {
                            "times": [
                                {
                                    "kind": "event",
                                    "resolved_at": "2026-10-04T00:30:00+00:00",
                                }
                            ]
                        }
                    ],
                }
            },
        }

        self.assertEqual(
            local_challenge_date(row),
            pd.Timestamp("2026-10-03"),
        )

    def test_falls_back_to_local_deadline_date(self):
        row = {
            "occurred_at": datetime(2026, 10, 4, 8),
            "deadline_at": datetime(2026, 10, 5, 14),
            "user_input_json": {"timezone": "America/Los_Angeles"},
            "analysis_json": {"data": {"context": {}, "actions": []}},
        }

        self.assertEqual(
            local_challenge_date(row),
            pd.Timestamp("2026-10-05"),
        )


class PersonalGeneralParityTests(unittest.TestCase):
    def setUp(self):
        self.data = pd.DataFrame(
            [
                {"user_id": "u1", "date": "2026-10-01", "category": "exercise", "target_hour": 8, "day_of_week": 3, "success": 1},
                {"user_id": "u1", "date": "2026-10-02", "category": "exercise", "target_hour": 22, "day_of_week": 4, "success": 0},
                {"user_id": "u2", "date": "2026-10-01", "category": "exercise", "target_hour": 22, "day_of_week": 3, "success": 0},
                {"user_id": "u2", "date": "2026-10-02", "category": "exercise", "target_hour": 22, "day_of_week": 4, "success": 1},
            ]
        )

    def test_inference_features_match_personal_training_features(self):
        training = build_training_data(self.data)
        training_row = training[
            (training["user_id"] == "u1")
            & (training["date"] == pd.Timestamp("2026-10-02"))
        ].iloc[0]
        history = self.data[
            (self.data["user_id"] == "u1")
            & (pd.to_datetime(self.data["date"]) < pd.Timestamp("2026-10-02"))
        ].copy()
        population = self.data[self.data["user_id"] != "u1"].copy()
        challenge = {
            "category": "exercise",
            "target_hour": 22,
            "day_of_week": 4,
            "weather": None,
            "hours_until_deadline": None,
        }

        features, _ = personal_features_for_challenge(
            history=history,
            challenge=challenge,
            population=population,
        )

        for name in FEATURES:
            self.assertAlmostEqual(float(training_row[name]), features[name])

    def test_personal_history_is_smoothed_toward_general_by_attempt_count(self):
        general_probability = 0.4
        empty_history = pd.DataFrame(columns=["success"])
        one_success = pd.DataFrame({"success": [1]})
        nine_of_ten = pd.DataFrame({"success": [1] * 9 + [0]})

        probability_without_history, attempts_without_history = stats_for_subset(
            empty_history,
            general_probability,
        )
        probability_with_one, attempts_with_one = stats_for_subset(
            one_success,
            general_probability,
        )
        probability_with_ten, attempts_with_ten = stats_for_subset(
            nine_of_ten,
            general_probability,
        )

        self.assertEqual(attempts_without_history, 0)
        self.assertAlmostEqual(probability_without_history, 0.4)
        self.assertEqual(attempts_with_one, 1)
        self.assertAlmostEqual(probability_with_one, 0.5)
        self.assertEqual(attempts_with_ten, 10)
        self.assertAlmostEqual(probability_with_ten, 11 / 15)


class PersonalContextProbabilityTests(unittest.TestCase):
    @staticmethod
    def history(rows):
        return pd.DataFrame(
            [
                {"category": category, "day_of_week": day, "success": success}
                for category, day, success in rows
            ]
        )

    def test_without_history_returns_general_prior(self):
        probability, attempts, context_attempts = personal_context_probability(
            pd.DataFrame(), "sleep", 5, 0.6
        )

        self.assertEqual((probability, attempts, context_attempts), (0.6, 0, 0))

    def test_single_day_type_matches_plain_category_blend(self):
        history = self.history([("sleep", 1, 1), ("sleep", 2, 1), ("exercise", 1, 0)])

        probability, attempts, context_attempts = personal_context_probability(
            history, "sleep", 3, 0.6
        )
        expected, _ = stats_for_subset(history[history["category"] == "sleep"], 0.6)

        self.assertAlmostEqual(probability, expected)
        self.assertEqual((attempts, context_attempts), (2, 2))

    def test_weekend_failures_lower_weekend_odds_only(self):
        weekdays = [("sleep", day % 5, 1) for day in range(20)]
        weekends = [("sleep", 5 + day % 2, 0) for day in range(10)]
        history = self.history(weekdays + weekends)

        saturday, attempts, saturday_attempts = personal_context_probability(
            history, "sleep", 5, 0.6
        )
        tuesday, _, tuesday_attempts = personal_context_probability(
            history, "sleep", 1, 0.6
        )

        # Weekday history (20/20) shrunk to the General 0.6 is the weekend prior.
        weekday_rate = (20 + 5 * 0.6) / 25
        self.assertAlmostEqual(saturday, 5 * weekday_rate / 15)
        self.assertAlmostEqual(tuesday, (20 + 5 * (5 * 0.6 / 15)) / 25)
        self.assertEqual((attempts, saturday_attempts, tuesday_attempts), (30, 10, 20))
        self.assertLess(saturday, 0.4)
        self.assertGreater(tuesday, 0.8)


class CategorySupportTests(unittest.TestCase):
    def test_only_exact_general_categories_are_supported(self):
        known_categories = {"exercise", "sleep", "steps"}

        self.assertTrue(general_category_supported("exercise", known_categories))
        self.assertTrue(general_category_supported("steps", known_categories))
        self.assertFalse(general_category_supported("learning", known_categories))
        self.assertFalse(general_category_supported("Fitness", known_categories))
        self.assertFalse(general_category_supported("walking", known_categories))


class DbModeCsvIndependenceTests(unittest.TestCase):
    def test_db_mode_runs_when_training_csv_is_missing(self):
        history = pd.DataFrame(
            [{
                "date": pd.Timestamp("2026-10-01"),
                "category": "exercise",
                "target_hour": 22,
                "weather": None,
                "hours_until_deadline": 24,
                "success": 1,
                "day_of_week": 3,
            }]
        )

        class GeneralModel:
            def predict_proba(self, _features):
                return np.array([[0.4, 0.6]])

        bundle = {
            "known_categories": ["exercise", "sleep", "steps"],
            "features": ["category", "day_of_week", "is_weekend", "target_hour"],
            "model": GeneralModel(),
        }
        output = io.StringIO()
        argv = [
            "preview_odds.py",
            "--user-id", "app-user-uuid",
            "--category", "exercise",
            "--target-hour", "22",
            "--day-of-week", "3",
            "--as-of", "2026-10-04",
        ]

        with (
            patch.object(preview_odds, "load_db_history", return_value=history),
            patch.object(preview_odds.joblib, "load", return_value=bundle),
            patch.object(preview_odds.pd, "read_csv") as read_csv,
            patch.object(sys, "argv", argv),
            redirect_stdout(output),
        ):
            preview_odds.main()

        read_csv.assert_not_called()
        self.assertIn("personal_history_rows=1", output.getvalue())
        self.assertIn("ODDS_BASE p_success=66.7%", output.getvalue())


if __name__ == "__main__":
    unittest.main()