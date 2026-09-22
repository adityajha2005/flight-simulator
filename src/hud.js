import * as THREE from "three";
import {
  GEAR_HEIGHT,
  METERS_TO_FEET,
  MPS_TO_FPM,
  MPS_TO_KNOTS,
  headingDegrees,
  wrapPi,
} from "./constants.js";
import { LAKE } from "./world.js";

const _ahead = new THREE.Vector3();

export function createHUD() {
  const hud = document.querySelector("#hud");
  const els = {
    hud,
    objective: document.querySelector("#obj-title"),
    objectiveSub: document.querySelector("#obj-sub"),
    speed: document.querySelector("#spd"),
    altitude: document.querySelector("#alt"),
    vs: document.querySelector("#vs"),
    throttle: document.querySelector("#thr-fill"),
    throttleRead: document.querySelector("#thr-read"),
    status: document.querySelector("#status"),
    heading: document.querySelector("#hdg-value"),
    ticks: document.querySelector("#hdg-ticks"),
    warning: document.querySelector("#warning"),
    toast: document.querySelector("#toast"),
    fpm: document.querySelector("#fpm"),
    help: document.querySelector("#help"),
    helpToggle: document.querySelector("#help-toggle"),
    adiRot: document.querySelector("#adi-rot"),
    adiShift: document.querySelector("#adi-shift"),
    map: document.querySelector("#minimap"),
  };

  const tickNodes = [];
  for (let i = 0; i < 11; i += 1) {
    const node = document.createElement("span");
    els.ticks.appendChild(node);
    tickNodes.push(node);
  }

  let toastTimer = 0;
  const mapCtx = els.map.getContext("2d");

  function show(mode) {
    hud.classList.toggle("hidden", !mode);
  }

  function toast(text, kind = "info") {
    els.toast.textContent = text;
    els.toast.className = `toast ${kind}`;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      els.toast.className = "toast hidden";
    }, 3200);
  }

  function toggleHelp(force) {
    const collapsed = force === undefined ? !els.help.classList.contains("collapsed") : !force;
    els.help.classList.toggle("collapsed", collapsed);
    els.helpToggle.textContent = collapsed ? "Controls" : "Hide";
  }

  function update(state, attitude, mission, camera) {
    const knots = Math.round(state.speed * MPS_TO_KNOTS);
    const feet = Math.round((state.position.y - GEAR_HEIGHT) * METERS_TO_FEET);
    const fpm = Math.round(state.velocity.y * MPS_TO_FPM);
    const heading = Math.round(headingDegrees(attitude.heading));
    const throttlePct = Math.round(state.throttle * 100);

    els.speed.textContent = String(knots);
    els.altitude.textContent = String(Math.max(0, feet));
    els.vs.textContent = `${fpm > 0 ? "+" : ""}${fpm} FPM`;
    els.vs.classList.toggle("up", fpm > 40);
    els.vs.classList.toggle("down", fpm < -40);
    els.heading.textContent = `${String(heading).padStart(3, "0")}°`;
    els.throttle.style.width = `${throttlePct}%`;
    els.throttleRead.textContent = `${throttlePct}% · ${throttleLabel(state.throttle)}`;
    els.status.textContent = mission.status;
    els.status.className = `status ${mission.statusClass || ""}`;
    els.objective.textContent = mission.title;
    els.objectiveSub.textContent = mission.subtitle;

    const pitchDeg = (attitude.pitch * 180) / Math.PI;
    const rollDeg = (attitude.roll * 180) / Math.PI;
    els.adiRot.style.transform = `rotate(${-rollDeg}deg)`;
    els.adiShift.style.transform = `translateY(${pitchDeg * 2.4}px)`;

    const center = headingDegrees(attitude.heading);
    for (let i = 0; i < tickNodes.length; i += 1) {
      const mark = Math.round((center - 50) / 10) * 10 + i * 10;
      const norm = ((mark % 360) + 360) % 360;
      tickNodes[i].textContent = compassLabel(norm);
      tickNodes[i].style.transform = `translateX(${(mark - center) * 4.2}px)`;
    }

    const warning = mission.warning;
    els.warning.classList.toggle("hidden", !warning);
    els.warning.textContent = warning || "";
    els.warning.classList.toggle("advise", mission.warningKind === "advise");
    els.speed.classList.toggle("danger", warning === "STALL" || warning === "LOW AIRSPEED");

    drawMap(mapCtx, state, attitude, mission);
    updateMarker(camera, state, els.fpm);
  }

  return { show, toast, toggleHelp, update, helpToggle: els.helpToggle };
}

function throttleLabel(throttle) {
  if (throttle < 0.04) return "IDLE";
  if (throttle > 0.92) return "TOGA";
  if (throttle > 0.65) return "CLIMB";
  return "THRUST";
}

function compassLabel(deg) {
  if (deg === 0) return "N";
  if (deg === 90) return "E";
  if (deg === 180) return "S";
  if (deg === 270) return "W";
  return String(deg).padStart(3, "0");
}

function drawMap(ctx, state, attitude, mission) {
  const { canvas } = ctx;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(36, 22, 18, 0.78)";
  ctx.fillRect(0, 0, w, h);

  const range = 4200;
  const scale = w / range;
  const cx = w / 2;
  const cy = h / 2;
  const px = (x) => cx + x * scale;
  const pz = (z) => cy + z * scale;

  ctx.fillStyle = "#2f6d66";
  ctx.beginPath();
  ctx.arc(px(LAKE.x), pz(LAKE.z), LAKE.r * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#cbb8a4";
  ctx.fillRect(px(145), pz(-390), 225 * scale, 560 * scale);
  ctx.fillStyle = "#6a625c";
  ctx.fillRect(px(-24), pz(-900), 48 * scale, 1800 * scale);

  mission.gates.forEach((gate, index) => {
    ctx.beginPath();
    ctx.arc(px(gate.x), pz(gate.z), index === mission.nextGate ? 5 : 3.5, 0, Math.PI * 2);
    if (index < mission.nextGate) ctx.fillStyle = "#63f0a8";
    else if (index === mission.nextGate) ctx.fillStyle = "#e36a45";
    else ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fill();
  });

  ctx.save();
  ctx.translate(px(state.position.x), pz(state.position.z));
  ctx.rotate(attitude.heading);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5, 7);
  ctx.lineTo(0, 4);
  ctx.lineTo(-5, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "rgba(214, 246, 255, 0.8)";
  ctx.font = "11px Outfit, sans-serif";
  ctx.fillText("N", cx - 4, 14);
}

function updateMarker(camera, state, el) {
  if (state.speed < 18 || state.onGround) {
    el.classList.add("hidden");
    return;
  }
  _ahead.copy(state.velocity).normalize().multiplyScalar(140).add(state.position);
  _ahead.project(camera);
  if (_ahead.z > 1) {
    el.classList.add("hidden");
    return;
  }
  const x = (_ahead.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-_ahead.y * 0.5 + 0.5) * window.innerHeight;
  if (x < -40 || y < -40 || x > window.innerWidth + 40 || y > window.innerHeight + 40) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
}

export function bearingTo(from, target) {
  return Math.atan2(target.x - from.x, -(target.z - from.z));
}

export function steerHint(heading, bearing) {
  const diff = wrapPi(bearing - heading);
  if (diff > 0.2) return "turn right";
  if (diff < -0.2) return "turn left";
  return "on course";
}
