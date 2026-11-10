import * as THREE from "three";
import type { GameState } from "@/domain/simulation/state.js";

/**
 * Orbit camera input (drag rotate, wheel zoom, right-drag pan).
 * Presentation-only: the world is read once for the initial framing and
 * never mutated.
 */

export interface OrbitState {
  theta: number;
  phi: number;
  radius: number;
  target: THREE.Vector3;
  detach(): void;
  apply(): void;
}

export function createOrbitControls(
  camera: THREE.PerspectiveCamera,
  container: HTMLElement,
  state: GameState,
): OrbitState {
  const target = new THREE.Vector3(state.world.width / 2, 0, state.world.height / 2);
  const orbit: OrbitState = {
    theta: Math.PI / 4,
    phi: Math.PI / 3.2,
    radius: Math.max(state.world.width, state.world.height) * 1.1,
    target,
    detach: () => {
      container.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("contextmenu", onContextMenu);
    },
    apply: () => syncCameraToOrbit(camera, orbit),
  };

  let dragging: "rotate" | "pan" | null = null;
  let lastX = 0;
  let lastY = 0;

  function onDown(event: PointerEvent): void {
    dragging = event.button === 2 ? "pan" : "rotate";
    lastX = event.clientX;
    lastY = event.clientY;
  }
  function onMove(event: PointerEvent): void {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (dragging === "rotate") {
      orbit.theta -= dx * 0.005;
      orbit.phi = clamp(orbit.phi - dy * 0.005, 0.15, Math.PI / 2.05);
    } else {
      const panScale = orbit.radius * 0.0016;
      const sin = Math.sin(orbit.theta);
      const cos = Math.cos(orbit.theta);
      orbit.target.x -= (dx * cos - dy * sin) * panScale;
      orbit.target.z -= (-dx * sin - dy * cos) * panScale;
    }
  }
  function onUp(): void {
    dragging = null;
  }
  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    orbit.radius = clamp(orbit.radius * (1 + Math.sign(event.deltaY) * 0.1), 5, 80);
  }
  function onContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  container.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  container.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("contextmenu", onContextMenu);

  return orbit;
}

export function syncCameraToOrbit(
  camera: THREE.PerspectiveCamera,
  orbit: OrbitState,
): void {
  camera.position.set(
    orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
    orbit.target.y + orbit.radius * Math.cos(orbit.phi),
    orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta),
  );
  camera.lookAt(orbit.target.x, 0, orbit.target.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
