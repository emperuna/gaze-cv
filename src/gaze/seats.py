"""Associate frame-local observations with fixed positions, never identities."""

from dataclasses import dataclass
import json
import math
from pathlib import Path


@dataclass(frozen=True)
class Seat:
    id: str
    roi: tuple[float, float, float, float]


@dataclass(frozen=True)
class AssociationResult:
    assignments: dict
    seat_reasons: dict
    detection_indices: dict
    unassigned: list

    def to_dict(self) -> dict:
        return {
            "seats": {seat_id: {
                "detection_index": self.detection_indices.get(seat_id),
                "reason": self.seat_reasons[seat_id],
                "observation": observation.to_dict() if observation is not None else None,
            } for seat_id, observation in self.assignments.items()},
            "unassigned": list(self.unassigned),
            "identity_note": "Seat labels describe fixed regions, not identified people.",
        }


class SeatAssociator:
    """Use center-in-ROI with strict one-to-one association and explicit gaps.

    Normalized ROIs are [left, top, right, bottom]. Left/top edges are included;
    right/bottom edges are excluded except at the image's outer edge. A shared
    border therefore belongs to the ROI starting at that border. Positive-area
    overlap is rejected; a crowded ROI produces no assignment for that seat.
    """

    def __init__(self, config: dict):
        if not isinstance(config, dict) or config.get("schema_version") != 1:
            raise ValueError("Seat configuration requires schema_version 1.")
        definitions = config.get("seats")
        if not isinstance(definitions, list) or not definitions:
            raise ValueError("Seat configuration requires a nonempty seats list.")
        self.seats = []
        identifiers = set()
        for definition in definitions:
            if not isinstance(definition, dict):
                raise ValueError("Each seat definition must be an object.")
            identifier, roi = definition.get("id"), definition.get("roi")
            if not isinstance(identifier, str) or not identifier.strip() or identifier in identifiers:
                raise ValueError("Seat IDs must be nonempty unique strings.")
            if not isinstance(roi, (tuple, list)) or len(roi) != 4:
                raise ValueError("Each seat roi must contain left,top,right,bottom.")
            if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in roi):
                raise ValueError("Seat coordinates must be finite numbers.")
            left, top, right, bottom = roi
            if not 0 <= left < right <= 1 or not 0 <= top < bottom <= 1:
                raise ValueError("Seat rectangles must have positive area inside [0,1].")
            seat = Seat(identifier, tuple(float(v) for v in roi))
            for prior in self.seats:
                a, b, c, d = prior.roi
                if min(right, c) > max(left, a) and min(bottom, d) > max(top, b):
                    raise ValueError(f"Seat rectangles overlap: {identifier} and {prior.id}.")
            identifiers.add(identifier)
            self.seats.append(seat)

    @classmethod
    def from_file(cls, path: str | Path):
        return cls(json.loads(Path(path).read_text(encoding="utf-8")))

    @property
    def seat_ids(self) -> list[str]:
        return [seat.id for seat in self.seats]

    def to_dict(self) -> dict:
        return {"schema_version": 1, "coordinate_space": "normalized unmirrored input image",
                "association": "bbox-center-in-roi; crowded ROI remains ambiguous",
                "seats": [{"id": seat.id, "roi": list(seat.roi)} for seat in self.seats]}

    def associate(self, detections, width: int, height: int) -> AssociationResult:
        if any(isinstance(v, bool) or not isinstance(v, int) or v <= 0 for v in (width, height)):
            raise ValueError("Image width and height must be positive integer pixels.")
        candidates = {seat.id: [] for seat in self.seats}
        detections = list(detections)
        unassigned = []
        for index, detection in enumerate(detections):
            bbox = getattr(detection, "bbox", None)
            if not isinstance(bbox, (list, tuple)) or len(bbox) != 4 or any(
                isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in bbox
            ):
                unassigned.append({"detection_index": index, "reason": "invalid_bbox"})
                continue
            x, y, box_width, box_height = bbox
            if box_width <= 0 or box_height <= 0:
                unassigned.append({"detection_index": index, "reason": "invalid_bbox"})
                continue
            center_x, center_y = (x + box_width / 2) / width, (y + box_height / 2) / height
            if not 0 <= center_x <= 1 or not 0 <= center_y <= 1:
                unassigned.append({"detection_index": index, "reason": "outside_image"})
                continue
            matches = []
            for seat in self.seats:
                left, top, right, bottom = seat.roi
                if left <= center_x and (center_x < right or right == center_x == 1) and (
                    top <= center_y and (center_y < bottom or bottom == center_y == 1)
                ):
                    matches.append(seat.id)
            if not matches:
                unassigned.append({"detection_index": index, "reason": "outside_seat_regions"})
            elif len(matches) != 1:
                # Constructor validation makes this defensive branch unreachable
                # for valid rectangles; never resolve ambiguous geometry silently.
                unassigned.append({"detection_index": index, "reason": "ambiguous_regions"})
            else:
                candidates[matches[0]].append(index)
        assignments, reasons, indices = {}, {}, {}
        for seat_id, possible in candidates.items():
            if len(possible) == 1:
                index = possible[0]
                assignments[seat_id] = detections[index]
                reasons[seat_id] = None
                indices[seat_id] = index
            else:
                assignments[seat_id] = None
                reasons[seat_id] = "missing" if not possible else "ambiguous"
                indices[seat_id] = None
                unassigned.extend({"detection_index": index, "reason": "crowded_seat_region",
                                   "seat_id": seat_id} for index in possible)
        return AssociationResult(assignments, reasons, indices, sorted(unassigned, key=lambda item: item["detection_index"]))
