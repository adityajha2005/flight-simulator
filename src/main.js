import * as THREE from "three";
import { createAircraft } from "./aircraft.js";
import { createAudio } from "./audio.js";
import { GEAR_HEIGHT, wrapPi } from "./constants.js";
import { bearingTo, createHUD, steerHint } from "./hud.js";
import { createInput } from "./input.js";
import { createFlightState, readAttitude, resetFlightState, stepPhysics } from "./physics.js";
import { GATE_DEFS, createWorld, hitsObstacle, inLake, onPavement, onRunway } from "./world.js";

const view = document.querySelector("#view");
const menu = document.querySelector("#menu");
const results = document.querySelector("#results");
const crashScreen = document.querySelector("#crash");
const startButton = document.querySelector("#start");
const againButton = document.querySelector("#again");
const restartButton = document.querySelector("#restart");

const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.35, 20000);

const world = createWorld(scene, renderer);
const aircraft = createAircraft();
scene.add(aircraft.group);
const beacons = [aircraft.beaconMat, world.parked.beaconMat];

const state = createFlightState();
const input = createInput();
const audio = createAudio();
const hud = createHUD();

const worldQuery = {
  onRunway,
  onPavement,
  inLake,
  hits: (points) => hitsObstacle(points, world.obstacles),
};

const debug = { timeScale: 1, pilot: null };
const attitude = {
  forward: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  pitch: 0,
  roll: 0,
  heading: 0,
};
const desired = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const camUp = new THREE.Vector3();
const lastPos = new THREE.Vector3();
const sunDir = new THREE.Vector3(-0.55, 0.78, 0.32).normalize();

const smoke = [];
const smokeTexture = createSmokeTexture();

let mode = "menu";
let nextGate = 0;
let takenOff = false;
let rollout = null;
let snapCamera = false;
let menuAngle = 0.6;
let prevHelp = false;
let prevRestart = false;
let rotateCall = false;
let brakeHintAt = 0;
let earlyLandingTold = false;

const clock = new THREE.Clock();

function resetMission() {
  resetFlightState(state);
  nextGate = 0;
  takenOff = false;
  rollout = null;
  rotateCall = false;
  brakeHintAt = 0;
  earlyLandingTold = false;
  lastPos.copy(state.position);
  smoke.forEach((puff) => scene.remove(puff.sprite));
  smoke.length = 0;
}

function showMenu() {
  mode = "menu";
  menu.classList.remove("hidden");
  results.classList.add("hidden");
  crashScreen.classList.add("hidden");
  hud.show(false);
}

function startFlight() {
  resetMission();
  mode = "fly";
  menu.classList.add("hidden");
  results.classList.add("hidden");
  crashScreen.classList.add("hidden");
  hud.show(true);
  snapCamera = true;
  audio.ensure();
  startButton.blur();
  againButton.blur();
  restartButton.blur();
}

function finishFlight() {
  mode = "done";
  state.frozen = true;
  hud.show(false);
  const rated = rateLanding(rollout.vs);
  const score = computeScore(rollout, state.time, rated.points);
  document.querySelector("#quality").textContent = rated.name;
  document.querySelector("#quality").className = rated.className;
  document.querySelector("#quality-note").textContent = rated.note;
  document.querySelector("#flight-time").textContent = formatTime(state.time);
  document.querySelector("#final-score").textContent = score.toLocaleString();
  results.classList.remove("hidden");
  audio.success();
}

function failFlight(reason) {
  mode = "crashed";
  hud.show(false);
  document.querySelector("#crash-reason").textContent = reason;
  crashScreen.classList.remove("hidden");
  spawnSmoke();
  audio.crash();
}

startButton.addEventListener("click", startFlight);
againButton.addEventListener("click", startFlight);
restartButton.addEventListener("click", startFlight);
hud.helpToggle.addEventListener("click", () => hud.toggleHelp());

