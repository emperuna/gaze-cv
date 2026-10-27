"""Declared deterministic stress transforms; never generate reference labels."""
import cv2
import numpy as np
from gaze.preprocessing import validate_image


def stress_variant(image, variant):
    validate_image(image)
    if variant == 'original': return image.copy()
    if variant == 'low_light': return np.rint(image.astype(float)*.18).astype(np.uint8)
    if variant == 'blur': return cv2.GaussianBlur(image, (31, 31), 8)
    if variant == 'occlusion':
        result = image.copy()
        h, w = image.shape[:2]
        result[round(.48*h):round(.63*h), round(.32*w):round(.68*w)] = 96
        return result
    if variant == 'small':
        h, w = image.shape[:2]
        return cv2.resize(image, (max(2, w//5), max(2, h//5)), interpolation=cv2.INTER_AREA)
    raise ValueError(f'Unsupported CP3 stress variant: {variant}')
