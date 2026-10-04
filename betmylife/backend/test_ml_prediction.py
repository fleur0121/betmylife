import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from ml_prediction import (
    build_prediction_features,
    build_history,
    fallback_prediction,
    request_prediction,
)


class PredictionFeatureTests(unittest.TestCase):
    def test_example_study_challenge_uses_nlp_action_and_goal(self):
        analysis = {
            "data": {
                "context": {"submitted_at": "2026-10-04T12:00:00-07:00", "timezone": "America/Vancouver"},
                "actions": [{
                    "category": "learning", "subcategory": "programming",
                    "measurements": [{"metric": "activity_duration", "value": 2, "unit": "hours"}],
                    "times": [{"kind": "deadline", "clock_time": "21:00", "resolved_at": None, "day_offset": None}],
                }],
                "user_reported": {"confidence_percent": None},
            }
        }
        features = build_prediction_features(
            "I will study for 2 hours before 9 PM", "Study", 3, 70,
            datetime(2026, 10, 5, 4, tzinfo=timezone.utc), analysis, None,
        )
        self.assertEqual(features["category"], "study")
        self.assertEqual(features["goal_value"], 2)
        self.assertEqual(features["goal_unit"], "hours")
        self.assertEqual(features["goal_type"], "amount")
        self.assertEqual(features["target_hour"], 21)
        self.assertEqual(features["user_confidence"], 0.7)

    def test_walk_steps_maps_to_steps(self):
        analysis = {"data": {"actions": [{"category": "exercise", "subcategory": "walking",
                    "measurements": [{"metric": "count", "value": 10000, "unit": "steps"}], "times": []}]}}
        features = build_prediction_features("Walk 10,000 steps", "Fitness", 3, 50,
                    datetime(2026, 10, 4, tzinfo=timezone.utc), analysis, None)
        self.assertEqual(features["category"], "steps")
        self.assertEqual(features["goal_value"], 10000)

    def test_untrained_reading_stays_unknown(self):
        analysis = {"data": {"actions": [{"category": "reading", "subcategory": "book",
                    "measurements": [], "times": []}]}}
        features = build_prediction_features("Read a book", "Study", 2, 50,
                    datetime(2026, 10, 4, tzinfo=timezone.utc), analysis, None)
        self.assertEqual(features["category"], "book")
        self.assertTrue(features["is_new_category"])

    def test_missing_service_has_explicit_neutral_fallback(self):
        with patch.dict(os.environ, {"ML_API_URL": ""}, clear=False):
            with patch("ml_prediction.httpx.post", side_effect=AssertionError("should not call")):
                result = request_prediction({"difficulty": 5}, {})
        self.assertEqual(result["success_probability"], 0.5)
        self.assertEqual(result["yes_odds"], 2.0)
        self.assertEqual(result["no_odds"], 2.0)
        self.assertEqual(result["prediction_source"], "fallback")

    def test_fallback_factory_keeps_reason(self):
        self.assertEqual(fallback_prediction("timeout")["breakdown"]["fallback_reason"], "timeout")

    def test_history_aggregation_produces_population_and_personal_counts(self):
        history = build_history(_HistoryCursor(), "user-1", "study", "programming", "amount", "hours")
        self.assertEqual(history["user_overall"], {"attempts": 2, "successes": 1})
        self.assertEqual(history["user_category"], {"attempts": 1, "successes": 1})
        self.assertEqual(history["user_subgoal"], {"attempts": 1, "successes": 1})
        self.assertEqual(history["community_category"], {"attempts": 80, "successes": 50})
        self.assertEqual(history["community_subgoal"], {"attempts": 30, "successes": 18})
        self.assertEqual(history["current_streak"], 2)
        self.assertEqual(history["usual_value"], 2.0)

    def test_challenge_creation_calls_ml_and_stores_returned_probability_and_odds(self):
        import main

        row = {
            "id": "challenge-1", "user_id": "user-1", "title": "Study two hours",
            "category": "Study", "difficulty": 3, "confidence": 72,
            "visibility": "public", "deadline_at": datetime(2026, 10, 5, 4),
            "deadline_label": "Tomorrow · 9:00 PM", "probability": 73.5,
            "yes_odds": 1.36, "no_odds": 3.77, "analysis_json": None,
            "proof_plan_json": None, "user_input_json": "{}",
            "prediction_source": "trained", "prediction_model_version": "test-model",
            "prediction_meta_json": "{}", "result": None, "resolved_at": None,
            "created_at": datetime(2026, 10, 4, 12),
        }
        connection1, connection2 = _CreateFakeConnection(), _CreateFakeConnection(row)
        ml_result = {"success_probability": 0.735, "yes_odds": 1.36, "no_odds": 3.77,
                     "prediction_source": "trained", "model_version": "test-model",
                     "difficulty_used": 3, "breakdown": {"starting_rate": 0.61}}
        with patch.object(main, "get_connection", side_effect=[connection1, connection2]), \
             patch.object(main, "request_prediction", return_value=ml_result) as predict:
            response = TestClient(main.app).post("/users/user-1/challenges", json={
                "title": "Study two hours", "category": "Study", "difficulty": 3,
                "confidence": 72, "visibility": "public",
                "deadline_at": "2026-10-05T04:00:00Z", "deadline_label": "Tomorrow · 9:00 PM",
                "analysis": None,
            })
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["probability"], 73.5)
        self.assertEqual(response.json()["yes_odds"], 1.36)
        self.assertEqual(response.json()["no_odds"], 3.77)
        self.assertEqual(response.json()["prediction_source"], "trained")
        self.assertEqual(predict.call_count, 1)
        self.assertEqual(connection2.insert_values[9], 73.5)
        self.assertEqual(connection2.insert_values[10:12], (1.36, 3.77))

    def test_result_endpoint_is_idempotent_and_saves_prediction_features(self):
        import main

        persisted = {"result": None, "observations": {}}
        with patch.object(main, "get_connection", side_effect=lambda: _ResultFakeConnection(persisted)):
            client = TestClient(main.app)
            first = client.post("/users/user-1/challenges/challenge-1/result", json={"result": "success"})
            second = client.post("/users/user-1/challenges/challenge-1/result", json={"result": "success"})
        self.assertEqual(first.status_code, 200, first.text)
        self.assertTrue(first.json()["created"])
        self.assertFalse(second.json()["created"])
        self.assertEqual(persisted["result"], "success")
        self.assertEqual(len(persisted["observations"]), 1)
        saved = next(iter(persisted["observations"].values()))
        self.assertEqual(saved["source"], "app")
        self.assertEqual(saved["category"], "study")
        self.assertEqual(saved["goal"], 2)
        self.assertEqual(saved["success"], 1)
        history = build_history(_ResultFakeCursor(_ResultFakeConnection(persisted)),
                                "user-1", "study", "programming", "amount", "hours")
        self.assertEqual(history["user_overall"]["attempts"], 1)
        self.assertEqual(history["user_subgoal"]["successes"], 1, persisted)


