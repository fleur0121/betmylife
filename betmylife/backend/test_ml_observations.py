import unittest
import json
from contextlib import contextmanager
from datetime import datetime
from unittest.mock import patch

from fastapi import HTTPException

try:
    from backend import main
except ImportError:
    import main


class MemoryCursor:
    def __init__(self, connection):
        self.connection = connection
        self.rowcount = 0
        self.result = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, values=()):
        normalized = " ".join(query.split())
        self.rowcount = 0
        self.result = None
        if normalized.startswith("SELECT id, category, created_at, deadline_at, analysis_json, user_input_json, result, resolved_at FROM challenges"):
            challenge_id, user_id = values
            if (challenge_id, user_id) == ("challenge-1", "user-1"):
                self.result = {
                    "id": challenge_id,
                    "category": "Fitness",
                    "created_at": datetime(2026, 10, 1, 9),
                    "deadline_at": datetime(2026, 10, 2, 9),
                    "user_input_json": {"timezone": "America/Los_Angeles"},
                    "result": self.connection.challenge_result,
                    "resolved_at": self.connection.resolved_at,
                    "analysis_json": {
                        "data": {
                            "context": {"timezone": "America/Los_Angeles"},
                            "actions": [
                                {
                                    "category": "exercise",
                                    "subcategory": "running",
                                    "measurements": [{"value": 5, "unit": "km"}],
                                    "times": [{"kind": "event", "clock_time": "07:30"}],
                                    "conditions": {"weather_requirement": "rain"},
                                }
                            ],
                        }
                    },
                }
        elif normalized.startswith("SELECT id FROM users WHERE id = %s"):
            self.result = {"id": values[0]}
        elif normalized.startswith("INSERT INTO challenges"):
            self.connection.challenge_values = values
            self.rowcount = 1
        elif normalized.startswith("SELECT * FROM challenges WHERE id = %s"):
            values = self.connection.challenge_values
            self.result = {
                "id": values[0],
                "user_id": values[1],
                "title": values[2],
                "category": values[3],
                "difficulty": values[4],
                "confidence": values[5],
                "visibility": values[6],
                "deadline_at": values[7],
                "deadline_label": values[8],
                "probability": values[9],
                "yes_odds": values[10],
                "no_odds": values[11],
                "user_input_json": values[12],
                "analysis_json": values[13],
                "proof_plan_json": values[14],
                "created_at": datetime(2026, 10, 1, 9),
                "result": None,
                "resolved_at": None,
            }
        elif normalized.startswith("UPDATE challenges SET result = %s"):
            self.connection.challenge_result = values[0]
            self.connection.resolved_at = values[1]
            self.rowcount = 1
        elif normalized.startswith("INSERT IGNORE INTO ml_observations"):
            observation_id = values[0]
            if observation_id not in self.connection.observations:
                self.connection.observations[observation_id] = values
                self.rowcount = 1
        else:
            raise AssertionError(f"Unexpected SQL: {normalized}")

    def fetchone(self):
        return self.result


class MemoryConnection:
    def __init__(self):
        self.observations = {}
        self.challenge_values = ()
        self.challenge_result = None
        self.resolved_at = None
        self.rollbacks = 0

    def begin(self):
        pass

    def commit(self):
        pass

    def rollback(self):
        self.rollbacks += 1

    def cursor(self):
        return MemoryCursor(self)


class MlObservationTests(unittest.TestCase):
    def test_raw_user_input_is_stored_separately_from_display_title(self):
        connection = MemoryConnection()
        raw_title = "  By tomorrow, run 5 km.  "
        user_input = {
            "title": raw_title,
            "category": "Fitness",
            "deadline_at": "2026-10-05T07:00:00-07:00",
            "timezone": "America/Los_Angeles",
        }
        analysis = {
            "data": {"source_text": raw_title, "actions": []},
            "model": "test-model",
        }

        @contextmanager
        def get_connection():
            yield connection

        request = main.ChallengeCreateRequest(
            title=raw_title,
            category="Fitness",
            difficulty=3,
            confidence=70,
            visibility="public",
            deadline_at="2026-10-05T14:00:00Z",
            deadline_label="Tomorrow · 7:00 AM",
            probability=50,
            yes_odds=2,
            no_odds=2,
            user_input=user_input,
            analysis=analysis,
        )
        with patch.object(main, "get_connection", get_connection):
            saved = main.create_challenge("user-1", request)

        self.assertEqual(saved.title, raw_title.strip())
        saved_values = connection.challenge_values
        self.assertEqual(json.loads(saved_values[12]), user_input)
        self.assertEqual(json.loads(saved_values[13]), analysis)
        self.assertEqual(saved.user_input, user_input)

    def test_challenge_result_is_saved_once(self):
        connection = MemoryConnection()

        @contextmanager
        def get_connection():
            yield connection

        with patch.object(main, "get_connection", get_connection):
            first = main.save_challenge_result(
                "user-1",
                "challenge-1",
                main.ChallengeResultRequest(outcome="success"),
            )
            second = main.save_challenge_result(
                "user-1",
                "challenge-1",
                main.ChallengeResultRequest(outcome="success"),
            )

        self.assertTrue(first["created"])
        self.assertFalse(second["created"])
        self.assertEqual(first["observation_id"], second["observation_id"])
        self.assertEqual(len(connection.observations), 1)
        self.assertEqual(connection.challenge_result, "success")
        self.assertIsNotNone(connection.resolved_at)
        saved_values = next(iter(connection.observations.values()))
        self.assertEqual(saved_values[1:3], ("user-1", "challenge-1"))
        self.assertEqual(saved_values[4:11], (
            "Fitness", "exercise", "running", 5, "km", 7, "rain"
        ))
        self.assertEqual(saved_values[-1], 1)

    def test_result_requires_challenge_ownership(self):
        connection = MemoryConnection()

        @contextmanager
        def get_connection():
            yield connection

        with patch.object(main, "get_connection", get_connection):
            with self.assertRaises(HTTPException) as error:
                main.save_challenge_result(
                    "another-user",
                    "challenge-1",
                    main.ChallengeResultRequest(outcome="failed"),
                )

        self.assertEqual(error.exception.status_code, 404)
        self.assertEqual(connection.observations, {})

    def test_result_cannot_be_changed_after_finalization(self):
        connection = MemoryConnection()
        connection.challenge_result = "success"
        connection.resolved_at = datetime(2026, 10, 2, 9)

        @contextmanager
        def get_connection():
            yield connection

        with patch.object(main, "get_connection", get_connection):
            with self.assertRaises(HTTPException) as error:
                main.save_challenge_result(
                    "user-1",
                    "challenge-1",
                    main.ChallengeResultRequest(outcome="failed"),
                )

        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(connection.observations, {})


if __name__ == "__main__":
    unittest.main()