import * as THREE from "three";
import type { BuildingType } from "../content/buildings.js";

/**
 * Parametric building silhouettes (docs/game/10-VISUAL-DIRECTION.md §3:
 * "Buildings should be readable by silhouette and function"). Pure
 * geometry assembly — no simulation logic, no canonical state.
 */

export interface BuildingPalette {
  /** Primary body color. */
  body: number;
  /** Accent color (roofs, details). */
  accent: number;
}

export const BUILDING_PALETTE: Record<BuildingType, BuildingPalette> = {
  residence: { body: 0x3f6fa8, accent: 0x6fb3e0 },
  farm: { body: 0x5c8a4e, accent: 0x9fce7a },
  well: { body: 0x4d8a99, accent: 0x9fd8e8 },
  workshop: { body: 0xa06a38, accent: 0xd98e4a },
  lumberCamp: { body: 0x6e5741, accent: 0x9c7f56 },
  quarry: { body: 0x7c828c, accent: 0xb0b8c4 },
  colonyCenter: { body: 0x8a9455, accent: 0xd6e07a },
};

export function createBuildingMeshes(
  type: BuildingType,
  palette: BuildingPalette,
): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: palette.body });
  const accent = new THREE.MeshLambertMaterial({ color: palette.accent });

  const add = (mesh: THREE.Mesh, x: number, y: number, z: number): void => {
    mesh.position.set(x, y, z);
    group.add(mesh);
  };

  switch (type) {
    case "residence": {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.62), body), 0, 0.2, 0);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.32, 4), accent);
      roof.rotation.y = Math.PI / 4;
      add(roof, 0, 0.56, 0);
      break;
    }
    case "farm": {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.55), body), -0.05, 0.09, 0.08);
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.42, 8), accent);
      add(silo, 0.28, 0.21, -0.22);
      break;
    }
    case "well": {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.3, 10), body), 0, 0.15, 0);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.2, 6), accent);
      add(roof, 0, 0.42, 0);
      break;
    }
    case "workshop": {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.42, 0.6), body), -0.04, 0.21, 0);
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 8), accent);
      add(chimney, 0.22, 0.5, -0.15);
      break;
    }
    case "lumberCamp": {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.4), body), -0.08, 0.11, 0);
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), accent);
      log.rotation.z = Math.PI / 2;
      add(log, 0.1, 0.36, 0.12);
      const log2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), accent);
      log2.rotation.z = Math.PI / 2;
      add(log2, 0.1, 0.36, -0.1);
      break;
    }
    case "quarry": {
      const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.2, 0.24, 8), body);
      add(pit, 0, 0.12, 0);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14), accent);
      add(rock, 0.2, 0.34, 0.18);
      break;
    }
    case "colonyCenter": {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.22, 8), body), 0, 0.11, 0);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), accent);
      add(crystal, 0, 0.52, 0);
      break;
    }
  }

  return group;
}
