import json
import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import HTTPException

try:
    from backend import betting, main
except ImportError:
    import betting
    import main


class MemoryCursor:
    def __init__(self, db):
        self.db = db
        self.rowcount = 0
        self.result = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, values=()):
        sql = " ".join(query.split())
        db = self.db
        self.rowcount = 0
        self.result = None
        if sql.startswith("SELECT * FROM challenges WHERE id = %s FOR UPDATE"):
            row = db.challenges.get(values[0])
            self.result = dict(row) if row else None
        elif sql.startswith("SELECT * FROM challenges WHERE id = %s AND user_id = %s"):
            row = db.challenges.get(values[0])
            self.result = dict(row) if row and row["user_id"] == values[1] else None
        elif sql.startswith("SELECT id FROM challenge_predictions"):
            challenge_id, user_id = values
            self.result = next(
                ({"id": p["id"]} for p in db.predictions.values()
                 if (p["challenge_id"], p["user_id"]) == (challenge_id, user_id)),
                None,
            )
        elif sql.startswith("SELECT id, user_id, choice, stake, locked_odds FROM challenge_predictions"):
            self.result = [dict(p) for p in db.predictions.values()
                           if p["challenge_id"] == values[0] and p["status"] == "active"]
        elif sql.startswith("SELECT id, points FROM users"):
            user_id = values[0]
            self.result = {"id": user_id, "points": db.points[user_id]} if user_id in db.points else None
        elif sql.startswith("SELECT state_json FROM user_app_states"):
            state = db.states.get(values[0])
            self.result = {"state_json": json.dumps(state)} if state is not None else None
        elif sql.startswith("SELECT badge_id"):
            self.result = []
        elif sql.startswith("SELECT reason, amount, created_at FROM point_transactions"):
            self.result = [
                {"reason": reason, "amount": amount, "created_at": datetime(2026, 10, 1)}
                for (user_id, reason), amount in db.ledger.items() if user_id == values[0]
            ]
        elif sql.startswith("INSERT IGNORE INTO point_transactions"):
            user_id, reason, amount = values
            if (user_id, reason) not in db.ledger:
                db.ledger[(user_id, reason)] = amount
                self.rowcount = 1
        elif sql.startswith("UPDATE users SET points"):
            db.points[values[1]] = values[0]
            self.rowcount = 1
        elif sql.startswith("UPDATE user_app_states SET state_json"):
            db.states[values[1]] = json.loads(values[0])
            self.rowcount = 1
        elif sql.startswith("INSERT INTO user_app_states"):
            db.states[values[0]] = json.loads(values[2])
            self.rowcount = 1
        elif sql.startswith("INSERT INTO challenge_predictions"):
            prediction_id, challenge_id, user_id, choice, stake, odds = values
            db.predictions[prediction_id] = {
                "id": prediction_id, "challenge_id": challenge_id, "user_id": user_id,
                "choice": choice, "stake": stake, "locked_odds": odds,
                "status": "active", "payout": None,
            }
            self.rowcount = 1
        elif sql.startswith("UPDATE challenges SET yes_pool") or sql.startswith("UPDATE challenges SET no_pool"):
            pool = "yes_pool" if "yes_pool" in sql else "no_pool"
            db.challenges[values[1]][pool] += values[0]
            self.rowcount = 1
        elif sql.startswith("UPDATE challenges SET result"):
            row = db.challenges[values[2]]
            row["result"], row["resolved_at"] = values[0], values[1]
            self.rowcount = 1
        elif sql.startswith("UPDATE challenge_predictions SET status"):
            status, payout, _settled_at, prediction_id = values
            db.predictions[prediction_id].update(status=status, payout=payout)
            self.rowcount = 1
        elif sql.startswith("INSERT IGNORE INTO ml_observations"):
            self.rowcount = 1
        else:
            raise AssertionError(f"Unexpected SQL: {sql}")

    def fetchone(self):
        return self.result

    def fetchall(self):
        return self.result


class MemoryDb:
    def __init__(self):
        deadline = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=1)
        self.challenges = {
            "c1": {
                "id": "c1", "user_id": "author", "category": "Fitness",
                "probability": 40.0, "yes_odds": 2.5, "no_odds": 1.67,
                "yes_pool": 0, "no_pool": 0, "deadline_at": deadline,
                "result": None, "resolved_at": None,
                "prediction_meta_json": None, "analysis_json": None,
            }
        }
        self.points = {"author": 100, "alice": 500, "bob": 500}
        self.states = {name: {"wallet": pts, "transactions": []} for name, pts in self.points.items()}
        self.ledger = {}
        self.predictions = {}

    def begin(self):
        pass

    def commit(self):
        pass

    def rollback(self):
        pass

    def cursor(self):
        return MemoryCursor(self)


