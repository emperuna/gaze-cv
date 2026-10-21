"""Draw observations for instructor review; labels never establish misconduct."""
import cv2
from gaze.preprocessing import validate_image

def annotate(image_bgr, result):
    validate_image(image_bgr)
    if image_bgr.shape[:2] != (result.height, result.width):
        raise ValueError("Result and image dimensions do not match.")
    output = image_bgr.copy()
    for index, observation in enumerate(result.detections, 1):
        x, y, width, height = observation.bbox
        color = (0, 170, 0) if observation.direction != "unknown" else (0, 170, 220)
        cv2.rectangle(output, (x, y), (x+width, y+height), color, 2)
        cv2.putText(output, f"face {index}: {observation.direction}", (max(0,x), max(18,y-8)), cv2.FONT_HERSHEY_SIMPLEX, .55, color, 2, cv2.LINE_AA)
        for point in observation.landmarks.values():
            cv2.circle(output, (round(point[0]*result.width), round(point[1]*result.height)), 2, (255,100,0), -1)
    if not result.detections:
        cv2.putText(output, "No usable face observation", (10,24), cv2.FONT_HERSHEY_SIMPLEX, .6, (0,170,220), 2, cv2.LINE_AA)
    return output
