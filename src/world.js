import * as THREE from "three";
import { GEAR_HEIGHT } from "./constants.js";
import { createAircraft } from "./aircraft.js";

export const GATE_DEFS = [
  { name: "Departure", heading: "north", x: 0, y: 95, z: -1150, dir: new THREE.Vector3(0, 0, -1) },
  { name: "Crosswind", heading: "west", x: -640, y: 150, z: -860, dir: new THREE.Vector3(-1, 0, 0) },
  { name: "Downwind", heading: "south", x: -640, y: 160, z: 240, dir: new THREE.Vector3(0, 0, 1) },
  { name: "Final", heading: "north", x: 0, y: 62, z: 1500, dir: new THREE.Vector3(0, 0, -1) },
];

export const LAKE = { x: -980, z: 420, r: 150 };

export function onRunway(x, z) {
  return Math.abs(x) <= 20 && z >= -860 && z <= 860;
}

export function onPavement(x, z) {
  if (Math.abs(x) <= 32 && z >= -950 && z <= 950) return true;
  if (x >= 18 && x <= 175 && z <= -70 && z >= -210) return true;
  if (x >= 145 && x <= 370 && z <= 170 && z >= -390) return true;
  return false;
}

export function inLake(x, z) {
  return Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r - 6;
}

export function hitsObstacle(points, obstacles) {
  for (const point of points) {
    for (const box of obstacles) {
      if (
        point.x > box.min.x &&
        point.x < box.max.x &&
        point.y > box.min.y &&
        point.y < box.max.y &&
        point.z > box.min.z &&
        point.z < box.max.z
      ) {
        return true;
      }
    }
  }
  return false;
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintTexture(base, variance, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (Math.random() - 0.5) * variance;
    image.data[i] = base[0] + n;
    image.data[i + 1] = base[1] + n;
    image.data[i + 2] = base[2] + n;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function skyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, "#3e5f86");
  gradient.addColorStop(0.38, "#c4785a");
  gradient.addColorStop(0.72, "#f0b48a");
  gradient.addColorStop(1, "#e7cbb6");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 8, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function cloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(128, 128, 16, 128, 128, 122);
  gradient.addColorStop(0, "rgba(255,255,255,0.92)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function textTexture(lines, width, height, background, color) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const list = Array.isArray(lines) ? lines : [lines];
  const size = list.length > 1 ? Math.floor(height / (list.length + 0.8)) : Math.floor(height * 0.62);
  ctx.font = `700 ${size}px sans-serif`;
  list.forEach((line, index) => {
    const y = list.length === 1 ? height / 2 : (index + 1) * (height / (list.length + 1));
    ctx.fillText(line, width / 2, y);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function mat(color, roughness = 0.75, metalness = 0.04, map = null) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, map });
}

export function createWorld(scene, renderer) {
  const obstacles = [];
  const rand = mulberry32(7);

  const hemi = new THREE.HemisphereLight(0xffd7bf, 0x6d6840, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffc49a, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 900;
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.045;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0xffb089, 0.4);
  fill.position.set(180, 90, -80);
  scene.add(fill);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.add(new THREE.HemisphereLight(0xffd2b8, 0x6a6844, 1));
  const envSun = new THREE.DirectionalLight(0xffb07a, 2.2);
  envSun.position.set(-3, 5, 2);
  env.add(envSun);
  scene.environment = pmrem.fromScene(env, 0.05).texture;
  pmrem.dispose();

  scene.fog = new THREE.Fog(0xe7cbb6, 320, 4800);
  scene.background = new THREE.Color(0xe7cbb6);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(6800, 28, 20),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(90, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffc48a, fog: false }),
  );
  sunDisc.position.set(-2200, 2600, 1400);
  scene.add(sunDisc);

  const grassMap = paintTexture([132, 124, 62], 36);
  grassMap.repeat.set(48, 48);
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(5600, 5600),
    new THREE.MeshLambertMaterial({ map: grassMap, color: 0xffffff }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  const asphaltMap = paintTexture([58, 52, 48], 18);
  asphaltMap.repeat.set(6, 28);
  const asphalt = mat(0xffffff, 0.92, 0.02, asphaltMap);
  const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(72, 1960), mat(0x5c534c, 0.95, 0.02));
  shoulder.rotation.x = -Math.PI / 2;
  shoulder.position.y = 0.015;
  shoulder.receiveShadow = true;
  scene.add(shoulder);

  const runway = new THREE.Mesh(new THREE.PlaneGeometry(48, 1800), asphalt);
  runway.rotation.x = -Math.PI / 2;
  runway.position.y = 0.03;
  runway.receiveShadow = true;
  scene.add(runway);

  const taxi = new THREE.Mesh(new THREE.PlaneGeometry(156, 140), asphalt);
  taxi.rotation.x = -Math.PI / 2;
  taxi.position.set(98, 0.028, -140);
  taxi.receiveShadow = true;
  scene.add(taxi);

  const apronMat = mat(0xcbb8a4, 0.88, 0.03);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(220, 560), apronMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(260, 0.02, -110);
  apron.receiveShadow = true;
  scene.add(apron);

  const marks = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({
    color: 0xf4f7f8,
    roughness: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const yellow = white.clone();
  yellow.color.setHex(0xe07a3a);
  const paint = (x, z, w, len, material = white) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.045, len), material);
    mesh.position.set(x, 0.07, z);
    mesh.receiveShadow = true;
    marks.add(mesh);
  };

  for (let z = -840; z <= 840; z += 52) paint(0, z, 0.7, 28);
  paint(22.2, 0, 0.45, 1760);
  paint(-22.2, 0, 0.45, 1760);
  for (const end of [820, -820]) {
    for (let i = -3; i <= 3; i += 1) {
      if (i === 0) continue;
      paint(i * 3.3, end, 1.7, 30);
    }
  }
  for (const zone of [560, -560]) {
    for (const side of [-1, 1]) {
      paint(side * 6, zone, 2.2, 42);
      paint(side * 10, zone, 2.2, 42);
    }
  }
  paint(0, 470, 3.2, 46);
  paint(0, -470, 3.2, 46);
  paint(96, -140, 136, 0.45, yellow);
  scene.add(marks);

  addRunwayNumber(scene, "36", 0, 740, 0);
  addRunwayNumber(scene, "18", 0, -740, Math.PI);

  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(LAKE.r, 40),
    new THREE.MeshStandardMaterial({ color: 0x2f6d66, roughness: 0.22, metalness: 0.35 }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(LAKE.x, 0.025, LAKE.z);
  scene.add(lake);

  addLights(scene);
  addBuildings(scene, obstacles, rand);
  const parked = addParkedAircraft(scene, obstacles);
  addVehicles(scene);
  addTrees(scene, rand);
  addHills(scene);
  addCity(scene, rand);
  const clouds = addClouds(scene, rand);
  const gates = addGates(scene);

  return { sun, sky, clouds, gates, obstacles, parked, lake };
}

