import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_EXAM, validateExamDetails } from '../src/lib/exam-details.ts';

test('missing exam details become empty strings', () => {
  assert.deepEqual(validateExamDetails(undefined), { title: '', room: '', proctor: '' });
  assert.deepEqual(validateExamDetails(null), EMPTY_EXAM);
  assert.deepEqual(validateExamDetails({ title: 'Math 101' }), { title: 'Math 101', room: '', proctor: '' });
});

test('exam details are trimmed', () => {
  assert.deepEqual(validateExamDetails({ title: '  Math 101  ', room: ' 204 ', proctor: ' Prof. Cruz ' }),
    { title: 'Math 101', room: '204', proctor: 'Prof. Cruz' });
});

test('exam details over 120 characters or not text are refused', () => {
  assert.throws(() => validateExamDetails({ title: 'x'.repeat(121) }), /at most 120 characters/);
  assert.throws(() => validateExamDetails({ room: 204 }), /at most 120 characters/);
  assert.throws(() => validateExamDetails('Math 101'), /at most 120 characters/);
  assert.equal(validateExamDetails({ title: 'x'.repeat(120) }).title.length, 120);
});
