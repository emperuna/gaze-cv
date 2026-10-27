import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import cv2
import numpy as np

from gaze.head_models import HeadDetection


def command(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[1]/'scripts'/f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class HeadCLITests(unittest.TestCase):
    def test_head_mode_requires_calibration_before_loading_models(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder)/'source.avi'
            source.write_bytes(b'not yet decoded')
            self.assertEqual(command('process_video').main(['--input', str(source),
                '--output-dir', str(Path(folder)/'out'), '--method', 'head']), 2)

    def test_calibration_command_reads_selected_frames_and_refuses_overwrite(self):
        from gaze.head_session import validate_calibration
        from gaze.video import _sha256
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            video = root/'source.avi'
            writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*'MJPG'), 10, (120,100))
            for _ in range(3):
                writer.write(np.random.default_rng(5).integers(0,255,(100,120,3),dtype=np.uint8))
            writer.release()
            config = {'schema_version':1, 'seats':[{'id':'a','roi':[0,0,1,1]}]}
            (root/'seats.json').write_text(json.dumps(config))
            (root/'refs.json').write_text(json.dumps({'a':[0,2]}))
            hashes = {'head':'1'*64, 'pose':'2'*64}
            class Models:
                metadata = {'model_sha256':hashes}
                def detect(self, image, threshold): return [HeadDetection((20,20,50,50),.95)]
                def angles(self, image, bbox): return np.array([0,0,0])
                def close(self): pass
            cmd = command('calibrate_heads')
            args = ['--input',str(video),'--seats',str(root/'seats.json'),'--references',str(root/'refs.json'),
                    '--output',str(root/'calibration.json')]
            with patch('gaze.head_models.HeadModels', return_value=Models()):
                self.assertEqual(cmd.main(args),0)
            saved = json.loads((root/'calibration.json').read_text())
            validate_calibration(saved, config, _sha256(video), hashes)
            self.assertEqual([r['frame_index'] for r in saved['seats']['a']['references']], [0,2])
            before = (root/'calibration.json').read_bytes()
            self.assertEqual(cmd.main(args),2)
            self.assertEqual((root/'calibration.json').read_bytes(),before)
