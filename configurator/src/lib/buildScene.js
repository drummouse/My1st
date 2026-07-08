import * as THREE from 'three';
import { buildFaceGeometry } from './buildGeometry.js';
import { boundingBox, facetKey } from './roofRulerParser.js';

// Builds a positioned scene graph from an arbitrary list of imported
// RoofRuler XML "layers" (roof, wall, and optionally more — garage roof,
// secondary structure, etc.). Every facet gets its own mesh (rather than one
// merged mesh per surface) so individual slopes/segments can be independently
// selected, colored, and priced — house sizes here (tens to low hundreds of
// facets) make this trivially cheap for Three.js.
//
// RoofRuler exports use X/Y as plan coordinates and Z as height — kept as-is
// here (the viewer sets camera.up = +Z instead of rotating geometry).
//
// Each layer's RoofRuler export uses its own independent local coordinate
// frame (verified against source files — same face sizes, different point
// coordinates), so every layer is centered on its own footprint and stacked
// on top of the previous layers by bounding-box height, in array order. This
// is a known, documented simplification (see README.md — "Known
// simplification"). A layer's manual `offset` (from its Assembly Adjustment
// control) is added on top of this auto-computed base position.
//
// @param {Array<{id: string, parsed: object, visible: boolean, offset?: {dx,dy,dz}}>} layers
export function buildHouseScene(layers) {
  const root = new THREE.Group();
  const layerGroups = {};
  const layerBasePositions = {};
  const facetMeshesByKey = {};

  let stackHeight = 0;
  layers
    .filter((l) => l.visible && l.parsed)
    .forEach((layer) => {
      const box = boundingBox(layer.parsed);
      const group = new THREE.Group();
      const base = new THREE.Vector3(
        -(box.min[0] + box.size[0] / 2),
        -(box.min[1] + box.size[1] / 2),
        stackHeight - box.min[2]
      );
      const offset = layer.offset || {};
      group.position.set(base.x + (offset.dx || 0), base.y + (offset.dy || 0), base.z + (offset.dz || 0));
      root.add(group);

      layer.parsed.faces.forEach((face) => {
        const role = face.type === 'Wall' ? 'wall' : 'roof';
        const mesh = new THREE.Mesh(
          buildFaceGeometry([face]),
          new THREE.MeshStandardMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            ...(role === 'wall' ? { roughness: 0.75, metalness: 0.15 } : { roughness: 0.4, metalness: 0.5 }),
          })
        );
        const key = facetKey(layer.id, face.id);
        mesh.userData = { key, faceId: face.id, role, layerId: layer.id, sizeSf: face.sizeSf, pitch: face.pitch, orientation: face.orientation };
        group.add(mesh);
        facetMeshesByKey[key] = mesh;
      });

      layerGroups[layer.id] = group;
      layerBasePositions[layer.id] = base;
      stackHeight += box.size[2];
    });

  root.updateMatrixWorld(true);
  const overallBox = new THREE.Box3().setFromObject(root);
  const sphere = new THREE.Sphere();
  if (overallBox.isEmpty()) {
    sphere.set(new THREE.Vector3(0, 0, 0), 10);
  } else {
    overallBox.getBoundingSphere(sphere);
  }

  return { root, layerGroups, layerBasePositions, facetMeshesByKey, boundingSphere: sphere };
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

const HIGHLIGHT_EMISSIVE = new THREE.Color(0xffa552);

export function setMeshHighlighted(mesh, highlighted) {
  if (!mesh) return;
  mesh.material.emissive = highlighted ? HIGHLIGHT_EMISSIVE : new THREE.Color(0x000000);
  mesh.material.emissiveIntensity = highlighted ? 0.55 : 0;
}
