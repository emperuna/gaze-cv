"""Source-time seat histories that preserve observation gaps and uncertainty."""

from dataclasses import asdict, dataclass
import math

from gaze.seats import AssociationResult


DIRECTIONS = {"forward", "left", "right", "down"}


@dataclass(frozen=True)
class HistoryEntry:
    seat_id: str
    timestamp_seconds: float
    direction: str
    valid: bool
    reason: str | None
    detection_index: int | None
    segment_id: int | None
    continuous_seconds: float

    def to_dict(self) -> dict:
        return asdict(self)


class HistoryTracker:
    """Record each configured seat on every frame, including explicit unknowns.

    A segment joins same-direction valid observations only when adjacent source
    timestamps are no further apart than max_gap_seconds. Duration is last minus
    first observed timestamp; it never extrapolates to the next frame or across
    a missing/ambiguous/invalid observation. Entries are observations, not events.
    """

    def __init__(self, seat_ids, max_gap_seconds: float = .25):
        self.seat_ids = list(seat_ids)
        if not self.seat_ids or any(not isinstance(value, str) or not value for value in self.seat_ids) or len(set(self.seat_ids)) != len(self.seat_ids):
            raise ValueError("History seat IDs must be nonempty and unique.")
        if isinstance(max_gap_seconds, bool) or not isinstance(max_gap_seconds, (int, float)) or not math.isfinite(max_gap_seconds) or max_gap_seconds <= 0:
            raise ValueError("Maximum source-time gap must be finite and positive.")
        self.max_gap_seconds = float(max_gap_seconds)
        self.entries = {seat_id: [] for seat_id in self.seat_ids}
        self._active = {seat_id: None for seat_id in self.seat_ids}
        self._next_segment = {seat_id: 0 for seat_id in self.seat_ids}
        self._last_timestamp = None

    def update(self, timestamp: float, association: AssociationResult) -> list[HistoryEntry]:
        if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp) or timestamp < 0:
            raise ValueError("Source timestamp must be finite and nonnegative.")
        if self._last_timestamp is not None and timestamp <= self._last_timestamp:
            raise ValueError("Source timestamps must strictly increase.")
        if set(association.assignments) != set(self.seat_ids):
            raise ValueError("Association seats must exactly match history seats.")
        result = []
        for seat_id in self.seat_ids:
            observation = association.assignments[seat_id]
            reason = association.seat_reasons[seat_id]
            direction = getattr(observation, "direction", "unknown")
            unavailable = getattr(observation, "unavailable_reason", None)
            valid = observation is not None and reason is None and direction in DIRECTIONS and unavailable is None
            if not valid:
                direction = "unknown"
                reason = reason or unavailable or "unusable_direction"
                self._active[seat_id] = None
                segment_id, continuous = None, 0.0
            else:
                active = self._active[seat_id]
                if active is None or active["direction"] != direction or timestamp - active["last"] > self.max_gap_seconds + 1e-9:
                    active = {"id": self._next_segment[seat_id], "start": float(timestamp),
                              "last": float(timestamp), "direction": direction}
                    self._next_segment[seat_id] += 1
                    self._active[seat_id] = active
                active["last"] = float(timestamp)
                segment_id = active["id"]
                continuous = float(timestamp) - active["start"]
                reason = None
            entry = HistoryEntry(seat_id, float(timestamp), direction, valid, reason,
                                 association.detection_indices.get(seat_id), segment_id, continuous)
            self.entries[seat_id].append(entry)
            result.append(entry)
        self._last_timestamp = float(timestamp)
        return result

    def to_dict(self) -> dict:
        return {"schema_version": 1,
                "timebase": "source session seconds; never processing wall time",
                "max_gap_seconds": self.max_gap_seconds,
                "duration_note": "Observed same-direction span only; gaps reset continuity; no movement events inferred.",
                "seats": {seat_id: [entry.to_dict() for entry in entries]
                          for seat_id, entries in self.entries.items()}}
