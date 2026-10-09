import * as THREE from "three";
import type { GameState } from "../domain/simulation/state.js";
import type { BuildingType } from "../content/buildings.js";
import { parseCellKey } from "../domain/shared/cells.js";

/**
 * Presentation layer (ADR-001): the renderer consumes simulation state
 * and never mutates it. The scene is rebuilt from canonical state on
 * update() — called once per simulation tick, not per frame.
 */

export interface Renderer {
  update(state: GameState): void;
  dispose(): void;
}

const TILE = 1;

const BUILDING_COLORS: Record<BuildingType, number> = {
  residence: 0x4a90d9,
  farm: 0x7fb069,
  well: 0x5bc0eb,
  workshop: 0xd98e4a,
  lumberCamp: 0x8a6f4d,
  quarry: 0x9b9b9b,
  colonyCenter: 0xc0c781,
};

export function createRenderer(container: HTMLElement, state: GameState): Renderer {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e14);

  const camera = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    0.1,
    200,
  );
  const orbit = createOrbitControls(camera, container, state);
  syncCameraToOrbit(camera, orbit, state);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const directional = new THREE.DirectionalLight(0xffffff, 1.1);
  directional.position.set(10, 18, 8);
  scene.add(directional);

  // --- static terrain -----------------------------------------------------
  const staticGroup = buildTerrain(state);
  scene.add(staticGroup);

  // --- dynamic groups (rebuilt per tick) ----------------------------------
  const buildingGroup = new THREE.Group();
  const roadGroup = new THREE.Group();
  const depositGroup = new THREE.Group();
  scene.add(buildingGroup, roadGroup, depositGroup);

  function update(current: GameState): void {
    rebuildGroup(roadGroup, current, (s) => buildRoads(s));
    rebuildGroup(depositGroup, current, (s) => buildDeposits(s));
    rebuildGroup(buildingGroup, current, (s) => buildBuildings(s));
  }

  function renderLoop(): void {
    orbit.apply();
    renderer.render(scene, camera);
    frameHandle = requestAnimationFrame(renderLoop);
  }
  let frameHandle = requestAnimationFrame(renderLoop);

  function dispose(): void {
    cancelAnimationFrame(frameHandle);
    orbit.detach();
    disposeGroup(staticGroup);
    disposeGroup(buildingGroup);
    disposeGroup(roadGroup);
    disposeGroup(depositGroup);
    renderer.dispose();
    renderer.domElement.remove();
  }

  update(state);

  return { update, dispose };
}

// --- orbit camera (drag rotate, wheel zoom, right-drag pan) ---------------

interface OrbitState {
  theta: number;
  phi: number;
  radius: number;
  target: THREE.Vector3;
  detach(): void;
  apply(): void;
}

function createOrbitControls(
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
    apply: () => syncCameraToOrbit(camera, orbit, state),
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

function syncCameraToOrbit(
  camera: THREE.PerspectiveCamera,
  orbit: OrbitState,
  state: GameState,
): void {
  camera.position.set(
    orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
    orbit.target.y + orbit.radius * Math.cos(orbit.phi),
    orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta),
  );
  camera.lookAt(orbit.target.x, 0, orbit.target.z);
  void state;
}

// --- scene builders --------------------------------------------------------

function buildTerrain(state: GameState): THREE.Group {
  const group = new THREE.Group();
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(state.world.width * TILE, 0.1, state.world.height * TILE),
    new THREE.MeshLambertMaterial({ color: 0x1d2b24 }),
  );
  ground.position.set((state.world.width * TILE) / 2, -0.05, (state.world.height * TILE) / 2);
  group.add(ground);

  const blockedMaterial = new THREE.MeshLambertMaterial({ color: 0x39424d });
  for (const key of Object.keys(state.world.blockedCells)) {
    const { x, y } = parseCellKey(key);
    const rock = new THREE.Mesh(
      new THREE.BoxGeometry(TILE, 0.45, TILE),
      blockedMaterial,
    );
    rock.position.set((x + 0.5) * TILE, 0.22, (y + 0.5) * TILE);
    group.add(rock);
  }
  return group;
}

function buildDeposits(state: GameState): THREE.Group {
  const group = new THREE.Group();
  const woodMaterial = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const stoneMaterial = new THREE.MeshLambertMaterial({ color: 0x616161 });
  for (const [key, deposit] of Object.entries(state.woodDeposits)) {
    if (deposit.remaining <= 0) continue;
    const { x, y } = parseCellKey(key);
    const marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.3 + Math.min(deposit.remaining, 20) * 0.03, 6),
      woodMaterial,
    );
    marker.position.set((x + 0.5) * TILE, 0.35, (y + 0.5) * TILE);
    group.add(marker);
  }
  for (const [key, deposit] of Object.entries(state.stoneDeposits)) {
    if (deposit.remaining <= 0) continue;
    const { x, y } = parseCellKey(key);
    const marker = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.28 + Math.min(deposit.remaining, 20) * 0.02),
      stoneMaterial,
    );
    marker.position.set((x + 0.5) * TILE, 0.35, (y + 0.5) * TILE);
    group.add(marker);
  }
  return group;
}

function buildRoads(state: GameState): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: 0x555f6b });
  for (const road of Object.values(state.roads)) {
    for (const key of road.cells) {
      const { x, y } = parseCellKey(key);
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(TILE * 0.9, 0.06, TILE * 0.9),
        material,
      );
      plate.position.set((x + 0.5) * TILE, 0.03, (y + 0.5) * TILE);
      group.add(plate);
    }
  }
  return group;
}

function buildBuildings(state: GameState): THREE.Group {
  const group = new THREE.Group();
  for (const building of Object.values(state.buildings)) {
    const color = BUILDING_COLORS[building.type] ?? 0xffffff;
    const material = new THREE.MeshLambertMaterial({
      color,
      transparent: building.status === "underConstruction",
      opacity: building.status === "underConstruction" ? 0.4 : 1,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), material);
    mesh.position.set((building.x + 0.5) * TILE, 0.35, (building.y + 0.5) * TILE);
    group.add(mesh);
  }
  return group;
}

function rebuildGroup(
  group: THREE.Group,
  state: GameState,
  build: (state: GameState) => THREE.Group,
): void {
  disposeGroup(group);
  const rebuilt = build(state);
  group.add(...rebuilt.children);
  rebuilt.clear();
}

function disposeGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
  }
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
  });
  group.clear();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
