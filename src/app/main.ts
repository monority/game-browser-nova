import { createInitialState, type GameState } from "../domain/simulation/state.js";
import { stepSimulation } from "../domain/simulation/tick.js";
import { createRenderer, type Renderer } from "../renderer/renderer.js";

/**
 * NOVA browser entry: owns the fixed-timestep loop and DOM bootstrap
 * only. Simulation rules live in the domain; rendering is presentation
 * (ADR-001, ADR-002).
 */

const TICK_MS = 500; // fixed simulation tick, independent of frame rate

export function boot(root: HTMLElement): { state: GameState; renderer: Renderer; stop(): void } {
  const state = createInitialState({
    seed: "nova-default",
    width: 24,
    height: 24,
    woodDeposits: [
      { x: 4, y: 4, amount: 60 },
      { x: 18, y: 6, amount: 40 },
    ],
    stoneDeposits: [{ x: 7, y: 18, amount: 50 }],
  });

  const renderer = createRenderer(root, state);

  let last = performance.now();
  let accumulator = 0;
  let frameHandle = 0;

  function frame(now: number): void {
    accumulator += now - last;
    last = now;
    while (accumulator >= TICK_MS) {
      stepSimulation(state);
      accumulator -= TICK_MS;
      renderer.update(state);
    }
    frameHandle = requestAnimationFrame(frame);
  }
  frameHandle = requestAnimationFrame(frame);

  // E2E / diagnostics surface (docs/DEBUGGING.md §3)
  const nova = window as typeof window & { __nova?: unknown };
  nova.__nova = {
    getState: () => state,
    stats: () => ({
      tick: state.tick,
      population: state.population,
      ...state.resources,
    }),
  };

  return {
    state,
    renderer,
    stop: () => {
      cancelAnimationFrame(frameHandle);
      renderer.dispose();
    },
  };
}

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("NOVA: #app root element not found");
boot(root);
