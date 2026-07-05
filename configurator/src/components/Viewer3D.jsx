import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildHouseScene, setMeshColor } from '../lib/buildScene.js';

export default function Viewer3D({ roofParsed, wallParsed, roofColorEntry, wallColorEntry, photoOverlay, roofOffset }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);

  // One-time scene setup + rebuild whenever the house data changes.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    // Background stays transparent so an uploaded photo can show through
    // behind the model (see .viewer3d-wrap CSS for the default sky fallback).

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 2000);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(80, -120, 160);
    scene.add(sun);

    const { root, wallMesh, roofMesh, wallRoofMesh, roofGroup, boundingSphere, roofBasePosition } = buildHouseScene(roofParsed, wallParsed);
    scene.add(root);

    const grid = new THREE.GridHelper(Math.max(boundingSphere.radius * 3, 100), 20, 0x8899aa, 0xaabbcc);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(boundingSphere.center);
    controls.enableDamping = true;
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

    sceneRef.current = { wallMesh, roofMesh, wallRoofMesh, roofGroup, roofBasePosition };
    setMeshColor(roofMesh, roofColorEntry);
    if (wallRoofMesh) setMeshColor(wallRoofMesh, roofColorEntry);
    setMeshColor(wallMesh, wallColorEntry);
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
      controls.dispose();
      renderer.dispose();
      mount.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roofParsed, wallParsed]);

  // Cheap updates: recolor existing meshes without rebuilding the scene.
  useEffect(() => {
    if (!sceneRef.current) return;
    setMeshColor(sceneRef.current.roofMesh, roofColorEntry);
    if (sceneRef.current.wallRoofMesh) setMeshColor(sceneRef.current.wallRoofMesh, roofColorEntry);
  }, [roofColorEntry]);

  useEffect(() => {
    if (!sceneRef.current) return;
    setMeshColor(sceneRef.current.wallMesh, wallColorEntry);
  }, [wallColorEntry]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.roofGroup.position.set(
      s.roofBasePosition.x + (roofOffset?.dx || 0),
      s.roofBasePosition.y + (roofOffset?.dy || 0),
      s.roofBasePosition.z + (roofOffset?.dz || 0)
    );
  }, [roofOffset]);

  return (
    <div className="viewer3d-wrap">
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
}
