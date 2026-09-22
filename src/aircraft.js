import * as THREE from "three";
import { GEAR_HEIGHT, WHEEL_RADIUS } from "./constants.js";

function standard(color, roughness = 0.45, metalness = 0.18) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function tailTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#4a241c";
  ctx.fillRect(0, 0, 256, 512);
  ctx.strokeStyle = "#e7b089";
  ctx.lineWidth = 16;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(48, 430);
  ctx.lineTo(128, 70);
  ctx.lineTo(208, 430);
  ctx.stroke();
  ctx.fillStyle = "#f6efe6";
  ctx.font = "700 86px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("H", 128, 300);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function decalTexture(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = "#c4492e";
  ctx.font = "700 40px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createAircraft() {
  const group = new THREE.Group();
  const white = standard(0xf3e6d4, 0.42, 0.16);
  const blue = standard(0xc4492e, 0.46, 0.12);
  const metal = standard(0xcbb6a6, 0.34, 0.68);
  const dark = standard(0x241812, 0.28, 0.5);
  const rubber = standard(0x241c18, 0.85, 0.05);
  const wingMat = standard(0xf7efe4, 0.5, 0.08);

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 22, 24), white);
  tube.rotation.x = Math.PI / 2;
  group.add(tube);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.85, 24, 18), white);
  nose.scale.set(1, 0.96, 1.35);
  nose.position.z = -11;
  group.add(nose);

  const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 1.85, 8, 20), white);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = 15;
  group.add(tailCone);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 10), standard(0xe4d3c0, 0.6, 0.1));
  belly.position.set(0, -1.7, 0.4);
  group.add(belly);

  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 20), blue);
    stripe.position.set(side * 1.82, 0.15, -0.4);
    group.add(stripe);
  }

  const windowGeo = new THREE.BoxGeometry(0.08, 0.32, 0.46);
  for (let i = 0; i < 16; i += 1) {
    const z = -7.4 + i * 0.95;
    for (const side of [-1, 1]) {
      const windowMesh = new THREE.Mesh(windowGeo, dark);
      windowMesh.position.set(side * 1.84, 0.55, z);
      group.add(windowMesh);
    }
  }

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.35, 18, 14), dark);
  cockpit.scale.set(1.05, 0.72, 1.25);
  cockpit.position.set(0, 0.95, -10.4);
  group.add(cockpit);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.15, 0.7), standard(0xd7dee6, 0.4, 0.2));
  door.position.set(-1.86, -0.15, -8.6);
  group.add(door);

  const reg = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshStandardMaterial({ map: decalTexture("H-310"), transparent: true, roughness: 0.5 }),
  );
  reg.position.set(-1.9, 0.15, 6.2);
  reg.rotation.y = -Math.PI / 2;
  group.add(reg);

  const surfaces = buildWings(group, wingMat, white);
  buildEngines(group, metal, dark);
  const tail = buildTail(group, white, blue);
  Object.assign(surfaces, tail);
  buildGear(group, metal, rubber);

  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3b4e });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), beaconMat);
  beacon.position.set(0, 2.05, -1);
  group.add(beacon);

  const nav = [
    lamp(group, -16.4, 0.15, 0.2, 0xff2a2a),
    lamp(group, 16.4, 0.15, 0.2, 0x3dff7a),
    lamp(group, 0, 2.4, 17.6, 0xf2f6ff),
  ];

  const exhausts = [];
  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
    if (obj.userData?.exhaustMat) exhausts.push(obj.userData);
  });

  return { group, surfaces, beacon, beaconMat, nav, exhausts };
}

