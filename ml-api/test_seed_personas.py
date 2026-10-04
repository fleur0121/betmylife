import unittest
from datetime import date
from zoneinfo import ZoneInfo

import numpy as np

import seed_personas


class SeedPersonasTests(unittest.TestCase):
    def generate(self):
        general = seed_personas.GeneralModel()
        rng = np.random.default_rng(7)
        return {
            persona.key: seed_personas.generate(
                persona, general, date(2026, 10, 4), 84, ZoneInfo("Asia/Tokyo"), rng
            )
            for persona in seed_personas.PERSONAS
        }

    def test_demo_challenge_ranks_personas_by_their_history(self):
        demos = {key: rows[2] for key, rows in self.generate().items()}

        self.assertTrue(all(demo["title"] == seed_personas.DEMO_TITLE for demo in demos.values()))
        self.assertTrue(all(demo["result"] is None for demo in demos.values()))
        self.assertGreater(demos["maya"]["probability"], 75)
        self.assertLess(demos["sora"]["probability"], demos["leo"]["probability"])
        self.assertLess(demos["leo"]["probability"], demos["maya"]["probability"])
        # Leo claims 90% but is priced near a coin flip.
        self.assertEqual(demos["leo"]["confidence"], 90)
        self.assertLess(demos["leo"]["probability"], 60)

    def test_every_challenge_has_one_linked_observation(self):
        for challenges, observations, _ in self.generate().values():
            self.assertEqual(
                [row["id"] for row in challenges],
                [row["challenge_id"] for row in observations],
            )
            for challenge, observation in zip(challenges, observations):
                self.assertEqual(
                    challenge["result"] == "success", bool(observation["success"])
                )

    def test_generation_is_deterministic(self):
        first, second = self.generate(), self.generate()

        for key in first:
            self.assertEqual(first[key][2]["probability"], second[key][2]["probability"])
            self.assertEqual(
                [row["success"] for row in first[key][1]],
                [row["success"] for row in second[key][1]],
            )


if __name__ == "__main__":
    unittest.main()
