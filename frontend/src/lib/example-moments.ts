// Fictional observations for the landing page example. Not model output.
export type ExampleDirection = 'Forward' | 'Left' | 'Right' | 'Down' | 'Unknown';
export type ExampleSeatId = '01' | '02' | '03' | '04';
export interface ExampleSeat { id: ExampleSeatId; tag: { x: number; y: number }; box: [number, number, number, number] }
export interface Segment { start: number; end: number; direction: ExampleDirection }
export interface ExampleMoment { time: number; seat: ExampleSeatId; title: string; note: string }

export const EXAMPLE_DURATION = 48;

// Percentages of ocular-output-mockup.png. `tag` sits beside the baked seat number;
// `box` (left, top, width, height) is the baked seat region, used to frost unseen seats.
export const EXAMPLE_SEATS: ExampleSeat[] = [
  { id: '01', tag: { x: 22, y: 42 }, box: [18.5, 42.3, 16.2, 51.2] },
  { id: '03', tag: { x: 34, y: 30.6 }, box: [30.7, 30.5, 16.4, 37.3] },
  { id: '04', tag: { x: 58, y: 31.4 }, box: [54.5, 30.2, 16.9, 37.6] },
  { id: '02', tag: { x: 72.3, y: 42 }, box: [68.6, 46.5, 16.2, 46.8] },
];

export const EXAMPLE_TIMELINES: Record<ExampleSeatId, Segment[]> = {
  '01': [{ start: 0, end: 20, direction: 'Forward' }, { start: 20, end: 30, direction: 'Down' }, { start: 30, end: 48, direction: 'Forward' }],
  '02': [{ start: 0, end: 10, direction: 'Forward' }, { start: 10, end: 16, direction: 'Unknown' }, { start: 16, end: 33, direction: 'Forward' }, { start: 33, end: 40, direction: 'Unknown' }, { start: 40, end: 48, direction: 'Forward' }],
  '03': [{ start: 0, end: 9, direction: 'Forward' }, { start: 9, end: 15, direction: 'Left' }, { start: 15, end: 39, direction: 'Forward' }, { start: 39, end: 48, direction: 'Down' }],
  '04': [{ start: 0, end: 34, direction: 'Forward' }, { start: 34, end: 38, direction: 'Right' }, { start: 38, end: 48, direction: 'Forward' }],
};

export const EXAMPLE_MOMENTS: ExampleMoment[] = [
  { time: 12, seat: '03', title: 'Check seat 03.', note: 'Illustrative alert: a sustained left turn. A direction describes what was seen, not why.' },
  { time: 24, seat: '01', title: 'Seat 01 looks down.', note: 'Writing looks the same; down never alerts.' },
  { time: 36, seat: '04', title: 'Check seat 04.', note: 'Illustrative alert: a sustained right turn. The instructor decides what it means.' },
  { time: 38, seat: '02', title: 'Seat 02 is out of view.', note: 'Out of view; gaps are never filled in.' },
];

export function directionAt(seat: ExampleSeatId, time: number): ExampleDirection {
  return EXAMPLE_TIMELINES[seat].find(s => s.start <= time && time < s.end)?.direction ?? 'Unknown';
}
