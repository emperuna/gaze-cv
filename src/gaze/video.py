"""Saved constant-frame-rate video processing with source-time observations."""
from __future__ import annotations

from collections import Counter
from importlib.metadata import PackageNotFoundError, version
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import time

import cv2


class VideoError(ValueError):
    """An input, timestamp, or video output could not be used."""


def source_timestamp(frame_index: int, fps: float) -> float:
    """Return session seconds for a zero-based CFR frame, never processing time."""
    if frame_index < 0 or not math.isfinite(fps) or fps <= 0:
        raise VideoError("Source frame index and FPS must be valid and positive.")
    return frame_index / fps


def _environment() -> dict:
    dependencies = {}
    for name in ("numpy", "opencv-contrib-python", "opencv-python", "mediapipe"):
        try:
            dependencies[name] = version(name)
        except PackageNotFoundError:
            pass
    return {"os": platform.platform(), "python": platform.python_version(),
            "cpu": platform.processor() or os.environ.get("PROCESSOR_IDENTIFIER", "unreported"),
            "machine": platform.machine(), "logical_cpus": os.cpu_count(),
            "dependencies": dependencies}


def process_video(input_path, output_dir, pipeline, *, annotate_fn=None,
                  max_frames=None, warmup_frames=5, expected_faces=None,
                  evidence_frame=None, run_label="unspecified", seat_associator=None,
                  history_tracker=None, seat_config=None, movement_monitor=None) -> dict:
    """Save annotations, frame observations and measured throughput on a CFR clip.

    ``pipeline`` exposes process(BGR)->ImageResult. Detections are independent per
    frame, with no identities, seat associations or event interpretation. A fixed
    expected face count is only a count-deficit reference, not matched detection
    recall or pose ground truth. VFR inputs must first be converted to CFR.
    """
    if (seat_associator is None) != (history_tracker is None):
        raise VideoError("Seat association and history tracking must be supplied together.")
    if movement_monitor is not None and seat_associator is None:
        raise VideoError("Movement events require configured seat observations.")
    if movement_monitor is not None and movement_monitor.settings.max_gap > history_tracker.max_gap_seconds:
        raise VideoError("Event maximum gap cannot exceed the history maximum observation gap.")
    input_path, output_dir = Path(input_path), Path(output_dir)
    if not input_path.is_file():
        raise VideoError(f"Video file does not exist: {input_path}")
    pipeline_metadata = getattr(pipeline, 'metadata', {})
    required_source = pipeline_metadata.get('required_input_sha256')
    if required_source is not None and required_source != _sha256(input_path):
        raise VideoError('Calibration source checksum does not match this video')
    mirrored = pipeline_metadata.get('mirrored_input', False)
    if seat_config is not None and seat_config.get("source_sha256") and seat_config["source_sha256"] != _sha256(input_path):
        raise VideoError("Seat configuration source checksum does not match this video.")
    if max_frames is not None and max_frames <= 0:
        raise VideoError("max_frames must be positive.")
    if warmup_frames < 0 or (expected_faces is not None and expected_faces <= 0):
        raise VideoError("warmup_frames must be nonnegative; expected_faces must be positive.")
    if annotate_fn is None:
        from gaze.visualization import annotate
        annotate_fn = annotate
    output_dir.mkdir(parents=True, exist_ok=True)
    # Runs get their own directory; do not silently overwrite observations.
    if any((output_dir / name).exists() for name in
           ("annotated.avi", "observations.jsonl", "summary.json", "seat_history.json", "events.json")):
        raise VideoError("Output directory already contains video results; use a new directory.")
    if evidence_frame is not None and Path(evidence_frame).exists():
        raise VideoError("Evidence image already exists; choose a new path.")
    if evidence_frame is not None and not cv2.haveImageWriter(str(evidence_frame)):
        raise VideoError("Evidence output needs a supported image extension, such as .jpg or .png.")
    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        capture.release()
        raise VideoError(f"Cannot decode saved video: {input_path}")
    writer = None
    counts = Counter()
    direction_counts = Counter()
    measured_seconds = inference_seconds = 0.0
    measured_frames = unknown_count = deficits = total_faces = 0
    frame_index = 0
    saved_evidence = None
    started = time.perf_counter()
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        source_timestamp(0, fps)
        advertised_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        width, height = None, None
        output_width, output_height = None, None
        with (output_dir / "observations.jsonl").open("x", encoding="utf-8") as observations:
            while max_frames is None or frame_index < max_frames:
                frame_started = time.perf_counter()
                ok, frame = capture.read()
                if not ok:
                    break
                h, w = frame.shape[:2]
                if writer is None:
                    width, height = w, h
                    # MJPG silently truncates odd edges; preserve them by padding.
                    output_width, output_height = w + w % 2, h + h % 2
                    writer = cv2.VideoWriter(str(output_dir / "annotated.avi"),
                                             cv2.VideoWriter_fourcc(*"MJPG"), fps, (output_width, output_height))
                    if not writer.isOpened():
                        raise VideoError("Cannot create MJPG annotated.avi; check installed video codecs.")
                elif (w, h) != (width, height):
                    raise VideoError("Video frame dimensions changed within the source.")
                timestamp = source_timestamp(frame_index, fps)
                inference_started = time.perf_counter()
                result = pipeline.process(frame)
                inference_elapsed = time.perf_counter() - inference_started
                association = None
                review_flags = []
                if seat_associator is not None:
                    association = seat_associator.associate(result.detections, w, h, mirrored=mirrored)
                    entries = history_tracker.update(timestamp, association)
                    if movement_monitor is not None:
                        movement_monitor.update(timestamp, {entry.seat_id: entry.direction for entry in entries},
                                                {entry.seat_id: entry.estimation_source for entry in entries})
                        review_flags = movement_monitor.review_flags()
                annotated = annotate_fn(frame, result)
                if association is not None and seat_config is not None:
                    _annotate_seats(annotated, association, seat_config, mirrored)
                if review_flags:
                    panel_top = max(0, h-32-24*len(review_flags))
                    cv2.rectangle(annotated, (0, panel_top), (w-1, h-30), (20, 20, 20), -1)
                for flag_index, flag in enumerate(review_flags):
                    text = f"{flag['seat_id']}: For instructor review ({flag['direction']})"
                    baseline_y = h-38-24*(len(review_flags)-1-flag_index)
                    cv2.putText(annotated, text, (8, max(12, baseline_y)),
                                cv2.FONT_HERSHEY_SIMPLEX, .45, (0, 180, 255), 1, cv2.LINE_AA)
                cv2.putText(annotated, f"frame={frame_index} source={timestamp:.3f}s",
                            (12, h - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                encoded_frame = annotated
                if (output_width, output_height) != (w, h):
                    encoded_frame = cv2.copyMakeBorder(annotated, 0, output_height-h, 0, output_width-w,
                                                       cv2.BORDER_REPLICATE)
                writer.write(encoded_frame)
                faces = len(result.detections)
                counts[faces] += 1
                total_faces += faces
                for detection in result.detections:
                    direction_counts[detection.direction] += 1
                    unknown_count += detection.direction == "unknown"
                deficit = None if expected_faces is None else max(0, expected_faces - faces)
                if deficit is not None:
                    deficits += deficit
                record = {"frame_index": frame_index, "source_timestamp_seconds": timestamp,
                          "face_count": faces, "expected_face_count": expected_faces,
                          "count_deficit": deficit, "inference_seconds": inference_elapsed,
                          "result": result.to_dict(), "review_flags": review_flags}
                if association is not None:
                    record["seat_association"] = association.to_dict()
                observations.write(json.dumps(record, allow_nan=False) + "\n")
                if evidence_frame is not None and saved_evidence is None and faces >= 3:
                    evidence_path = Path(evidence_frame)
                    evidence_path.parent.mkdir(parents=True, exist_ok=True)
                    try:
                        ok, encoded = cv2.imencode(evidence_path.suffix, annotated)
                    except cv2.error as error:
                        raise VideoError("Could not encode the evidence image.") from error
                    if not ok:
                        raise VideoError("Could not encode the evidence image.")
                    # Exclusive creation protects a shared evidence destination.
                    with evidence_path.open("xb") as evidence_output:
                        evidence_output.write(encoded.tobytes())
                    saved_evidence = str(evidence_path)
                if frame_index >= warmup_frames:
                    measured_frames += 1
                    inference_seconds += inference_elapsed
                    measured_seconds += time.perf_counter() - frame_started
                frame_index += 1
        if frame_index == 0:
            raise VideoError("The video contains no decodable frames.")
        # A short clip can be processed, but has no timed post-warmup result.
        summary = {"schema_version": 2, "run_label": run_label,
                   "input": str(input_path),
                   "input_sha256": _sha256(input_path),
                   "environment": _environment(),
                   "pipeline": getattr(pipeline, "metadata", {"backend": "injected"}),
                   "source": {"width": width, "height": height, "fps": fps,
                              "advertised_frames": advertised_frames,
                              "timebase": "constant frame rate: zero-based frame_index / source_fps",
                              "last_timestamp_seconds": source_timestamp(frame_index - 1, fps),
                              "processed_duration_seconds": frame_index / fps},
                   "output": {"width": output_width, "height": output_height, "codec": "MJPG",
                              "padding_right": output_width-width, "padding_bottom": output_height-height,
                              "padding_mode": "replicate; source coordinates unchanged"},
                   "processed_frames": frame_index,
                   "stopped_at_requested_limit": max_frames is not None and frame_index >= max_frames,
                   "decoded_fewer_than_advertised": advertised_frames > 0 and frame_index < advertised_frames,
                   "face_count_histogram": dict(sorted(counts.items())),
                   "frames_with_at_least_three_faces": sum(n for k, n in counts.items() if k >= 3),
                   "detected_observations": total_faces, "unknown_observations": unknown_count,
                   "direction_counts": dict(direction_counts),
                   "expected_face_count": expected_faces,
                   "count_deficit_observations": None if expected_faces is None else deficits,
                   "reference_note": "Fixed count deficits do not establish matched recall, identities or direction accuracy.",
                   "timing": {"warmup_frames": min(frame_index, warmup_frames),
                              "measured_frames": measured_frames,
                              "measured_seconds": measured_seconds,
                              "processing_fps": measured_frames / measured_seconds if measured_seconds else None,
                              "inference_seconds": inference_seconds,
                              "inference_fps": measured_frames / inference_seconds if inference_seconds else None,
                              "scope": "Per-frame decode, preprocessing, detection, classification, optional seat/history/event updates, annotation, AVI encoding, buffered JSON write and optional evidence image save; excludes model initialization, warmup frames, final flush, final history/event export and summary/hash writing.",
                              "elapsed_before_summary_seconds": time.perf_counter() - started},
                   "evidence_frame": saved_evidence,
                   "seat_configuration": seat_config,
                   "seat_history_file": "seat_history.json" if history_tracker is not None else None,
                   "movement_events_file": "events.json" if movement_monitor is not None else None,
                   "observation_kind": "heads" if pipeline_metadata.get('estimation_source') == 'head_pose_fallback' else "faces",
                   "count_field_note": "face_count/count histogram field names retained for compatibility; use observation_kind to distinguish head mode",
                   "limitations": ["CFR inputs only; VFR timestamps are not supported.",
                                   "No person identities or misconduct inference; event accuracy remains unvalidated.",
                                   "Seat association and observation histories require explicit seat configuration."]}
    finally:
        capture.release()
        if writer is not None:
            writer.release()
    if history_tracker is not None:
        history_record = history_tracker.to_dict()
        history_record.update({"input_sha256": summary["input_sha256"], "run_label": run_label,
                               "pipeline": summary["pipeline"], "seat_configuration": seat_config})
        (output_dir / "seat_history.json").write_text(
            json.dumps(history_record, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    if movement_monitor is not None:
        event_record = movement_monitor.to_dict()
        event_record["input_sha256"] = summary["input_sha256"]
        event_record["run_label"] = run_label
        event_record["pipeline"] = summary["pipeline"]
        event_record["seat_configuration"] = seat_config
        (output_dir / "events.json").write_text(
            json.dumps(event_record, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    return summary


def _sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _annotate_seats(image, association, config, mirrored=False):
    height, width = image.shape[:2]
    for seat in config["seats"]:
        seat_id = seat["id"]
        x0, y0, x1, y1 = seat["roi"]
        if mirrored:
            x0, x1 = 1-x1, 1-x0
        observation = association.assignments[seat_id]
        direction = observation.direction if observation is not None else "unknown"
        reason = association.seat_reasons[seat_id]
        label = f"{seat_id}: {direction}" + (f" ({reason})" if reason else "")
        color = (0, 170, 220) if direction == "unknown" else (220, 120, 30)
        cv2.rectangle(image, (round(x0*width), round(y0*height)),
                      (round(x1*width), round(y1*height)), color, 1)
        cv2.putText(image, label, (round(x0*width), max(18, round(y0*height)-10)),
                    cv2.FONT_HERSHEY_SIMPLEX, .45, color, 1, cv2.LINE_AA)
