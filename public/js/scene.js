/**
 * WebGL backdrop: drifting particle field + wireframe polyhedra that react to
 * pointer movement and scroll. Degrades silently if WebGL is unavailable and
 * disables itself when the user prefers reduced motion.
 */
import * as THREE from '../vendor/three.module.min.js';

export function initScene(canvas) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return { destroy() {} };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: window.devicePixelRatio < 2,
      powerPreference: 'high-performance',
    });
  } catch {
    return { destroy() {} }; // no WebGL — the CSS aurora still looks good
  }

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060f, 0.055);

  const camera = new THREE.PerspectiveCamera(
    62, window.innerWidth / window.innerHeight, 0.1, 120,
  );
  camera.position.set(0, 0, 18);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  /* ------------------------------------------------------- particle field */
  const COUNT = window.innerWidth < 760 ? 1400 : 3200;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);

  const paletteA = new THREE.Color(0x22d3ee);
  const paletteB = new THREE.Color(0xa855f7);
  const paletteC = new THREE.Color(0xf5a524);

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 56;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 42;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 44;
    speeds[i] = 0.004 + Math.random() * 0.016;

    const r = Math.random();
    const c = r < 0.5 ? paletteA : r < 0.85 ? paletteB : paletteC;
    colors[i * 3]     = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const points = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      size: 0.085,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  );
  scene.add(points);

  /* ----------------------------------------------------- wireframe shapes */
  const shapes = [];
  const shapeDefs = [
    { geo: new THREE.IcosahedronGeometry(3.1, 0), pos: [-9.5, 2.4, -6],  color: 0x22d3ee, spin: 0.0022 },
    { geo: new THREE.OctahedronGeometry(2.3, 0),  pos: [10.2, -2.6, -4], color: 0xa855f7, spin: -0.0031 },
    { geo: new THREE.TorusGeometry(2.1, 0.42, 10, 34), pos: [7.4, 4.4, -9], color: 0xf5a524, spin: 0.0026 },
    { geo: new THREE.DodecahedronGeometry(1.8, 0), pos: [-7.8, -4.6, -3], color: 0x6366f1, spin: -0.0019 },
  ];

  for (const def of shapeDefs) {
    const mesh = new THREE.Mesh(
      def.geo,
      new THREE.MeshBasicMaterial({
        color: def.color,
        wireframe: true,
        transparent: true,
        opacity: 0.26,
      }),
    );
    mesh.position.set(...def.pos);
    mesh.userData.spin = def.spin;
    mesh.userData.baseY = def.pos[1];
    scene.add(mesh);
    shapes.push(mesh);
  }

  /* ---------------------------------------------------------------- input */
  const pointer = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  let scrollY = 0;

  const onPointer = (e) => {
    const t = e.touches?.[0];
    const cx = t ? t.clientX : e.clientX;
    const cy = t ? t.clientY : e.clientY;
    target.x = (cx / window.innerWidth) * 2 - 1;
    target.y = -((cy / window.innerHeight) * 2 - 1);
  };
  const onScroll = () => { scrollY = window.scrollY; };
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('touchmove', onPointer, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);

  /* ----------------------------------------------------------------- loop */
  let raf = 0;
  let running = true;
  const clock = new THREE.Clock();

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);

    const t = clock.getElapsedTime();

    // Ease the camera toward the pointer for a parallax feel.
    pointer.x += (target.x - pointer.x) * 0.045;
    pointer.y += (target.y - pointer.y) * 0.045;
    camera.position.x = pointer.x * 3.1;
    camera.position.y = pointer.y * 2.1 - scrollY * 0.0022;
    camera.lookAt(0, -scrollY * 0.0012, 0);

    // Drift particles upward and wrap them around.
    const arr = pGeo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 1] += speeds[i];
      if (arr[i * 3 + 1] > 21) arr[i * 3 + 1] = -21;
    }
    pGeo.attributes.position.needsUpdate = true;
    points.rotation.y = t * 0.026;

    for (const m of shapes) {
      m.rotation.x += m.userData.spin;
      m.rotation.y += m.userData.spin * 1.35;
      m.position.y = m.userData.baseY + Math.sin(t * 0.62 + m.userData.baseY) * 0.55;
    }

    renderer.render(scene, camera);
  }

  frame();

  // Pause rendering when the tab is hidden to save battery.
  const onVisibility = () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!running) {
      running = true;
      clock.getDelta();
      frame();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('touchmove', onPointer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      pGeo.dispose();
      points.material.dispose();
      shapes.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
      renderer.dispose();
    },
  };
}
