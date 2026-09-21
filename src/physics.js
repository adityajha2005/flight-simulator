import * as THREE from "three";
import { GEAR_HEIGHT, wrapPi } from "./constants.js";

const MAX_THRUST = 6.5;
const DRAG_K = 0.00046;
const LIFT_K = 0.00515;
const CL0 = 0.2;
const CL_ALPHA = 5.05;
const STALL_AOA = 0.33;
const ROTATE_SPEED = 44;
const GRAVITY = 9.81;

const attitude = {
  forward: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  pitch: 0,
  roll: 0,
  heading: 0,
};

const accel = new THREE.Vector3();
const axisX = new THREE.Vector3(1, 0, 0);
const axisY = new THREE.Vector3(0, 1, 0);
const axisZ = new THREE.Vector3(0, 0, 1);
const qPitch = new THREE.Quaternion();
const qYaw = new THREE.Quaternion();
const qRoll = new THREE.Quaternion();
const sample = [
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
];

export function createFlightState() {
  return {
    position: new THREE.Vector3(0, GEAR_HEIGHT, 760),
    velocity: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    throttle: 0,
    throttleTarget: 0,
    pitchRate: 0,
    rollRate: 0,
    yawRate: 0,
    onGround: true,
    wasAirborne: false,
    crashed: false,
    crashReason: "",
    frozen: false,
    time: 0,
    aoa: 0,
    speed: 0,
    justContact: false,
    contact: null,
  };
}

export function resetFlightState(state) {
  state.position.set(0, GEAR_HEIGHT, 760);
  state.velocity.set(0, 0, 0);
  state.quaternion.identity();
  state.throttle = 0;
  state.throttleTarget = 0;
  state.pitchRate = 0;
  state.rollRate = 0;
  state.yawRate = 0;
  state.onGround = true;
  state.wasAirborne = false;
  state.crashed = false;
  state.crashReason = "";
  state.frozen = false;
  state.time = 0;
  state.aoa = 0;
  state.speed = 0;
  state.justContact = false;
  state.contact = null;
}

export function readAttitude(quaternion, out = attitude) {
  out.forward.set(0, 0, -1).applyQuaternion(quaternion);
  out.up.set(0, 1, 0).applyQuaternion(quaternion);
  out.right.set(1, 0, 0).applyQuaternion(quaternion);

  out.pitch = Math.asin(THREE.MathUtils.clamp(out.forward.y, -1, 1));
  out.heading = Math.atan2(out.forward.x, -out.forward.z);

  const rightX = -out.forward.z;
  const rightZ = out.forward.x;
  const horizontal = Math.hypot(rightX, rightZ);
  if (horizontal > 0.12) {
    const upDotRight = (out.up.x * rightX + out.up.z * rightZ) / horizontal;
    out.roll = Math.atan2(-upDotRight, out.up.y);
  } else {
    out.roll = 0;
  }

  return out;
}

function crash(state, reason) {
  state.crashed = true;
  state.crashReason = reason;
  state.frozen = true;
  state.onGround = true;
  state.velocity.set(0, 0, 0);
  state.position.y = Math.max(state.position.y, GEAR_HEIGHT);
}

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

export function stepPhysics(state, input, world, dt) {
  state.justContact = false;
  state.contact = null;
  if (state.frozen) return;

  const h = Math.min(dt, 1 / 60);
  const steps = Math.max(1, Math.ceil(dt / h));
  const stepDt = dt / steps;
  for (let i = 0; i < steps; i += 1) integrate(state, input, world, stepDt);
}