class _CreateFakeConnection:
    def __init__(self, challenge_row=None):
        self.challenge_row = challenge_row
        self.cursor_instance = _CreateFakeCursor(self)
        self.insert_values = ()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def cursor(self):
        return self.cursor_instance


class _CreateFakeCursor:
    def __init__(self, connection):
        self.connection = connection
        self.current = None
        self.rows = []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, query, params=None):
        normalized = " ".join(query.split())
        if "SELECT id FROM users" in normalized:
            self.current = {"id": "user-1"}
        elif "COUNT(*) AS attempts" in normalized:
            self.current = {"attempts": 0, "successes": 0, "usual_value": None}
        elif "SELECT success FROM ml_observations" in normalized:
            self.rows = []
        elif normalized.startswith("INSERT INTO challenges"):
            self.connection.insert_values = params
        elif "SELECT * FROM challenges WHERE id = %s" in normalized:
            self.current = self.connection.challenge_row

    def fetchone(self):
        value, self.current = self.current, None
        return value

    def fetchall(self):
        value, self.rows = self.rows, []
        return value


class _ResultFakeConnection:
    def __init__(self, persisted):
        self.persisted = persisted
        self.cursor_instance = _ResultFakeCursor(self)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def cursor(self):
        return self.cursor_instance

    def begin(self):
        pass

    def commit(self):
        pass

    def rollback(self):
        pass


