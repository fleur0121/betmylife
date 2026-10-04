"""Opt-in real-model evaluation; run from repo root with --live --limit N."""
import argparse
import json
import unittest

from dotenv import load_dotenv
from fastapi import HTTPException
from backend import challenge_nlp as nlp
from backend.test_challenge_nlp import CASES, assert_subset


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', action='store_true', help='Make real, billable provider calls')
    parser.add_argument('--limit', type=int, default=5)
    args = parser.parse_args()
    if not args.live or not 1 <= args.limit <= len(CASES):
        parser.error(f'Use --live and --limit between 1 and {len(CASES)}')
    load_dotenv(nlp.ROOT / 'backend/.env')
    total = {'total_input_tokens': 0, 'total_output_tokens': 0}
    failures = 0
    for case in CASES[:args.limit]:
        request = nlp.AnalyzeRequest.model_validate({k: case[k] for k in ('text', 'submitted_at', 'timezone')})
        try:
            result = nlp.analyze(request)
        except HTTPException as error:
            print(json.dumps({'id': case['id'], 'error': error.detail}))
            # Stop on API/config failures to avoid spending more calls on a broken setup.
            raise SystemExit(1)
        for field in total:
            total[field] += result['usage'].get(field, 0)
        try:
            assert_subset(unittest.TestCase(), case['expected'], result['data'])
            if case['id'] in ('ambiguous-sleep', 'multiple-actions'):
                assert result['data']['actions'][0]['clarification_questions']
        except (AssertionError, KeyError, TypeError):
            failures += 1
            print(json.dumps({'id': case['id'], 'passed': False, 'actual': result['data']}))
        else:
            print(json.dumps({'id': case['id'], 'passed': True, 'usage': result['usage']}))
    print(json.dumps({'cases': args.limit, 'failures': failures, 'measured_tokens': total}))
    raise SystemExit(bool(failures))


if __name__ == '__main__':
    main()
