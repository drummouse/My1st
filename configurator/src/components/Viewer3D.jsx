import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildHouseScene, setMeshColor, setMeshHighlighted } from '../lib/buildScene.js';

const Viewer3D = forwardRef(function Viewer3D({
  roofParsed,
  wallParsed,
  roofFaceColors,
  wallFaceColors,
  photoOverlay,
  roofOffset,
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

  // One-time scene setup + rebuild whenever the house data changes.
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

    const { root, roofFaceMeshes, wallFaceMeshes, wallRoofFaceMeshes, roofGroup, boundingSphere, roofBasePosition } =
      buildHouseScene(roofParsed, wallParsed);
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
    const allFacetMeshes = [...Object.values(roofFaceMeshes), ...Object.values(wallFaceMeshes), ...Object.values(wallRoofFaceMeshes)];
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

    sceneRef.current = { roofFaceMeshes, wallFaceMeshes, wallRoofFaceMeshes, roofGroup, roofBasePosition, highlightedMesh: null, renderer };
    if (roofOffset) {
      roofGroup.position.set(
        roofBasePosition.x + (roofOffset.dx || 0),
        roofBasePosition.y + (roofOffset.dy || 0),
        roofBasePosition.z + (roofOffset.dz || 0)
      );
    }

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
  }, [roofParsed, wallParsed]);

  // Cheap updates: recolor existing facet meshes without rebuilding the scene.
  useEffect(() => {
    const s = sceneRef.current;
    if (!s || !roofFaceColors) return;
    Object.entries(roofFaceColors).forEach(([faceId, colorEntry]) => {
      setMeshColor(s.roofFaceMeshes[faceId] || s.wallRoofFaceMeshes[faceId], colorEntry);
    });
  }, [roofFaceColors]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s || !wallFaceColors) return;
    Object.entries(wallFaceColors).forEach(([faceId, colorEntry]) => {
      setMeshColor(s.wallFaceMeshes[faceId], colorEntry);
    });
  }, [wallFaceColors]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.roofGroup.position.set(
      s.roofBasePosition.x + (roofOffset?.dx || 0),
      s.roofBasePosition.y + (roofOffset?.dy || 0),
      s.roofBasePosition.z + (roofOffset?.dz || 0)
    );
  }, [roofOffset]);

  // Highlight the selected facet (used when per-facet override mode is on).
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    if (s.highlightedMesh) setMeshHighlighted(s.highlightedMesh, false);
    const mesh = selectedFacetId
      ? s.roofFaceMeshes[selectedFacetId] || s.wallFaceMeshes[selectedFacetId] || s.wallRoofFaceMeshes[selectedFacetId]
      : null;
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
        Preview model: roof + wall RoofRuler exports rendered independently and stacked for display.
      </div>
    </div>
  );
});

export default Viewer3D;
