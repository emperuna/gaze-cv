"""Source-time movement observations for human review, never misconduct judgments."""
from collections import deque
from dataclasses import asdict, dataclass
import math

DIRECTIONS = {"forward", "left", "right", "down", "unknown"}
TIME_EPSILON = 1e-9

@dataclass(frozen=True)
class MovementSettings:
    min_duration: float = 2.0
    repetition_count: int = 3
    repetition_window: float = 10.0
    max_gap: float = 0.5
    repeat_min_duration: float = 0.25

    def __post_init__(self):
        if any(not math.isfinite(v) or v <= 0 for v in (self.min_duration, self.repetition_window, self.max_gap, self.repeat_min_duration)):
            raise ValueError("Duration, repetition window, and maximum observation gap must be finite and positive")
        if isinstance(self.repetition_count, bool) or not isinstance(self.repetition_count, int) or self.repetition_count < 2:
            raise ValueError("Repetition count must be an integer of at least two")

    def to_dict(self):
        return asdict(self)


class MovementMonitor:
    """Track per-seat episodes; missing observations cannot accumulate duration.

    A sustained record starts at its threshold crossing and extends while the
    same movement is still observed. Repetition counts separate entries into a
    direction after a minimum continuous dwell, not video frames; observations interrupted by unknown data clear
    the repetition window so an unseen episode is never inferred.
    """
    def __init__(self, seat_ids, settings=None):
        seat_ids = list(seat_ids)
        if not seat_ids or len(set(seat_ids)) != len(seat_ids) or any(not isinstance(s, str) or not s for s in seat_ids):
            raise ValueError("Unique nonempty seat IDs are required")
        self.settings = settings or MovementSettings()
        self.states = {s: {"direction": "unknown", "start": None, "last": None,
                           "event": None, "repeat_counted": False, "entries": {d: deque() for d in ("left", "right", "down")}} for s in seat_ids}
        self.events = []
        self.last_timestamp = None

    def update(self, timestamp, directions):
        if not math.isfinite(timestamp) or timestamp < 0 or (self.last_timestamp is not None and timestamp <= self.last_timestamp):
            raise ValueError("Source timestamps must be finite, nonnegative, and strictly increasing")
        if any(s not in self.states or d not in DIRECTIONS for s, d in directions.items()):
            raise ValueError("Unknown seat or direction")
        self.last_timestamp = timestamp
        new = []
        for seat, state in self.states.items():
            direction = directions.get(seat, "unknown")
            gap = state["last"] is not None and timestamp - state["last"] > self.settings.max_gap + TIME_EPSILON
            if direction == "unknown" or gap:
                state["direction"], state["start"], state["event"] = "unknown", None, None
                state["repeat_counted"] = False
                for queue in state["entries"].values():
                    queue.clear()
            if direction == "unknown":
                state["last"] = timestamp
                continue
            if direction != state["direction"]:
                state["direction"], state["start"], state["event"] = direction, timestamp, None
                state["repeat_counted"] = False
            if direction != "forward":
                elapsed = timestamp - state["start"]
                if not state["repeat_counted"] and elapsed + TIME_EPSILON >= self.settings.repeat_min_duration:
                    queue = state["entries"][direction]
                    while queue and timestamp - queue[0] > self.settings.repetition_window + TIME_EPSILON:
                        queue.popleft()
                    queue.append(state["start"])
                    state["repeat_counted"] = True
                    if len(queue) >= self.settings.repetition_count:
                        event = {"seat_id": seat, "event_type": "repeated_movement", "direction": direction,
                                 "start_time": queue[0], "end_time": timestamp, "duration": timestamp - queue[0],
                                 "repetition_count": len(queue), "observed_at": timestamp}
                        self.events.append(event)
                        new.append(dict(event))
                        queue.clear()
                if elapsed + TIME_EPSILON >= self.settings.min_duration:
                    if state["event"] is None:
                        event = {"seat_id": seat, "event_type": "sustained_movement", "direction": direction,
                                 "start_time": state["start"], "end_time": timestamp, "duration": elapsed,
                                 "observed_at": timestamp}
                        self.events.append(event)
                        state["event"] = event
                        new.append(dict(event))
                    else:
                        state["event"]["end_time"], state["event"]["duration"] = timestamp, elapsed
            state["last"] = timestamp
        return new

    def to_dict(self):
        return {"settings": self.settings.to_dict(), "events": [dict(event) for event in self.events],
                "semantics": "source-time head movement observations for instructor review; no misconduct inference",
                "validation": "rule behavior tested on synthetic sequences; real event accuracy unvalidated"}
