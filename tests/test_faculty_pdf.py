"""The camera report's faculty layout: summary, alert details, blind spots and review."""
import copy
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from reportlab.pdfgen import canvas as rl_canvas

import gaze.incident_pdf as module
import gaze.faculty_pdf as module_faculty
from gaze.incident_pdf import render_incident_pdf, validate_report

FOOTER = 'Confidential: contains images of students. Keep only as long as your institution allows.'


def small_jpeg(path):
    from PIL import Image
    Image.new('RGB', (320, 240), (90, 110, 140)).save(path, 'JPEG')


def alert(time, title, mark, image=None, note=''):
    return {'time': time, 'title': title, 'rule': 'Held one direction longer than the 2-second rule.', 'mark': mark,
            'markedAt': '9:42 AM' if mark else None, 'note': note, 'image': image,
            'imageNote': None if image else 'Photo unavailable'}


def faculty(seat_count=6):
    seats = [{'label': str(n), 'roi': [((n - 1) % 3) * .33, .5 if n > 3 else 0, ((n - 1) % 3) * .33 + .3, .95 if n > 3 else .45],
              'status': 'look-again' if n == 4 else 'dismissed' if n in (2, 5) else 'none', 'hidden': n == 6}
             for n in range(1, seat_count + 1)]
    return {
        'exam': {'title': 'Math 101 Midterm', 'room': '204', 'proctor': 'Prof. Cruz'},
        'date': 'Friday 20 November 2026', 'timeRange': '9:00–10:30 AM (1 h 30 min)', 'seatsWatched': seat_count,
        'glance': {'alerts': 5, 'lookAgain': 1, 'notReviewed': 1, 'notWatchedMinutes': 3},
        'seats': [
            {'seat': 'Seat 4', 'status': 'look-again', 'alerts': 3, 'saw': '3 alerts · turned right 6 times · longest 4.2 s', 'when': '9:41–9:58 AM', 'marks': '2 Checked · 1 not reviewed'},
            {'seat': 'Seat 2', 'status': 'dismissed', 'alerts': 1, 'saw': '1 alert · looked left for 2.6 s', 'when': '10:05 AM', 'marks': 'Dismissed'},
        ],
        'quietSeats': 'No alerts: Seats 1, 3 and 6.',
        'map': seats,
        'timeline': {'ticks': [{'at': 0, 'label': '9:00'}, {'at': 1 / 3, 'label': '9:30'}, {'at': 2 / 3, 'label': '10:00'}, {'at': 1, 'label': '10:30'}],
                     'rows': [{'label': f'Seat {n}', 'marks': [{'at': .46, 'kind': 'checked'}, {'at': .64, 'kind': 'not-reviewed'}] if n == 4 else [],
                               'hidden': [{'from': .22, 'to': .34}] if n == 6 else []} for n in range(1, seat_count + 1)],
                     'off': [{'from': .556, 'to': .589}]},
        'alertGroups': [
            {'seat': 'Seat 4', 'status': 'look-again', 'alerts': [alert('9:41 AM', 'Looked right for 4.2 seconds', 'Checked', note='Asked to face forward.'), alert('9:58 AM', 'Looked right for 2.8 seconds', None)]},
            {'seat': 'Seat 2', 'status': 'dismissed', 'alerts': [alert('10:05 AM', 'Looked left for 2.6 seconds', 'Dismissed', note='Dropped a pencil.')]},
        ],
        'blindSpots': [{'what': 'Whole room not watched', 'when': '9:50–9:53 AM (3 min)', 'reason': 'Camera stopped; monitoring resumed'},
                       {'what': 'Seat 6 hidden', 'when': '9:20–9:31 AM · 12% of the exam', 'reason': 'Face not visible'}],
        'reviewSeats': ['Seat 4', 'Seat 2'],
        'rules': 'An alert means a head in that seat turned left or right for 2 seconds or more, or 3 times within 10 seconds.',
        'sessionLine': 'Session details for your records: session 3f2a9c1e · camera started 9:00 AM · alert rules: 2 s, 3 turns in 10 s.',
    }


def camera_report(fac=None, root=None):
    return {'schemaVersion': 1, 'mode': 'camera', 'id': '3f2a9c1e', 'source': 'Local live camera', 'generatedAt': '2026-11-20T02:40:00Z',
            'metadata': [], 'summary': '', 'items': [], 'omittedItems': 0, 'coverage': [], 'notes': '', 'reviewer': '',
            'signedOffAt': None, 'limitations': [], 'confidential': True, 'imageRoot': root or '/tmp/none',
            'faculty': faculty() if fac is None else fac}


def rendered_text(value):
    """Every Paragraph and canvas string the renderer draws."""
    written = []
    real_paragraph = module.Paragraph
    def paragraph(text, *args, **kwargs):
        written.append(text)
        return real_paragraph(text, *args, **kwargs)
    patches = [mock.patch.object(module, 'Paragraph', paragraph)]
    for name in ('drawString', 'drawRightString', 'drawCentredString'):
        real = getattr(rl_canvas.Canvas, name)
        def spy(canvas, x, y, text, *args, _real=real, **kwargs):
            written.append(text)
            return _real(canvas, x, y, text, *args, **kwargs)
        patches.append(mock.patch.object(rl_canvas.Canvas, name, spy))
    for patch in patches:
        patch.start()
    try:
        pdf = render_incident_pdf(value)
    finally:
        for patch in patches:
            patch.stop()
    return pdf, '\n'.join(written)


class FacultyLayoutTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / 'stills').mkdir()
        small_jpeg(self.root / 'stills' / 'alert-1.jpg')
        self.addCleanup(self.tmp.cleanup)

    def test_full_report_has_every_section_on_at_least_three_pages(self):
        fac = faculty()
        fac['alertGroups'][0]['alerts'][0]['image'] = 'stills/alert-1.jpg'
        fac['alertGroups'][0]['alerts'][0]['imageNote'] = None
        value = camera_report(fac, str(self.root))
        original = copy.deepcopy(value)
        pdf, text = rendered_text(value)
        self.assertTrue(pdf.startswith(b'%PDF-'))
        self.assertGreaterEqual(pdf.count(b'/Type /Page\n') + pdf.count(b'/Type /Page '), 3)
        for heading in ['Seats to look at again', 'Where the seats are', 'When alerts happened', 'Each alert, with its photo',
                        'What Ocular could not see', 'Your review', 'How to read this report', 'Page 1 of 3', FOOTER,
                        'Math 101 Midterm', 'Prof. Cruz', 'LOOK AGAIN', 'Photo unavailable', 'Reviewed by', 'Signature']:
            self.assertIn(heading, text, heading)
        self.assertIn(b'/Subtype /Image', pdf)
        self.assertEqual(value, original)

    def test_off_label_is_drawn_when_given_and_camera_off_otherwise(self):
        _, live = rendered_text(camera_report())
        self.assertIn('not watched (camera off)', live)
        self.assertIn('Camera off', live)
        fac = faculty()
        fac['offLabel'] = 'not reviewed'
        _, text = rendered_text(camera_report(fac))
        self.assertIn('not reviewed', text)
        self.assertIn('Video not reviewed', text)
        self.assertNotIn('camera off', text.lower())
        fac['offLabel'] = 7
        with self.assertRaises(ValueError):
            validate_report(camera_report(fac))

    def test_no_banned_words_are_drawn(self):
        _, text = rendered_text(camera_report())
        for word in ['suspicious', 'incident', 'violation', 'catch']:
            self.assertNotIn(word, text.lower(), word)

    def test_missing_exam_details_print_blank_lines(self):
        fac = faculty()
        fac['exam'] = {'title': '', 'room': '', 'proctor': ''}
        _, text = rendered_text(camera_report(fac))
        self.assertIn('Exam: ____', text)
        self.assertIn('Room: ____', text)
        self.assertIn('Proctor: ____', text)

    def test_session_without_alerts(self):
        fac = faculty()
        fac.update(seats=[], alertGroups=[], reviewSeats=[], quietSeats='No alerts on any seat.')
        fac['glance'] = {'alerts': 0, 'lookAgain': 0, 'notReviewed': 0, 'notWatchedMinutes': 0}
        for row in fac['timeline']['rows']:
            row['marks'] = []
        _, text = rendered_text(camera_report(fac))
        self.assertIn('No seats to look at again.', text)
        self.assertIn('No alerts during this session.', text)

    def test_long_title_and_twenty_seats_render(self):
        fac = faculty(20)
        fac['exam']['title'] = 'Advanced Topics in Applied Mathematics and Statistical Reasoning for Engineers — Final Examination, Section B'[:120]
        pdf, text = rendered_text(camera_report(fac))
        self.assertTrue(pdf.startswith(b'%PDF-'))
        self.assertIn('Seat 20', text)

    def test_invalid_faculty_sections_are_refused(self):
        bad = []
        value = camera_report(); value['faculty'] = 'text'; bad.append(value)
        value = camera_report(); value['faculty']['seats'][0]['saw'] = 'x' * 2001; bad.append(value)
        value = camera_report(); value['faculty']['timeline']['rows'][0]['marks'] = [{'at': 1.5, 'kind': 'checked'}]; bad.append(value)
        value = camera_report(); value['faculty']['timeline']['rows'][0]['marks'] = [{'at': .5, 'kind': 'guilty'}]; bad.append(value)
        value = camera_report(faculty(21)); bad.append(value)
        value = camera_report(); value['faculty']['map'][0]['roi'] = [0, 0, 2, 1]; bad.append(value)
        value = camera_report(); value['faculty']['glance']['alerts'] = -1; bad.append(value)
        value = camera_report(root=str(self.root)); value['faculty']['alertGroups'][0]['alerts'][0]['image'] = '../outside.jpg'; bad.append(value)
        for index, value in enumerate(bad):
            with self.subTest(index=index), self.assertRaises(ValueError):
                validate_report(value)

    def test_alerts_left_out_of_the_details_are_counted(self):
        fac = faculty()
        fac['omittedAlerts'] = 20
        _, text = rendered_text(camera_report(fac))
        self.assertIn('20 more alerts are not shown here', text)
        fac['omittedAlerts'] = -1
        with self.assertRaises(ValueError):
            validate_report(camera_report(fac))

    def test_timeline_fits_the_width_it_is_given(self):
        from reportlab.graphics.shapes import Rect, String
        drawing = module_faculty._timeline(faculty(20)['timeline'], 280)
        self.assertEqual(drawing.width, 280)
        for shape in drawing.contents:
            if isinstance(shape, Rect):
                self.assertLessEqual(shape.x + shape.width, 280 + .01)
            if isinstance(shape, String):
                self.assertLessEqual(shape.x, 280)

    def test_old_camera_reports_without_faculty_keep_the_previous_layout(self):
        value = camera_report()
        del value['faculty']
        _, text = rendered_text(value)
        self.assertIn('Seat check<br/>review report', text)
        self.assertNotIn('Seats to look at again', text)


if __name__ == '__main__':
    unittest.main()
