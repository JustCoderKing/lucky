import * as THREE from "../vendor/three.module.min.js";
import { Body, Box, ContactMaterial, Cylinder, Material, Sphere, Vec3, World } from "../vendor/cannon-es.js";
import { EXIT_GAP_MS, EXIT_MS, MIX_MS } from "./draw-plan.js";

const BALL_R = 0.15;
const CHAMBER = { x: 0, y: 0.42, z: 0 };
const INNER = 1.22;
const WALL_H = 1.9;
const GLASS_R = INNER + 0.05;
const ROW_Y = -1.18;
const ROW_SPACING = 0.5;
const SETTLED_SCALE = 1.48;

function easeOutCubic(amount) {
  return 1 - (1 - amount) ** 3;
}

function clamp01(amount) {
  return Math.min(1, Math.max(0, amount));
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

function slotFor(index, count) {
  const origin = -((count - 1) * ROW_SPACING) / 2;
  return new THREE.Vector3(origin + index * ROW_SPACING, ROW_Y, 0.35);
}

export function createMachine(ctx) {
  const { scene, camera, renderer, resize, rim } = ctx;
  const force = new Vec3();
  let active = false;
  let paused = false;
  let settled = false;
  let holding = false;
  let blowing = true;
  let settleUntil = 0;
  let startedAt = 0;
  let pauseStarted = 0;
  let pausedFor = 0;
  let simTime = 0;
  let accumulator = 0;
  let frozen = false;
  let finish = () => {};
  let root = null;
  let world = null;
  let actors = [];
  let winnerActors = [];
  let fan = null;
  let cameraSaved = null;
  let caption = "";

  function elapsedNow() {
    const end = paused ? pauseStarted : performance.now();
    return end - startedAt - pausedFor;
  }

  function adoptCamera() {
    if (cameraSaved) return;
    cameraSaved = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      fov: camera.fov,
    };
    camera.position.set(-0.62, 0.55, 8.4);
    camera.lookAt(0.12, -0.15, 0);
    camera.fov = 34;
    camera.updateProjectionMatrix();
  }

  function restoreCamera() {
    if (!cameraSaved) return;
    camera.position.copy(cameraSaved.position);
    camera.quaternion.copy(cameraSaved.quaternion);
    camera.fov = cameraSaved.fov;
    camera.updateProjectionMatrix();
    cameraSaved = null;
  }

  function teardown() {
    active = false;
    paused = false;
    holding = false;
    if (root) {
      const geometries = new Set();
      const materials = new Set();
      root.traverse((node) => {
        if (node.geometry) geometries.add(node.geometry);
        if (node.material) {
          const list = Array.isArray(node.material) ? node.material : [node.material];
          list.forEach((material) => materials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach(disposeMaterial);
      scene.remove(root);
    }
    root = null;
    world = null;
    actors = [];
    winnerActors = [];
    fan = null;
    frozen = false;
    restoreCamera();
  }

  function disposeMaterial(material) {
    if (material.map) material.map.dispose();
    material.dispose();
  }

  let sphereGeometry = null;
  let labelGeometry = null;

  function vividColor(color) {
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(color).getHSL(hsl);
    return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s + 0.22), hsl.l);
  }

  function makeBall(item, color) {
    const group = new THREE.Group();
    const sphere = new THREE.Mesh(
      sphereGeometry,
      new THREE.MeshPhysicalMaterial({
        color: vividColor(color),
        metalness: 0,
        roughness: 0.26,
        clearcoat: 0.58,
        clearcoatRoughness: 0.16,
        reflectivity: 0.5,
        envMapIntensity: 0.32,
      }),
    );
    const label = new THREE.Mesh(
      labelGeometry,
      new THREE.MeshBasicMaterial({
        map: numberTexture(String(item.number).padStart(2, "0")),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    label.position.z = BALL_R + 0.012;
    group.add(sphere, label);
    return { group, sphere, label };
  }

  function buildChamber() {
    const glass = new THREE.MeshBasicMaterial({
      color: 0x5eaeef,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(GLASS_R, GLASS_R, WALL_H + 0.08, 36, 1, true), glass);
    shell.position.set(CHAMBER.x, CHAMBER.y, CHAMBER.z);
    const metal = new THREE.MeshLambertMaterial({ color: 0x3f86d4 });
    const rimGeo = new THREE.TorusGeometry(GLASS_R, 0.03, 8, 36);
    const top = new THREE.Mesh(rimGeo, metal);
    top.rotation.x = Math.PI / 2;
    top.position.set(CHAMBER.x, CHAMBER.y + WALL_H / 2, CHAMBER.z);
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(GLASS_R + 0.03, GLASS_R + 0.12, 0.36, 36),
      metal,
    );
    cup.position.set(CHAMBER.x, CHAMBER.y - WALL_H / 2 - 0.02, CHAMBER.z);
    const liner = new THREE.Mesh(
      new THREE.CylinderGeometry(GLASS_R - 0.03, GLASS_R - 0.03, 0.16, 36),
      new THREE.MeshLambertMaterial({ color: 0x2f6ec4 }),
    );
    liner.position.set(CHAMBER.x, CHAMBER.y - WALL_H / 2 + 0.08, CHAMBER.z);
    root.add(shell, top, cup, liner);
  }

  function buildBlower() {
    const housing = new THREE.MeshLambertMaterial({ color: 0x4d92dc });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2d64b0 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.38), housing);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 0.32, 16), dark);
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.x = -0.36;
    fan = new THREE.Group();
    fan.position.set(-0.18, 0, 0);
    for (let index = 0; index < 3; index += 1) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.2, 0.055), housing);
      blade.position.y = 0.11;
      const arm = new THREE.Group();
      arm.rotation.x = index * ((Math.PI * 2) / 3);
      arm.add(blade);
      fan.add(arm);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), dark);
    hub.rotation.z = Math.PI / 2;
    hub.position.copy(fan.position);
    const air = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.72, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x3aa0f0,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    air.rotation.z = Math.PI / 2;
    air.position.x = -0.72;
    const unit = new THREE.Group();
    unit.add(body, nozzle, hub, fan, air);
    unit.position.set(CHAMBER.x + GLASS_R + 0.72, CHAMBER.y - WALL_H / 2 + 0.48, CHAMBER.z + 0.02);
    root.add(unit);
  }

  function buildWorld() {
    world = new World({ gravity: new Vec3(0, -12, 0) });
    world.allowSleep = false;
    world.solver.iterations = 6;
    const ballMaterial = new Material("ball");
    const wallMaterial = new Material("wall");
    world.addContactMaterial(new ContactMaterial(ballMaterial, wallMaterial, { friction: 0.08, restitution: 0.48 }));
    world.addContactMaterial(new ContactMaterial(ballMaterial, ballMaterial, { friction: 0.05, restitution: 0.42 }));
    const segments = 16;
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const wall = new Body({ mass: 0, material: wallMaterial });
      wall.addShape(new Box(new Vec3(0.36, WALL_H / 2, 0.1)));
      wall.position.set(CHAMBER.x + Math.sin(angle) * INNER, CHAMBER.y, CHAMBER.z + Math.cos(angle) * INNER);
      wall.quaternion.setFromAxisAngle(new Vec3(0, 1, 0), angle);
      world.addBody(wall);
    }
    const floor = new Body({ mass: 0, material: wallMaterial });
    floor.addShape(new Cylinder(INNER, INNER, 0.16, 14));
    floor.position.set(CHAMBER.x, CHAMBER.y - WALL_H / 2 + 0.1, CHAMBER.z);
    world.addBody(floor);
    const lid = new Body({ mass: 0, material: wallMaterial });
    lid.addShape(new Cylinder(INNER - 0.05, INNER - 0.05, 0.16, 14));
    lid.position.set(CHAMBER.x, CHAMBER.y + WALL_H / 2, CHAMBER.z);
    world.addBody(lid);
    return ballMaterial;
  }

  function spawn(item, color, spot, material, winner) {
    const visual = makeBall(item, color);
    root.add(visual.group);
    const body = new Body({
      mass: 1,
      material,
      linearDamping: 0.12,
      angularDamping: 0.08,
      allowSleep: false,
    });
    body.addShape(new Sphere(BALL_R));
    body.position.set(spot.x, spot.y, spot.z);
    body.velocity.set((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8);
    body.angularVelocity.set(Math.random() * 4, Math.random() * 4, Math.random() * 4);
    world.addBody(body);
    const actor = { ...visual, body, item, winner };
    actors.push(actor);
    return actor;
  }

  function spots(count) {
    const list = [];
    const gap = BALL_R * 2 + 0.025;
    const floorY = CHAMBER.y - WALL_H / 2 + BALL_R + 0.16;
    const ceilY = floorY + BALL_R * 5;
    let y = floorY;
    while (list.length < count) {
      const rings = [0];
      for (let radius = gap; radius <= 0.95; radius += gap * 0.92) rings.push(radius);
      rings.forEach((radius) => {
        if (list.length >= count) return;
        if (radius === 0) {
          list.push({ x: CHAMBER.x, y, z: CHAMBER.z });
          return;
        }
        const around = Math.max(6, Math.floor((Math.PI * 2 * radius) / gap));
        for (let index = 0; index < around && list.length < count; index += 1) {
          const angle = (index / around) * Math.PI * 2 + y * 2;
          list.push({
            x: CHAMBER.x + Math.cos(angle) * radius,
            y,
            z: CHAMBER.z + Math.sin(angle) * radius,
          });
        }
      });
      y += gap;
      if (y > ceilY) y = floorY + gap * 0.45;
    }
    return list;
  }

  function contain(body) {
    const dx = body.position.x - CHAMBER.x;
    const dz = body.position.z - CHAMBER.z;
    const dist = Math.hypot(dx, dz);
    const limit = 0.98;
    if (dist > limit) {
      body.position.x = CHAMBER.x + (dx / dist) * limit;
      body.position.z = CHAMBER.z + (dz / dist) * limit;
      body.velocity.x *= -0.25;
      body.velocity.z *= -0.25;
    }
    const low = CHAMBER.y - WALL_H / 2 + BALL_R + 0.08;
    const high = CHAMBER.y + WALL_H / 2 - BALL_R - 0.08;
    if (body.position.y < low) {
      body.position.y = low;
      body.velocity.y = Math.abs(body.velocity.y) * 0.8;
    }
    if (body.position.y > high) {
      body.position.y = high;
      body.velocity.y = -Math.abs(body.velocity.y) * 0.8;
    }
  }

  function stir() {
    if (!blowing) return;
    actors.forEach((actor, index) => {
      if (!actor.body) return;
      const body = actor.body;
      const dy = body.position.y - CHAMBER.y;
      const dx = body.position.x - CHAMBER.x;
      const dz = body.position.z - CHAMBER.z;
      const radial = Math.hypot(dx, dz) || 0.001;
      const swirl = simTime * 0.003 + index * 0.65;
      const height = (body.position.y - (CHAMBER.y - WALL_H / 2)) / WALL_H;
      const loft = height < 0.32 ? (0.32 - height) * 24 : -height * 10;
      const spread = radial < 0.45 ? 8 : 0;
      force.set(
        Math.cos(swirl) * 14 + (dx / radial) * spread - Math.max(0, dx) * 6,
        loft,
        Math.sin(swirl) * 14 + (dz / radial) * spread,
      );
      body.applyForce(force);
      const blow = height < 0.55 && Math.random() < (dx > 0.1 ? 0.05 : 0.022);
      if (blow) {
        body.velocity.y = 3.6 + Math.random() * 2.4;
        body.velocity.x += (Math.random() - 0.72) * 2.6;
        body.velocity.z += (Math.random() - 0.5) * 2.6;
      }
      if (height > 0.82 && body.velocity.y > 0) body.velocity.y *= 0.35;
      const speed = body.velocity.length();
      if (speed > 6.5) body.velocity.scale(6.5 / speed, body.velocity);
      const spin = body.angularVelocity.length();
      if (spin > 8) body.angularVelocity.scale(8 / spin, body.angularVelocity);
    });
  }

  const facing = new THREE.Quaternion();
  const curvePoint = new THREE.Vector3();

  function copyBody(actor) {
    if (!actor.body) return;
    const position = actor.body.position;
    const rotation = actor.body.quaternion;
    actor.group.position.set(position.x, position.y, position.z);
    actor.group.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  }

  function pointOnExit(actor, amount, out) {
    const t = easeOutCubic(clamp01(amount));
    const remain = 1 - t;
    out.set(0, 0, 0);
    out.addScaledVector(actor.from, remain * remain);
    out.addScaledVector(actor.mouth, 2 * remain * t);
    out.addScaledVector(actor.to, t * t);
    return out;
  }

  function launch(actor, index, count) {
    copyBody(actor);
    actor.from = actor.group.position.clone();
    actor.fromQuat = actor.group.quaternion.clone();
    actor.to = slotFor(index, count);
    actor.mouth = new THREE.Vector3(
      actor.from.x * 0.2,
      Math.min(Math.max(actor.from.y, CHAMBER.y - 0.35), CHAMBER.y + 0.15),
      CHAMBER.z + GLASS_R + 0.2,
    );
    actor.exiting = true;
    if (actor.body) {
      world.removeBody(actor.body);
      actor.body = null;
    }
  }

  function placeWinner(actor, amount) {
    const t = easeOutCubic(clamp01(amount));
    actor.group.position.copy(pointOnExit(actor, amount, curvePoint));
    actor.group.scale.setScalar(1 + (SETTLED_SCALE - 1) * t);
    actor.group.quaternion.copy(actor.fromQuat).slerp(facing, clamp01((t - 0.15) / 0.85));
    if (t > 0.2) actor.label.lookAt(camera.position);
  }

  function setCaption(next, hooks) {
    if (next === caption) return;
    caption = next;
    hooks.onLabel?.(next);
  }

  function stepPhysics(deltaMs) {
    const stepMs = 1000 / 60;
    accumulator += deltaMs;
    let steps = 0;
    while (accumulator >= stepMs && steps < 2) {
      stir();
      actors.forEach((actor) => {
        if (actor.body) contain(actor.body);
      });
      world.step(stepMs / 1000);
      accumulator -= stepMs;
      simTime += stepMs;
      steps += 1;
    }
    if (accumulator > stepMs) accumulator = stepMs;
  }

  function frame() {
    if (!active) return;
    if (!paused && !holding) requestAnimationFrame(frame);
    const elapsed = elapsedNow();
    const delta = Math.min(50, Math.max(0, elapsed - frame.last));
    frame.last = elapsed;
    resize();
    if (fan) fan.rotation.x += 0.62;
    const after = elapsed - MIX_MS;
    const slotMs = EXIT_MS + EXIT_GAP_MS;
    if (after >= 0 && winnerActors.length > 0) {
      const due = Math.min(winnerActors.length, Math.floor(after / slotMs) + 1);
      for (let index = 0; index < due; index += 1) {
        const actor = winnerActors[index];
        if (!actor.exiting) launch(actor, index, winnerActors.length);
        placeWinner(actor, (after - index * slotMs) / EXIT_MS);
      }
      const shown = Math.min(winnerActors.length - 1, Math.floor(after / slotMs));
      const done = after >= winnerActors.length * slotMs;
      setCaption(done ? "第 1 注" : winnerActors[shown].item.caption, frame.hooks);
      if (done && !settled) {
        settled = true;
        blowing = false;
        settleUntil = performance.now() + 700;
        finish("done");
      }
      if (settled && !holding && performance.now() >= settleUntil) holding = true;
    } else {
      setCaption("搅球", frame.hooks);
    }
    if (!holding) stepPhysics(delta || 16);
    actors.forEach(copyBody);
    renderer.render(scene, camera);
  }

  function play(plan, colors, hooks) {
    stop();
    active = true;
    paused = false;
    settled = false;
    holding = false;
    blowing = true;
    settleUntil = 0;
    frozen = false;
    simTime = 0;
    accumulator = 0;
    pausedFor = 0;
    caption = "";
    frame.last = 0;
    frame.hooks = hooks;
    startedAt = performance.now();
    adoptCamera();
    if (rim) rim.color.set(colors.main);
    sphereGeometry = new THREE.SphereGeometry(BALL_R, 40, 28);
    labelGeometry = new THREE.PlaneGeometry(BALL_R * 1.55, BALL_R * 0.96);
    root = new THREE.Group();
    scene.add(root);
    buildChamber();
    buildBlower();
    const material = buildWorld();
    const main = new THREE.Color(colors.main);
    const extra = new THREE.Color(colors.extra);
    winnerActors = plan.winners.map((item) => ({ item, winner: true }));
    const roster = [...winnerActors, ...plan.fillers.map((item) => ({ item, winner: false }))];
    const layout = spots(roster.length);
    for (let index = layout.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      const held = layout[index];
      layout[index] = layout[swap];
      layout[swap] = held;
    }
    roster.forEach((entry, index) => {
      const color = entry.item.zone === "extra" ? extra : main;
      const actor = spawn(entry.item, color, layout[index], material, entry.winner);
      if (entry.winner) winnerActors[winnerActors.indexOf(entry)] = actor;
    });
    resize();
    requestAnimationFrame(frame);
    return new Promise((resolve) => {
      finish = resolve;
    });
  }

  function stop() {
    const pending = active && !settled;
    teardown();
    settled = true;
    if (pending) finish("cancel");
  }

  return {
    get active() {
      return active || root !== null;
    },
    play,
    pause() {
      if (!active || paused) return;
      paused = true;
      pauseStarted = performance.now();
    },
    resume() {
      if (!active) return;
      const wasPaused = paused;
      if (paused) {
        pausedFor += performance.now() - pauseStarted;
        paused = false;
        frame.last = elapsedNow();
      }
      if (holding) {
        resize();
        renderer.render(scene, camera);
        return;
      }
      if (wasPaused) requestAnimationFrame(frame);
    },
    stop,
  };
}