function integrate(state, input, world, dt) {
  if (state.frozen) return;

  state.time += dt;
  const att = readAttitude(state.quaternion, attitude);
  const speed = state.velocity.length();
  state.speed = speed;

  if (input.throttleUp) state.throttleTarget = Math.min(1, state.throttleTarget + 0.9 * dt);
  if (input.throttleDown) state.throttleTarget = Math.max(0, state.throttleTarget - 1.05 * dt);
  state.throttle = damp(state.throttle, state.throttleTarget, 3.4, dt);

  const airborneAuth = THREE.MathUtils.clamp((speed - 18) / 32, 0.28, 1);
  let targetPitch = 0;
  let targetRoll = 0;
  let targetYaw = 0;

  if (state.onGround) {
    const steer = THREE.MathUtils.clamp(1.25 - speed / 90, 0.28, 1.15);
    targetYaw = input.yaw * steer;
    targetRoll = -att.roll * 6;
    if (speed > ROTATE_SPEED && input.pitch > 0) targetPitch = input.pitch * 0.5;
    else targetPitch = -att.pitch * 3.8;
    if (att.pitch > 0.18) targetPitch = Math.min(targetPitch, -1.5);
    if (att.pitch < -0.03) targetPitch = Math.max(targetPitch, 1.5);
  } else {
    targetPitch = input.pitch * 0.58 * airborneAuth;
    targetRoll = input.roll * 1.05 * airborneAuth;
    targetYaw = input.yaw * 0.48 * airborneAuth;
    targetYaw += att.roll * 0.28 * THREE.MathUtils.clamp(speed / 70, 0, 1);
    targetRoll += -att.roll * 0.35;
    targetPitch += (0.03 - att.pitch) * 0.35;

    if (att.pitch > 0.38) targetPitch = Math.min(targetPitch, -0.7);
    if (att.pitch < -0.32) targetPitch = Math.max(targetPitch, 0.7);
    if (att.roll > 0.95) targetRoll = Math.min(targetRoll, -0.9);
    if (att.roll < -0.95) targetRoll = Math.max(targetRoll, 0.9);

    if (state.aoa > STALL_AOA - 0.02) targetPitch -= 0.85;
    else if (speed < 34 && att.pitch > 0.12) targetPitch -= 0.35;
  }

  state.pitchRate = damp(state.pitchRate, targetPitch, 7.5, dt);
  state.rollRate = damp(state.rollRate, targetRoll, 7.5, dt);
  state.yawRate = damp(state.yawRate, targetYaw, 7.5, dt);

  qPitch.setFromAxisAngle(axisX, state.pitchRate * dt);
  qYaw.setFromAxisAngle(axisY, -state.yawRate * dt);
  qRoll.setFromAxisAngle(axisZ, state.rollRate * dt);
  state.quaternion.multiply(qPitch).multiply(qYaw).multiply(qRoll).normalize();

  const body = readAttitude(state.quaternion, attitude);
  const { forward, up, right } = body;

  let aoa = 0;
  if (speed > 2) {
    const inv = 1 / speed;
    const vx = state.velocity.x * inv;
    const vy = state.velocity.y * inv;
    const vz = state.velocity.z * inv;
    const forwardDot = forward.x * vx + forward.y * vy + forward.z * vz;
    const upDot = up.x * vx + up.y * vy + up.z * vz;
    aoa = Math.atan2(-upDot, forwardDot);
  }
  state.aoa = aoa;

  let cl = CL0 + CL_ALPHA * aoa;
  if (aoa > STALL_AOA) cl = CL0 + CL_ALPHA * STALL_AOA - 7.5 * (aoa - STALL_AOA);
  cl = THREE.MathUtils.clamp(cl, -0.35, 1.7);

  let lift = LIFT_K * speed * speed * cl;
  const agl = Math.max(0, state.position.y - GEAR_HEIGHT);
  if (agl < 20) lift *= 1 + ((20 - agl) / 20) * 0.28;

  accel.set(0, 0, 0);
  accel.addScaledVector(up, lift);
  accel.y -= GRAVITY;
  accel.addScaledVector(forward, state.throttle * MAX_THRUST);

  if (speed > 0.05) {
    accel.addScaledVector(state.velocity, -DRAG_K * speed);
    if (speed > 102) accel.addScaledVector(state.velocity, -((speed - 102) * 0.012));
  }

  const side = right.x * state.velocity.x + right.y * state.velocity.y + right.z * state.velocity.z;
  accel.addScaledVector(right, -side * (state.onGround ? 5.5 : 1.35));

  if (input.brake && speed > 0.2) {
    const brake = state.onGround ? 18 : 3.2;
    accel.addScaledVector(state.velocity, -brake / speed);
  }

  if (state.onGround && speed > 0.2) {
    accel.addScaledVector(state.velocity, -1.15 / speed);
  }

  const canLift =
    state.onGround &&
    accel.y > 0.85 &&
    speed > ROTATE_SPEED - 2 &&
    body.pitch > 0.055 &&
    !input.brake;

  if (state.onGround && !canLift) {
    accel.y = 0;
    state.velocity.y = 0;
  } else if (canLift) {
    state.onGround = false;
    state.wasAirborne = true;
    state.velocity.y = Math.max(state.velocity.y, 0.6);
  }

  state.velocity.addScaledVector(accel, dt);

  if (state.onGround) {
    const flatX = forward.x;
    const flatZ = forward.z;
    const flatLen = Math.hypot(flatX, flatZ) || 1;
    const along = (state.velocity.x * flatX + state.velocity.z * flatZ) / flatLen;
    const desiredX = (flatX / flatLen) * along;
    const desiredZ = (flatZ / flatLen) * along;
    const blend = 1 - Math.exp(-10 * dt);
    state.velocity.x += (desiredX - state.velocity.x) * blend;
    state.velocity.z += (desiredZ - state.velocity.z) * blend;
    state.velocity.y = 0;
    if (state.speed < 0.35 && state.throttle < 0.02 && !input.throttleUp) {
      state.velocity.set(0, 0, 0);
    }
  }

  state.position.addScaledVector(state.velocity, dt);
  state.speed = state.velocity.length();

  sample[0].copy(state.position);
  sample[1].copy(state.position).addScaledVector(forward, 14);
  sample[2].copy(state.position).addScaledVector(forward, -12);
  sample[3].copy(state.position).addScaledVector(right, 13);
  sample[4].copy(state.position).addScaledVector(right, -13);

  if (world.hits(sample) && state.speed > 6) {
    crash(state, "Collision with airport structure");
    return;
  }

  if (world.inLake(state.position.x, state.position.z) && state.position.y <= GEAR_HEIGHT + 0.4) {
    crash(state, "Ditched in the lake");
    return;
  }

  if (!state.onGround && state.position.y <= GEAR_HEIGHT && state.velocity.y <= 0.15) {
    resolveContact(state, world, body);
    return;
  }

  if (state.onGround) {
    state.position.y = GEAR_HEIGHT;
    state.velocity.y = 0;
    if (!world.onPavement(state.position.x, state.position.z) && state.speed > 20) {
      crash(state, "Ran off the paved surface");
    }
  } else if (state.position.y > GEAR_HEIGHT + 8) {
    state.wasAirborne = true;
  }
}

