# Faculty seat check report: design

Status: draft for approval, 20 November 2026. Mockup: https://claude.ai/artifact/86XCi8Zj5wdPAN2wjYsyo8 (three A4 pages, sample data).

## Intent

The main users are faculty. After an exam they open the live camera session's PDF to decide which students to look at again. Today's camera PDF reads like a technical log: UTC times, minutes into the session, raw settings, internal event names and frame counts. The new PDF leads with the seats that need attention, uses clock times and plain words, shows where each seat is and when alerts happened, states what Ocular could not see, and gives the faculty member room to record a decision.

## Goals

1. Page 1, summary: exam name, date, clock-time range, room, proctor and number of seats; four at-a-glance numbers (alerts, seats to look at again, alerts not reviewed, minutes not watched); a ranked **Seats to look at again** table; a seat map; an alert timeline.
2. Page 2, alert details: alerts grouped by seat, most activity first. Each alert shows its photo, clock time, what happened in plain words, and the faculty member's mark and note. Unreviewed alerts are highlighted, with Follow up / Nothing to follow up tick boxes. Dismissed alerts are shown smaller.
3. Page 3: **What Ocular could not see** (camera-off gaps, hidden seats); **Your review** (Follow up / No action per seat with alerts, overall notes, reviewed by, signature, date); **How to read this report**; one small line of session details.
4. Every page: confidential footer and "Page N of M".

## Non-goals

- Saved video and image reports are unchanged.
- No identity recognition. Ocular does not store student names.
- No change to how alerts are detected or grouped.

## Anti-goals

The report fails if it says or implies "suspicious", "cheating" or "incident"; if a seat without alerts reads as cleared while it was hidden; or if technical details crowd out the decision.

## Decisions

| Decision | Made by |
| --- | --- |
| Content and layout follow the three-page mockup. | User ("looks good, apply those") |
| Faculty are the main users; plain words throughout. | User |
| Students are matched to seats by hand: a blank **Student** column on page 1 that the faculty member fills in from their seating chart. Ocular stores no names. | Design call; the user approved the mockup that shows it. Typing names into Ocular is the alternative, deferred. |
| "Look again" = a seat with at least one alert not dismissed (Checked or not reviewed). Order: look-again seats by number of non-dismissed alerts, then by total alerts; then seats whose alerts were all dismissed; seats without alerts are listed in one line. | Design call |
| Times are clock times in the laptop's local time zone ("9:41 AM"), computed from each monitoring segment's start time plus session seconds. | Design call |
| Optional exam, room and proctor fields sit in a collapsible **About this exam** section on the Camera setup screen, closed by default. They're saved in the session; blank ones print as lines to fill in by hand. | User (20 Nov: "make it collapsible"), after first asking to remove the fields |
| The seat map is drawn from the saved seat boxes as the camera sees the room, labelled "As seen from the camera". Look-again seats are highlighted; seats hidden for 10% or more of the session are dashed. | Design call |
| The timeline runs from the start to the end of the session, one row per seat. Alert marks are coloured by mark (Checked, Not reviewed, Dismissed), hidden stretches are hatched, and camera-off gaps are a band across all rows. | Design call |
| Hidden seat reason reads "Face not visible"; a camera-off gap reads "Camera stopped; monitoring resumed". Ocular cannot know more. | Design call |
| Alert wording: sustained → "Looked right for 4.2 seconds"; repeated → "Turned right 4 times"; a grouped alert spans its first to last time. | Design call |
| Technical details shrink to one line at the end: session id, camera start time, alert rules. | Design call |

## Approaches considered

- **A. Structured camera report (chosen).** The Node report builder sends a structured `faculty` section (header, glance numbers, seats, seat boxes, timeline, alerts by seat, blind spots); the Python renderer gets a camera-only layout that draws the seat map and timeline with ReportLab graphics. Saved video and image keep the current layout.
- **B. Keep the generic report shape and only reword it.** Cheaper, but there's no seat map, timeline or ranked table: it can't produce the mockup.
- **C. Render HTML to PDF in the browser.** Faithful to the mockup's CSS, but it adds a headless-browser dependency and moves PDF creation away from the shared renderer. Rejected.

## Constraints

- Local only; ReportLab 5.1.0 (already pinned). Existing limits stay: ≤ 200 stills, images only from the session folder, report JSON ≤ 4 MB, PDF ≤ 48 MB.
- Repository rules: Conventional Commits, no commit without the user's say-so, plain words for faculty.

## Verification

- Python: the camera layout renders with and without exam info, with 0 alerts, with unreviewed alerts, with a missing still, and with many seats (20); the confidential footer and page numbers are drawn; banned words are absent.
- TypeScript: seat ranking, the look-again rule, clock-time conversion across a resume gap, blind-spot rows, the exam fields saved and validated (length ≤ 120).
- A real PDF from a fake-camera session, opened and checked against the mockup.

## Left to the builder

Exact font sizes and colours within the mockup's look, how page breaks fall, and the timeline's tick spacing.
