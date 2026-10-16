import { afterEach, describe, expect, it, vi } from "vitest";
import { startFixedTimestepLoop } from "@/app/loop.js";

/**
 * The fixed-timestep loop must never die silently: a throwing tick
 * stops the loop deliberately and reports through onError (the app
 * pauses and tells the player), instead of just never rescheduling.
 */

const frames: FrameRequestCallback[] = [];
vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
  frames.push(cb);
  return frames.length;
});
vi.stubGlobal("cancelAnimationFrame", (_id: number): void => {});

afterEach(() => {
  frames.length = 0;
});

function runNextFrame(t: number): void {
  const cb = frames.shift();
  if (!cb) throw new Error("no frame scheduled");
  cb(t);
}

/**
 * Drive the loop with exact single-tick steps. NOTE: t0 is read before
 * start() captures `last`, so frame deltas must clear the step by a
 * margin that also absorbs the carry: with step 1000 and 1100 deltas,
 * every frame ticks exactly once (safe for the frame counts used here).
 */
function stepOnce(t0: number, n: number): void {
  runNextFrame(t0 + 1100 * n);
}

describe("fixed-timestep loop error guard", () => {
  it("stops and reports instead of dying silently when a tick throws", () => {
    const bomb = new Error("boom");
    let ticks = 0;
    const errors: unknown[] = [];
    const t0 = performance.now();
    startFixedTimestepLoop(
      () => {
        ticks += 1;
        if (ticks === 2) throw bomb;
      },
      () => 1000,
      (error) => {
        errors.push(error);
      },
    );
    stepOnce(t0, 1); // tick 1 ok, reschedules
    expect(frames.length).toBe(1);
    expect(errors).toEqual([]);
    stepOnce(t0, 2); // tick 2 throws: no reschedule, error reported
    expect(ticks).toBe(2);
    expect(errors).toEqual([bomb]);
    expect(frames.length).toBe(0); // loop stopped: nothing left to run
  });

  it("keeps ticking at the fixed rate when nothing throws", () => {
    let ticks = 0;
    const errors: unknown[] = [];
    const t0 = performance.now();
    startFixedTimestepLoop(
      () => {
        ticks += 1;
      },
      () => 1000,
      (error) => {
        errors.push(error);
      },
    );
    stepOnce(t0, 1);
    stepOnce(t0, 2);
    stepOnce(t0, 3);
    expect(ticks).toBe(3);
    expect(errors).toEqual([]);
    expect(frames.length).toBe(1); // still scheduled
  });
});
