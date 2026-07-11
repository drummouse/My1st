import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildHouseScene, setMeshColor, setMeshHighlighted } from '../lib/buildScene.js';

// Front/Right/Back/Left — relative to the model, since RoofRuler exports
// carry no true compass orientation. Shared by captureElevationViews (a PDF
// snapshot per direction) and snapToElevation (the live "Elevation View"
// buttons) so there's one source for what each of the 4 directions means.
const ELEVATION_DIRECTIONS = [
  { key: 'front', label: 'Front Elevation', dir: new THREE.Vector3(0, -1, 0) },
  { key: 'right', label: 'Right Elevation', dir: new THREE.Vector3(1, 0, 0) },
  { key: 'back', label: 'Back Elevation', dir: new THREE.Vector3(0, 1, 0) },
  { key: 'left', label: 'Left Elevation', dir: new THREE.Vector3(-1, 0, 0) },
];

// Average of a mesh's raw (un-deduped) vertex positions, transformed to world
// space — a fine stand-in for the true area-weighted centroid at this scale
// (each mesh is a single facet, so vertices repeat roughly in proportion to
// each triangle's share of the surface).
function meshWorldCentroid(mesh) {
  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  const sum = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    sum.add(v);
  }
  sum.divideScalar(pos.count || 1);
  return sum.applyMatrix4(mesh.matrixWorld);
}

// Renders the given camera's already-drawn frame plus a label at each facet
// whose centroid projects on-screen AND isn't occluded by another facet
// (checked via a centroid raycast) — so labels only land on facets actually
// visible from that angle, turning a plain render into a labeled diagram.
// `labelForMesh(mesh)` resolves the text (return a falsy value to skip that
// facet); omit it — or pass an empty `facetMeshesByKey` — for an unlabeled
// plain render.
function renderLabeledFrame(renderer, camera, facetMeshesByKey, labelForMesh, dpr) {
  const glCanvas = renderer.domElement;
  const width = glCanvas.width;
  const height = glCanvas.height;
  const allMeshes = Object.values(facetMeshesByKey || {});
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector3();

  const labels = [];
  allMeshes.forEach((mesh) => {
    const text = labelForMesh ? labelForMesh(mesh) : mesh.userData.faceId;
    if (!text) return;
    const centroid = meshWorldCentroid(mesh);
    ndc.copy(centroid).project(camera);
    if (ndc.z < -1 || ndc.z > 1) return;
    const sx = (ndc.x * 0.5 + 0.5) * width;
    const sy = (1 - (ndc.y * 0.5 + 0.5)) * height;
    if (sx < 0 || sx > width || sy < 0 || sy > height) return;
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    const hits = raycaster.intersectObjects(allMeshes, false);
    if (!hits.length || hits[0].object !== mesh) return;
    labels.push({ text, x: sx, y: sy });
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(glCanvas, 0, 0);

  // dpr scales the label size to the backing-store resolution: for the live
  // interactive canvas that's its real devicePixelRatio (vs. CSS size); for
  // the dedicated ortho captures (a resolution with no on-screen CSS size to
  // compare against) the caller passes a fixed value tuned for that fixed
  // resolution instead.
  const effectiveDpr = dpr ?? (width / glCanvas.clientWidth || 1);
  const fontSize = Math.max(11 * effectiveDpr, 11);
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  labels.forEach(({ text, x, y }) => {
    const padX = 5 * effectiveDpr;
    const padY = 3 * effectiveDpr;
    const w = ctx.measureText(text).width + padX * 2;
    const h = fontSize + padY * 2;
    ctx.fillStyle = 'rgba(20, 24, 30, 0.72)';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y + fontSize * 0.06);
  });

  return canvas.toDataURL('image/png');
}

// Solves for the minimum camera distance (along a fixed viewing direction,
// looking at the box's center) such that every corner of the box stays
// within the camera's field of view — exact, not an eyeballed coefficient.
// A camera's position only moves along `dir`, so each corner's off-axis
// offset (relative to the right/up basis) is fixed regardless of distance;
// only its depth changes, which is what lets this solve directly rather
// than needing to iterate.
function computeFramingDistance(box, dir, aspect, fovDegVertical, margin = 1.1) {
  const center = box.getCenter(new THREE.Vector3());
  const d = dir.clone().normalize();
  const upHint = Math.abs(d.z) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3().crossVectors(d, upHint).normalize();
  const up = new THREE.Vector3().crossVectors(right, d).normalize();

  const tanV = Math.tan((fovDegVertical * Math.PI / 180) / 2);
  const tanH = Math.tan(Math.atan(tanV * aspect));

  const corners = [];
  [box.min.x, box.max.x].forEach((x) => [box.min.y, box.max.y].forEach((y) => [box.min.z, box.max.z].forEach((z) => {
    corners.push(new THREE.Vector3(x, y, z));
  })));

  let distance = 0;
  corners.forEach((corner) => {
    const rel = corner.sub(center);
    const f = rel.dot(d);
    const r = Math.abs(rel.dot(right));
    const u = Math.abs(rel.dot(up));
    distance = Math.max(distance, f + r / tanH, f + u / tanV);
  });
  return { center, up, distance: Math.max(distance * margin, 10) };
}

// Same corner-projection idea as computeFramingDistance, but for an
// orthographic camera: no perspective/distance trig needed, just the tightest
// half-width/half-height that contains every corner along the view's own
// right/up axes (so a narrow elevation isn't padded out to the model's
// widest axis just because some other, perpendicular side is wider).
function computeOrthoExtents(box, dir, margin = 1.1) {
  const center = box.getCenter(new THREE.Vector3());
  const d = dir.clone().normalize();
  const upHint = Math.abs(d.z) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3().crossVectors(d, upHint).normalize();
  const up = new THREE.Vector3().crossVectors(right, d).normalize();

  let halfW = 0;
  let halfH = 0;
  [box.min.x, box.max.x].forEach((x) => [box.min.y, box.max.y].forEach((y) => [box.min.z, box.max.z].forEach((z) => {
    const rel = new THREE.Vector3(x, y, z).sub(center);
    halfW = Math.max(halfW, Math.abs(rel.dot(right)));
    halfH = Math.max(halfH, Math.abs(rel.dot(up)));
  })));
  return { center, up, halfW: halfW * margin, halfH: halfH * margin };
}

// Renders one orthographic capture sized to the CONTENT's own natural aspect
// ratio (temporarily resizing the renderer) rather than forcing the ortho
// frustum to match the interactive viewer's current (often much wider)
// canvas aspect — that would otherwise pad the frame with a lot of empty
// space just to avoid distorting a flat, wide elevation into a squarer slot.
const MAX_CAPTURE_DIM = 1000;
function captureOrthoNatural(renderer, scene, box, dir, facetMeshesByKey, labelForMesh) {
  const { center, up, halfW, halfH } = computeOrthoExtents(box, dir);
  const contentAspect = halfW / halfH;
  const width = contentAspect >= 1 ? MAX_CAPTURE_DIM : Math.max(1, Math.round(MAX_CAPTURE_DIM * contentAspect));
  const height = contentAspect >= 1 ? Math.max(1, Math.round(MAX_CAPTURE_DIM / contentAspect)) : MAX_CAPTURE_DIM;

  const savedSize = renderer.getSize(new THREE.Vector2());
  const savedPixelRatio = renderer.getPixelRatio();
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);

  const size = box.getSize(new THREE.Vector3());
  const dist = Math.max(size.x, size.y, size.z) * 3 + 50;
  const ortho = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, dist * 3);
  ortho.up.copy(up);
  ortho.position.copy(center).addScaledVector(dir, dist);
  ortho.lookAt(center);
  ortho.updateProjectionMatrix();
  renderer.render(scene, ortho);
  const dataUrl = renderLabeledFrame(renderer, ortho, facetMeshesByKey, labelForMesh, MAX_CAPTURE_DIM / 700);

  renderer.setPixelRatio(savedPixelRatio);
  renderer.setSize(savedSize.x, savedSize.y, false);
  return dataUrl;
}

