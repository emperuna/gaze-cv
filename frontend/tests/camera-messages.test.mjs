import test from 'node:test';
import assert from 'node:assert/strict';
import { PlainError, cameraProblem, describeProblem } from '../src/lib/camera-messages.ts';

const dom = name => new DOMException('raw browser text', name);

test('plain errors keep their words; anything else gets the plain fallback with the raw text as detail', () => {
  assert.deepEqual(describeProblem(new PlainError('The camera could not start. Press Start again.', 'spawn python ENOENT'), 'x'),
    { text: 'The camera could not start. Press Start again.', detail: 'spawn python ENOENT' });
  assert.deepEqual(describeProblem(new SyntaxError('Unexpected token < in JSON'), 'Monitoring could not start.'),
    { text: 'Monitoring could not start.', detail: 'Unexpected token < in JSON' });
  assert.deepEqual(describeProblem('oops', 'Fallback.'), { text: 'Fallback.', detail: 'oops' });
  assert.deepEqual(describeProblem(undefined, 'Fallback.'), { text: 'Fallback.', detail: '' });
});

test('camera errors name the button to press, and never show raw browser text', () => {
  assert.match(cameraProblem(dom('NotAllowedError')).text, /^Allow camera access in the browser, then press Start again\.$/);
  assert.match(cameraProblem(dom('NotFoundError'), 'Resume').text, /connect it, then press Resume again\./);
  assert.match(cameraProblem(dom('NotReadableError')).text, /close other apps using it, then press Start again\./);
  assert.equal(cameraProblem(dom('OverconstrainedError')).text, 'That camera is unavailable: choose another, then press Start again.');
  for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError']) {
    assert.doesNotMatch(cameraProblem(dom(name)).text, /raw browser text/);
  }
  const lost = cameraProblem(new TypeError('Failed to fetch'));
  assert.deepEqual(lost, { text: 'The camera stopped. Press Start again.', detail: 'Failed to fetch' });
});

test('a missing camera while interrupted points to Back to past sessions, which has the camera list', () => {
  for (const name of ['OverconstrainedError', 'NotFoundError']) {
    const text = cameraProblem(dom(name), 'Resume', 'interrupted').text;
    assert.match(text, /Back to past sessions/);
    assert.doesNotMatch(text, /choose another, then press/);
  }
});