function addRunwayNumber(scene, text, x, z, spin) {
  const texture = textTexture(text.split(""), 256, 512, "rgba(0,0,0,0)", "#f7f7f5");
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 18),
    new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 1, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = spin;
  mesh.position.set(x, 0.08, z);
  scene.add(mesh);
}

function addLights(scene) {
  const metal = mat(0x8d949c, 0.4, 0.6);
  const bulb = (x, y, z, color, radius = 0.28) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 8, 8),
      new THREE.MeshBasicMaterial({ color }),
    );
    mesh.position.set(x, y, z);
    scene.add(mesh);
  };
  const pole = (x, z) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.7, 5), metal);
    mesh.position.set(x, 0.35, z);
    scene.add(mesh);
  };

  for (let z = -860; z <= 860; z += 70) {
    for (const x of [-26, 26]) {
      pole(x, z);
      bulb(x, 0.78, z, 0xffe3a1, 0.22);
    }
  }
  for (let x = -18; x <= 18; x += 4.5) {
    bulb(x, 0.45, 892, 0x49f08a, 0.2);
    bulb(x, 0.45, -892, 0xff4d4d, 0.2);
  }
  for (let i = 0; i < 16; i += 1) {
    const z = 940 + i * 32;
    bulb(0, 0.35, z, i % 5 === 0 ? 0xfff4c4 : 0xf7f7f2, 0.18);
    if (i % 4 === 0) {
      bulb(-6, 0.35, z, 0xf7f7f2, 0.16);
      bulb(6, 0.35, z, 0xf7f7f2, 0.16);
    }
  }
  const papiColors = [0xffffff, 0xffffff, 0xff3a3a, 0xff3a3a];
  papiColors.forEach((color, index) => {
    bulb(-30 - index * 3.2, 0.7, 640, color, 0.26);
  });

  for (let i = 0; i < 8; i += 1) {
    bulb(30 + i * 16, 0.4, -168, 0x4aa3ff, 0.16);
    bulb(30 + i * 16, 0.4, -112, 0x4aa3ff, 0.16);
  }
}

