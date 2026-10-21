"""Synthetic camera projections verify pose signs and failure accounting."""
import unittest
from unittest.mock import patch
import cv2
import numpy as np
from gaze.pose import OBJECT_POINTS,POINT_NAMES,PoseThresholds,estimate_direction,nominal_camera_matrix

def projected(yaw=0,pitch=0,roll=0,mirrored=False):
    # Rotation y is negative for subject-left in the camera frame.
    x,y,z=np.deg2rad([pitch,-yaw,roll])
    rx=np.array([[1,0,0],[0,np.cos(x),-np.sin(x)],[0,np.sin(x),np.cos(x)]])
    ry=np.array([[np.cos(y),0,np.sin(y)],[0,1,0],[-np.sin(y),0,np.cos(y)]])
    rz=np.array([[np.cos(z),-np.sin(z),0],[np.sin(z),np.cos(z),0],[0,0,1]])
    rvec,_=cv2.Rodrigues(rz@ry@rx)
    pixels,_=cv2.projectPoints(OBJECT_POINTS,rvec,np.array([0.,0.,70.]),nominal_camera_matrix(640,480),None)
    points=pixels.reshape(-1,2)/np.array([640,480])
    if mirrored:
        points[:,0]=1-points[:,0]
    return dict(zip(POINT_NAMES,points))

class PoseTests(unittest.TestCase):
    def test_projected_forward_left_right_down(self):
        for yaw,pitch,label in [(0,0,"forward"),(35,0,"left"),(-35,0,"right"),(0,35,"down")]:
            with self.subTest(yaw=yaw,pitch=pitch):
                direction,scores,reason=estimate_direction(projected(yaw,pitch),640,480)
                self.assertEqual(direction,label)
                self.assertIsNone(reason)
                self.assertAlmostEqual(scores["yaw_degrees"],yaw,places=4)
                self.assertAlmostEqual(scores["pitch_degrees"],pitch,places=4)
    def test_mirror_and_roll(self):
        result=estimate_direction(projected(35,0,15,True),640,480,mirrored=True)
        self.assertEqual(result[0],"left")
        self.assertAlmostEqual(result[1]["roll_degrees"],15,places=4)
    def test_mixed_and_up_are_explicitly_unknown(self):
        self.assertEqual(estimate_direction(projected(35,35),640,480)[2],"mixed_down_and_sideways")
        self.assertEqual(estimate_direction(projected(0,-35),640,480)[2],"upward_pose_outside_four_classes")
    def test_missing_degenerate_and_failed_solver_unknown(self):
        self.assertEqual(estimate_direction({},640,480)[2],"missing_pose_landmarks")
        self.assertEqual(estimate_direction(dict.fromkeys(POINT_NAMES,(.5,.5)),640,480)[0],"unknown")
        with patch("gaze.pose.cv2.solvePnP",return_value=(False,None,None)):
            self.assertEqual(estimate_direction(projected(),640,480)[2],"pose_solver_failed")
    def test_reprojection_gate_rejects_corrupt_correspondence(self):
        points=projected()
        points["chin"]=(.7,.2)
        result=estimate_direction(points,640,480,PoseThresholds(max_reprojection_ratio=.01))
        self.assertEqual(result[0],"unknown")
        self.assertIn(result[2],("pose_reprojection_error","pose_behind_camera","pose_outside_supported_range"))
