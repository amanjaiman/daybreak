import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GENERATION_TIMEOUT_MS,
  generationDeadline,
  generationTimedOut,
} from '../src/lib/generationLifecycle.ts';

test('widget generation deadline', () => {
  const startedAt = 1_000;
  const deadlineAt = generationDeadline(startedAt);

  assert.equal(deadlineAt, startedAt + GENERATION_TIMEOUT_MS);
  assert.equal(generationTimedOut(deadlineAt, deadlineAt - 1), false);
  assert.equal(generationTimedOut(deadlineAt, deadlineAt), true);
});
