/** Optional details about the exam, entered at camera setup and printed at the top of the faculty PDF report. */
export interface ExamDetails { title: string; room: string; proctor: string }

export const EMPTY_EXAM: ExamDetails = { title: '', room: '', proctor: '' };
export const MAX_EXAM_TEXT = 120;

const PROBLEM = `Exam details must be text of at most ${MAX_EXAM_TEXT} characters.`;

/** Missing details become empty strings; each value is trimmed; anything else is refused. */
export function validateExamDetails(value: unknown): ExamDetails {
  if (value === undefined || value === null) return { ...EMPTY_EXAM };
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(PROBLEM);
  const input = value as Record<string, unknown>;
  const read = (key: keyof ExamDetails) => {
    const text = input[key];
    if (text === undefined || text === null) return '';
    if (typeof text !== 'string') throw new Error(PROBLEM);
    const trimmed = text.trim();
    if (trimmed.length > MAX_EXAM_TEXT) throw new Error(PROBLEM);
    return trimmed;
  };
  return { title: read('title'), room: read('room'), proctor: read('proctor') };
}
