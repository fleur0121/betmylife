"""Offline fixtures test code behavior; they are NOT measured LLM extractions."""
import json
import os
import io
from contextlib import redirect_stdout
import unittest
from unittest.mock import patch

import httpx
from fastapi import HTTPException
from pydantic import ValidationError

from backend import challenge_nlp as nlp

CASES = json.loads((nlp.ROOT / 'shared/challenge-examples.json').read_text())


def assert_subset(test, expected, actual):
    if isinstance(expected, dict):
        for key, value in expected.items():
            assert_subset(test, value, actual[key])
    elif isinstance(expected, list):
        test.assertEqual(len(expected), len(actual))
        for want, got in zip(expected, actual):
            assert_subset(test, want, got)
    else:
        test.assertEqual(expected, actual)


class NlpTests(unittest.TestCase):
    def setUp(self):
        self.case = json.loads(json.dumps(CASES[0]))

    def normalize(self, case=None):
        case = case or self.case
        return nlp.normalize(nlp.Extraction.model_validate(case['fixture']), nlp.AnalyzeRequest.model_validate({k: case[k] for k in ('text', 'submitted_at', 'timezone')}))

    def test_expected_fixtures(self):
        for case in CASES:
            with self.subTest(case=case['id']):
                result = self.normalize(case)
                assert_subset(self, case['expected'], result)
                self.assertEqual(case['text'], result['source_text'])
                if case['id'] in ('ambiguous-sleep', 'multiple-actions'):
                    self.assertTrue(result['actions'][0]['clarification_questions'])

    def test_invalid_pair(self):
        self.case['fixture']['actions'][0]['subcategory'] = 'running'
        with self.assertRaises(ValueError):
            self.normalize()

    def test_negative_value(self):
        self.case['fixture']['actions'][0]['measurements'][0]['value'] = -1
        with self.assertRaises(ValueError):
            self.normalize()

    def test_unrecognized_unit(self):
        self.case['fixture']['actions'][0]['measurements'][0]['unit'] = 'fortnights'
        result = self.normalize()
        self.assertIsNone(result['actions'][0]['measurements'][0]['value'])
        self.assertTrue(result['actions'][0]['clarification_questions'])

    def test_no_unbacked_confidence(self):
        self.case['fixture']['user_reported']['confidence_percent'] = 100
        with self.assertRaises(ValueError):
            self.normalize()

    def test_invalid_date(self):
        case = json.loads(json.dumps(CASES[6]))
        case['fixture']['actions'][0]['times'][0]['date_text'] = '2026-02-30'
        result = self.normalize(case)
        self.assertIsNone(result['actions'][0]['times'][0]['date'])
        self.assertTrue(result['actions'][0]['clarification_questions'])

    def test_timezone_boundary(self):
        case = json.loads(json.dumps(CASES[6]))
        case['submitted_at'] = '2026-10-04T02:00:00Z'  # Still Oct 3 in Vancouver.
        self.assertEqual(self.normalize(case)['actions'][0]['times'][0]['date'], '2026-10-04')

    def test_dst_nonexistent_and_ambiguous(self):
        for day in ('2025-03-09', '2025-11-02'):
            case = json.loads(json.dumps(CASES[6]))
            case['timezone'] = 'America/New_York'
            point = case['fixture']['actions'][0]['times'][0]
            point['date_text'] = day
            point['clock_time'] = '02:30' if '03-09' in day else '01:30'
            result = self.normalize(case)
            self.assertIsNone(result['actions'][0]['times'][0]['resolved_at'])
            self.assertTrue(result['actions'][0]['clarification_questions'])

    def test_invalid_request_context(self):
        for change in ({'timezone': 'Not/AZone'}, {'submitted_at': '2026-10-03T12:00:00'}, {'text': ' '}, {'text': 'x' * 1001}):
            with self.assertRaises(ValidationError):
                nlp.AnalyzeRequest.model_validate({'text': 'sleep', 'timezone': 'America/Vancouver', 'submitted_at': '2026-10-03T12:00:00Z', **change})

    def test_schema_matches_shared_file(self):
        shared = json.loads((nlp.ROOT / 'shared/challenge-extraction.schema.json').read_text())
        self.assertEqual(nlp.Extraction.model_json_schema(), shared)
        shared_response = json.loads((nlp.ROOT / 'shared/challenge-analysis.schema.json').read_text())
        self.assertEqual(nlp.AnalyzeResponse.model_json_schema(), shared_response)

    def test_numeric_conflicts_and_bed_sleep_distinction(self):
        case = json.loads(json.dumps(CASES[0]))
        case['fixture']['actions'][0]['measurements'].append({'original': '7 hours', 'metric': 'sleep_duration', 'value': 6, 'unit': 'hours', 'operator': 'lt'})
        with self.assertRaises(ValueError):
            self.normalize(case)
        case = json.loads(json.dumps(CASES[0]))
        case['fixture']['actions'][0]['subcategory'] = 'bedtime'
        with self.assertRaises(ValueError):
            self.normalize(case)

    def test_response_model(self):
        data = self.normalize()
        parsed = nlp.AnalyzeResponse(data=data, usage={}, model='test', cached=False)
        self.assertEqual(parsed.data.source_text, self.case['text'])

    def test_endpoint_logs_results_and_failures(self):
        from backend import main
        request = nlp.AnalyzeRequest(text=self.case['text'], submitted_at=self.case['submitted_at'], timezone=self.case['timezone'])
        result = {'data': self.normalize(), 'usage': {}, 'model': 'test', 'cached': True}
        output = io.StringIO()
        with patch.object(main, 'analyze', return_value=result), redirect_stdout(output):
            self.assertEqual(main.challenge_analyze(request), result)
        self.assertIn('[challenge-nlp] analyzed', output.getvalue())
        self.assertIn('[challenge-nlp] requested', output.getvalue())
        self.assertIn('"sleep_duration"', output.getvalue())
        self.assertIn('"cached": true', output.getvalue())
        output = io.StringIO()
        with patch.object(main, 'analyze', side_effect=HTTPException(502, detail={'code': 'nlp_provider_busy', 'provider_status': 503})), redirect_stdout(output):
            with self.assertRaises(HTTPException):
                main.challenge_analyze(request)
        self.assertIn('[challenge-nlp] failed', output.getvalue())
        self.assertIn('503', output.getvalue())

    def test_current_steps_and_legacy_outputs(self):
        raw = json.dumps(self.case['fixture'])
        response = {'steps': [
            {'type': 'model_output', 'content': [{'type': 'thought', 'text': 'Do not extract reasoning'}]},
            {'type': 'tool_result', 'content': []},
            {'type': 'model_output', 'content': [{'type': 'text', 'text': raw[:20]}, {'type': 'text', 'text': raw[20:]}]},
        ]}
        self.assertEqual(nlp.output_text(response), raw)
        self.assertEqual(nlp.output_text({'outputs': [{'type': 'text', 'text': raw}]}), raw)
        self.assertEqual(nlp.output_text({'steps': []}), '')

    def test_current_provider_response_end_to_end(self):
        request = nlp.AnalyzeRequest(text=self.case['text'], submitted_at=self.case['submitted_at'], timezone=self.case['timezone'])
        upstream = {'status': 'completed', 'steps': [{'type': 'model_output', 'content': [{'type': 'text', 'text': json.dumps(self.case['fixture'])}]}], 'usage': {}}
        nlp._cache.clear()
        nlp._calls = 0
        transport = httpx.MockTransport(lambda req: httpx.Response(200, json=upstream))
        with patch.dict(os.environ, {'GEMINI_API_KEY': 'test-key'}), patch.object(nlp.httpx, 'HTTPTransport', return_value=transport):
            result = nlp.analyze(request)
        self.assertEqual(result['data']['actions'][0]['measurements'][0]['value'], 25200)
        nlp._cache.clear()
        nlp._calls = 0

    def test_provider_failure_incomplete_cache_and_limit(self):
        request = nlp.AnalyzeRequest(text=self.case['text'], submitted_at=self.case['submitted_at'], timezone=self.case['timezone'])
        upstream = {'status': 'completed', 'outputs': [{'type': 'text', 'text': json.dumps(self.case['fixture'])}], 'usage': {'total_input_tokens': 100, 'total_output_tokens': 50}}
        for response, expected_code in [({'status': 'incomplete'}, 'nlp_incomplete'), ({'status': 'completed', 'outputs': []}, 'nlp_validation_failed'), (None, 'nlp_provider_busy')]:
            nlp._cache.clear()
            nlp._calls = 0
            def handler(req):
                return httpx.Response(503 if response is None else 200, json=response or {})
            transport = httpx.MockTransport(handler)
            with patch.dict(os.environ, {'GEMINI_API_KEY': 'test-key'}), patch.object(nlp.httpx, 'HTTPTransport', return_value=transport):
                with self.assertRaises(HTTPException) as error:
                    nlp.analyze(request)
                self.assertEqual(error.exception.detail['code'], expected_code)
                self.assertEqual(nlp._calls, 1)
        nlp._cache.clear()
        nlp._calls = 0
        transport = httpx.MockTransport(lambda req: httpx.Response(200, json=upstream))
        with patch.dict(os.environ, {'GEMINI_API_KEY': 'test-key', 'NLP_MAX_CALLS': '1'}), patch.object(nlp.httpx, 'HTTPTransport', return_value=transport):
            self.assertFalse(nlp.analyze(request)['cached'])
            self.assertTrue(nlp.analyze(request)['cached'])
            with self.assertRaises(HTTPException) as error:
                nlp.analyze(request.model_copy(update={'text': 'Another challenge'}))
            self.assertEqual(error.exception.status_code, 429)
        nlp._cache.clear()
        nlp._calls = 0


if __name__ == '__main__':
    unittest.main()
