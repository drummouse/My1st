import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildHouseScene, setMeshColor, setMeshHighlighted } from '../lib/buildScene.js';

const Viewer3D = forwardRef(function Viewer3D({
  parsedLayers,
  layerOffsets,
  facetColors,
  photoOverlay,
  facetSelectionEnabled,
  selectedFacetId,
  onFacetClick,
}, ref) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);

  useImperativeHandle(ref, () => ({
    captureSnapshot: () => sceneRef.current?.renderer?.domElement?.toDataURL('image/png') || null,
  }));
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
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', handleResize);

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

    sceneRef.current = { layerGroups, layerBasePositions, facetMeshesByKey, highlightedMesh: null, renderer };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
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
      <div className="viewer3d-note">
        Preview model: each imported layer's RoofRuler export rendered independently and stacked for display.
      </div>
    </div>
  );
});

export default Viewer3D;