function addBoxObstacle(obstacles, minX, minY, minZ, maxX, maxY, maxZ, pad = 1.4) {
  obstacles.push({
    min: new THREE.Vector3(minX - pad, minY - pad, minZ - pad),
    max: new THREE.Vector3(maxX + pad, maxY + pad, maxZ + pad),
  });
}

function addBuildings(scene, obstacles, rand) {
  const concrete = mat(0xd7c4ae, 0.8, 0.04);
  const glassMap = windowGrid();
  const glass = new THREE.MeshStandardMaterial({
    color: 0xd7a48a,
    map: glassMap,
    roughness: 0.18,
    metalness: 0.55,
  });

  const terminal = new THREE.Mesh(new THREE.BoxGeometry(26, 16, 210), concrete);
  terminal.position.set(248, 8, -150);
  terminal.castShadow = true;
  terminal.receiveShadow = true;
  scene.add(terminal);
  addBoxObstacle(obstacles, 235, 0, -255, 261, 16, -45);

  const curtain = new THREE.Mesh(new THREE.BoxGeometry(1.2, 12, 198), glass);
  curtain.position.set(234.4, 8.2, -150);
  curtain.castShadow = true;
  scene.add(curtain);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(30, 1.1, 214), mat(0x8c4d3a, 0.62, 0.12));
  roof.position.set(248, 16.6, -150);
  roof.castShadow = true;
  scene.add(roof);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 6, 42),
    new THREE.MeshStandardMaterial({
      map: textTexture("CEDAR FIELD", 1024, 256, "#6e2e22", "#f6efe6"),
      roughness: 0.6,
    }),
  );
  sign.position.set(232, 20.5, -150);
  scene.add(sign);

  for (let i = 0; i < 4; i += 1) {
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(16, 3.2, 4), mat(0xb7c3ce, 0.5, 0.2));
    bridge.position.set(214, 6.2, -230 + i * 46);
    bridge.castShadow = true;
    scene.add(bridge);
  }

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 4.4, 46, 12), concrete);
  shaft.position.set(332, 23, 20);
  shaft.castShadow = true;
  scene.add(shaft);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 4.6, 14), glass);
  cab.position.set(332, 48, 20);
  cab.castShadow = true;
  scene.add(cab);
  const cabRoof = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 6.2, 1.1, 14), mat(0x223044, 0.5, 0.3));
  cabRoof.position.set(332, 51, 20);
  scene.add(cabRoof);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 8, 6), mat(0xd0d5dc, 0.3, 0.8));
  mast.position.set(332, 56, 20);
  scene.add(mast);
  addBoxObstacle(obstacles, 322, 0, 8, 344, 52, 34);

  hangar(scene, obstacles, 175, 70, 62, 48, 14, 0xc4a88e);
  hangar(scene, obstacles, 268, 78, 78, 54, 16, 0xb08972);

  const radar = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 12), mat(0xd5dbe2, 0.35, 0.4));
  radar.scale.y = 0.72;
  radar.position.set(318, 12, 90);
  radar.castShadow = true;
  scene.add(radar);
  const radarBase = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 8, 10), concrete);
  radarBase.position.set(318, 4, 90);
  scene.add(radarBase);
  addBoxObstacle(obstacles, 308, 0, 80, 328, 16, 102);

  for (let i = 0; i < 5; i += 1) {
    const person = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 1.05, 6),
      mat([0x234e8c, 0xc4493a, 0xf0c84a, 0x2f6b4f, 0x222831][i], 0.7),
    );
    body.position.y = 0.85;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), mat(0xf0d2b5, 0.6));
    head.position.y = 1.55;
    person.add(body, head);
    person.position.set(228, 0, -40 + i * 3.2);
    scene.add(person);
  }

  const windsockPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), mat(0xdedede, 0.4, 0.4));
  windsockPole.position.set(48, 3, 700);
  scene.add(windsockPole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.4, 8), mat(0xf08a2a, 0.6));
  sock.rotation.z = Math.PI / 2;
  sock.position.set(49.4, 5.6, 700);
  scene.add(sock);
}