class _ResultFakeCursor:
    def __init__(self, connection):
        self.connection = connection
        self.current = None
        self.rows = []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, query, params=None):
        normalized = " ".join(query.split())
        observations = list(self.connection.persisted["observations"].values())
        if "COUNT(*) AS attempts" in normalized:
            if "AVG(CASE WHEN goal IS NOT NULL" in normalized:
                matches = [row for row in observations if row["source"] == "app"
                           and row["user_id"] == params[2] and row["category"] == params[3]
                           and row["subcategory"] == params[5] and row["goal_type"] == params[6]]
            elif "source = 'app'" in normalized:
                matches = observations
                matches = [row for row in matches if row["source"] == "app" and row["user_id"] == params[0]]
            else:
                matches = []
            if "AND category = %s" in normalized and "AVG(CASE WHEN goal IS NOT NULL" not in normalized:
                matches = [row for row in matches if row["category"] == params[1]]
            if "AND (goal_type = %s OR goal_type IS NULL)" in normalized and "AVG(CASE WHEN goal IS NOT NULL" not in normalized:
                matches = [row for row in matches if row["goal_type"] == params[1]]
            self.current = {"attempts": len(matches), "successes": sum(row["success"] for row in matches),
                            "usual_value": (sum(row["goal"] for row in matches if row["goal"] is not None) /
                                            max(1, len([row for row in matches if row["goal"] is not None])))}
        elif normalized.startswith("SELECT success FROM ml_observations"):
            self.rows = [{"success": row["success"]} for row in sorted(observations,
                         key=lambda item: item["occurred_at"], reverse=True)
                         if row["source"] == "app" and row["user_id"] == params[0]
                         and row["category"] == params[1]]
        elif normalized.startswith("SELECT * FROM challenges"):
            self.current = {
                "id": "challenge-1", "user_id": "user-1", "category": "Study",
                "result": self.connection.persisted["result"], "resolved_at": None,
                "prediction_meta_json": {"ml_request": {
                    "category": "study", "goal_type": "amount", "goal_value": 2,
                    "goal_unit": "hours", "target_hour": 21, "day_of_week": 0,
                }},
                "analysis_json": {"data": {"actions": [{"subcategory": "programming"}]}},
            }
        elif normalized.startswith("UPDATE challenges SET result"):
            self.connection.persisted["result"] = params[0]
        elif normalized.startswith("INSERT IGNORE INTO ml_observations"):
            names = ("id", "user_id", "challenge_id", "occurred_at", "app_category",
                     "category", "subcategory", "goal", "goal_unit", "goal_type",
                     "target_hour", "day_of_week", "success")
            values = {"source": "app", **dict(zip(names, params))}
            self.connection.persisted["observations"].setdefault(params[0], values)

    def fetchone(self):
        value, self.current = self.current, None
        return value

    def fetchall(self):
        value, self.rows = self.rows, []
        return value


class _HistoryCursor:
    def __init__(self):
        self.current = None
        self.rows = []

    def execute(self, query, params=()):
        normalized = " ".join(query.split())
        if normalized.startswith("SELECT success FROM ml_observations"):
            self.rows = [{"success": 1}, {"success": 1}, {"success": 0}]
        elif "AVG(CASE WHEN goal IS NOT NULL" in normalized:
            self.current = {"attempts": 1, "successes": 1, "usual_value": 2.0}
        elif "source IN ('fitbit', 'atus')" in normalized and "goal_type" in normalized:
            self.current = {"attempts": 30, "successes": 18}
        elif "source IN ('fitbit', 'atus')" in normalized:
            self.current = {"attempts": 80, "successes": 50}
        elif "category = %s" in normalized:
            self.current = {"attempts": 1, "successes": 1}
        else:
            self.current = {"attempts": 2, "successes": 1}

    def fetchone(self):
        value, self.current = self.current, None
        return value

    def fetchall(self):
        value, self.rows = self.rows, []
        return value


if __name__ == "__main__":
    unittest.main()
