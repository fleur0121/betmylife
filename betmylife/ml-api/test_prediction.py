import unittest

from fastapi.testclient import TestClient

from main import app
from import_observations import _row


class PredictionApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["model_version"])

    def test_known_and_unknown_categories_return_capped_odds(self):
        for category in ("study", "exercise", "steps", "sleep", "not_a_trained_category"):
            with self.subTest(category=category):
                response = self.client.post("/predict", json={
                    "category": category,
                    "is_new_category": category.startswith("not_"),
                    "goal_value": 2 if category == "study" else None,
                    "goal_unit": "hours" if category == "study" else None,
                    "difficulty": 3,
                    "user_confidence": 0.5,
                })
                self.assertEqual(response.status_code, 200, response.text)
                prediction = response.json()
                self.assertGreater(prediction["success_probability"], 0)
                self.assertLess(prediction["success_probability"], 1)
                self.assertGreater(prediction["yes_odds"], 0)
                self.assertGreater(prediction["no_odds"], 0)
                self.assertIn("breakdown", prediction)

    def test_personal_history_moves_starting_rate(self):
        payload = {"category": "study", "goal_type": "amount", "goal_value": 2,
                   "goal_unit": "hours", "difficulty": 3, "user_confidence": 0.5}
        cold = self.client.post("/predict", json=payload).json()
        payload["history"] = {
            "user_overall": {"attempts": 12, "successes": 11},
            "user_category": {"attempts": 8, "successes": 8},
            "user_subgoal": {"attempts": 4, "successes": 4},
            "community_category": {"attempts": 100, "successes": 60},
            "community_subgoal": {"attempts": 40, "successes": 24},
            "current_streak": 4, "usual_value": 60,
        }
        personal = self.client.post("/predict", json=payload).json()
        self.assertIn("your record", personal["breakdown"]["starting_from"])
        self.assertNotEqual(cold["success_probability"], personal["success_probability"])

    def test_real_observation_import_is_stable_and_source_guarded(self):
        row = {"source": "fitbit", "user_id": "person-1", "date": "2016-04-12",
               "category": "steps", "goal_type": "amount", "goal": "10000",
               "day_of_week": "1", "target_hour": "22", "success": "1"}
        first = _row("fitbit", row)
        self.assertEqual(first, _row("fitbit", row))
        self.assertEqual(first[1], "fitbit")
        self.assertEqual(first[5], 10000.0)
        with self.assertRaises(ValueError):
            _row("fitbit", {**row, "source": "synthetic"})


if __name__ == "__main__":
    unittest.main()
