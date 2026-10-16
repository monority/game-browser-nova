/**
 * Fixed-timestep frame loop (ADR-002): rendering runs independently,
 * simulation advances in fixed ticks. Backlog capped so pause /
 * suspension never fast-forwards on resume.
 */

export function startFixedTimestepLoop(
  onTick: () => void,
  tickMs: () => number,
  onError?: (error: unknown) => void,
): { stop(): void } {
  let last = performance.now();
  let accumulator = 0;
  let frameHandle = 0;
  let stopped = false;

  function frame(now: number): void {
    if (stopped) return;
    accumulator += now - last;
    last = now;
    accumulator = Math.min(accumulator, 1000);
    const step = tickMs();
    try {
      while (accumulator >= step) {
        onTick();
        accumulator -= step;
      }
    } catch (error) {
      // A throwing tick must never kill the loop silently: stop
      // deliberately (no reschedule below) and report through onError
      // so the app can pause and tell the player what happened.
      stopped = true;
      cancelAnimationFrame(frameHandle);
      onError?.(error);
      return;
    }
    frameHandle = requestAnimationFrame(frame);
  }
  frameHandle = requestAnimationFrame(frame);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(frameHandle);
    },
  };
}