function hangar(scene, obstacles, x, z, w, d, h, color) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, 0.82));
  body.position.set(x, h / 2, z);
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);
  const door = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, h * 0.7, 0.5), mat(0x3e4650, 0.55, 0.2));
  door.position.set(x, h * 0.36, z - d / 2 - 0.2);
  scene.add(door);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.8, d + 0.4), mat(0xc4492e, 0.5));
  stripe.position.set(x, h - 0.7, z);
  scene.add(stripe);
  addBoxObstacle(obstacles, x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2);
}

function addParkedAircraft(scene, obstacles) {
  const parked = createAircraft();
  parked.group.position.set(196, GEAR_HEIGHT, -70);
  parked.group.rotation.y = -Math.PI / 2;
  scene.add(parked.group);
  addBoxObstacle(obstacles, 176, 0, -90, 216, 10, -48, 2);
  return parked;
}

function addVehicles(scene) {
  vehicle(scene, 210, -20, 4.2, 1.6, 1.8, 0xf4f4f4, 0);
  vehicle(scene, 218, -12, 3.2, 1.5, 1.4, 0xd23b3b, 0.4);
  vehicle(scene, 230, 8, 7.5, 2.4, 2.4, 0x245ea8, 0);
  vehicle(scene, 188, -130, 5.5, 1.8, 2, 0xf2f2f2, Math.PI / 2);
  vehicle(scene, 200, -138, 2.2, 1.1, 1.2, 0xf0c84a, Math.PI / 2);
  for (let i = 0; i < 3; i += 1) {
    vehicle(scene, 206 + i * 2.4, -146, 1.6, 0.8, 1.1, 0x8a939c, Math.PI / 2);
  }
}

function vehicle(scene, x, z, length, height, width, color, rotation) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), mat(color, 0.55, 0.2));
  body.position.y = 0.55 + height / 2;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.82, height * 0.55, length * 0.4),
    mat(0x1b242e, 0.2, 0.5),
  );
  cabin.position.y = 0.55 + height + height * 0.2;
  cabin.position.z = -length * 0.12;
  group.add(cabin);
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  scene.add(group);
}

