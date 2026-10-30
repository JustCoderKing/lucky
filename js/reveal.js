import * as THREE from "../vendor/three.module.min.js";

const BALL_RADIUS = 0.4;
const SPACING = 0.92;

function easeOutBack(amount) {
  const overshoot = 1.70158;
  const extra = overshoot + 1;
  return 1 + extra * (amount - 1) ** 3 + overshoot * (amount - 1) ** 2;
}

function numberTexture(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, 256, 256);
  context.fillStyle = "#ffffff";
  context.font = "700 148px Segoe UI, Microsoft YaHei, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 128, 136);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeBall(number, color) {
  const group = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 48, 32),
    new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.22,
      roughness: 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    }),
  );
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 0.32),
    new THREE.MeshBasicMaterial({
      map: numberTexture(String(number).padStart(2, "0")),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  label.position.z = BALL_RADIUS + 0.03;
  group.add(sphere, label);
  return { group, sphere, label };
}

export function createStage(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
  } catch {
    return null;
  }

  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  camera.position.set(0, 0.35, 8.4);

  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x141820, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rim = new THREE.PointLight(0xff5a45, 18, 14);
  rim.position.set(-2.4, 1.2, 1.5);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 64),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.58;
  scene.add(floor);

  const balls = [];
  let startedAt = 0;
  let duration = 1500;
  let running = false;
  let settled = false;

  function resize() {
    const width = canvas.clientWidth || canvas.parentElement.clientWidth;
    const height = canvas.clientHeight || canvas.parentElement.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function clearBalls() {
    balls.splice(0).forEach((entry) => {
      scene.remove(entry.group);
      entry.sphere.geometry.dispose();
      entry.sphere.material.dispose();
      entry.label.geometry.dispose();
      entry.label.material.map.dispose();
      entry.label.material.dispose();
    });
  }

  function tick(now) {
    if (!running) return;
    requestAnimationFrame(tick);
    const elapsed = now - startedAt;
    resize();
    balls.forEach((entry, index) => {
      const local = Math.min(1, Math.max(0, (elapsed - index * 80) / duration));
      const eased = easeOutBack(local);
      entry.group.position.x = entry.from.x + (entry.to.x - entry.from.x) * eased;
      entry.group.position.y = entry.from.y + (entry.to.y - entry.from.y) * eased;
      entry.group.position.z = entry.from.z + (entry.to.z - entry.from.z) * eased;
      entry.sphere.rotation.y = entry.spin * (1 - local) + now * 0.0004;
      if (local >= 1) {
        entry.group.position.y = entry.to.y + Math.sin(now * 0.002 + index) * 0.035;
      }
      entry.label.lookAt(camera.position);
    });
    if (!settled && elapsed > duration + balls.length * 80) settled = true;
    renderer.render(scene, camera);
  }

  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(tick);
  }

  return {
    resize,
    pause() {
      running = false;
    },
    resume() {
      if (balls.length === 0) return;
      start();
    },
    clear() {
      clearBalls();
      running = false;
    },
    show(numbers, colors) {
      clearBalls();
      rim.color.set(colors.main);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      duration = reduced ? 1 : 920;
      const total = numbers.length;
      const origin = -((total - 1) * SPACING) / 2;
      numbers.forEach((item, index) => {
        const entry = makeBall(item.number, item.zone === "extra" ? colors.extra : colors.main);
        entry.from = reduced
          ? { x: origin + index * SPACING, y: 0, z: 0 }
          : {
              x: (Math.random() - 0.5) * 3.2,
              y: 2.3 + Math.random() * 0.8,
              z: -1.4 - Math.random(),
            };
        entry.to = { x: origin + index * SPACING, y: 0, z: 0 };
        entry.spin = reduced ? 0 : 4 + Math.random() * 5;
        entry.group.position.set(entry.from.x, entry.from.y, entry.from.z);
        scene.add(entry.group);
        balls.push(entry);
      });
      resize();
      startedAt = performance.now();
      settled = false;
      start();
      return new Promise((resolve) => {
        window.setTimeout(resolve, duration + total * 80 + 40);
      });
    },
  };
}
