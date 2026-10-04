import json
import unittest
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import patch

from backend import main


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
        if normalized.startswith("SELECT id, points FROM users"):
            self.result = {"id": "user-1", "points": self.connection.user_points}
        elif normalized.startswith("INSERT IGNORE INTO user_achievements"):
            _, badge_id, reward = values
            if badge_id not in self.connection.badges:
                self.connection.badges[badge_id] = {
                    "badge_id": badge_id,
                    "unlocked_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
                    "reward_points_granted": reward,
                }
                self.rowcount = 1
        elif normalized.startswith("INSERT IGNORE INTO point_transactions"):
            _, reason, amount = values
            if reason not in self.connection.transactions:
                self.connection.transactions[reason] = amount
                self.rowcount = 1
        elif normalized.startswith("SELECT badge_id, unlocked_at, reward_points_granted FROM user_achievements"):
            _, badge_id = values
            self.result = self.connection.badges.get(badge_id)
        elif normalized.startswith("SELECT state_json FROM user_app_states"):
            self.result = {"state_json": json.dumps(self.connection.state)}
        elif normalized.startswith("UPDATE users SET points"):
            self.connection.user_points = values[0]
            self.rowcount = 1
        elif normalized.startswith("UPDATE user_app_states SET state_json"):
            self.connection.state = json.loads(values[0])
            self.rowcount = 1
        else:
            raise AssertionError(f"Unexpected SQL: {normalized}")

    def fetchone(self):
        return self.result


class MemoryConnection:
    def __init__(self):
        self.user_points = 100
        self.badges = {}
        self.transactions = {}
        self.state = {"wallet": 100, "transactions": []}

    def begin(self):
        pass

    def commit(self):
        pass

    def rollback(self):
        raise AssertionError("Unexpected transaction rollback")

    def cursor(self):
        return MemoryCursor(self)


class BadgeClaimTests(unittest.TestCase):
    def test_repeated_claim_grants_reward_once(self):
        connection = MemoryConnection()

        @contextmanager
        def get_connection():
            yield connection

        with patch.object(main, "get_connection", get_connection):
            first = main.claim_badge("user-1", "first_challenge")
            second = main.claim_badge("user-1", "first_challenge")

        self.assertTrue(first.created)
        self.assertTrue(first.reward_granted)
        self.assertFalse(second.created)
        self.assertFalse(second.reward_granted)
        self.assertEqual(connection.user_points, 150)
        self.assertEqual(first.wallet, 150)
        self.assertEqual(second.wallet, 150)
        self.assertEqual(connection.transactions, {"BADGE_REWARD:first_challenge": 50})
        self.assertEqual(len(connection.badges), 1)


if __name__ == "__main__":
    unittest.main()