function resolveContact(state, world, body) {
  const sink = Math.max(0, -state.velocity.y);
  const onRunway = world.onRunway(state.position.x, state.position.z);
  const onPavement = world.onPavement(state.position.x, state.position.z);
  const bank = Math.abs(body.roll);
  const headingError = Math.min(
    Math.abs(wrapPi(body.heading)),
    Math.abs(wrapPi(body.heading - Math.PI)),
  );

  let reason = "";
  if (sink > 8.4) reason = "Hard landing — sink rate too high";
  else if (bank > 0.3 && state.speed > 18) reason = "Wing strike";
  else if (body.pitch < -0.14 && sink > 1.2) reason = "Nose-down impact";
  else if (body.pitch > 0.34 && sink > 1) reason = "Tail strike";
  else if (!onPavement && state.speed > 16) reason = "Ran off the paved surface";
  else if (!onRunway && state.speed > 30) reason = "Missed the runway";
  else if (onRunway && headingError > 0.62 && state.speed > 28) reason = "Misaligned landing";

  state.position.y = GEAR_HEIGHT;
  state.velocity.y = 0;

  if (reason && state.wasAirborne) {
    crash(state, reason);
    return;
  }

  state.onGround = true;
  if (sink > 3.2) state.velocity.multiplyScalar(0.9);

  if (state.wasAirborne && state.speed > 24) {
    state.justContact = true;
    state.contact = {
      vs: sink,
      x: state.position.x,
      z: state.position.z,
      heading: body.heading,
      roll: body.roll,
      pitch: body.pitch,
      speed: state.speed,
      onRunway,
      onPavement,
    };
  }
}
