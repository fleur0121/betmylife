"""In-process contract test: backend feature/history request -> real model API."""
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "ml-api"))

from main import app as ml_app  # noqa: E402
from ml_prediction import build_prediction_features, request_prediction  # noqa: E402


class InProcessResponse:
    def __init__(self, response):
        self.response = response

    def raise_for_status(self):
        if self.response.status_code >= 400:
            raise RuntimeError(self.response.text)

    def json(self):
        return self.response.json()


class BackendToModelContractTests(unittest.TestCase):
    def test_nlp_features_and_todb_history_reach_real_model_api(self):
        nlp = {"data": {
            "context": {"submitted_at": "2026-10-04T12:00:00-07:00", "timezone": "America/Vancouver"},
            "actions": [{"category": "learning", "subcategory": "programming",
                         "measurements": [{"metric": "activity_duration", "value": 2, "unit": "hours"}],
                         "times": [{"kind": "deadline", "clock_time": "21:00"}]}],
            "user_reported": {"confidence_percent": None},
        }}
        features = build_prediction_features(
            "I will study for 2 hours before 9 PM", "Study", 3, 70,
            datetime(2026, 10, 5, 4, tzinfo=timezone.utc), nlp, None,
        )
        history = {
            "user_overall": {"attempts": 1, "successes": 1},
            "user_category": {"attempts": 1, "successes": 1},
            "user_subgoal": {"attempts": 1, "successes": 1},
            "community_category": {"attempts": 100, "successes": 61},
            "community_subgoal": {"attempts": 40, "successes": 25},
            "current_streak": 1,
            "usual_value": 2,
        }
        client = TestClient(ml_app)
        sent = {}

        def in_process_post(url, json, timeout):
            sent.update(json)
            return InProcessResponse(client.post("/predict", json=json))

        with patch.dict("os.environ", {"ML_API_URL": "http://ml-api:8000/predict"}), \
             patch("ml_prediction.httpx.post", side_effect=in_process_post):
            prediction = request_prediction(features, history)

        self.assertNotEqual(prediction["prediction_source"], "fallback")
        self.assertEqual(sent["category"], "study")
        self.assertEqual(sent["goal_value"], 2)
        self.assertEqual(sent["target_hour"], 21)
        self.assertEqual(sent["history"]["user_subgoal"]["successes"], 1)
        self.assertGreater(prediction["yes_odds"], 0)
        self.assertGreater(prediction["no_odds"], 0)


if __name__ == "__main__":
    unittest.main()