window.addEventListener("keydown", (event) => {
  if (event.code === "Enter" && mode === "menu") startFlight();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const steps = Math.max(1, Math.round(debug.timeScale));

  if (mode === "menu") {
    updateMenuCamera(dt);
  } else if (mode === "fly") {
    let sample = input.sample();
    if (debug.pilot) sample = { ...sample, ...debug.pilot(state, readAttitude(state.quaternion, attitude)) };
    edgeKeys(sample);
    for (let i = 0; i < steps; i += 1) {
      stepPhysics(state, sample, worldQuery, dt);
      updateMission(sample);
      if (mode !== "fly") break;
    }
    updateChase(dt, false);
    const mission = describeMission();
    hud.update(state, readAttitude(state.quaternion, attitude), mission, camera);
    audio.update(state.throttle, state.speed, sample.brake, dt);
    if (mission.warning === "STALL") audio.stall(dt);
  } else {
    const sample = input.sample();
    edgeKeys(sample);
    updateChase(dt, false);
  }

  updateWorld(dt);
  syncAircraft(input.sample());
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function edgeKeys(sample) {
  if (sample.helpPressed && !prevHelp) hud.toggleHelp();
  if (sample.restartPressed && !prevRestart && mode !== "menu") startFlight();
  prevHelp = sample.helpPressed;
  prevRestart = sample.restartPressed;
}

function updateMission(sample) {
  if (mode !== "fly" || state.frozen) return;

  const agl = state.position.y - GEAR_HEIGHT;
  if (!takenOff && !state.onGround && agl > 16 && state.speed > 40) {
    takenOff = true;
    hud.toast("Positive rate. Climb through the departure gate.");
    audio.blip(660, 0.1, "sine", 0.04);
  }

  if (!rotateCall && state.onGround && state.speed >= 44 && !takenOff) {
    rotateCall = true;
    hud.toast("Rotate — pull the nose up with W");
  }

  if (takenOff && nextGate < GATE_DEFS.length && crossedGate(GATE_DEFS[nextGate])) {
    const cleared = GATE_DEFS[nextGate];
    nextGate += 1;
    audio.gate();
    if (nextGate >= GATE_DEFS.length) hud.toast("Circuit complete. Land on runway 36 and stop.");
    else hud.toast(`${cleared.name} gate cleared.`);
  }

  if (state.crashed) {
    failFlight(state.crashReason);
    return;
  }

  if (!state.onGround && agl > 12) earlyLandingTold = false;

  if (state.justContact && state.contact) {
    const contact = state.contact;
    if (!takenOff || nextGate < GATE_DEFS.length) {
      if (!earlyLandingTold) {
        earlyLandingTold = true;
        hud.toast("Touchdown before the circuit is complete. Take off and finish the gates.", "bad");
      }
    } else if (contact.onRunway) {
      rollout = contact;
      brakeHintAt = state.time + 3;
      const rated = rateLanding(contact.vs);
      hud.toast(`${rated.name} touchdown. Hold Space and stop on the runway.`);
    } else if (!earlyLandingTold) {
      earlyLandingTold = true;
      hud.toast("That was not the runway. Go around and line up on 36.", "bad");
    }
  }

  if (rollout) {
    if (!state.onGround && agl > 12) {
      rollout = null;
      hud.toast("Go-around. Bring it back to runway 36.");
    } else if (!onRunway(state.position.x, state.position.z) && state.speed >= 12) {
      rollout = null;
      hud.toast("You left the runway. Line up and land again.", "bad");
    } else if (state.onGround && state.speed < 12 && onRunway(state.position.x, state.position.z)) {
      finishFlight();
      return;
    } else if (brakeHintAt && state.time > brakeHintAt && state.speed > 25 && !sample.brake) {
      brakeHintAt = 0;
      hud.toast("Hold Space to brake");
    }
  }

  lastPos.copy(state.position);
}

function crossedGate(gate) {
  const prev = planeOffset(lastPos, gate);
  const curr = planeOffset(state.position, gate);
  if (!((prev < 0 && curr >= 0) || (prev > 0 && curr <= 0))) return false;
  const span = prev - curr || 1;
  const t = prev / span;
  const x = lastPos.x + (state.position.x - lastPos.x) * t;
  const y = lastPos.y + (state.position.y - lastPos.y) * t;
  const z = lastPos.z + (state.position.z - lastPos.z) * t;
  const radial = Math.hypot(x - gate.x, y - gate.y, z - gate.z);
  const speed = state.speed || 1;
  const align =
    (state.velocity.x * gate.dir.x + state.velocity.y * gate.dir.y + state.velocity.z * gate.dir.z) / speed;
  return radial < 32 && align > 0.2;
}

function planeOffset(point, gate) {
  return (
    (point.x - gate.x) * gate.dir.x +
    (point.y - gate.y) * gate.dir.y +
    (point.z - gate.z) * gate.dir.z
  );
}

function describeMission() {
  const att = readAttitude(state.quaternion, attitude);
  let title = "Take off from runway 36";
  let subtitle = "Hold Shift, accelerate, then pull up with W";
  if (takenOff && nextGate < GATE_DEFS.length) {
    const gate = GATE_DEFS[nextGate];
    title = `Fly through the ${gate.name.toLowerCase()} gate`;
    const dist = Math.round(
      Math.hypot(state.position.x - gate.x, state.position.y - gate.y, state.position.z - gate.z),
    );
    const bearing = bearingTo(state.position, gate);
    subtitle = `${dist} m · ${steerHint(att.heading, bearing)} · pass heading ${gate.heading}`;
  } else if (takenOff) {
    title = "Land on runway 36 and stop";
    const dist = Math.round(Math.hypot(state.position.x, state.position.z - 860));
    subtitle = rollout
      ? "Brake to a full stop on the runway"
      : `${dist} m to the threshold · idle the thrust and flare`;
  }

  const agl = state.position.y - GEAR_HEIGHT;
  const aligned = Math.abs(state.position.x) < 50 && state.position.z < 1600 && state.position.z > -200;
  let warning = "";
  let warningKind = "danger";
  if (!state.onGround && state.aoa > 0.24) warning = "STALL";
  else if (!state.onGround && state.speed < 36) warning = "LOW AIRSPEED";
  else if (!state.onGround && state.speed > 108) warning = "OVERSPEED";
  else if (!state.onGround && state.velocity.y < -7 && agl < 90) warning = "SINK RATE";
  else if (!state.onGround && agl < 24 && !(aligned && nextGate >= GATE_DEFS.length)) warning = "TOO LOW";
  else if (state.onGround && !takenOff && state.speed > 44) {
    warning = "ROTATE";
    warningKind = "advise";
  }

  let status = "PARKED";
  let statusClass = "";
  if (state.crashed) {
    status = "CRASHED";
    statusClass = "warn";
  } else if (rollout) {
    status = "ROLLOUT";
    statusClass = "good";
  } else if (state.onGround && state.speed < 2 && state.throttle < 0.08) status = "PARKED";
  else if (state.onGround && state.speed < 44) status = "TAKEOFF ROLL";
  else if (state.onGround) status = "ROTATE";
  else if (warning === "STALL") {
    status = "STALL";
    statusClass = "warn";
  } else if (takenOff && nextGate >= GATE_DEFS.length && agl < 180) status = "APPROACH";
  else if (state.velocity.y > 2) status = "CLIMB";
  else if (state.velocity.y < -2) status = "DESCENT";
  else status = "CRUISE";

  return {
    title,
    subtitle,
    warning,
    warningKind,
    status,
    statusClass,
    gates: GATE_DEFS,
    nextGate,
  };
}

function updateMenuCamera(dt) {
  menuAngle += dt * 0.18;
  const x = Math.sin(menuAngle) * 52;
  const z = 760 + Math.cos(menuAngle) * 46;
  const y = 10 + Math.sin(menuAngle * 0.7) * 1.5;
  camera.position.set(x, y, z);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 5, 760);
}

function updateChase(dt, snap) {
  const att = readAttitude(state.quaternion, attitude);
  const back = 34 + state.throttle * 7;
  desired.copy(state.position).addScaledVector(att.forward, -back).addScaledVector(att.up, 7.5);
  desired.y += 2.4;
  if (state.onGround && state.speed > 12) {
    const rumble = Math.min(0.12, state.speed * 0.0015);
    desired.y += Math.sin(state.time * 47) * rumble;
    desired.x += Math.sin(state.time * 31) * rumble;
  }
  desired.y = Math.max(1.8, desired.y);

  if (snapCamera || snap) {
    camera.position.copy(desired);
    snapCamera = false;
  } else {
    const gain = 1 - Math.exp(-3.1 * dt);
    camera.position.lerp(desired, gain);
  }

  lookAt.copy(state.position).addScaledVector(att.forward, 22);
  lookAt.y += 1.8;
  camUp.set(0, 1, 0).lerp(att.up, state.onGround ? 0.05 : 0.38).normalize();
  camera.up.copy(camUp);
  camera.lookAt(lookAt);

  const fovTarget = 56 + state.throttle * 6 + Math.max(0, state.velocity.y) * 0.12;
  camera.fov += (fovTarget - camera.fov) * (1 - Math.exp(-2.2 * dt));
  camera.updateProjectionMatrix();
}

function syncAircraft(sample) {
  if (mode === "menu") {
    aircraft.group.position.copy(state.position);
    aircraft.group.quaternion.identity();
  } else {
    aircraft.group.position.copy(state.position);
    aircraft.group.quaternion.copy(state.quaternion);
  }

  const pitch = sample.pitch || 0;
  const roll = sample.roll || 0;
  const yaw = sample.yaw || 0;
  aircraft.surfaces.elevatorL.rotation.x = -pitch * 0.42;
  aircraft.surfaces.elevatorR.rotation.x = -pitch * 0.42;
  aircraft.surfaces.aileronL.rotation.x = roll * 0.4;
  aircraft.surfaces.aileronR.rotation.x = -roll * 0.4;
  aircraft.surfaces.rudder.rotation.y = -yaw * 0.45;

  const pulse = Math.sin(performance.now() / 90) > 0 ? 1 : 0.12;
  for (const mat of beacons) mat.color.setRGB(pulse, pulse * 0.16, pulse * 0.18);

  for (const exhaust of aircraft.exhausts) {
    const scale = 0.35 + state.throttle * 1.5;
    exhaust.exhaust.scale.setScalar(scale);
    exhaust.exhaustMat.color.set(state.throttle > 0.75 ? 0xfff1c9 : 0xff9a3c);
  }
}

function updateWorld(dt) {
  world.sky.position.copy(camera.position);
  const focus = mode === "menu" ? aircraft.group.position : state.position;
  world.sun.position.copy(focus).addScaledVector(sunDir, 420);
  world.sun.target.position.copy(focus);

  for (const cloud of world.clouds) {
    cloud.position.x += cloud.userData.speed * dt;
    if (cloud.position.x > 1800) cloud.position.x = -1800;
  }

  const time = state.time || menuAngle;
  world.gates.forEach((gate, index) => {
    const done = index < nextGate;
    const active = index === nextGate;
    if (done) {
      gate.ringMat.color.setHex(0x63f0a8);
      gate.ringMat.emissive.setHex(0x1f8a52);
      gate.ringMat.emissiveIntensity = 0.35;
      gate.beam.material.opacity = 0.06;
      gate.label.visible = false;
      gate.ring.scale.setScalar(1);
    } else if (active) {
      const pulse = 0.65 + Math.sin(time * 4) * 0.35;
      gate.ringMat.color.setHex(0xffc14d);
      gate.ringMat.emissive.setHex(0xffc14d);
      gate.ringMat.emissiveIntensity = pulse;
      gate.beam.material.color.setHex(0xffc14d);
      gate.beam.material.opacity = 0.18 + pulse * 0.12;
      gate.label.visible = true;
      gate.ring.scale.setScalar(1 + Math.sin(time * 3) * 0.035);
    } else {
      gate.ringMat.color.setHex(0x9fb4c4);
      gate.ringMat.emissive.setHex(0x27485a);
      gate.ringMat.emissiveIntensity = 0.15;
      gate.beam.material.opacity = 0.05;
      gate.label.visible = false;
      gate.ring.scale.setScalar(1);
    }
  });

  for (let i = smoke.length - 1; i >= 0; i -= 1) {
    const puff = smoke[i];
    puff.life -= dt;
    puff.sprite.position.addScaledVector(puff.velocity, dt);
    puff.sprite.material.opacity = Math.max(0, puff.life);
    const grow = 1 + (1 - puff.life) * 2.4;
    puff.sprite.scale.setScalar(8 * grow);
    if (puff.life <= 0) {
      scene.remove(puff.sprite);
      smoke.splice(i, 1);
    }
  }
}

function spawnSmoke() {
  for (let i = 0; i < 10; i += 1) {
    const material = new THREE.SpriteMaterial({
      map: smokeTexture,
      transparent: true,
      depthWrite: false,
      color: i % 2 ? 0x666666 : 0xff6a3d,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(state.position);
    sprite.position.y += 1;
    scene.add(sprite);
    smoke.push({
      sprite,
      life: 1,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6),
    });
  }
}

function createSmokeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  gradient.addColorStop(0, "rgba(255,255,255,0.8)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function rateLanding(vs) {
  if (vs < 1.35) return { name: "BUTTER", note: "Barely a ripple.", className: "butter", points: 1000 };
  if (vs < 2.7) return { name: "SMOOTH", note: "Nice and stable.", className: "smooth", points: 720 };
  if (vs < 4.8) return { name: "FIRM", note: "You felt that one.", className: "firm", points: 460 };
  return { name: "HARD", note: "The gear took it.", className: "hard", points: 220 };
}

function computeScore(contact, time, qualityPoints) {
  const center = Math.max(0, Math.round(250 * (1 - Math.abs(contact.x) / 20)));
  const headingError = Math.min(Math.abs(wrapPi(contact.heading)), Math.abs(wrapPi(contact.heading - Math.PI)));
  const align = Math.max(0, Math.round(250 * (1 - headingError / (20 * (Math.PI / 180)))));
  const timeBonus = Math.max(0, Math.round(400 - Math.max(0, time - 80) * 2.5));
  return 600 + qualityPoints + center + align + timeBonus;
}

function formatTime(time) {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

window.__flight = {
  start: startFlight,
  get state() {
    return state;
  },
  get mode() {
    return mode;
  },
  debug,
  attitude: () => readAttitude(state.quaternion, attitude),
  mission: () => ({ nextGate, takenOff, rollout, mode }),
};

requestAnimationFrame(frame);
