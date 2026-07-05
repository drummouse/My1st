import * as THREE from 'three';
import { buildFaceGeometry } from './buildGeometry.js';
import { boundingBox } from './roofRulerParser.js';

// Builds a positioned scene graph from the parsed roof + wall structures.
// RoofRuler exports use X/Y as plan coordinates and Z as height — kept as-is
// here (the viewer sets camera.up = +Z instead of rotating geometry).
//
// The two RoofRuler exports use independent local coordinate frames (verified
// against the source files — same face sizes, different point coordinates),
// so each structure is centered on its own footprint and the roof group is
// stacked on top of the wall group by bounding-box height. This is a known,
// documented simplification (see PROJECT_BRIEF.md — "house geometry: simplified").
export function buildHouseScene(roofParsed, wallParsed) {
  const root = new THREE.Group();

  const wallBox = boundingBox(wallParsed);
  const wallGroup = new THREE.Group();
  wallGroup.position.set(-(wallBox.min[0] + wallBox.size[0] / 2), -(wallBox.min[1] + wallBox.size[1] / 2), -wallBox.min[2]);
  root.add(wallGroup);

  const wallFaces = wallParsed.faces.filter((f) => f.type === 'Wall');
  const wallRoofFaces = wallParsed.faces.filter((f) => f.type === 'Roof');
  const wallMesh = new THREE.Mesh(
    buildFaceGeometry(wallFaces),
    new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.75, metalness: 0.15 })
  );
  wallMesh.userData.materialRole = 'wall';
  wallGroup.add(wallMesh);

  let wallRoofMesh = null;
  if (wallRoofFaces.length) {
    wallRoofMesh = new THREE.Mesh(
      buildFaceGeometry(wallRoofFaces),
      new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.5 })
    );
    wallRoofMesh.userData.materialRole = 'roof';
    wallGroup.add(wallRoofMesh);
  }

  const roofBox = boundingBox(roofParsed);
  const roofGroup = new THREE.Group();
  // Auto-computed base position: centers the roof footprint and stacks it at
  // the wall structure's height. Exposed so the UI can add a manual nudge on
  // top without recomputing it (see AssemblyAdjustment).
  const roofBasePosition = new THREE.Vector3(
    -(roofBox.min[0] + roofBox.size[0] / 2),
    -(roofBox.min[1] + roofBox.size[1] / 2),
    wallBox.size[2] - roofBox.min[2]
  );
  roofGroup.position.copy(roofBasePosition);
  root.add(roofGroup);

  const roofFaces = roofParsed.faces.filter((f) => f.type === 'Roof');
  const roofMesh = new THREE.Mesh(
    buildFaceGeometry(roofFaces),
    new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.5 })
  );
  roofMesh.userData.materialRole = 'roof';
  roofGroup.add(roofMesh);

  root.updateMatrixWorld(true);
  const overallBox = new THREE.Box3().setFromObject(root);
  const sphere = new THREE.Sphere();
  overallBox.getBoundingSphere(sphere);

  return { root, wallGroup, roofGroup, wallMesh, roofMesh, wallRoofMesh, boundingSphere: sphere, roofBasePosition };
}

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();

function loadTexture(url) {
  if (!textureCache.has(url)) {
    const texture = textureLoader.load(url);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(url, texture);
  }
  return textureCache.get(url);
}

/**
 * Applies a picked color to a mesh's material — either a flat color, or (for
 * colors with a photographed texture map, e.g. Printech Woodgrain) the real
 * texture tiled across the geometry's planar UVs.
 */
export function setMeshColor(mesh, colorEntry) {
  if (!mesh || !colorEntry) return;
  const material = mesh.material;
  if (colorEntry.texture) {
    material.map = loadTexture(colorEntry.texture);
    material.color.set(0xffffff);
  } else {
    material.map = null;
    material.color.set(colorEntry.hex);
  }
  material.needsUpdate = true;
}