function lamp(parent, x, y, z, color) {
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function buildWings(group, wingMat, white) {
  const left = new THREE.Group();
  left.position.set(-1.4, -0.2, 0.2);
  left.rotation.z = -0.08;
  const leftWing = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.22, 4.4), wingMat);
  leftWing.position.set(-7.3, 0, 0);
  left.add(leftWing);

  const aileronL = new THREE.Group();
  aileronL.position.set(-12.2, 0, 1.85);
  const aileronLMesh = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.85), white);
  aileronLMesh.position.z = 0.4;
  aileronL.add(aileronLMesh);
  left.add(aileronL);

  const wingletL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 1.8), standardSafe(0xc4492e));
  wingletL.position.set(-14.7, 0.7, -0.2);
  wingletL.rotation.z = -0.08;
  left.add(wingletL);
  group.add(left);

  const right = new THREE.Group();
  right.position.set(1.4, -0.2, 0.2);
  right.rotation.z = 0.08;
  const rightWing = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.22, 4.4), wingMat);
  rightWing.position.set(7.3, 0, 0);
  right.add(rightWing);

  const aileronR = new THREE.Group();
  aileronR.position.set(12.2, 0, 1.85);
  const aileronRMesh = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.85), white);
  aileronRMesh.position.z = 0.4;
  aileronR.add(aileronRMesh);
  right.add(aileronR);

  const wingletR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 1.8), standardSafe(0xc4492e));
  wingletR.position.set(14.7, 0.7, -0.2);
  wingletR.rotation.z = 0.08;
  right.add(wingletR);
  group.add(right);

  return { aileronL, aileronR };
}

function standardSafe(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.15 });
}

function buildEngines(group, metal, dark) {
  for (const side of [-1, 1]) {
    const engine = new THREE.Group();
    engine.position.set(side * 5.1, -1.25, -0.15);
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.86, 3.5, 18), metal);
    nacelle.rotation.x = Math.PI / 2;
    engine.add(nacelle);

    const intake = new THREE.Mesh(new THREE.CircleGeometry(0.58, 16), dark);
    intake.position.z = -1.76;
    intake.rotation.y = Math.PI;
    engine.add(intake);

    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12), standardSafe(0x98a2ae));
    fan.position.z = -1.7;
    fan.rotation.y = Math.PI;
    engine.add(fan);

    const exhaustMat = new THREE.MeshBasicMaterial({ color: 0xffb15a });
    const exhaust = new THREE.Mesh(new THREE.CircleGeometry(0.38, 14), exhaustMat);
    exhaust.position.z = 1.76;
    engine.add(exhaust);
    engine.userData.exhaust = exhaust;
    engine.userData.exhaustMat = exhaustMat;

    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.85, 1.6), standardSafe(0xd5dde6));
    pylon.position.set(0, 0.7, 0);
    engine.add(pylon);
    group.add(engine);
  }
}

function buildTail(group, white, blue) {
  const finMat = blue.clone();
  finMat.map = tailTexture();
  finMat.roughness = 0.5;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.6, 3.4), finMat);
  fin.position.set(0, 2.7, 15.2);
  group.add(fin);

  const rudder = new THREE.Group();
  rudder.position.set(0, 2.8, 16.7);
  const rudderMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.6, 1.05), blue);
  rudderMesh.position.z = 0.45;
  rudder.add(rudderMesh);
  group.add(rudder);

  const hstab = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.16, 2.3), white);
  hstab.position.set(0, 1.15, 15.6);
  group.add(hstab);

  const elevatorL = hinged(group, -2.3, 1.15, 16.55, 3.6, white);
  const elevatorR = hinged(group, 2.3, 1.15, 16.55, 3.6, white);
  return { rudder, elevatorL, elevatorR };
}

function hinged(parent, x, y, z, width, material) {
  const hinge = new THREE.Group();
  hinge.position.set(x, y, z);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 0.85), material);
  plate.position.z = 0.4;
  hinge.add(plate);
  parent.add(hinge);
  return hinge;
}

function buildGear(group, metal, rubber) {
  addWheel(group, 0, -9.4, 0.28, metal, rubber);
  addWheel(group, -1.7, 1.4, 0.5, metal, rubber);
  addWheel(group, 1.7, 1.4, 0.5, metal, rubber);
}

function addWheel(group, x, z, width, metal, rubber) {
  const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.35, 8), metal);
  strut.position.set(x, -2.25, z);
  group.add(strut);
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, width, 14), rubber);
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(x, -GEAR_HEIGHT + WHEEL_RADIUS, z);
  group.add(wheel);
}