class LiveOddsTests(unittest.TestCase):
    def test_empty_pools_return_opening_odds_less_margin(self):
        with patch.object(betting, "HOUSE_MARGIN", 0):
            self.assertEqual(betting.live_odds(0.4, 2.5, 1.67, 0, 0), (2.5, 1.67))
        with patch.object(betting, "HOUSE_MARGIN", 0.05):
            self.assertEqual(betting.live_odds(0.5, 2.0, 2.0, 0, 0), (1.9, 1.9))

    def test_margin_gives_the_house_an_edge(self):
        yes, no = betting.live_odds(0.4, 2.5, 1.67, 300, 100)
        self.assertGreater(1 / yes + 1 / no, 1)

    def test_money_on_yes_shortens_yes_and_lengthens_no(self):
        yes, no = betting.live_odds(0.4, 2.5, 1.67, 200, 0)
        self.assertLess(yes, 2.5)
        self.assertGreater(no, 1.67)

    def test_one_max_bet_only_nudges_the_line(self):
        yes, _ = betting.live_odds(0.5, 2.0, 2.0, betting.MAX_STAKE, 0)
        self.assertGreater(yes, 1.5)

    def test_lopsided_pools_stay_bounded(self):
        yes, no = betting.live_odds(0.5, 2.0, 2.0, 10**9, 0)
        self.assertGreaterEqual(yes, betting.MIN_ODDS)
        self.assertLess(no, 100)

    def test_payout_rounds_halves_up_like_the_client(self):
        self.assertEqual(betting.payout(25, 2.5), 63)  # 62.5


class PlacePredictionTests(unittest.TestCase):
    def setUp(self):
        self.db = MemoryDb()

        @contextmanager
        def get_connection():
            yield self.db

        patcher = patch.object(main, "get_connection", get_connection)
        patcher.start()
        self.addCleanup(patcher.stop)

    def bet(self, user, choice="yes", stake=100, expected=None):
        return main.place_prediction(
            user, "c1",
            main.PredictionCreateRequest(choice=choice, stake=stake, expected_odds=expected),
        )

    def assert_http(self, status, fn):
        with self.assertRaises(HTTPException) as error:
            fn()
        self.assertEqual(error.exception.status_code, status)
        return error.exception

    def test_bet_locks_live_odds_moves_pool_and_debits_wallet(self):
        opening_yes, _ = betting.challenge_live_odds(self.db.challenges["c1"])
        self.assertLess(opening_yes, 2.5)
        first = self.bet("alice", expected=opening_yes)
        self.assertEqual(first.locked_odds, opening_yes)
        self.assertEqual(first.wallet, 400)
        self.assertEqual(self.db.points["alice"], 400)
        self.assertEqual(self.db.states["alice"]["wallet"], 400)
        self.assertEqual(self.db.states["alice"]["transactions"], [first.transaction])
        self.assertEqual(self.db.challenges["c1"]["yes_pool"], 100)
        self.assertLess(first.yes_odds, opening_yes)

        second = self.bet("bob")
        self.assertEqual(second.locked_odds, first.yes_odds)

    def test_stale_expected_odds_are_refused_without_charging(self):
        self.bet("alice")
        error = self.assert_http(409, lambda: self.bet("bob", expected=2.3))
        self.assertEqual(error.detail["message"], "Odds changed")
        self.assertEqual(self.db.points["bob"], 500)
        self.assertEqual(self.db.challenges["c1"]["yes_pool"], 100)

    def test_author_duplicate_closed_and_overdrawn_bets_are_refused(self):
        self.assert_http(403, lambda: self.bet("author"))
        self.bet("alice")
        self.assert_http(409, lambda: self.bet("alice", choice="no"))
        self.db.points["bob"] = 50
        self.db.states["bob"]["wallet"] = 50
        self.assert_http(409, lambda: self.bet("bob"))
        self.assertEqual(self.db.challenges["c1"]["no_pool"], 0)
        self.db.challenges["c1"]["deadline_at"] = (
            datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=30)
        )
        self.db.points["bob"] = 500
        self.assert_http(409, lambda: self.bet("bob"))

    def test_resolving_pays_winners_once(self):
        alice = self.bet("alice", choice="yes", stake=100)
        self.bet("bob", choice="no", stake=100)
        request = main.ChallengeResultRequest(result="success")
        main.record_challenge_result("author", "c1", request)
        main.record_challenge_result("author", "c1", request)

        expected = 400 + betting.payout(100, alice.locked_odds)
        self.assertEqual(self.db.points["alice"], expected)
        self.assertEqual(self.db.states["alice"]["wallet"], expected)
        self.assertEqual(self.db.points["bob"], 400)
        statuses = sorted(p["status"] for p in self.db.predictions.values())
        self.assertEqual(statuses, ["lost", "won"])

    def test_stale_client_save_keeps_server_debit(self):
        stale_client = {"wallet": 500, "transactions": []}
        self.bet("alice", stake=100)
        for _ in range(2):
            main.save_app_state(
                "alice", main.AppStateRequest(version=2, data=dict(stale_client))
            )
            self.assertEqual(self.db.points["alice"], 400)

        reloaded = self.db.states["alice"]
        main.save_app_state("alice", main.AppStateRequest(version=2, data=reloaded))
        self.assertEqual(self.db.points["alice"], 400)


if __name__ == "__main__":
    unittest.main()
