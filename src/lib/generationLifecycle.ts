export const GENERATION_TIMEOUT_MS = 15 * 60_000;

export const GENERATION_TIMEOUT_MESSAGE =
  'This widget took longer than 15 minutes to build. Try again.';

export function generationDeadline(startedAt: number): number {
  return startedAt + GENERATION_TIMEOUT_MS;
}

export function generationTimedOut(deadlineAt: number, now = Date.now()): boolean {
  return Math.sign(now - deadlineAt) !== -1;
}
