import copy
import re
import unittest

from gaze.incident_pdf import render_incident_pdf, validate_report


def report(mode='image'):
    return {'schemaVersion': 1, 'mode': mode, 'id': 'synthetic-test', 'source': 'Authorized test source',
            'generatedAt': '2026-11-18T00:00:00Z', 'metadata': [['Method', 'baseline']],
            'summary': 'Synthetic observations for human review, not a misconduct finding.',
            'items': [{'label': 'Seat A: left', 'time': '00:02.00 to 00:04.00', 'detail': 'Repeated movement record.',
                       'status': 'Follow-up needed', 'notes': 'Check the source footage.'}],
            'omittedItems': 0, 'coverage': ['Seat A: 1.5 seconds unavailable.'], 'notes': 'Proctor notes.',
            'reviewer': 'Test reviewer', 'signedOffAt': None,
            'limitations': ['Head movement alone cannot establish cheating.']}


class IncidentPdfTests(unittest.TestCase):
    def test_all_source_modes_generate_real_pdfs_without_mutating_data(self):
        for mode in ['image', 'video', 'camera']:
            with self.subTest(mode=mode):
                value = report(mode)
                original = copy.deepcopy(value)
                pdf = render_incident_pdf(value)
                self.assertTrue(pdf.startswith(b'%PDF-'))
                self.assertTrue(pdf.rstrip().endswith(b'%%EOF'))
                self.assertIn(b'Potential incident review report', pdf)
                self.assertEqual(value, original)

    def test_long_notes_and_many_items_paginate_instead_of_clipping_or_failing(self):
        value = report('video')
        value['notes'] = 'Long proctor note with context. ' * 200
        value['items'] = [{**value['items'][0], 'label': f'Seat {i}: left', 'notes': 'Observation context. ' * 50} for i in range(15)]
        pdf = render_incident_pdf(value)
        self.assertGreater(len(re.findall(rb'/Type /Page\b', pdf)), 2)

    def test_markup_unicode_and_long_unbroken_tokens_are_plain_text(self):
        value = report()
        value['source'] = 'Peña <img src="https://unrelated.example/private"> & <b>Notes</b> 方'
        value['items'][0]['notes'] = 'x' * 2000
        self.assertTrue(render_incident_pdf(value).startswith(b'%PDF-'))

    def test_empty_results_and_explicit_omissions_still_generate_reports(self):
        value = report('camera')
        value['items'] = []
        value['omittedItems'] = 45
        self.assertTrue(render_incident_pdf(value).startswith(b'%PDF-'))

    def test_invalid_or_unbounded_documents_are_rejected(self):
        for changes in [{'mode': 'cheating-detector'}, {'schemaVersion': 2}, {'notes': 'x' * 10001},
                        {'items': [report()['items'][0]] * 501}, {'metadata': [['bad']]},
                        {'omittedItems': -1}, {'coverage': [None]}, {'signedOffAt': 42}]:
            with self.subTest(changes=str(changes)[:70]), self.assertRaises(ValueError):
                validate_report({**report(), **changes})
