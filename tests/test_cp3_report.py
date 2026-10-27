import unittest
from gaze.cp3_report import select_failures


class ReportTests(unittest.TestCase):
    def test_gallery_selects_real_failures_across_conditions_without_duplicates(self):
        records = [dict(id=f'a{i}', expected='left', predicted='unknown', cause='blur') for i in range(12)]
        records += [dict(id='b', expected='down', predicted='forward', cause='clean_pose'),
                    dict(id='c', expected='left', predicted='left', cause='angle')]
        chosen = select_failures(records, 10)
        self.assertEqual(len(chosen), 10)
        self.assertEqual(len({r['id'] for r in chosen}), 10)
        self.assertIn('b', {r['id'] for r in chosen})
        self.assertNotIn('c', {r['id'] for r in chosen})
        with self.assertRaisesRegex(ValueError, 'failures'):
            select_failures(records, 14)
