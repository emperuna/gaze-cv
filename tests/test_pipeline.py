"""End-to-end orchestration with injected detections; no model/network needed."""
import json
import unittest
import numpy as np
from gaze.landmarks import LandmarkFace
from gaze.pipeline import ImagePipeline
from gaze.visualization import annotate

class FakeDetector:
    def __init__(self,faces):
        self.faces=faces
        self.closed=False
    def detect(self,rgb):
        self.rgb=rgb
        return self.faces
    def close(self):
        self.closed=True

def sample_face():
    return LandmarkFace((.2,.1,.5,.8),{"left_eye":(.4,.4),"right_eye":(.6,.4),"nose":(.5,.52),"chin":(.5,.8)})

class PipelineTests(unittest.TestCase):
    def test_multiface_coordinates_serialization_and_cleanup(self):
        detector=FakeDetector([sample_face(),LandmarkFace((.1,.2,.2,.3),{})])
        image=np.full((100,200,3),(1,2,3),dtype=np.uint8)
        with ImagePipeline(detector=detector,max_width=100) as pipeline:
            result=pipeline.process(image)
            self.assertEqual(len(result.detections),2)
            self.assertEqual(result.detections[0].bbox,(40,10,100,80))
            self.assertEqual(result.detections[1].direction,"unknown")
            self.assertEqual(detector.rgb.shape,(50,100,3))
            self.assertEqual(detector.rgb[0,0].tolist(),[3,2,1])
            self.assertIn("thresholds",pipeline.metadata)
            json.dumps(result.to_dict(),allow_nan=False)
            drawn=annotate(image,result)
            self.assertFalse(np.array_equal(drawn,image))
            self.assertEqual(image[0,0].tolist(),[1,2,3])
        self.assertTrue(detector.closed)
    def test_mirrored_input_unmirrors_before_detection_and_maps_back(self):
        face=sample_face()
        face.landmarks["nose"]=(.56,.52)
        detector=FakeDetector([face])
        image=np.zeros((100,200,3),dtype=np.uint8)
        image[:,0]=(10,20,30)
        image[:,-1]=(40,50,60)
        with ImagePipeline(detector=detector,mirrored=True) as pipeline:
            result=pipeline.process(image)
        self.assertEqual(detector.rgb[0,0].tolist(),[60,50,40])
        self.assertEqual(result.detections[0].bbox,(60,10,100,80))
        self.assertAlmostEqual(result.detections[0].landmarks["nose"][0],.44)
        self.assertEqual(result.detections[0].direction,"left")

    def test_absent_faces_do_not_become_forward(self):
        with ImagePipeline(detector=FakeDetector([])) as pipeline:
            result=pipeline.process(np.zeros((20,40,3),dtype=np.uint8))
            self.assertEqual(result.detections,[])
    def test_exception_closes_detector(self):
        detector=FakeDetector([])
        with self.assertRaises(ValueError):
            with ImagePipeline(detector=detector) as pipeline:
                pipeline.process(None)
        self.assertTrue(detector.closed)


class TiledDetectionTests(unittest.TestCase):
    def test_windows_cover_edges_and_remap_to_full_image(self):
        from gaze.landmarks import tile_windows, remap_face
        windows=tile_windows(1280,720,2)
        self.assertEqual(len(windows),6)
        self.assertIn((640,80,640,640),windows)
        face=LandmarkFace((.1,.2,.3,.4),{"nose":(.5,.5)})
        mapped=remap_face(face,(640,80,640,640),1280,720)
        self.assertAlmostEqual(mapped.bbox[0],.55)
        self.assertAlmostEqual(mapped.bbox[1],208/720)
        self.assertEqual(mapped.landmarks["nose"],(.75,400/720))
    def test_overlapping_detections_merge_without_merging_different_faces(self):
        from gaze.landmarks import merge_faces
        a=LandmarkFace((.1,.1,.2,.2),{})
        duplicate=LandmarkFace((.11,.11,.19,.19),{})
        b=LandmarkFace((.6,.1,.2,.2),{})
        result=merge_faces([a,duplicate,b])
        self.assertEqual(len(result),2)
        self.assertIn(a,result)
        self.assertIn(b,result)
    def test_detect_maps_injected_task_results_and_deduplicates(self):
        from gaze.landmarks import MediaPipeDetector
        detector=object.__new__(MediaPipeDetector)
        detector.tile_grid=2
        detector.max_faces=10
        calls=[]
        def fake(rgb):
            calls.append(rgb.shape)
            return [LandmarkFace((.1,.1,.2,.2),{"nose":(.2,.2)})]
        detector._detect_window=fake
        faces=detector.detect(np.zeros((720,1280,3),dtype=np.uint8))
        self.assertEqual(len(calls),6)
        self.assertTrue(all(shape==(640,640,3) for shape in calls))
        self.assertTrue(all(0<=f.bbox[0]<=1 for f in faces))


class ImageCommandTests(unittest.TestCase):
    def test_predict_refuses_input_and_report_collisions_before_model_load(self):
        import importlib.util
        from pathlib import Path
        import tempfile
        spec=importlib.util.spec_from_file_location("gaze_predict_script",Path(__file__).resolve().parents[1]/"scripts/predict.py")
        command=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(command)
        with tempfile.TemporaryDirectory() as folder:
            image=Path(folder)/"source.png"
            from gaze.preprocessing import write_image
            write_image(image,np.zeros((10,10,3),dtype=np.uint8))
            original=image.read_bytes()
            self.assertEqual(command.main(["--input",str(image),"--output",str(image)]),2)
            self.assertEqual(image.read_bytes(),original)
            # Valid image bytes may have a misleading .json extension.
            report_source=Path(folder)/"source.json"
            report_source.write_bytes(original)
            self.assertEqual(command.main(["--input",str(report_source),"--output",str(image)]),2)
            self.assertEqual(report_source.read_bytes(),original)


class SpikeInputProtectionTests(unittest.TestCase):
    def test_spike_preserves_locked_test_image_at_planned_output(self):
        import importlib.util
        from pathlib import Path
        import tempfile
        from unittest.mock import patch
        script=Path(__file__).resolve().parents[1]/"scripts/spike.py"
        spec=importlib.util.spec_from_file_location("spike_input_guard_test",script)
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            output=root/"results"
            output.mkdir()
            locked=output/"01-val0.png"
            locked.write_bytes(b"locked test image contents")
            records=[{"image":f"val{index}.png","image_path":root/f"val{index}.png","split":"validation"} for index in range(5)]
            records.append({"image":"results/01-val0.png","image_path":locked,"split":"test"})
            with patch.object(module,"read_manifest",return_value=records),patch.object(module,"ImagePipeline") as pipeline:
                code=module.main(["--manifest",str(root/"manifest.json"),"--output-dir",str(output)])
            self.assertEqual(code,2)
            pipeline.assert_not_called()
            self.assertEqual(locked.read_bytes(),b"locked test image contents")
            self.assertFalse((output/"report.json").exists())
