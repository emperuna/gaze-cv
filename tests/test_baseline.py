"""Check direction conventions, roll compensation, and unavailable states."""
import math
import unittest
from gaze.baseline import Thresholds, classify_direction

def face(nose=(.5,.52)):
    return {"left_eye":(.4,.4),"right_eye":(.6,.4),"nose":nose,"chin":(.5,.8)}

class BaselineTests(unittest.TestCase):
    def test_subject_left_and_right_unmirrored(self):
        self.assertEqual(classify_direction(face((.56,.52)))[0],"left")
        self.assertEqual(classify_direction(face((.44,.52)))[0],"right")
    def test_mirrored_input_preserves_subject_direction(self):
        original=face((.56,.52))
        reflected={k:(1-x,y) for k,(x,y) in original.items()}
        self.assertEqual(classify_direction(reflected,mirrored=True)[0],"left")
        self.assertEqual(classify_direction(reflected)[0],"right")
    def test_forward_down_and_mixed(self):
        self.assertEqual(classify_direction(face())[0],"forward")
        self.assertEqual(classify_direction(face((.5,.64)))[0],"down")
        direction,scores,reason=classify_direction(face((.56,.64)))
        self.assertEqual((direction,reason),("unknown","mixed_down_and_sideways"))
        self.assertIn("nose_down_ratio",scores)
    def test_missing_nonfinite_and_tiny_faces_unknown(self):
        self.assertEqual(classify_direction({})[2],"missing_landmarks")
        self.assertEqual(classify_direction(face((math.nan,.5)))[0],"unknown")
        tiny={k:(.5+(x-.5)*.01,.5+(y-.5)*.01) for k,(x,y) in face().items()}
        self.assertEqual(classify_direction(tiny)[2],"eye_span_too_small")
    def test_roll_and_aspect_ratio(self):
        def rotate(point):
            x,y=point[0]-.5,point[1]-.5
            return (.5+x*math.cos(.3)-y*math.sin(.3),.5+x*math.sin(.3)+y*math.cos(.3))
        rotated={k:rotate(p) for k,p in face((.56,.52)).items()}
        self.assertEqual(classify_direction(rotated)[0],"left")
        widescreen={k:(x/2,y) for k,(x,y) in rotated.items()}
        self.assertEqual(classify_direction(widescreen,aspect_ratio=2)[0],"left")
    def test_invalid_thresholds_rejected(self):
        for kwargs in ({"yaw":0},{"down":1},{"down":math.nan},{"min_eye_span":-1}):
            with self.subTest(kwargs=kwargs),self.assertRaises(ValueError):
                Thresholds(**kwargs)
