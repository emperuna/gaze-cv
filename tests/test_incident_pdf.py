import copy
import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from reportlab.pdfgen import canvas as rl_canvas

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


def small_jpeg(path):
    from PIL import Image
    Image.new('RGB', (320, 240), (200, 60, 40)).save(path, 'JPEG')


FOOTER = 'Confidential: contains images of students. Keep only as long as your institution allows.'


class AlertStillTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / 'stills').mkdir()
        small_jpeg(self.root / 'stills' / 'a1.jpg')
        self.addCleanup(self.tmp.cleanup)

    def with_image(self, image='stills/a1.jpg', count=1):
        value = report('camera')
        value['imageRoot'] = str(self.root)
        value['items'] = [{**value['items'][0], 'image': image} for _ in range(count)]
        return value

    def test_alert_still_renders(self):
        plain = render_incident_pdf(report('camera'))
        with_still = render_incident_pdf(self.with_image())
        self.assertGreater(len(with_still), len(plain))
        self.assertIn(b'/Subtype /Image', with_still)

    def test_image_outside_root_rejected(self):
        small_jpeg(self.root.parent / 'x.jpg')
        self.addCleanup(lambda: (self.root.parent / 'x.jpg').unlink())
        with self.assertRaises(ValueError):
            validate_report(self.with_image('../x.jpg'))

    def test_png_rejected(self):
        from PIL import Image
        Image.new('RGB', (8, 8)).save(self.root / 'stills' / 'a1.png', 'PNG')
        with self.assertRaises(ValueError):
            validate_report(self.with_image('stills/a1.png'))
        (self.root / 'stills' / 'fake.jpg').write_bytes(b'\x89PNG' + b'0' * 20)
        with self.assertRaises(ValueError):
            validate_report(self.with_image('stills/fake.jpg'))

    def test_oversized_and_missing_images_rejected(self):
        (self.root / 'stills' / 'big.jpg').write_bytes(b'\xff\xd8\xff' + b'0' * 200_000)
        with self.assertRaises(ValueError):
            validate_report(self.with_image('stills/big.jpg'))
        with self.assertRaises(ValueError):
            validate_report(self.with_image('stills/missing.jpg'))

    def test_image_without_root_rejected(self):
        value = self.with_image()
        del value['imageRoot']
        with self.assertRaises(ValueError):
            validate_report(value)

    def test_more_than_200_images_rejected(self):
        validate_report(self.with_image(count=200))
        with self.assertRaises(ValueError):
            validate_report(self.with_image(count=201))

    def test_confidential_footer_text(self):
        drawn = []
        real = rl_canvas.Canvas.drawString
        def spy(canvas, x, y, text, *args, **kwargs):
            drawn.append(text)
            return real(canvas, x, y, text, *args, **kwargs)
        for confidential, expected in [(True, True), (False, False)]:
            drawn.clear()
            value = report('camera')
            value['confidential'] = confidential
            with mock.patch.object(rl_canvas.Canvas, 'drawString', spy):
                render_incident_pdf(value)
            self.assertEqual(FOOTER in drawn, expected)
