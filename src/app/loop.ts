/**
 * Fixed-timestep frame loop (ADR-002): rendering runs independently,
 * simulation advances in fixed ticks. Backlog capped so pause /
 * suspension never fast-forwards on resume.
 */

export function startFixedTimestepLoop(
  onTick: () => void,
  tickMs: () => number,
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
    while (accumulator >= step) {
      onTick();
      accumulator -= step;
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
