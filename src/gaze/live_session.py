"""Per-seat movement monitoring for live frames, reusing the saved-video rules."""
import base64
import dataclasses
import math

import cv2
import numpy as np

from gaze.baseline import Thresholds
from gaze.events import MovementMonitor, MovementSettings
from gaze.history import HistoryTracker
from gaze.seats import AssociationResult, SeatAssociator

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
    """`fallback` (optional) is a second pipeline, the head-pose model, asked only about seats whose face was not
    found this frame: the face model misses heads turned strongly to the side."""

    def __init__(self, config, mirrored, fallback=None):
        self.mirrored = mirrored
        self.fallback = fallback
        # Nearest seat wins, so a student who shifts in their chair keeps their seat.
        self.associator = SeatAssociator({'schema_version': 1, 'seats': config['seats']}, nearest=True)
        seat_ids = self.associator.seat_ids
        movement = config['movement']
        self.history = HistoryTracker(seat_ids, movement['max_gap'])
        self.monitor = MovementMonitor(seat_ids, MovementSettings(**movement))
        self.rois = {seat.id: seat.roi for seat in self.associator.seats}

    def _still_region(self, seat_id, face, width, height):
        """The seat box, moved to centre on the seat's face this frame (canonical coordinates)."""
        left, top, right, bottom = self.rois[seat_id]
        if face is None:
            return left, top, right, bottom
        x, y, w, h = face.bbox
        cx, cy = (x + w / 2) / width, (y + h / 2) / height
        if self.mirrored:
            cx = 1 - cx
        half_w, half_h = (right - left) / 2, (bottom - top) / 2
        cx, cy = min(max(cx, half_w), 1 - half_w), min(max(cy, half_h), 1 - half_h)
        return cx - half_w, cy - half_h, cx + half_w, cy + half_h

    def _read_lost_seats(self, association, image, width, height):
        """Fill seats with no face from the fallback model, run once on the area around those seats."""
        lost = [seat for seat in self.associator.seat_ids if association.seat_reasons[seat] == 'missing']
        if self.fallback is None or not lost:
            return association
        areas = []
        for seat in lost:
            left, top, right, bottom = self.rois[seat]
            if self.mirrored:
                left, right = 1 - right, 1 - left
            w, h = right - left, bottom - top
            areas.append((max(0., left - w), max(0., top - h), min(1., right + w), min(1., bottom + h)))
        x0, y0 = int(min(a[0] for a in areas) * width), int(min(a[1] for a in areas) * height)
        x1, y1 = math.ceil(max(a[2] for a in areas) * width), math.ceil(max(a[3] for a in areas) * height)
        found = self.fallback.process(np.ascontiguousarray(image[y0:y1, x0:x1])).detections
        heads = [dataclasses.replace(o, bbox=(o.bbox[0] + x0, o.bbox[1] + y0, o.bbox[2], o.bbox[3]))
                 for o in found if o.unavailable_reason is None and o.direction != 'unknown']
        matched = self.associator.associate(heads, width, height, self.mirrored).assignments
        assignments, reasons = dict(association.assignments), dict(association.seat_reasons)
        for seat in lost:
            if matched[seat] is not None:
                assignments[seat], reasons[seat] = matched[seat], None
        return AssociationResult(assignments, reasons, association.detection_indices, association.unassigned)

    def update(self, timestamp, result, image, open_alerts):
        association = self.associator.associate(result.detections, result.width, result.height, self.mirrored)
        association = self._read_lost_seats(association, image, result.width, result.height)
        entries = self.history.update(timestamp, association)
        # A seat with no face in its region this frame is "not seen", not a reading: a face that drops out for a
        # moment keeps its movement going if it is seen again within max_gap. Its seat state still reads unknown.
        unseen = {e.seat_id for e in entries if e.reason == 'missing'}
        seen = [e for e in entries if e.seat_id not in unseen]
        # No sources here: a turn read by the face model and then by the head model is one continuous turn.
        new = self.monitor.update(timestamp, {e.seat_id: e.direction for e in seen}, unobserved=unseen)
        source = {e.seat_id: e.estimation_source for e in entries}
        events = []
        for event in new:
            event = {**event, 'estimation_source': source[event['seat_id']]}
            if event['review_required'] and (event['seat_id'], event['direction']) not in open_alerts:
                region = self._still_region(event['seat_id'], association.assignments.get(event['seat_id']),
                                            result.width, result.height)
                still = crop_still(image, region, self.mirrored)
                if still is not None:
                    event = {**event, 'still': base64.b64encode(still).decode('ascii')}
            events.append(event)
        return {'seats': {e.seat_id: {'direction': e.direction, 'reason': e.reason} for e in entries},
                'events': events}