function addTrees(scene, rand) {
  const count = 180;
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 1, 5);
  const crownGeo = new THREE.SphereGeometry(1, 7, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4630 });
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x6e7a38 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);
  const dummy = new THREE.Object3D();
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < 4000) {
    guard += 1;
    const x = (rand() - 0.5) * 2400;
    const z = (rand() - 0.5) * 2400;
    if (Math.abs(x) < 100 && Math.abs(z) < 1700) continue;
    if (x > 90 && x < 400 && z > -430 && z < 220) continue;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 40) continue;
    if (GATE_DEFS.some((gate) => Math.hypot(x - gate.x, z - gate.z) < 70)) continue;
    const height = 6 + rand() * 8;
    dummy.position.set(x, height * 0.35, z);
    dummy.scale.set(1, height, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.set(x, height * 0.85, z);
    dummy.scale.set(1.6 + rand() * 1.4, 1.3 + rand(), 1.6 + rand() * 1.4);
    dummy.updateMatrix();
    crowns.setMatrixAt(placed, dummy.matrix);
    placed += 1;
  }
  trunks.count = placed;
  crowns.count = placed;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  scene.add(trunks, crowns);
}

function addHills(scene) {
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2 + 0.2;
    const radius = 2000 + (i % 4) * 180;
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(160 + (i % 5) * 36, 14, 10),
      new THREE.MeshLambertMaterial({ color: i % 2 ? 0x8a8450 : 0x6e7344 }),
    );
    hill.position.set(Math.cos(angle) * radius, -50, Math.sin(angle) * radius);
    hill.scale.y = 0.42 + (i % 3) * 0.08;
    scene.add(hill);
  }
}

function addCity(scene, rand) {
  const facade = windowGrid();
  for (let i = 0; i < 36; i += 1) {
    const w = 16 + rand() * 24;
    const d = 16 + rand() * 22;
    const h = 18 + rand() * 80;
    const x = -700 + rand() * 1400;
    const z = -2500 - rand() * 420;
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({
        color: 0xd2bba8,
        map: facade,
        roughness: 0.62,
        metalness: 0.15,
      }),
    );
    building.position.set(x, h / 2, z);
    building.castShadow = true;
    scene.add(building);
  }
}

function windowGrid() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#c9957a";
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 256; y += 22) {
    for (let x = 6; x < 128; x += 16) {
      ctx.fillStyle = Math.random() > 0.82 ? "#f6e2c4" : "#3a241c";
      ctx.fillRect(x, y, 10, 14);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addClouds(scene, rand) {
  const texture = cloudTexture();
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: 0xffe4d4,
    transparent: true,
    depthWrite: false,
    opacity: 0.88,
  });
  const clouds = [];
  for (let i = 0; i < 28; i += 1) {
    const group = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 3);
    for (let p = 0; p < puffs; p += 1) {
      const sprite = new THREE.Sprite(material);
      const scale = 80 + rand() * 120;
      sprite.scale.set(scale, scale * 0.62, 1);
      sprite.position.set((rand() - 0.5) * 70, (rand() - 0.5) * 16, (rand() - 0.5) * 40);
      group.add(sprite);
    }
    group.position.set((rand() - 0.5) * 2800, 520 + rand() * 420, (rand() - 0.5) * 2800);
    group.userData.speed = 4 + rand() * 6;
    scene.add(group);
    clouds.push(group);
  }
  return clouds;
}

function addGates(scene) {
  return GATE_DEFS.map((def) => {
    const group = new THREE.Group();
    group.position.set(def.x, def.y, def.z);
    if (Math.abs(def.dir.x) > 0.5) group.rotation.y = Math.PI / 2;

    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xe36a45,
      emissive: 0xe36a45,
      emissiveIntensity: 0.8,
      roughness: 0.35,
      metalness: 0.1,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(26, 0.7, 10, 36), ringMat);
    group.add(ring);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.45, Math.max(8, def.y - 30), 6),
      new THREE.MeshBasicMaterial({ color: 0xe36a45, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    beam.position.y = -(def.y / 2) - 12;
    group.add(beam);

    const label = gateLabel(def.name);
    group.add(label);
    scene.add(group);
    return { def, group, ring, ringMat, beam, label };
  });
}

function gateLabel(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.font = "700 68px sans-serif";
  ctx.fillStyle = "#ffd2c2";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  sprite.position.y = 38;
  sprite.scale.set(52, 13, 1);
  return sprite;
}
