import * as THREE from "three";
import type { GameState } from "../domain/simulation/state.js";
import { parseCellKey } from "../domain/shared/cells.js";
import { computeOverlay, type OverlayMode, type OverlayTint } from "./overlay.js";
import { createBuildingMeshes, BUILDING_PALETTE } from "./shapes.js";

/**
 * Presentation layer (ADR-001): the renderer consumes simulation state
 * and never mutates it. The scene is rebuilt from canonical state on
 * update() — called once per simulation tick, not per frame.
 */

export interface Renderer {
  update(state: GameState): void;
  /** Active analysis overlay (recolors buildings on the next update). */
  setOverlay(mode: OverlayMode): void;
  /** Screen point → terrain cell (or null when off-grid). */
  pickCell(clientX: number, clientY: number): { x: number; y: number } | null;
  /** Hover feedback: highlight a cell green/red per placement validity. */
  setHover(cell: { x: number; y: number } | null, valid: boolean): void;
  dispose(): void;
}

const TILE = 1;

export function createRenderer(container: HTMLElement, state: GameState): Renderer {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e14);
  scene.fog = new THREE.Fog(0x0b0e14, 34, 95);

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

  scene.add(new THREE.HemisphereLight(0x9db4d6, 0x1d2b24, 0.75));
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const directional = new THREE.DirectionalLight(0xfff2df, 1.15);
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

  // --- hover highlight (single reusable mesh, never rebuilt) --------------
  const hoverMaterial = new THREE.MeshBasicMaterial({
    color: 0x44ff88,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const hoverMesh = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.95, 0.08, TILE * 0.95), hoverMaterial);
  hoverMesh.visible = false;
  scene.add(hoverMesh);

  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function pickCell(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
    const x = Math.floor(hit.x / TILE);
    const y = Math.floor(hit.z / TILE);
    if (x < 0 || y < 0 || x >= state.world.width || y >= state.world.height) return null;
    return { x, y };
  }

  function setHover(cell: { x: number; y: number } | null, valid: boolean): void {
    if (!cell) {
      hoverMesh.visible = false;
      return;
    }
    hoverMaterial.color.setHex(valid ? 0x44ff88 : 0xff4455);
    hoverMesh.position.set((cell.x + 0.5) * TILE, 0.05, (cell.y + 0.5) * TILE);
    hoverMesh.visible = true;
  }

  let overlayMode: OverlayMode = "none";

  function update(current: GameState): void {
    // age atmosphere (docs/game/07-PROGRESSION.md: an age is visibly a chapter)
    const ageTwoPlus = current.age >= 2;
    (scene.fog as THREE.Fog).color.setHex(ageTwoPlus ? 0x181109 : 0x0b0e14);
    (scene.background as THREE.Color).setHex(ageTwoPlus ? 0x151009 : 0x0b0e14);
    directional.color.setHex(ageTwoPlus ? 0xffdfb0 : 0xfff2df);

    rebuildGroup(roadGroup, current, (s) => buildRoads(s));
    rebuildGroup(depositGroup, current, (s) => buildDeposits(s));
    rebuildGroup(buildingGroup, current, (s) => buildBuildings(s, overlayMode));
  }

  function setOverlay(mode: OverlayMode): void {
    if (overlayMode === mode) return;
    overlayMode = mode;
    update(state);
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

  return { update, setOverlay, pickCell, setHover, dispose };
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
    new THREE.MeshLambertMaterial({ color: 0x22352c }),
  );
  ground.position.set((state.world.width * TILE) / 2, -0.05, (state.world.height * TILE) / 2);
  group.add(ground);

  // subtle checker variation for tile readability (deterministic)
  const lightTile = new THREE.MeshLambertMaterial({ color: 0x273b30 });
  const darkTile = new THREE.MeshLambertMaterial({ color: 0x1f2f27 });
  for (let y = 0; y < state.world.height; y++) {
    for (let x = 0; x < state.world.width; x++) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(TILE * 0.98, 0.02, TILE * 0.98),
        (x + y) % 2 === 0 ? lightTile : darkTile,
      );
      plate.position.set((x + 0.5) * TILE, 0.015, (y + 0.5) * TILE);
      group.add(plate);
    }
  }

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

const OVERLAY_TINTS: Record<OverlayTint, number> = {
  ok: 0x51cf66,
  warn: 0xd9a44a,
  off: 0x555b66,
};

function buildBuildings(state: GameState, overlayMode: OverlayMode): THREE.Group {
  const group = new THREE.Group();
  const tints = new Map(computeOverlay(state, overlayMode).map((c) => [c.key, c.tint]));
  for (const building of Object.values(state.buildings)) {
    const key = `${building.x},${building.y}`;
    const tint = tints.get(key);
    const palette = BUILDING_PALETTE[building.type];
    const meshes = createBuildingMeshes(building.type, palette);
    meshes.position.set((building.x + 0.5) * TILE, 0, (building.y + 0.5) * TILE);

    if (tint !== undefined) {
      // overlay tint replaces the palette on every material of the building
      const tinted = OVERLAY_TINTS[tint];
      meshes.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          (object.material as THREE.MeshLambertMaterial).color.setHex(tinted);
        }
      });
    }
    if (building.status === "underConstruction") {
      meshes.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          const material = object.material as THREE.MeshLambertMaterial;
          material.transparent = true;
          material.opacity = 0.4;
        }
      });
    }
    group.add(meshes);
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
  for (const child of rebuilt.children) {
    if (!child) console.error("NOVA-DEBUG: undefined child in", group.id ?? group.type, "from", build.name);
    else group.add(child);
  }
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
