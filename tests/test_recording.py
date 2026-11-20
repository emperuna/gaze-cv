"""Video files are sampled by their own frame times and fed to the live camera engine."""
import base64
import os
from pathlib import Path
import tempfile
import unittest

import cv2
import numpy as np

from gaze.camera import CameraProcessor
from gaze.pipeline import FaceObservation, ImageResult
from gaze.recording import VideoInfo, open_video, review, sample_frames, suggest

SETTINGS = {'mirrored': False, 'tileGrid': 1, 'seats': [{'id': 'seat-1', 'roi': [0, 0, .5, 1]}],
            'movement': {'min_duration': .5, 'repetition_count': 3, 'repetition_window': 10.,
                         'max_gap': 1., 'repeat_min_duration': .25}}


class Pipeline:
    metadata = {'method': 'injected', 'mirrored_input': False}

    def process(self, image):
        h, w = image.shape[:2]
        return ImageResult(w, h, [FaceObservation((5, 5, 30, 30), 'left', {}, {})], 2., {})


def write_video(path, seconds, size=(320, 180), fps=30):
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*'mp4v'), fps, size)
    for index in range(int(seconds * fps)):
        writer.write(np.full((size[1], size[0], 3), index % 255, np.uint8))
    writer.release()


class FakeCapture:
    """Frames carry the given (uneven) timestamps in seconds."""

    def __init__(self, times, size=(64, 36), fps=30.):
        self.times, self.size, self.fps, self.index = times, size, fps, -1

    def isOpened(self):
        return True

    def get(self, prop):
        if prop == cv2.CAP_PROP_POS_MSEC:
            return self.times[self.index] * 1000
        if prop == cv2.CAP_PROP_FPS:
            return self.fps
        if prop == cv2.CAP_PROP_FRAME_COUNT:
            return len(self.times)
        if prop == cv2.CAP_PROP_FRAME_WIDTH:
            return self.size[0]
        if prop == cv2.CAP_PROP_FRAME_HEIGHT:
            return self.size[1]
        return 0

    def set(self, prop, value):
        return True

    def grab(self):
        self.index += 1
        return self.index < len(self.times)

    def retrieve(self):
        return True, np.zeros((self.size[1], self.size[0], 3), np.uint8)

    def read(self):
        return (True, self.retrieve()[1]) if self.grab() else (False, None)

    def release(self):
        pass


class RecordingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.clip = Path(cls.directory.name) / 'clip.mp4'
        write_video(cls.clip, 4)

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def test_samples_every_tenth_of_a_second_of_video_time(self):
        times = [t for t, _ in sample_frames(self.clip)]
        self.assertAlmostEqual(len(times), 40, delta=1)
        self.assertTrue(all(b > a for a, b in zip(times, times[1:])))
        for a, b in zip(times, times[1:]):
            self.assertAlmostEqual(b - a, .1, delta=.04)

    def test_frames_are_resized_to_fit_1280x720(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'big.mp4'
            write_video(path, 1, (1920, 1080))
            _, image = next(sample_frames(path))
        self.assertEqual(image.shape[:2], (720, 1280))

    def test_uneven_frame_times_are_sampled_by_their_own_timestamps(self):
        times = [0., .02, .25, .27, .5, 1.1, 1.12, 1.4]
        samples = [t for t, _ in sample_frames('x.mp4', capture=lambda _: FakeCapture(times))]
        self.assertEqual(samples, [0., .25, .5, 1.1, 1.4])
        self.assertEqual(open_video('x.mp4', capture=lambda _: FakeCapture(times)).width, 64)

    def test_suggest_uses_frames_at_0_to_4_seconds_and_returns_a_preview(self):
        result = suggest(self.clip, CameraProcessor(Pipeline()))
        self.assertGreaterEqual(result['sampled_frames'], 4)
        self.assertLessEqual(result['sampled_frames'], 5)
        self.assertEqual([s['id'] for s in result['seats']], ['seat-1'])
        self.assertEqual((result['width'], result['height']), (320, 180))
        self.assertAlmostEqual(result['duration_seconds'], 4, delta=.2)
        self.assertIn('note', result)
        preview = cv2.imdecode(np.frombuffer(base64.b64decode(result['preview_jpeg']), np.uint8), cv2.IMREAD_COLOR)
        self.assertEqual(preview.shape[:2], (180, 320))

    def configured(self):
        processor = CameraProcessor(Pipeline())
        processor.configure(SETTINGS)
        return processor

    def test_review_emits_one_line_per_frame_then_done(self):
        lines = []
        review(self.clip, self.configured(), lines.append)
        frames, done = lines[:-1], lines[-1]
        self.assertAlmostEqual(len(frames), 40, delta=1)
        self.assertEqual(set(frames[0]), {'t', 'seats', 'events', 'duration'})
        self.assertEqual(frames[0]['seats'], {'seat-1': {'direction': 'left', 'reason': None}})
        self.assertEqual(done['done'], True)
        self.assertAlmostEqual(done['duration'], 4, delta=.2)

    def test_review_events_carry_their_still(self):
        lines = []
        review(self.clip, self.configured(), lines.append)
        events = [e for line in lines for e in line.get('events', [])]
        self.assertTrue(events)
        self.assertTrue(all(e.get('still') for e in events))

    def test_unreadable_or_too_long_videos_are_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'notes.mp4'
            path.write_text('not a video')
            with self.assertRaisesRegex(ValueError, r'\.$'):
                open_video(path)
        long = [i * 10. for i in range(1081)]
        with self.assertRaisesRegex(ValueError, '3 hours'):
            open_video('x.mp4', capture=lambda _: FakeCapture(long, fps=.1))

    def test_video_info_fields(self):
        info = open_video(self.clip)
        self.assertIsInstance(info, VideoInfo)
        self.assertEqual((info.width, info.height), (320, 180))


if __name__ == '__main__':
    unittest.main()
