"""Per-seat movement monitoring for live frames, reusing the saved-video rules."""
import base64

import cv2

from gaze.baseline import Thresholds
from gaze.events import MovementMonitor, MovementSettings
from gaze.history import HistoryTracker
from gaze.seats import SeatAssociator

MAX_STILL_BYTES = 200_000
STILL_LONG_SIDE = 320
STILL_MARGIN = .2


def crop_still(image, roi, mirrored):
    """JPEG of a seat region plus margin, or None when it cannot fit the size limit.

    ROIs are canonical (unmirrored) coordinates, so a mirrored frame is flipped
    first, exactly as the pipelines do before detection.
    """
    if mirrored:
        image = image[:, ::-1]
    height, width = image.shape[:2]
    left, top, right, bottom = roi
    margin_x, margin_y = (right - left) * STILL_MARGIN, (bottom - top) * STILL_MARGIN
    x0, x1 = max(0, int(max(0., left - margin_x) * width)), min(width, round(min(1., right + margin_x) * width))
    y0, y1 = max(0, int(max(0., top - margin_y) * height)), min(height, round(min(1., bottom + margin_y) * height))
    x0, y0 = min(x0, width - 1), min(y0, height - 1)
    crop = image[y0:max(y1, y0 + 1), x0:max(x1, x0 + 1)]
    scale = STILL_LONG_SIDE / max(crop.shape[:2])
    if scale < 1:
        crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    for quality in (80, 60):
        ok, encoded = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, quality])
        if ok and len(encoded) <= MAX_STILL_BYTES:
            return encoded.tobytes()
    return None


def live_thresholds():
    """Baseline thresholds for the live camera and recording review: a glance down and to one side (towards a
    neighbour's desk) counts as that side instead of unknown."""
    return Thresholds(side_over_down=True)


class LiveSeatMonitor:
    def __init__(self, config, mirrored):
        self.mirrored = mirrored
        self.associator = SeatAssociator({'schema_version': 1, 'seats': config['seats']})
        seat_ids = self.associator.seat_ids
        movement = config['movement']
        self.history = HistoryTracker(seat_ids, movement['max_gap'])
        self.monitor = MovementMonitor(seat_ids, MovementSettings(**movement))
        self.rois = {seat.id: seat.roi for seat in self.associator.seats}

    def update(self, timestamp, result, image, open_alerts):
        association = self.associator.associate(result.detections, result.width, result.height, self.mirrored)
        entries = self.history.update(timestamp, association)
        # A seat with no face in its region this frame is "not seen", not a reading: a face that drops out for a
        # moment keeps its movement going if it is seen again within max_gap. Its seat state still reads unknown.
        unseen = {e.seat_id for e in entries if e.reason == 'missing'}
        seen = [e for e in entries if e.seat_id not in unseen]
        new = self.monitor.update(timestamp, {e.seat_id: e.direction for e in seen},
                                  {e.seat_id: e.estimation_source for e in seen}, unobserved=unseen)
        events = []
        for event in new:
            if event['review_required'] and (event['seat_id'], event['direction']) not in open_alerts:
                still = crop_still(image, self.rois[event['seat_id']], self.mirrored)
                if still is not None:
                    event = {**event, 'still': base64.b64encode(still).decode('ascii')}
            events.append(event)
        return {'seats': {e.seat_id: {'direction': e.direction, 'reason': e.reason} for e in entries},
                'events': events}
