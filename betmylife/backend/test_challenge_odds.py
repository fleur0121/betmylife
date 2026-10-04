import os
import unittest
from unittest.mock import patch

try:
    from backend import main
except ImportError:
    import main


class FakeResponse:
    def raise_for_status(self):
        pass

    def json(self):
        return {"probability": 42.5, "yes_odds": 2.35, "no_odds": 1.74}


class ChallengeOddsTests(unittest.TestCase):
    def make_request(self):
        return main.ChallengeCreateRequest(
            title="Run 5 km by tomorrow morning",
            category="Fitness",
            difficulty=3,
            confidence=70,
            visibility="public",
            deadline_at="2026-10-05T14:00:00Z",
            deadline_label="Tomorrow · 7:00 AM",
            user_input={"timezone": "America/Los_Angeles"},
            analysis={
                "data": {
                    "context": {"timezone": "America/Los_Angeles"},
                    "actions": [
                        {
                            "category": "exercise",
                            "times": [
                                {
                                    "kind": "event",
                                    "resolved_at": "2026-10-05T01:30:00Z",
                                }
                            ],
                        }
                    ],
                }
            },
        )

    def test_context_uses_nlp_category_and_local_event_day_and_hour(self):
        context = main._challenge_prediction_context(self.make_request())

        self.assertEqual(context, {
            "category": "exercise",
            "target_hour": 18,
            "day_of_week": 6,
        })

    def test_post_uses_model_odds(self):
        with patch.dict(os.environ, {"ODDS_API_URL": "http://ml-odds:8001/predict"}):
            with patch.object(main.httpx, "post", return_value=FakeResponse()) as post:
                result = main._challenge_odds("user-123", self.make_request())

        self.assertEqual(result, (42.5, 2.35, 1.74))
        self.assertEqual(post.call_args.args[0], "http://ml-odds:8001/predict")
        self.assertEqual(post.call_args.kwargs["json"], {
            "user_id": "user-123",
            "category": "exercise",
            "target_hour": 18,
            "day_of_week": 6,
        })

    def test_model_unavailable_or_unconfigured_uses_neutral_odds(self):
        with patch.dict(os.environ, {"ODDS_API_URL": "http://ml-odds:8001/predict"}):
            with patch.object(main.httpx, "post", side_effect=main.httpx.ConnectError("offline")):
                self.assertEqual(
                    main._challenge_odds("user-123", self.make_request()),
                    (50.0, 2.0, 2.0),
                )
        with patch.dict(os.environ):
            os.environ.pop("ODDS_API_URL", None)
            self.assertEqual(
                main._challenge_odds("user-123", self.make_request()),
                (50.0, 2.0, 2.0),
            )


if __name__ == "__main__":
    unittest.main()
