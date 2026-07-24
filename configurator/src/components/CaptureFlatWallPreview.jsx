import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// R2.5 — honest flat-wall TECHNICAL COMPATIBILITY preview. This is a
// non-production Three.js test object: a plain wall plane plus a
// proportioned slab sized from the session's own confirmed width/height
// measurements, oriented per the confirmed texture direction, with simple
// color banding standing in for "texture direction" — not an actual
// texture map, not reconstructed profile geometry (bends/seams/ribs/hems
// are never drawn), and never exported as or treated like a Studio-ready
// GLB. Untested (canvas/WebGL glue, matching the existing CaptureCamera.jsx
// precedent) — the pure readiness/validation logic it's driven by lives in
// api/_lib/captureStudioValidation.js and IS unit-tested.
export default function CaptureFlatWallPreview({ widthMm, heightMm, textureDirection }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !widthMm || !heightMm) return undefined;

    const width = mount.clientWidth || 320;
    const height = 220;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, -3, 1.6);
    camera.lookAt(0, 0, 0.3);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 0.6);
    key.position.set(2, -2, 3);
    scene.add(key);

    // The "wall" — a plain flat plane, exactly the scale-of-scene backdrop
    // this preview exists to prove compatibility against.
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 2),
      new THREE.MeshStandardMaterial({ color: 0xdedad2, side: THREE.DoubleSide }),
    );
    scene.add(wall);

    // The schematic slab — proportioned from real confirmed measurements,
    // never from any assumed/default dimension. Color banding along the
    // confirmed texture direction stands in for a real texture; it is not one.
    const w = Math.min(1.6, Math.max(0.2, widthMm / 300));
    const h = Math.min(1.2, Math.max(0.08, heightMm / 300));
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x8a3b25 }),
    );
    slab.position.z = 0.02;
    scene.add(slab);

    const bandCount = 6;
    const bandGeometry = textureDirection === 'across_coverage'
      ? new THREE.BoxGeometry(w / bandCount, h * 1.02, 0.032)
      : new THREE.BoxGeometry(w * 1.02, h / bandCount, 0.032);
    for (let i = 0; i < bandCount; i += 2) {
      const band = new THREE.Mesh(bandGeometry, new THREE.MeshStandardMaterial({ color: 0x6e2f1c }));
      if (textureDirection === 'across_coverage') {
        band.position.set(-w / 2 + (bandGeometry.parameters.width / 2) + i * bandGeometry.parameters.width, 0, 0.03);
      } else {
        band.position.set(0, -h / 2 + (bandGeometry.parameters.height / 2) + i * bandGeometry.parameters.height, 0.03);
      }
      scene.add(band);
    }

    renderer.render(scene, camera);

    return () => {
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [widthMm, heightMm, textureDirection]);

  return (
    <div>
      <div ref={mountRef} style={{ width: '100%', height: 220 }} aria-hidden="true" />
      <div className="control-sublabel">
        Technical compatibility preview — a schematic proof of scale, orientation, material zone, and
        texture direction. Not reconstructed geometry. Not fabrication grade.
      </div>
    </div>
  );
}
