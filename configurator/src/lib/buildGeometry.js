import * as THREE from 'three';

// Feet per texture tile for planar UV projection — keeps repeating material
// maps (e.g. woodgrain siding) at a plausible physical scale rather than
// stretching one image across an entire wall face.
const TILE_SIZE_FT = 8;

// Newell's method — robust face normal for a possibly non-convex planar polygon.
function faceNormal(loop) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1, z1] = loop[i];
    const [x2, y2, z2] = loop[(i + 1) % loop.length];
    nx += (y1 - y2) * (z1 + z2);
    ny += (z1 - z2) * (x1 + x2);
    nz += (x1 - x2) * (y1 + y2);
  }
  const v = new THREE.Vector3(nx, ny, nz);
  return v.lengthSq() > 1e-9 ? v.normalize() : new THREE.Vector3(0, 0, 1);
}

// Project 3D loops (outer contour + holes) onto their shared plane and
// triangulate with THREE.ShapeUtils, then map the 2D triangle indices back
// to 3D positions. Handles concave polygons and holes (window/door cutouts).
function triangulateFace(loops) {
  const [outer, ...holes] = loops;
  const normal = faceNormal(outer);
  const origin = new THREE.Vector3(...outer[0]);

  let arbitrary = Math.abs(normal.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(normal, arbitrary).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();

  const to2D = (p3) => {
    const p = new THREE.Vector3(...p3).sub(origin);
    return new THREE.Vector2(p.dot(u), p.dot(v));
  };

  const contour2D = outer.map(to2D);
  const holes2D = holes.map((h) => h.map(to2D));
  const all3D = [...outer, ...holes.flat()];
  const all2D = [...contour2D, ...holes2D.flat()];

  const triangles = THREE.ShapeUtils.triangulateShape(contour2D, holes2D);

  const positions = [];
  const uvs = [];
  triangles.forEach(([a, b, c]) => {
    positions.push(...all3D[a], ...all3D[b], ...all3D[c]);
    [a, b, c].forEach((i) => uvs.push(all2D[i].x / TILE_SIZE_FT, all2D[i].y / TILE_SIZE_FT));
  });
  return { positions, uvs };
}

/**
 * Build a single BufferGeometry per material key (roof/wall) from parsed faces,
 * grouping faces so each mesh can carry its own color/material.
 */
export function buildFaceGeometry(faces) {
  const positions = [];
  const uvs = [];
  faces.forEach((face) => {
    if (face.loops[0].length < 3) return;
    try {
      const result = triangulateFace(face.loops);
      positions.push(...result.positions);
      uvs.push(...result.uvs);
    } catch (e) {
      // Skip degenerate/self-intersecting facets rather than crash the viewer.
      console.warn('Skipped face', face.id, e.message);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}
