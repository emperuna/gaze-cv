# Nearest seat wins: keep a seat when a student shifts in their chair

## Why

On the live camera, a student who shifts their chair or leans moves their face out of the
tight seat box found at setup. The face is still detected, but it matches no seat, so the
seat reads "unknown" for as long as they sit there and no alert can fire for them.

Seat boxes are tight on purpose: setup pads each face box by 40%, but when neighbours'
padded boxes would overlap, both shrink back to the bare face box, which is the usual case
in a full row.

## Goals

- A small or medium shift in the same chair (leaning, sliding sideways, slouching) keeps
  the seat observed on the live camera.
- A face far from every seat (a proctor walking by, a student standing) is still ignored.
- Behaviour stays predictable and testable: no tracking, no memory between frames.

## Non-goals

- Following a student who moves to a different seat. Ocular does not recognise people;
  a student in seat 3's place is seat 3.
- Changing saved-video review or evaluation; they keep center-in-box matching.
- Showing the reach on the live view (possible follow-up).

## Approaches considered

- **A. Nearest seat wins (chosen).** Each seat is a point with a reach; a face goes to the
  closest seat within reach. Simple, stateless, cannot drift or swap.
- B. Seats follow the student: each seat centre drifts toward its face. Handles bigger
  moves, but seats can swap or drift into each other unnoticed.
- C. "Find seats again" mid-exam. A manual fallback only; kept for later if A is not enough.

The user picked A.

## Design

For the live camera only, `SeatAssociator(config, nearest=True)`:

1. **Seat point:** the centre of the seat's box, in pixels of the canonical (unmirrored) frame.
2. **Reach** (pixels) = the smaller of
   - half the distance to the nearest other seat's point, so reaches never overlap; and
   - the seat box's width, which caps a seat with no close neighbour (about 1–2 face
     widths, depending on whether setup padded the box). Back-row seats have smaller
     boxes, so their reach is smaller too.
3. **Matching a face:** its candidate seats are those whose box contains its centre (as
   today) or whose point is within reach. It goes to the candidate with the closest point.
   No candidate: unassigned (`outside_seat_regions`).
4. **Two faces for one seat:** the closer face counts and the other is unassigned
   (`crowded_seat_region`). Today this makes the seat "ambiguous"; in nearest mode a
   neighbour leaning in no longer blanks the seat.
5. **Alert photo:** when the seat has a face this frame, the still is the seat box's size
   centred on that face, so a shifted student is not cut off. Otherwise the seat box as today.

Unchanged: setup, the saved seat list (boxes), Adjust seats, alerts, PDF, saved-video review.

## Known limit

A student who leans more than halfway toward a neighbour is counted as that neighbour for
that moment.

## Verification

- Unit tests (tests/test_seats.py, tests/test_live_session.py): shifted face stays in its
  seat; beyond halfway goes to the neighbour; two faces near one seat; passer-by far away;
  smaller back-row reach; mirrored frames; default mode unchanged; still centred on the face.
- Replay the iPhone test clip, plus the same clip shifted sideways after setup, and compare
  observed frames and alerts before and after.
- Full Python and frontend suites.