const Viewer3D = forwardRef(function Viewer3D({
  parsedLayers,
  layerOffsets,
  facetColors,
  facetLabels,
  photoOverlay,
  facetSelectionEnabled,
  selectedFacetId,
  onFacetClick,
}, ref) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);

  useImperativeHandle(ref, () => ({
    captureSnapshot: () => sceneRef.current?.renderer?.domElement?.toDataURL('image/png') || null,
    // Captures 4 static PNGs from each diagonal corner, close enough that the
    // model fills most of the frame (product-shot framing, not a distant
    // survey shot), angled slightly above ground to show some roof — for the
    // PDF export's locked, non-interactive renderings (no live 3D in the PDF
    // itself, just these pre-rendered images). No facet labels here — these
    // are the "wow" renderings, not a labeled diagram.
    captureIsoViews: () => {
      const s = sceneRef.current;
      if (!s?.scene || !s.camera || !s.renderer || !s.root || !s.controls) return [];
      const { scene, camera, renderer, root, controls, grid } = s;
      const savedCameraPos = camera.position.clone();
      const savedTarget = controls.target.clone();
      const gridWasVisible = grid ? grid.visible : false;
      if (grid) grid.visible = false;

      const box = new THREE.Box3().setFromObject(root);
      const aspect = renderer.domElement.width / renderer.domElement.height;
      // Shallow ~19° elevation ("slightly above ground, see a bit of roof"),
      // one fixed direction per corner — computeFramingDistance solves the
      // exact minimum distance so the whole model fits with a small margin,
      // rather than an eyeballed distance guess that can clip the model.
      const directions = [[1, 1, 0.35], [-1, 1, 0.35], [-1, -1, 0.35], [1, -1, 0.35]];
      const images = directions.map(([dx, dy, dz]) => {
        const dir = new THREE.Vector3(dx, dy, dz);
        const { center, distance } = computeFramingDistance(box, dir, aspect, camera.fov);
        camera.position.copy(center).addScaledVector(dir.normalize(), distance);
        camera.lookAt(center);
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/png');
      });

      if (grid) grid.visible = gridWasVisible;
      camera.position.copy(savedCameraPos);
      camera.lookAt(savedTarget);
      renderer.render(scene, camera);
      return images;
    },
    // Four orthographic elevations (Front/Right/Back/Left — relative to the
    // model, since RoofRuler exports carry no true compass orientation).
    // True-to-scale (no perspective foreshortening), matching an
    // architectural elevation drawing rather than a photo — also unlabeled.
    captureElevationViews: () => {
      const s = sceneRef.current;
      if (!s?.scene || !s.renderer || !s.root || !s.controls) return [];
      const { scene, renderer, root, controls, camera: mainCamera, grid } = s;
      const savedCameraPos = mainCamera.position.clone();
      const savedTarget = controls.target.clone();
      const gridWasVisible = grid ? grid.visible : false;
      if (grid) grid.visible = false;

      const box = new THREE.Box3().setFromObject(root);
      const images = ELEVATION_DIRECTIONS.map(({ label, dir }) => ({
        label,
        dataUrl: captureOrthoNatural(renderer, scene, box, dir, {}),
      }));

      if (grid) grid.visible = gridWasVisible;
      renderer.render(scene, mainCamera);
      mainCamera.position.copy(savedCameraPos);
      mainCamera.lookAt(savedTarget);
      return images;
    },
    // Top-down Roof Plan — the one rendering that keeps facet labels, using
    // the clean per-type R#/F# scheme (facetLabels, keyed by facetKey)
    // instead of the raw, collision-prone RoofRuler face id.
    captureRoofPlanView: () => {
      const s = sceneRef.current;
      if (!s?.scene || !s.renderer || !s.root || !s.controls) return null;
      const { scene, renderer, root, controls, camera: mainCamera, grid, facetMeshesByKey } = s;
      const savedCameraPos = mainCamera.position.clone();
      const savedTarget = controls.target.clone();
      const gridWasVisible = grid ? grid.visible : false;
      if (grid) grid.visible = false;

      const labelForMesh = (mesh) => s.facetLabels?.[mesh.userData.key] || mesh.userData.faceId;
      const box = new THREE.Box3().setFromObject(root);
      const dataUrl = captureOrthoNatural(renderer, scene, box, new THREE.Vector3(0, 0, 1), facetMeshesByKey, labelForMesh);

      if (grid) grid.visible = gridWasVisible;
      renderer.render(scene, mainCamera);
      mainCamera.position.copy(savedCameraPos);
      mainCamera.lookAt(savedTarget);
      return dataUrl;
    },
  }));
  // Snaps the live (interactive) camera to look straight at one side of the
  // model — a shortcut into the same view captureElevationViews() renders
  // for the PDF, except this one stays live/orbitable rather than a one-shot
  // capture. Reuses ELEVATION_DIRECTIONS (module scope) so both stay in sync.
  const snapToElevation = (direction) => {
    const s = sceneRef.current;
    const dir = ELEVATION_DIRECTIONS.find((d) => d.key === direction)?.dir;
    if (!s?.camera || !s.renderer || !s.root || !s.controls || !dir) return;
    const { camera, renderer, root, controls } = s;
    const box = new THREE.Box3().setFromObject(root);
    const aspect = renderer.domElement.width / renderer.domElement.height;
    const { center, distance } = computeFramingDistance(box, dir, aspect, camera.fov);
    camera.position.copy(center).addScaledVector(dir, distance);
    camera.up.set(0, 0, 1);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
  };

  const onFacetClickRef = useRef(onFacetClick);
  onFacetClickRef.current = onFacetClick;
  const facetSelectionEnabledRef = useRef(facetSelectionEnabled);
  facetSelectionEnabledRef.current = facetSelectionEnabled;

  // One-time scene setup + rebuild whenever the set of layers (content or
  // visibility) changes. Layer offsets are handled by a cheap separate effect
  // below so dragging a position slider doesn't rebuild the whole scene.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    // Background stays transparent so an uploaded photo can show through
    // behind the model (see .viewer3d-wrap CSS for the default sky fallback).

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 2000);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(80, -120, 160);
    scene.add(sun);

    const { root, layerGroups, layerBasePositions, facetMeshesByKey, boundingSphere } = buildHouseScene(
      (parsedLayers || []).map((l) => ({ ...l, offset: layerOffsets?.[l.id] }))
    );
    scene.add(root);

    const grid = new THREE.GridHelper(Math.max(boundingSphere.radius * 3, 100), 20, 0x8899aa, 0xaabbcc);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(boundingSphere.center);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    // Half the default speed and a longer damping tail — slower, smoother
    // orbit/zoom instead of the default snappy feel.
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.5;
    controls.panSpeed = 0.5;
    const dist = boundingSphere.radius * 2.4;
    camera.position.set(boundingSphere.center.x + dist, boundingSphere.center.y - dist, boundingSphere.center.z + dist * 0.6);
    controls.update();

    let raf;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!mount || !mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    // The pane also resizes without a window resize (Full Screen / Restore
    // toggles swap CSS classes) — without this, the canvas buffer keeps its
    // old aspect ratio and the browser stretches the image to the new box.
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    // Click-to-select a facet: distinguish a click from an orbit-drag by
    // pointer travel distance rather than relying on the native 'click'
    // event, since OrbitControls' own listeners can interfere with it.
    const raycaster = new THREE.Raycaster();
    const allFacetMeshes = Object.values(facetMeshesByKey);
    let downPos = null;
    const onPointerDown = (e) => { downPos = [e.clientX, e.clientY]; };
    const onPointerUp = (e) => {
      if (!downPos) return;
      const [dx0, dy0] = downPos;
      downPos = null;
      if (!facetSelectionEnabledRef.current) return;
      if (Math.hypot(e.clientX - dx0, e.clientY - dy0) > 5) return; // was a drag/orbit
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(allFacetMeshes, false);
      if (hits.length) onFacetClickRef.current?.(hits[0].object.userData);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    sceneRef.current = { layerGroups, layerBasePositions, facetMeshesByKey, highlightedMesh: null, renderer, scene, camera, controls, boundingSphere, grid, root, facetLabels: facetLabels || {} };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      renderer.dispose();
      mount.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedLayers]);

  // Cheap update: recolor existing facet meshes without rebuilding the scene.
  useEffect(() => {
    const s = sceneRef.current;
    if (!s || !facetColors) return;
    Object.entries(facetColors).forEach(([key, colorEntry]) => {
      setMeshColor(s.facetMeshesByKey[key], colorEntry);
    });
  }, [facetColors]);

  // Cheap update: keep the Roof Plan's R#/F# label map current without
  // rebuilding the scene — it only changes alongside facetColors anyway
  // (both derive from the same imported layers).
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.facetLabels = facetLabels || {};
  }, [facetLabels]);

  // Cheap update: reposition each layer group from its cached auto-computed
  // base position plus the current manual offset, without rebuilding meshes.
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    Object.entries(s.layerGroups).forEach(([id, group]) => {
      const base = s.layerBasePositions[id];
      const offset = layerOffsets?.[id] || {};
      group.position.set(base.x + (offset.dx || 0), base.y + (offset.dy || 0), base.z + (offset.dz || 0));
    });
  }, [layerOffsets]);

  // Highlight the selected facet (used when per-facet override mode is on).
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    if (s.highlightedMesh) setMeshHighlighted(s.highlightedMesh, false);
    const mesh = selectedFacetId ? s.facetMeshesByKey[selectedFacetId] : null;
    if (mesh) setMeshHighlighted(mesh, true);
    s.highlightedMesh = mesh || null;
  }, [selectedFacetId]);

  return (
    <div className={`viewer3d-wrap${facetSelectionEnabled ? ' viewer3d-selectable' : ''}`}>
      {photoOverlay?.url && (
        <img
          className="viewer3d-photo"
          src={photoOverlay.url}
          alt="Uploaded house photo overlay"
          style={{ opacity: photoOverlay.opacity }}
        />
      )}
      <div ref={mountRef} className="viewer3d-canvas" />
      <button type="button" className="viewer3d-elevation-btn viewer3d-elevation-btn-top" onClick={() => snapToElevation('back')}>Elevation View</button>
      <button type="button" className="viewer3d-elevation-btn viewer3d-elevation-btn-bottom" onClick={() => snapToElevation('front')}>Elevation View</button>
      <button type="button" className="viewer3d-elevation-btn viewer3d-elevation-btn-left" onClick={() => snapToElevation('left')}>Elevation View</button>
      <button type="button" className="viewer3d-elevation-btn viewer3d-elevation-btn-right" onClick={() => snapToElevation('right')}>Elevation View</button>
      <div className="viewer3d-note">
        Preview model: each imported layer's RoofRuler export rendered independently and stacked for display.
      </div>
    </div>
  );
});

export default Viewer3D;
