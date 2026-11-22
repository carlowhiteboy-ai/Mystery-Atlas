import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeDoc, makeProp } from './evidence.js';
import { openCreator } from './creator.js';
import { initSocial } from './social.js';
const MAPS = window.MAPS;

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);
const show = (el, on = true) => el.classList.toggle('hidden', !on);
const LOAD = window.MA_LOAD || { set() {}, done() {}, fail() {} };
const tick = () => new Promise((r) => setTimeout(r, 24));   // lets the browser paint the loading bar between heavy steps
/*@SOCKET*/
let netMissing = false;
const socket = (() => {
  if (typeof io === 'function') return io({ reconnectionDelayMax: 5000, timeout: 8000 });
  netMissing = true;                          // socket.io did not load: keep the page alive with an inert socket
  const noop = () => {};
  return { connected: false, id: null, emit: noop, on: noop, once: noop, volatile: { emit: noop }, io: { on: noop }, connect: noop };
})();
/*@END-SOCKET*/
const SPEED = 7;
const params = new URLSearchParams(location.search);
const inviteCode = (params.get('room') || '').toUpperCase().slice(0, 8);

let myId = null;
let room = null;          // latest lobby snapshot
let mode = 'home';        // home | lobby | playing | ended
let round = null;         // { clues, endsAt, found:Set, votes:{} }

let toastTimer;
let ac, master, sfx, noiseBuf, musicOn = true;   // audio (see the audio section)
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- three.js scene ---------- */
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
catch (e) { LOAD.fail('Your browser cannot run 3D graphics', 'WebGL is disabled or not supported. Turn on hardware acceleration or try another browser.'); throw e; }
LOAD.set(22, 'Starting the 3D engine…'); await tick();
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
$('#stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060914);
scene.fog = new THREE.FogExp2(0x0a1020, 0.022);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);
scene.add(camera);

const hemi = new THREE.HemisphereLight(0x5a6aa0, 0x0e1410, 0.8); scene.add(hemi);
const moon = new THREE.DirectionalLight(0xa9bcff, 1.25);
moon.position.set(-30, 50, 20);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.04;
Object.assign(moon.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 160 });
scene.add(moon);

// flashlight that follows the camera (only lit while playing)
const flash = new THREE.SpotLight(0xfff0cc, 0, 32, 0.5, 0.6, 1.4);
flash.position.set(0, 0, 0); flash.target.position.set(0, 0, -1);
camera.add(flash, flash.target);

// post-processing: bloom + vignette + tone mapping
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.5, 0.8));
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null }, strength: { value: 1.0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5)); c.rgb *= smoothstep(0.95, 0.35, d * strength); gl_FragColor = c; }'
}));
composer.addPass(new OutputPass());
addEventListener('resize', () => composer.setSize(innerWidth, innerHeight));

/* procedural textures (drawn on canvas, no image files needed) */
function tex(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const speckle = (g, s, n, cols, max) => {
  for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(rnd() * cols.length)]; const w = 1 + rnd() * max; g.fillRect(rnd() * s, rnd() * s, w, w); }
};
const groundTex = tex(512, (g, s) => { g.fillStyle = '#1c2b1e'; g.fillRect(0, 0, s, s); speckle(g, s, 6000, ['#24391f', '#162316', '#2c2a1a', '#1f3322', '#0f1a10'], 4); }, 40, 40);
const dirtTex = tex(256, (g, s) => { g.fillStyle = '#3a2f23'; g.fillRect(0, 0, s, s); speckle(g, s, 3000, ['#4a3c2c', '#2a2118', '#51463a'], 3); }, 1, 8);
const brickTex = tex(256, (g, s) => {
  g.fillStyle = '#1e1816'; g.fillRect(0, 0, s, s);
  for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
    g.fillStyle = `hsl(10 28% ${22 + rnd() * 12}%)`; g.fillRect(c * 64 + (r % 2 ? 32 : 0) + 2, r * 32 + 2, 60, 28);
  }
  speckle(g, s, 900, ['rgba(0,0,0,.25)', 'rgba(255,255,255,.06)'], 3);
}, 4, 3);
const roofTex = tex(256, (g, s) => {
  g.fillStyle = '#100e16'; g.fillRect(0, 0, s, s);
  for (let r = 0; r < 8; r++) for (let c = -1; c < 9; c++) {
    g.fillStyle = `hsl(250 14% ${12 + rnd() * 10}%)`; g.beginPath(); g.arc(c * 32 + (r % 2 ? 16 : 0) + 16, r * 32 + 14, 16, 0, Math.PI); g.rect(c * 32 + (r % 2 ? 16 : 0), r * 32 - 2, 32, 16); g.fill();
  }
}, 6, 2);
const woodTex = tex(256, (g, s) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(25 ${30 + rnd() * 10}% ${16 + rnd() * 10}%)`; g.fillRect(i * 32, 0, 31, s); }
  speckle(g, s, 1500, ['rgba(0,0,0,.3)', 'rgba(255,220,160,.07)'], 2);
}, 2, 1);
const stoneTex = tex(256, (g, s) => {
  g.fillStyle = '#23252b'; g.fillRect(0, 0, s, s);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { g.fillStyle = `hsl(220 6% ${28 + rnd() * 14}%)`; g.fillRect(c * 64 + 3, r * 64 + 3, 58, 58); }
  speckle(g, s, 1200, ['rgba(0,0,0,.3)', 'rgba(255,255,255,.08)'], 3);
}, 2, 1);
function radialTex(inner, outer) {
  return tex(128, (g, s) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, s, s); });
}
const glowTex = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
const mistTex = radialTex('rgba(200,210,235,.5)', 'rgba(200,210,235,0)');

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...o });
const tm = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.95, ...o });
const brickM = tm(brickTex), roofM = tm(roofTex, { roughness: 0.8 }), woodM = tm(woodTex), stoneM = tm(stoneTex);
const metalM = mat(0x3a3f46, { metalness: 0.8, roughness: 0.45 });
const darkWoodM = mat(0x24170e);
function boxM(w, h, d, m, x, y, z) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; scene.add(o); return o;
}
function cyl(rt, rb, h, m, x, y, z, seg = 12) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; scene.add(o); return o;
}
const manorLay = { boxes: [], circles: [], waters: [], decks: [] };   // collision data of the current map (see maps.js)
let curLay = manorLay;
const block = (x0, x1, z0, z1) => manorLay.boxes.push({ x0, x1, z0, z1 });
let flicker = [];
function light(color, intensity, dist, x, y, z, flick = true) {
  const l = new THREE.PointLight(color, intensity, dist, 2); l.position.set(x, y, z); scene.add(l);
  if (flick) flicker.push({ l, base: intensity }); return l;
}
const glowM = (c, i = 2.5) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: i });

LOAD.set(38, 'Raising Blackwood Manor…'); await tick();
const manorStart = scene.children.length;
{ const mc = MAPS.layout(MAPS[0]); mc.boxes.forEach(b => block(b.x0, b.x1, b.z0, b.z1)); manorLay.circles.push(...mc.circles); }
// ground + dirt path
const ground = new THREE.Mesh(new THREE.PlaneGeometry(170, 170), tm(groundTex));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const path = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 28), tm(dirtTex));
path.rotation.x = -Math.PI / 2; path.position.set(0, 0.03, -1); path.receiveShadow = true; scene.add(path);

// ----- Blackwood Manor -----
boxM(16, 8, 12, brickM, 0, 4, -20);
boxM(16.8, 0.8, 12.8, stoneM, 0, 0.4, -20);
const roof = new THREE.Mesh(new THREE.ConeGeometry(11, 6, 4), roofM);
roof.rotation.y = Math.PI / 4; roof.position.set(0, 11, -20); roof.castShadow = true; scene.add(roof);
boxM(1.4, 5, 1.4, brickM, -4.5, 10.8, -21); boxM(1.4, 4.5, 1.4, brickM, 5, 10.5, -19);
// porch, door, steps
boxM(6, 0.4, 3, stoneM, 0, 0.2, -12.2); boxM(4, 0.2, 1, stoneM, 0, 0.1, -10.8);
boxM(2.4, 3.6, 0.2, darkWoodM, 0, 1.9, -13.85); boxM(2.0, 3.3, 0.3, woodM, 0, 1.75, -13.8);
const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), glowM(0xffcc66)); knob.position.set(0.7, 1.7, -13.62); scene.add(knob);
cyl(0.18, 0.18, 3.6, stoneM, -2.6, 1.9, -11); cyl(0.18, 0.18, 3.6, stoneM, 2.6, 1.9, -11);
boxM(6.6, 0.3, 3.6, roofM, 0, 3.8, -12.2);
// windows
const litM = glowM(0xffb050, 2.2), darkGlassM = mat(0x0a0e18, { metalness: 0.6, roughness: 0.2 });
for (const wx of [-5.5, -2.8, 2.8, 5.5]) for (const wy of [2.9, 6.2]) {
  boxM(1.7, 2.2, 0.12, darkWoodM, wx, wy, -13.97);
  const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.9), rnd() < 0.55 ? litM : darkGlassM); w.position.set(wx, wy, -13.9); scene.add(w);
  boxM(0.07, 1.9, 0.06, darkWoodM, wx, wy, -13.88); boxM(1.4, 0.07, 0.06, darkWoodM, wx, wy, -13.88);
}
const porchLamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), glowM(0xffa640, 3)); porchLamp.position.set(0, 3.2, -11.6); scene.add(porchLamp);
light(0xffa640, 36, 18, 0, 3.2, -11);
light(0xffa040, 14, 14, -4, 3.2, -12.5); light(0xffa040, 14, 14, 4, 6.4, -12.5);

// ----- greenhouse -----
boxM(9, 3.5, 7, new THREE.MeshStandardMaterial({ color: 0x88ffcc, transparent: true, opacity: 0.2, roughness: 0.1, metalness: 0.2, depthWrite: false }), -30, 1.75, 10);
boxM(9.3, 0.4, 7.3, stoneM, -30, 0.2, 10);
for (const [dx, dz] of [[-4.5, -3.5], [4.5, -3.5], [-4.5, 3.5], [4.5, 3.5]]) boxM(0.16, 3.6, 0.16, darkWoodM, -30 + dx, 1.8, 10 + dz);
boxM(9.2, 0.14, 0.14, darkWoodM, -30, 3.5, 6.5); boxM(9.2, 0.14, 0.14, darkWoodM, -30, 3.5, 13.5);
for (let i = 0; i < 14; i++) {
  const px = -33.5 + (i % 7) * 1.1, pz = 8.4 + Math.floor(i / 7) * 2.6;
  cyl(0.28, 0.2, 0.4, mat(0x7a3b22), px, 0.55, pz, 8);
  const pl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), mat(0x2f9e55, { emissive: 0x0b3a1d })); pl.position.set(px, 1.05, pz); scene.add(pl);
}

light(0x88ffcc, 9, 12, -30, 2.6, 10);

// ----- shed -----
boxM(6, 4, 5, woodM, 28, 2, 8);
const shedRoof = new THREE.Mesh(new THREE.ConeGeometry(4.8, 2.2, 4), roofM); shedRoof.rotation.y = Math.PI / 4; shedRoof.position.set(28, 5.1, 8); shedRoof.castShadow = true; scene.add(shedRoof);
boxM(0.12, 2.7, 1.5, darkWoodM, 24.95, 1.35, 8);
boxM(0.3, 0.3, 0.3, woodM, 23.6, 0.15, 10.2); boxM(0.5, 0.5, 0.5, woodM, 23.4, 0.25, 6.4);

// ----- cellar hatch -----
boxM(2.8, 0.3, 2, stoneM, -11, 0.15, -18);
boxM(1.2, 0.14, 1.7, metalM, -11.65, 0.38, -18); boxM(1.2, 0.14, 1.7, metalM, -10.35, 0.38, -18);
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 12), metalM); ring.position.set(-11, 0.5, -18); ring.rotation.x = Math.PI / 2; scene.add(ring);

// ----- well -----
cyl(1.3, 1.3, 1.2, stoneM, 0, 0.6, 20, 16);
const water = new THREE.Mesh(new THREE.CircleGeometry(1.05, 16), mat(0x04070d, { metalness: 0.9, roughness: 0.1 })); water.rotation.x = -Math.PI / 2; water.position.set(0, 1.05, 20); scene.add(water);
boxM(0.2, 2.4, 0.2, woodM, -1.2, 1.2, 20); boxM(0.2, 2.4, 0.2, woodM, 1.2, 1.2, 20); boxM(2.8, 0.15, 0.15, woodM, 0, 2.4, 20);
const wellRoof = new THREE.Mesh(new THREE.ConeGeometry(2, 0.9, 4), roofM); wellRoof.rotation.y = Math.PI / 4; wellRoof.position.set(0, 3, 20); wellRoof.castShadow = true; scene.add(wellRoof);


// ----- ancient oak -----
const barkM = tm(woodTex, { color: 0x8a7060 });
cyl(0.9, 1.4, 7, barkM, 14, 3.5, 34, 10);
for (const [bx, bz, rz] of [[2, 0, -0.9], [-2, 1, 0.9], [0, -2, 0.7]]) {
  const b = cyl(0.25, 0.45, 4, barkM, 14 + bx, 6.8, 34 + bz, 6); b.rotation.z = rz; if (bz) b.rotation.x = bz > 0 ? -0.5 : 0.5;
}
const leafM = mat(0x1b3320, { flatShading: true });
for (const [lx, ly, lz, r] of [[0, 9.5, 0, 4.2], [3.5, 8.5, 1, 3], [-3.5, 8.8, -1, 3.2], [0.5, 8.2, 3.5, 2.8], [-1, 11.5, -1, 2.6]]) {
  const l = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafM); l.position.set(14 + lx, ly, 34 + lz); l.castShadow = true; scene.add(l);
}


// ----- graveyard + dead trees -----
for (let i = 0; i < 12; i++) {
  const gx = 34 + (i % 4) * 3, gz = -40 + Math.floor(i / 4) * 3.5, tilt = (rnd() - 0.5) * 0.25;
  const g = boxM(0.8, 1.1, 0.25, stoneM, gx, 0.55, gz); g.rotation.z = tilt;
  const a = cyl(0.4, 0.4, 0.25, stoneM, gx, 1.1, gz, 12); a.rotation.x = Math.PI / 2; a.rotation.z = tilt;
}
function deadTree(x, z, s) {
  const t = cyl(0.12 * s, 0.32 * s, 5 * s, barkM, x, 2.5 * s, z, 6); t.rotation.z = (rnd() - 0.5) * 0.2;
  for (let k = 0; k < 4; k++) {
    const b = cyl(0.04 * s, 0.12 * s, 2 * s, barkM, x + Math.cos(k * 1.6) * 0.6 * s, (3 + k * 0.5) * s, z + Math.sin(k * 1.6) * 0.6 * s, 5);
    b.rotation.z = (k % 2 ? 1 : -1) * 0.9; b.rotation.y = k * 1.6;
  }
}
for (const [x, z] of [[32, -32], [47, -38], [38, -46], [50, -28], [30, -44], [44, -24]]) deadTree(x, z, 0.9 + rnd() * 0.5);

// ----- lamp posts -----
for (const [x, z] of [[-2.4, -5], [2.4, 8]]) {
  cyl(0.07, 0.1, 3.2, metalM, x, 1.6, z, 8);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), glowM(0xffb86b, 3)); h.position.set(x, 3.3, z); scene.add(h);
  light(0xffb86b, 10, 11, x, 3.3, z);
}

// ----- fence around the map -----
{
  const half = 56, step = 2.5, pts = [];
  for (let v = -half; v <= half; v += step) pts.push([v, -half], [v, half], [-half, v], [half, v]);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), metalM, pts.length);
  const tips = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.35, 4), metalM, pts.length);
  const d = new THREE.Object3D();
  pts.forEach(([x, z], i) => { d.position.set(x, 1.1, z); d.updateMatrix(); posts.setMatrixAt(i, d.matrix); d.position.set(x, 2.35, z); d.updateMatrix(); tips.setMatrixAt(i, d.matrix); });
  posts.castShadow = true; scene.add(posts, tips);
  for (const y of [0.7, 1.7]) {
    boxM(112, 0.1, 0.1, metalM, 0, y, -half); boxM(112, 0.1, 0.1, metalM, 0, y, half);
    boxM(0.1, 0.1, 112, metalM, -half, y, 0); boxM(0.1, 0.1, 112, metalM, half, y, 0);
  }
}

LOAD.set(50, 'Planting the pines…'); await tick();
// ----- pines (instanced) -----
const keepClear = [[0, -20, 14], [0, 8, 10], [-30, 10, 8], [28, 8, 7], [0, 20, 5], [14, 34, 8], [-11, -18, 5], [41, -35, 12]];
{
  const list = [];
  for (let i = 0; list.length < 110 && i < 800; i++) {
    const x = (rnd() - 0.5) * 108, z = (rnd() - 0.5) * 108;
    if (keepClear.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r)) continue;
    list.push([x, z, 0.8 + rnd() * 0.9]);
  }
  for (const [x, z, sc] of list) manorLay.circles.push({ x, z, r: 0.5 * sc + 0.1 });   // trunks you can't walk through
  for (let i = 0; i < 170; i++) { const a = rnd() * Math.PI * 2, r = 60 + rnd() * 26; list.push([Math.cos(a) * r, Math.sin(a) * r, 1.1 + rnd() * 1.1]); }
  const layers = [
    [new THREE.CylinderGeometry(0.25, 0.38, 2.2, 6), 1.1, 0x3a2716],
    [new THREE.ConeGeometry(2.3, 3.4, 7), 3.2, 0x12301c],
    [new THREE.ConeGeometry(1.8, 3.1, 7), 5.0, 0x163a22],
    [new THREE.ConeGeometry(1.2, 2.7, 7), 6.6, 0x1a4428]
  ];
  const d = new THREE.Object3D(), col = new THREE.Color();
  for (const [geo, cy, c] of layers) {
    const im = new THREE.InstancedMesh(geo, mat(0xffffff, { flatShading: true }), list.length);
    list.forEach(([x, z, s], i) => {
      d.position.set(x, cy * s, z); d.scale.setScalar(s); d.rotation.y = rnd() * 6; d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      col.set(c).offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.04); im.setColorAt(i, col);
    });
    im.castShadow = true; im.receiveShadow = true; scene.add(im);
  }
}

// ----- rocks (instanced) -----
{
  const n = 60, im = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat(0x474952, { flatShading: true }), n), d = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    let x, z; do { x = (rnd() - 0.5) * 108; z = (rnd() - 0.5) * 108; } while (keepClear.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r));
    const s = 0.2 + rnd() * 0.6; if (s > 0.4) manorLay.circles.push({ x, z, r: s * 1.1 }); d.position.set(x, s * 0.4, z); d.scale.set(s * 1.3, s, s); d.rotation.set(rnd() * 3, rnd() * 3, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
  }
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
}

LOAD.set(62, 'Growing the grass…'); await tick();
// ----- swaying grass (instanced blades + wind shader) -----
const grassTime = { value: 0 };
{
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.06, 0, 0, 0.06, 0, 0, 0, 1, 0]), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.03, 0.09, 0.04, 0.03, 0.09, 0.04, 0.3, 0.5, 0.2]), 3));
  const gm = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  gm.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = grassTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
       float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
       transformed.x += sin(uTime * 1.6 + ph) * 0.22 * position.y;
       transformed.z += cos(uTime * 1.3 + ph) * 0.14 * position.y;
       #endif`);
  };
  const N = 32000, im = new THREE.InstancedMesh(geo, gm, N), d = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < 60000 && n < N; i++) {
    const x = (rnd() - 0.5) * 108, z = (rnd() - 0.5) * 108;
    if (Math.abs(x) < 2.1 && z > -14 && z < 15) continue;
    if (manorLay.boxes.some(b => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1)) continue;
    if (Math.hypot(x + 11, z + 18) < 2.5) continue;
    d.position.set(x, 0, z); d.rotation.set(0, rnd() * Math.PI, 0); d.scale.set(1 + rnd(), 0.5 + rnd() * 0.7, 1); d.updateMatrix();
    im.setMatrixAt(n++, d.matrix);
  }
  im.count = n; scene.add(im);
}

LOAD.set(74, 'Lighting the night sky…'); await tick();
// ----- sky: stars, moon, drifting mist, fireflies -----
{
  const n = 1800, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, e = 0.08 + rnd() * 1.3, r = 220;
    pos[i * 3] = Math.cos(a) * Math.cos(e) * r; pos[i * 3 + 1] = Math.sin(e) * r; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, fog: false })));
  const dir = moon.position.clone().normalize().multiplyScalar(200);
  const m = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf3efe0, fog: false })); m.position.copy(dir); scene.add(m);
  const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9db4ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  gl.scale.set(70, 70, 1); gl.position.copy(dir); scene.add(gl);
}
const mists = [];
for (let i = 0; i < 40; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.14, depthWrite: false }));
  const k = 16 + rnd() * 18; s.scale.set(k, k * 0.35, 1); s.position.set((rnd() - 0.5) * 110, 1 + rnd() * 1.5, (rnd() - 0.5) * 110);
  s.userData.v = 0.15 + rnd() * 0.3; scene.add(s); mists.push(s);
}
const flies = (() => {
  const n = 320, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - 0.5) * 110; pos[i * 3 + 1] = 0.4 + rnd() * 5; pos[i * 3 + 2] = (rnd() - 0.5) * 110; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffe9a0, size: 0.28, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTex }));
  scene.add(p); return p;
})();

const manorNodes = scene.children.slice(manorStart);
const manorFlicker = flicker;

/* ---------- other maps (built on demand from maps.js) ---------- */
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
let mapGroup = null, curMapId = 'blackwood-manor';
function mapRng(str) { let a = 0; for (const ch of str) a = (a * 31 + ch.charCodeAt(0)) >>> 0; return () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296; }
function disposeGroup(g) { g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) for (const m of [].concat(o.material)) { if (m.map && m.map !== groundTex && !m.map.userData.shared) m.map.dispose(); m.dispose(); } }); }

/* wall / roof textures are shared between maps (tinted per building by the material colour) */
const WALLTEX = {};
function wallTex(kind) {
  if (WALLTEX[kind]) return WALLTEX[kind];
  const t = tex(256, (g, s) => {
    g.fillStyle = '#c4c4c4'; g.fillRect(0, 0, s, s);
    if (kind === 'plank') {
      for (let i = 0; i < 8; i++) { const v = 150 + Math.floor(rnd() * 70); g.fillStyle = `rgb(${v},${v - 6},${v - 14})`; g.fillRect(0, i * 32, s, 30); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, i * 32 + 30, s, 2); }
      speckle(g, s, 1400, ['rgba(0,0,0,.18)', 'rgba(255,255,255,.08)'], 2);
    } else if (kind === 'stone') {
      for (let r = 0; r < 5; r++) { let x = -(r % 2) * 22; while (x < s) { const w = 42 + rnd() * 30, v = 140 + Math.floor(rnd() * 70); g.fillStyle = `rgb(${v},${v},${v + 6})`; g.fillRect(x + 1, r * 51 + 1, w - 2, 49); x += w; } }
      speckle(g, s, 1500, ['rgba(0,0,0,.2)', 'rgba(255,255,255,.07)'], 3);
    } else if (kind === 'tiles') {
      for (let r = 0; r < 8; r++) for (let c = -1; c < 9; c++) { const v = 130 + Math.floor(rnd() * 70); g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(c * 32 + (r % 2 ? 16 : 0) + 16, r * 32 + 14, 16, 0, Math.PI); g.rect(c * 32 + (r % 2 ? 16 : 0), r * 32 - 2, 32, 16); g.fill(); }
    } else speckle(g, s, 5000, ['rgba(0,0,0,.08)', 'rgba(255,255,255,.12)', 'rgba(90,60,30,.08)'], 3);   // plaster
  });
  t.userData.shared = true; WALLTEX[kind] = t; return t;
}
const trimM = mat(0x24170e), litWinM = glowM(0xffb050, 1.7), darkWinM = mat(0x0a0e18, { metalness: 0.6, roughness: 0.2 }), stepM = mat(0x3a3a3e);

function buildMap(def) {
  const g = new THREE.Group(); const R = mapRng(def.id); const fl = []; let lights = 0;
  const lay = MAPS.layout(def);
  const add = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...o });
  const gt = tex(512, (c, sz) => { c.fillStyle = hex(def.ground[0]); c.fillRect(0, 0, sz, sz); speckle(c, sz, 6000, def.ground[1], 4); }, 40, 40);
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(170, 170), tm(gt)); gm.rotation.x = -Math.PI / 2; gm.receiveShadow = true; g.add(gm);

  /* ---- detailed building: plinth, textured walls, door + step + lamp, windows, roof, chimney ---- */
  function wallBox(w, h, d, m) {
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv, sz = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * sz[f][0] / 3, uv.getY(i) * sz[f][1] / 3); }
    uv.needsUpdate = true; return new THREE.Mesh(geo, m);
  }
  const FACES = { '+z': [0, 0, 1], '-z': [Math.PI, 0, -1], '+x': [Math.PI / 2, 1, 0], '-x': [-Math.PI / 2, -1, 0] };
  function building(p) {
    const [, x, z, w, h, d, wallC, roofC, styleStr = 'gable', faceArg] = p;
    const [style, kind = 'plaster'] = styleStr.split(':');
    const face = FACES[faceArg] ? faceArg : (z < 12 ? '+z' : '-z');
    const b = new THREE.Group(); b.position.set(x, 0, z); g.add(b);
    const put = (m, px, py, pz, cast = true, parent = b) => { m.position.set(px, py, pz); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; };
    const wallM = new THREE.MeshStandardMaterial({ map: wallTex(kind), color: wallC, roughness: 0.92 });
    const roofMat = style === 'arch' ? std(roofC, { metalness: 0.5, roughness: 0.55 }) : new THREE.MeshStandardMaterial({ map: wallTex('tiles'), color: roofC, roughness: 0.85, side: THREE.DoubleSide });
    put(new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.45, d + 0.3), stepM), 0, 0.22, 0);
    put(wallBox(w, h, d, wallM), 0, h / 2, 0);

    // door + windows on each face (frame: local +z points away from the wall)
    const doorW = Math.min(1.4, (face[1] === 'z' ? w : d) * 0.4), doorH = Math.min(2.3, h * 0.72);
    for (const f in FACES) {
      const [rot, nx, nz] = FACES[f], fw = nz ? w : d, half = (nz ? d : w) / 2;
      const fg = new THREE.Group(); fg.rotation.y = rot; fg.position.set(nx * half, 0, nz * half); b.add(fg);
      const hasDoor = f === face;
      if (hasDoor) {
        put(new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.3, doorH + 0.2, 0.1), trimM), 0, (doorH + 0.2) / 2 + 0.2, 0.03, true, fg);
        put(new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.14), woodM), 0, doorH / 2 + 0.2, 0.08, true, fg);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), glowM(0xffcc66)); put(knob, doorW * 0.32, doorH * 0.45 + 0.2, 0.18, false, fg);
        put(new THREE.Mesh(new THREE.BoxGeometry(doorW + 1.2, 0.12, 0.8), stepM), 0, 0.06, 0.45, true, fg);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), glowM(0xffb86b, 2.6)); put(lamp, doorW / 2 + 0.7, doorH + 0.2, 0.16, false, fg);
      }
      const floors = h >= 6.5 ? 2 : 1, wh = h < 4 ? 0.85 : 1.25, ww = 0.95, n = fw < 3 ? 0 : Math.floor((fw - 1.2) / 3);
      for (let fl2 = 0; fl2 < floors; fl2++) {
        const y = floors === 1 ? h * 0.58 : (fl2 === 0 ? h * 0.3 : h * 0.72);
        if (y + wh / 2 > h - 0.25 || y - wh / 2 < 0.6) continue;
        for (let i = 0; i < n; i++) {
          const wx = -fw / 2 + (fw / (n + 1)) * (i + 1);
          if (hasDoor && fl2 === 0 && Math.abs(wx) < doorW / 2 + ww / 2 + 0.4) continue;
          put(new THREE.Mesh(new THREE.BoxGeometry(ww + 0.2, wh + 0.2, 0.1), trimM), wx, y, 0.03, false, fg);
          const gl = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), R() < 0.5 ? litWinM : darkWinM); put(gl, wx, y, 0.1, false, fg);
          put(new THREE.Mesh(new THREE.BoxGeometry(0.06, wh, 0.05), trimM), wx, y, 0.13, false, fg);
          put(new THREE.Mesh(new THREE.BoxGeometry(ww, 0.06, 0.05), trimM), wx, y, 0.13, false, fg);
          put(new THREE.Mesh(new THREE.BoxGeometry(ww + 0.4, 0.08, 0.3), stepM), wx, y - wh / 2 - 0.1, 0.12, false, fg);   // sill
        }
      }
    }

    // roof
    const ov = 0.5, roof = new THREE.Group(); roof.position.y = h; b.add(roof);
    const [frot, swap] = [FACES[face][0], face[1] === 'x'], W = swap ? d : w, D = swap ? w : d;   // roof frame: front = door side
    if (style === 'gable') {
      const along = w >= d, L = along ? w : d, S = along ? d : w, rh = Math.min(3.6, S * 0.38), half = S / 2 + ov, len = Math.hypot(half, rh), ang = Math.atan2(rh, half);
      roof.rotation.y = along ? 0 : Math.PI / 2;
      for (const sd of [1, -1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(L + ov * 2, 0.22, len), roofMat); put(m, 0, rh / 2 + 0.05, sd * half / 2, true, roof); m.rotation.x = sd * ang; }
      const tri = new THREE.Shape(); tri.moveTo(-S / 2, 0); tri.lineTo(S / 2, 0); tri.lineTo(0, rh);
      for (const sd of [1, -1]) { const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshStandardMaterial({ map: wallM.map, color: wallC, roughness: 0.92, side: THREE.DoubleSide })); put(m, sd * (L / 2 + 0.02), 0, 0, true, roof); m.rotation.y = sd * Math.PI / 2; }
      if (L >= 8 && S >= 6) { const H = rh + 1.2; put(wallBox(0.9, H, 0.9, new THREE.MeshStandardMaterial({ map: wallTex('stone'), color: 0x4a3a34, roughness: 1 })), L * 0.28, H / 2 - 0.1, S * 0.1, true, roof); }
    } else if (style === 'hip') {
      const rh = Math.min(3, Math.min(w, d) * 0.45), geo = new THREE.ConeGeometry(1, rh, 4); geo.rotateY(Math.PI / 4);
      const m = new THREE.Mesh(geo, roofMat); m.scale.set((w + ov * 2) / Math.SQRT2, 1, (d + ov * 2) / Math.SQRT2); put(m, 0, rh / 2, 0, true, roof);
    } else if (style === 'flat') {
      put(new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4), roofMat), 0, 0.15, 0, true, roof);
      for (const [bw, bd, bx, bz] of [[w + 0.4, 0.2, 0, d / 2 + 0.2], [w + 0.4, 0.2, 0, -d / 2 - 0.2], [0.2, d + 0.4, w / 2 + 0.2, 0], [0.2, d + 0.4, -w / 2 - 0.2, 0]]) put(new THREE.Mesh(new THREE.BoxGeometry(bw, 0.4, bd), roofMat), bx, 0.45, bz, true, roof);
      put(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), stepM), w * 0.22, 0.65, -d * 0.18, true, roof);          // roof vent
    } else if (style === 'shed') {
      const rs = Math.min(1.6, D * 0.3), half = D / 2 + ov, len = Math.hypot(half * 2, rs), ang = Math.atan2(rs, half * 2);
      roof.rotation.y = frot;
      const m = new THREE.Mesh(new THREE.BoxGeometry(W + ov * 2, 0.22, len), roofMat); put(m, 0, rs / 2 + 0.1, 0, true, roof); m.rotation.x = ang;   // low side = front
      put(new THREE.Mesh(new THREE.BoxGeometry(W, rs, 0.15), wallM), 0, rs / 2 - 0.05, -D / 2 + 0.05, true, roof);
    } else if (style === 'arch') {
      const along = w >= d, L = along ? w : d, S = along ? d : w, a = S / 2 + 0.2, bb = Math.min(2.2, S * 0.4), sh = new THREE.Shape();
      sh.moveTo(-a, 0); for (let i = 0; i <= 16; i++) { const t = Math.PI - (i / 16) * Math.PI; sh.lineTo(Math.cos(t) * a, Math.sin(t) * bb); } sh.lineTo(-a, 0);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: L + 0.4, bevelEnabled: false }); geo.translate(0, 0, -(L + 0.4) / 2);
      const m = new THREE.Mesh(geo, roofMat); m.rotation.y = along ? Math.PI / 2 : 0; put(m, 0, 0, 0, true, roof);
    }
    return b;
  }

  /* ---- towers: lighthouse, bell tower, round stone tower ---- */
  function tower(p) {
    const [, x, z, r, h, wallC, roofC, bandC, shape = 'round', lighthouse = false] = p;
    const t = new THREE.Group(); t.position.set(x, 0, z); g.add(t);
    const put = (m, px, py, pz, cast = true) => { m.position.set(px, py, pz); m.castShadow = cast; m.receiveShadow = true; t.add(m); return m; };
    if (shape === 'square') {
      const wm = new THREE.MeshStandardMaterial({ map: wallTex('stone'), color: wallC, roughness: 0.95 });
      put(wallBox(r * 2 + 0.4, 0.6, r * 2 + 0.4, new THREE.MeshStandardMaterial({ map: wallTex('stone'), color: 0x55524a })), 0, 0.3, 0);
      put(wallBox(r * 2, h, r * 2, wm), 0, h / 2, 0);
      const rh = r * 1.4, geo = new THREE.ConeGeometry(1, rh, 4); geo.rotateY(Math.PI / 4);
      const roof = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: wallTex('tiles'), color: roofC, roughness: 0.85 })); roof.scale.set((r * 2 + 1) / Math.SQRT2, 1, (r * 2 + 1) / Math.SQRT2); put(roof, 0, h + rh / 2, 0);
      for (const [rot, nx, nz] of Object.values(FACES)) {   // arched belfry openings near the top + a narrow window below
        const og = new THREE.Group(); og.rotation.y = rot; og.position.set(nx * r, 0, nz * r); t.add(og);
        const op = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.8, 2.2), darkWinM); op.position.set(0, h - 1.8, 0.02); og.add(op);
        const fr = new THREE.Mesh(new THREE.BoxGeometry(r * 0.8 + 0.3, 2.4, 0.08), trimM); fr.position.set(0, h - 1.8, 0); og.add(fr);
        const sl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.4), litWinM); sl.position.set(0, h * 0.5, 0.02); og.add(sl);
      }
      const bell = put(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.55, 0.8, 12), mat(0x8a6a2a, { metalness: 0.7, roughness: 0.4 })), 0, h - 1.6, 0, false);
      void bell;
    } else {
      const top = r * 0.78, tx = tex(256, (c, s) => { c.fillStyle = '#c8c8c8'; c.fillRect(0, 0, s, s); for (let rr = 0; rr < 5; rr++) { let xx = -(rr % 2) * 22; while (xx < s) { const ww2 = 42 + rnd() * 30, v = 150 + Math.floor(rnd() * 60); c.fillStyle = `rgb(${v},${v},${v + 4})`; c.fillRect(xx + 1, rr * 51 + 1, ww2 - 2, 49); xx += ww2; } } }, 6, Math.max(1, h / 4));
      const wm = new THREE.MeshStandardMaterial({ map: tx, color: wallC, roughness: 0.92 });
      put(new THREE.Mesh(new THREE.CylinderGeometry(r + 0.25, r + 0.3, 0.6, 24), stepM), 0, 0.3, 0);
      put(new THREE.Mesh(new THREE.CylinderGeometry(top, r, h, 24), wm), 0, h / 2, 0);
      const rr = (y) => r - (r - top) * (y / h);
      if (lighthouse) {
        const bandM = std(bandC);
        for (const f of [0.22, 0.5, 0.78]) put(new THREE.Mesh(new THREE.CylinderGeometry(rr(h * f + h * 0.06) + 0.03, rr(h * f - h * 0.06) + 0.03, h * 0.12, 24), bandM), 0, h * f, 0);
        put(new THREE.Mesh(new THREE.CylinderGeometry(top + 1, top + 0.6, 0.35, 24), mat(0x2a2a30, { metalness: 0.5 })), 0, h + 0.1, 0);
        const rail = new THREE.Mesh(new THREE.TorusGeometry(top + 0.95, 0.05, 6, 28), metalM); rail.rotation.x = Math.PI / 2; put(rail, 0, h + 1.15, 0, false);
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; put(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 5), metalM), Math.cos(a) * (top + 0.95), h + 0.65, Math.sin(a) * (top + 0.95), false); }
        put(new THREE.Mesh(new THREE.CylinderGeometry(top * 0.62, top * 0.62, 2.2, 16), mat(0x1a2230, { metalness: 0.6, roughness: 0.15, transparent: true, opacity: 0.85 })), 0, h + 1.4, 0, false);   // dark lantern room: the beam is out
        put(new THREE.Mesh(new THREE.ConeGeometry(top * 0.85, 1.8, 16), std(roofC, { metalness: 0.4 })), 0, h + 3.4, 0);
        put(new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), metalM), 0, h + 4.4, 0, false);
        const dg = new THREE.Group(); dg.position.set(0, 0, rr(1.2)); t.add(dg);
        const dr = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.6, 0.15), woodM); dr.position.set(0, 1.5, 0.05); dg.add(dr);
        const df = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.8, 0.1), trimM); df.position.set(0, 1.6, 0); dg.add(df);
        for (const y of [h * 0.35, h * 0.62]) { const wn = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9), darkWinM); wn.position.set(0, y, rr(y) + 0.02); t.add(wn); }
      } else {
        put(new THREE.Mesh(new THREE.CylinderGeometry(top + 0.35, top + 0.1, 0.4, 24), stepM), 0, h + 0.1, 0);
        put(new THREE.Mesh(new THREE.ConeGeometry(top + 0.5, Math.max(1.8, r * 0.9), 24), new THREE.MeshStandardMaterial({ map: wallTex('tiles'), color: roofC, roughness: 0.85 })), 0, h + 0.3 + Math.max(1.8, r * 0.9) / 2, 0);
        const dr = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.0, 0.14), woodM); dr.position.set(0, 1.2, rr(1) + 0.03); t.add(dr);
        for (const y of [h * 0.5, h * 0.8]) { const wn = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.8), litWinM); wn.position.set(0, y, rr(y) + 0.02); t.add(wn); }
      }
    }
  }
  function waterTower(p) {
    const [, x, z, r, h, c] = p, t = new THREE.Group(); t.position.set(x, 0, z); g.add(t);
    const put = (m, px, py, pz) => { m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; t.add(m); return m; };
    for (const [lx, lz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) put(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, h - 1.6, 8), metalM), lx * r * 0.7, (h - 1.6) / 2, lz * r * 0.7);
    for (const y of [h * 0.3, h * 0.6]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.99, 0.05, 6, 4), metalM); ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 4; put(ring, 0, y, 0); }
    put(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 3, 20), std(c, { roughness: 0.8 })), 0, h - 0.1, 0);
    for (const y of [h - 1.1, h + 0.9]) put(new THREE.Mesh(new THREE.CylinderGeometry(r + 0.04, r + 0.04, 0.12, 20), metalM), 0, y, 0);
    put(new THREE.Mesh(new THREE.ConeGeometry(r + 0.3, 1.4, 20), std(0x2a2420)), 0, h + 2.1, 0);
    put(new THREE.Mesh(new THREE.BoxGeometry(0.1, h - 1, 0.35), metalM), r * 0.95, (h - 1) / 2, 0);   // ladder
  }

  const prop = (p) => {
    const k = p[0];
    if (k === 'B') building(p);
    else if (k === 'T') tower(p);
    else if (k === 'W') waterTower(p);
    else if (k === 'b') { const [, x, z, w, h, d, c] = p; const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(c))); m.position.set(x, h / 2, z); }
    else if (k === 'c') { const [, x, z, r, h, c] = p; const m = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), std(c))); m.position.set(x, h / 2, z); }
    else if (k === 'k') { const [, x, z, r, h, c] = p; const m = add(new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), std(c))); m.position.set(x, h / 2, z); }
    else if (k === 'p') { const [, x, z, r, y, h, c] = p; const m = add(new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), std(c))); m.rotation.y = Math.PI / 4; m.position.set(x, y + h / 2, z); }
    else if (k === 'w') { const [, x, z, w, d, c] = p; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std(c, { metalness: 0.9, roughness: 0.12 })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, z); m.receiveShadow = true; g.add(m); }
    else if (k === 'l') {
      const [, x, z, h, c, inten] = p; const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, h, 8), std(0x222222, { metalness: 0.6 }))); pole.position.set(x, h / 2, z);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), glowM(c, 3)); bulb.position.set(x, h + 0.1, z); g.add(bulb);
      if (lights < 6) { const l = new THREE.PointLight(c, inten, 26, 2); l.position.set(x, h - 0.2, z); g.add(l); fl.push({ l, base: inten }); lights++; }
    }
    else if (k === 't') { const [, x, z, s, c] = p; const tr = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 2 * s, 7), woodM)); tr.position.set(x, s, z);
      for (let i = 0; i < 3; i++) { const cn = add(new THREE.Mesh(new THREE.ConeGeometry((2 - i * 0.5) * s, 2.4 * s, 8), std(c, { flatShading: true }))); cn.position.set(x, (2.2 + i * 1.3) * s, z); } }
    else if (k === 'rk') { const [, x, z, s, c] = p; const m = add(new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), std(c, { flatShading: true }))); m.position.set(x, s * 0.5, z); m.rotation.set(R() * 3, R() * 3, 0); m.scale.y = 0.7; }
    else if (k === 'o') { const [, x, z, r, y, c] = p; const m = add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.25, 8, 28), std(c, { metalness: 0.5 }))); m.position.set(x, y, z); for (let i = 0; i < 6; i++) { const sp = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, r * 2, 0.1), std(c))); sp.position.set(x, y, z); sp.rotation.z = (i / 6) * Math.PI; } }
    else if (k === 'f') { const [, x, z, len, rot, c] = p; const f = new THREE.Group(); const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.12), std(c)); rail.position.y = 0.9; f.add(rail); const rail2 = rail.clone(); rail2.position.y = 0.5; f.add(rail2);
      for (let i = 0; i <= len; i += 3) { const po = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), std(c)); po.position.set(-len / 2 + i, 0.55, 0); f.add(po); } f.position.set(x, 0, z); f.rotation.y = rot; f.traverse(o => { o.castShadow = true; }); g.add(f); }
    else if (k === 'cactus') { const [, x, z, h, c] = p; const m = add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, h, 8), std(c))); m.position.set(x, h / 2, z); const a = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 8), std(c))); a.position.set(x + 0.45, h * 0.6, z); a.rotation.z = Math.PI / 2.4; }
    else if (k === 'vine') { const [, x, z, s, c] = p; const m = add(new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), std(c, { flatShading: true })), false); m.position.set(x, 0.55, z); m.scale.y = 0.8; const st = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 5), woodM), false); st.position.set(x, 0.7, z); }
    else if (k === 'crate') { const [, x, z, s, c, ry] = p; const m = add(new THREE.Mesh(new THREE.BoxGeometry(s, s, s), std(c))); m.position.set(x, s / 2, z); m.rotation.y = ry; }
  };
  lay.props.forEach(prop);

  // stars
  const sp = new Float32Array(900); for (let i = 0; i < 300; i++) { const a = R() * 6.283, e = 0.15 + R() * 1.2, r = 220; sp[i * 3] = Math.cos(a) * Math.cos(e) * r; sp[i * 3 + 1] = Math.sin(e) * r; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xe8eeff, size: 1.5, sizeAttenuation: false, fog: false })));
  return { g, lay, fl };
}

function loadMap(id) {
  const def = MAPS.find(m => m.id === id) || MAPS[0];
  if (mapGroup) { scene.remove(mapGroup); disposeGroup(mapGroup); mapGroup = null; }
  curMapId = def.id;
  if (def.builtin) {
    for (const n of manorNodes) n.visible = true; curLay = manorLay; flicker = manorFlicker;
    scene.background.set(0x060914); scene.fog.color.set(0x0a1020); scene.fog.density = 0.022;
    hemi.color.set(0x5a6aa0); hemi.groundColor.set(0x0e1410); hemi.intensity = 0.8; moon.color.set(0xa9bcff); moon.intensity = 1.25; baseFog = 0.022; baseHemi = 0.8; return;
  }
  for (const n of manorNodes) n.visible = false;
  const m = buildMap(def); mapGroup = m.g; scene.add(mapGroup); curLay = m.lay; flicker = m.fl;
  scene.background.set(def.sky); scene.fog.color.set(def.fog[0]); scene.fog.density = def.fog[1];
  hemi.color.set(def.hemi[0]); hemi.groundColor.set(def.hemi[1]); hemi.intensity = def.hemi[2]; moon.color.set(def.sun[0]); moon.intensity = def.sun[1];
  baseFog = def.fog[1]; baseHemi = def.hemi[2];
}

/* ---------- avatars ---------- */
function nameSprite(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '28px "Special Elite", monospace'; g.textAlign = 'center';
  g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(text, 128, 42);
  g.fillStyle = '#fff'; g.fillText(text, 128, 42);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, fog: false }));
  s.scale.set(3, 0.75, 1); s.position.y = 3.3; return s;
}
function makeAvatar(name, skin, idx) {
  const g = new THREE.Group();
  const coat = mat(skin), dark = mat(0x1d1b22), skinM = mat(0xf1d3b3), bootM = mat(0x0e0d12);
  const part = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  part(new THREE.BoxGeometry(0.72, 0.85, 0.42), coat, 0, 1.25, 0);
  part(new THREE.BoxGeometry(0.62, 0.22, 0.4), dark, 0, 0.78, 0);
  part(new THREE.BoxGeometry(0.5, 0.55, 0.22), mat(0x5a3b22), 0, 1.25, -0.32);
  part(new THREE.SphereGeometry(0.28, 18, 14), skinM, 0, 1.95, 0);
  part(new THREE.SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x2a1c12), 0, 1.97, -0.02);
  for (const ex of [-0.1, 0.1]) part(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }), ex, 1.97, 0.26);
  const limb = (w, h, d, x, y, m, tip) => {
    const p = new THREE.Group(); p.position.set(x, y, 0);
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.y = -h / 2; p.add(o);
    const t = tip(); t.position.y = -h + 0.04; p.add(t); g.add(p); return p;
  };
  const boot = () => new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.38), bootM);
  const hand = () => new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), skinM);
  const legL = limb(0.26, 0.78, 0.3, -0.17, 0.78, dark, boot), legR = limb(0.26, 0.78, 0.3, 0.17, 0.78, dark, boot);
  const armL = limb(0.2, 0.7, 0.22, -0.47, 1.62, coat, hand), armR = limb(0.2, 0.7, 0.22, 0.47, 1.62, coat, hand);
  const acc = idx % 4;
  if (acc === 0) part(new THREE.ConeGeometry(0.34, 0.6, 12), mat(0x1c1226), 0, 2.45, 0);
  if (acc === 1) part(new THREE.CylinderGeometry(0.32, 0.34, 0.14, 12), mat(0x3a2a1a), 0, 2.2, 0);
  if (acc === 2) { const t = part(new THREE.TorusGeometry(0.28, 0.09, 8, 14), mat(0xb22222), 0, 1.7, 0); t.rotation.x = Math.PI / 2; }
  if (acc === 3) part(new THREE.CylinderGeometry(0.22, 0.24, 0.5, 12), mat(0x111111), 0, 2.4, 0);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { legL, legR, armL, armR };
  g.add(nameSprite(name));
  scene.add(g);
  return g;
}

const avatars = new Map(); // id -> { obj, tx, tz, try }
let local = { x: 0, z: 14, ry: Math.PI, y: 0 };
function addAvatar(p) {
  if (avatars.has(p.id)) return;
  const obj = makeAvatar(p.name, p.skin, p.skinIndex);
  obj.position.set(p.x, 0, p.z); obj.rotation.y = p.ry || 0;
  avatars.set(p.id, { obj, tx: p.x, tz: p.z, try: p.ry || 0 });
}
function removeAvatar(id) {
  const a = avatars.get(id); if (!a) return;
  scene.remove(a.obj); avatars.delete(id);
}
function clearWorldState() {
  for (const id of [...avatars.keys()]) removeAvatar(id);
  for (const m of clueMeshes.values()) scene.remove(m);
  clueMeshes.clear(); clueCircles.length = 0;
  npcs.length = 0; closeTalk(); setWeather('clear'); blackoutUntil = lightningUntil = shakeUntil = 0;
}

/* ---------- clue markers ---------- */
const clueMeshes = new Map();
const clueCircles = [];   // the little tables block movement until their clue is picked up
function removeClueMarker(id) { const g = clueMeshes.get(id); if (g) { scene.remove(g); clueMeshes.delete(id); } const i = clueCircles.findIndex(c => c.id === id); if (i >= 0) clueCircles.splice(i, 1); }
const propCache = new Map();
function addClueMarker(c) {
  // a small stand with the unopened object lying on it: no glow, just a real thing to find
  const g = new THREE.Group();
  const sh = 0.7 + (c.id.charCodeAt(1) % 3) * 0.12;
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.95, sh, 0.8), new THREE.MeshStandardMaterial({ map: woodM.map, color: 0x7a6044, roughness: 0.95 }));
  stand.position.y = sh / 2; stand.castShadow = true; stand.receiveShadow = true; stand.rotation.y = (c.x * 7 + c.z * 3) % 1;
  if (!propCache.has(c.type)) { const p = makeProp(c.type); const t = new THREE.CanvasTexture(p.cv); t.colorSpace = THREE.SRGBColorSpace; propCache.set(c.type, { ...p, t }); }
  const p = propCache.get(c.type);
  const top = new THREE.MeshStandardMaterial({ map: p.t, roughness: 0.9, color: 0xcfcfcf });
  const obj = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), [new THREE.MeshStandardMaterial({ color: 0xcfc3a0 }), new THREE.MeshStandardMaterial({ color: 0xcfc3a0 }), top, new THREE.MeshStandardMaterial({ color: 0xcfc3a0 }), new THREE.MeshStandardMaterial({ color: 0xcfc3a0 }), new THREE.MeshStandardMaterial({ color: 0xcfc3a0 })]);
  obj.position.y = sh + p.h / 2 + 0.01; obj.rotation.y = ((c.x * 13 + c.z * 5) % 1.6) - 0.8; obj.castShadow = true;
  g.add(stand, obj); g.position.set(c.x, 0, c.z); g.userData = { obj, base: 0 };
  scene.add(g); clueMeshes.set(c.id, g); clueCircles.push({ id: c.id, x: c.x, z: c.z, r: 0.55 });
}

/* ---------- input / camera ---------- */
const keys = {};
let camYaw = 0, camPitch = 0.45, dragging = false;
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && mode === 'playing') e.preventDefault();
  if (e.code === 'Escape' && talking >= 0) closeTalk();
  if (e.code === 'KeyE' && !e.repeat && mode === 'playing' && !viewing) {
    const nn = nearestNpc(3.4);
    if (nn && nn.d < nearestClueDist()) openTalk(nn.n.i); else if (socket.connected) socket.emit('search'); else toast('Connection lost. Waiting to reconnect…');
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
renderer.domElement.addEventListener('pointerdown', () => { dragging = true; });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => {
  if (!dragging || mode !== 'playing') return;
  camYaw -= e.movementX * 0.005;
  camPitch = Math.max(0.1, Math.min(1.2, camPitch + e.movementY * 0.004));
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const NPC_SOLID_R = 0.5;   // suspects are solid: you walk around them, and they can't walk through you either
function stepLocal(dt) {
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let nx = local.x, nz = local.z;
  if (f || s) {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let vx = fx * f + rx * s, vz = fz * f + rz * s;
    const len = Math.hypot(vx, vz) || 1; vx = vx / len * SPEED; vz = vz / len * SPEED;
    nx += vx * dt; nz += vz * dt;
    local.ry = Math.atan2(vx, vz);
  }
  // circle-vs-shape collision: slides along walls, trees, fences, clue tables and suspects; water blocks unless you are on a pier or boardwalk.
  // It also runs while standing still, so a suspect who patrols into you pushes you aside instead of ghosting through.
  let solid = clueCircles;
  if (npcs.length) { solid = clueCircles.slice(); for (const n of npcs) { const a = avatars.get(n.id); if (a) solid.push({ id: n.id, x: a.obj.position.x, z: a.obj.position.z, r: NPC_SOLID_R }); } }
  [local.x, local.z] = MAPS.collision.moveTo(curLay, local.x, local.z, nx, nz, MAPS.collision.PLAYER_R, solid);
  const dy = MAPS.collision.deckY(curLay, local.x, local.z);
  local.y += ((dy < 0 ? 0 : dy) - local.y) * Math.min(1, dt * 12);
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

/* ---------- main loop ---------- */
const clock = new THREE.Clock();
let sendT = 0;
const SURFACE = { 'blackwood-manor': 'grass', 'foggy-harbor': 'stone', 'desert-dig': 'sand', 'frost-station': 'snow', 'midnight-carnival': 'dirt',
  'cliffside-lighthouse': 'grass', 'rail-yard': 'gravel', 'hollow-monastery': 'stone', 'bayou-village': 'mud', 'moonlit-vineyard': 'grass' };
function stepSound(a, id) {
  if (!ac || !musicOn) return;
  const x = a.obj.position.x, z = a.obj.position.z;
  let vol = 1, pan = 0;
  if (id !== myId) {                                   // other detectives: quieter with distance, panned left/right of the camera
    const dx = x - local.x, dz = z - local.z, d = Math.hypot(dx, dz);
    vol = Math.pow(Math.max(0, 1 - d / 26), 1.6) * 0.8;
    pan = Math.max(-1, Math.min(1, (dx * Math.cos(camYaw) - dz * Math.sin(camYaw)) / 14));
  }
  footstep(MAPS.collision.deckY(curLay, x, z) >= 0 ? 'wood' : (SURFACE[curMapId] || 'grass'), vol, pan);
}
function animateAvatars(dt) {
  for (const [id, a] of avatars) {
    const p = a.obj.position;
    const sp = Math.hypot(p.x - (a.px ?? p.x), p.z - (a.pz ?? p.z)) / Math.max(dt, 0.001);
    a.px = p.x; a.pz = p.z;
    a.sp = (a.sp || 0) * 0.8 + sp * 0.2; a.ph = (a.ph || 0) + a.sp * dt * 1.3;
    const k = Math.min(1, a.sp / 4) * 0.9, u = a.obj.userData, s = Math.sin(a.ph) * k;
    u.legL.rotation.x = s; u.legR.rotation.x = -s; u.armL.rotation.x = -s * 0.8; u.armR.rotation.x = s * 0.8;
    const ty = id === myId ? local.y : Math.max(0, MAPS.collision.deckY(curLay, p.x, p.z));   // step up onto piers and boardwalks
    a.by = (a.by ?? ty) + (ty - (a.by ?? ty)) * Math.min(1, dt * 12);
    p.y = a.by + Math.abs(s) * 0.07;
    const idx = Math.floor(a.ph / Math.PI);              // one footstep each time a foot lands
    if (mode === 'playing' && a.sp > 1.6 && a.lastStep !== undefined && idx !== a.lastStep) stepSound(a, id);
    a.lastStep = idx;
  }
}
/* ---------- weather, timed events, walking suspects ---------- */
const ROUND_MS = 10 * 60 * 1000;
let baseFog = 0.022, baseHemi = 0.8, blackoutUntil = 0, lightningUntil = 0, shakeUntil = 0;
const wx = { kind: 'clear', obj: null, base: null, n: 0 };
const FOG_MULT = { fog: 2.6, rain: 1.35, snow: 1.5, wind: 1.1, clear: 1 };
function setWeather(kind) {
  if (wx.obj) { scene.remove(wx.obj); wx.obj.geometry.dispose(); wx.obj.material.dispose(); wx.obj = null; }
  wx.kind = kind;
  const cfg = { rain: { n: 1800 }, snow: { n: 1400 }, wind: { n: 260 } }[kind];
  if (cfg) {
    const n = cfg.n, base = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { base[i * 3] = (Math.random() - 0.5) * 44; base[i * 3 + 1] = Math.random() * 24; base[i * 3 + 2] = (Math.random() - 0.5) * 44; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * (kind === 'rain' ? 6 : 3)), 3));
    wx.base = base; wx.n = n;
    wx.obj = kind === 'rain' ? new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.4, fog: false }))
      : new THREE.Points(geo, new THREE.PointsMaterial({ color: kind === 'snow' ? 0xffffff : 0xcdb98c, size: kind === 'snow' ? 0.22 : 0.13, transparent: true, opacity: kind === 'snow' ? 0.85 : 0.6, depthWrite: false }));
    wx.obj.frustumCulled = false; scene.add(wx.obj); updateWeather(0, 0);
  }
  setWeatherSound(kind);
}
function updateWeather(dt, t) {
  scene.fog.density = baseFog * (FOG_MULT[wx.kind] || 1);
  if (!wx.obj) return;
  const b = wx.base, p = wx.obj.geometry.attributes.position.array, n = wx.n, k = wx.kind;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    if (k === 'rain') { b[o + 1] -= 26 * dt; b[o] += 3 * dt; } else if (k === 'snow') { b[o + 1] -= 2.4 * dt; b[o] += Math.sin(t * 0.7 + i) * 0.6 * dt; } else { b[o] += 12 * dt; }
    if (b[o + 1] < 0 && k !== 'wind') b[o + 1] += 24; if (b[o] > 22) b[o] -= 44;
    if (k === 'rain') { const q = i * 6; p[q] = b[o]; p[q + 1] = b[o + 1]; p[q + 2] = b[o + 2]; p[q + 3] = b[o] - 0.15; p[q + 4] = b[o + 1] + 0.7; p[q + 5] = b[o + 2]; }
    else { p[o] = b[o]; p[o + 1] = k === 'wind' ? 1 + (b[o + 1] / 24) * 5 + Math.sin(t * 2 + i) * 0.4 : b[o + 1]; p[o + 2] = b[o + 2]; }
  }
  wx.obj.geometry.attributes.position.needsUpdate = true;
  const cx = mode === 'playing' ? local.x : camera.position.x, cz = mode === 'playing' ? local.z : camera.position.z;
  wx.obj.position.set(cx, 0, cz);
}
let wxSound = null;
function setWeatherSound(kind) {
  if (wxSound) { const s = wxSound; wxSound = null; try { s.g.gain.setTargetAtTime(0, ac.currentTime, 0.3); setTimeout(() => { try { s.src.stop(); } catch (e) { /* already stopped */ } }, 1500); } catch (e) { /* ignore */ } }
  if (!ac || !noiseBuf || kind === 'clear' || kind === 'fog') return;
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ac.createBiquadFilter(), g = ac.createGain(); g.gain.value = 0;
  const target = kind === 'rain' ? 0.2 : 0.14;
  f.type = kind === 'rain' ? 'bandpass' : 'lowpass'; f.frequency.value = kind === 'rain' ? 3200 : 480; f.Q.value = 0.5;
  if (kind !== 'rain') { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 0.13; lg.gain.value = 0.07; l.connect(lg); lg.connect(g.gain); l.start(); }
  src.connect(f); f.connect(g); g.connect(sfx); src.start(); g.gain.setTargetAtTime(target, ac.currentTime, 1);
  wxSound = { src, g };
}

// one-shot sounds for the events (all synthesised)
function sndBell(v = 1) { if (!ac || !musicOn) return; const t = ac.currentTime; for (const [f, a] of [[196, 1], [392, 0.5], [588, 0.35], [1172, 0.15]]) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35 * a * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5); o.connect(g); g.connect(sfx); o.start(t); o.stop(t + 4.6); } }
function sndScream() {
  if (!ac || !musicOn) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter(), lfo = ac.createOscillator(), lg = ac.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(520, t); o.frequency.linearRampToValueAtTime(980, t + 0.35); o.frequency.linearRampToValueAtTime(700, t + 1.1);
  lfo.frequency.value = 8; lg.gain.value = 45; lfo.connect(lg); lg.connect(o.frequency); lp.type = 'lowpass'; lp.frequency.value = 1500;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  o.connect(lp); lp.connect(g); g.connect(sfx); o.start(t); lfo.start(t); o.stop(t + 1.3); lfo.stop(t + 1.3);
}
function noiseHit(freq, type, dur, vol, delay = 0) {
  if (!ac || !musicOn || !noiseBuf) return; const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.4), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.15, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfx); s.start(t); s.stop(t + dur + 0.1);
}
const sndThunder = () => noiseHit(160, 'lowpass', 3, 1.2);
const sndGust = () => noiseHit(900, 'bandpass', 2.4, 0.35);
function sndBuzz() { if (!ac || !musicOn) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = 100; g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); o.connect(g); g.connect(sfx); o.start(t); o.stop(t + 0.8); }

function onEvent(ev) {
  const now = performance.now();
  switch (ev.kind) {
    case 'wind': sndGust(); break;
    case 'flicker': blackoutUntil = now + 4500; sndBuzz(); toast('The lights flicker…'); break;
    case 'scream': sndScream(); shakeUntil = now + 700; toast('A scream echoes across the grounds!'); break;
    case 'thunder': lightningUntil = now + 700; setTimeout(sndThunder, 450); break;
    case 'warning': sndBell(0.8); toast('One minute left. Make your decision.'); break;
    case 'bell': sndBell(); toast('A bell tolls in the distance…'); break;
    case 'bonus': sndBell(); if (ev.clue) { addClueMarker(ev.clue); toast('A bell tolls. Something was left at the ' + ev.clue.label + '.'); } break;
  }
}

/* suspects who patrol the map; their routes come from a seed, so every player sees them in the same place */
const npcs = [], stmtSeen = new Set(), NPC_SKINS = ['#9b5de5', '#00bbf9', '#f15bb5', '#fee440'];
const TALK_Q = { where: 'Where were you tonight?', saw: 'What did you notice?', suspect: 'Who do you suspect?' };
let talking = -1;
function spawnNpcs(list, seed) {
  npcs.length = 0; const def = MAPS.find(m => m.id === curMapId); if (!def || !window.MANPC || !list.length) return;
  const routes = window.MANPC.build(MAPS, def, seed, list.length);
  list.forEach((n, i) => {
    const p = window.MANPC.posAt(routes[i], 0); npcs.push({ i, name: n.name, role: n.role, route: routes[i], id: 'npc' + i, frozen: 0, holdAt: null });
    addAvatar({ id: 'npc' + i, name: n.name, skin: NPC_SKINS[i % 4], skinIndex: i + 2, x: p.x, z: p.z, ry: p.ry });
  });
}
const roundSeconds = () => (ROUND_MS - Math.max(0, round.endsAt - Date.now())) / 1000;
// a suspect that is being questioned stands still. The paused time is subtracted from their patrol clock, so they
// carry on from the same spot afterwards, and every player computes the same thing from the same server timestamps.
function applyHold(d) {
  const n = npcs[d.npc]; if (!n) return;
  if (d.held) { if (n.holdAt === null) n.holdAt = d.at; } else if (n.holdAt !== null) { n.frozen += Math.max(0, d.at - n.holdAt); n.holdAt = null; }
}
function updateNpcs() {
  if (!round || !npcs.length) return;
  const tr = roundSeconds();
  for (const n of npcs) {
    const te = Math.max(0, (n.holdAt !== null ? n.holdAt : tr) - n.frozen), p = window.MANPC.posAt(n.route, te), a = avatars.get(n.id);
    if (!a) continue;
    a.tx = p.x; a.tz = p.z; a.try = p.ry;
    if (n.holdAt !== null) {              // turn to face whoever is closest
      let best = null, bd = 12;
      for (const [id, o] of avatars) { if (id.startsWith('npc')) continue; const d = Math.hypot(o.obj.position.x - a.obj.position.x, o.obj.position.z - a.obj.position.z); if (d < bd) { bd = d; best = o; } }
      if (best) a.try = Math.atan2(best.obj.position.x - a.obj.position.x, best.obj.position.z - a.obj.position.z);
    }
  }
}
function nearestNpc(maxD) {
  let best = null, bd = maxD;
  for (const n of npcs) { const a = avatars.get(n.id); if (!a) continue; const d = Math.hypot(a.obj.position.x - local.x, a.obj.position.z - local.z); if (d < bd) { bd = d; best = n; } }
  return best ? { n: best, d: bd } : null;
}
function nearestClueDist() { let bd = Infinity; for (const g of clueMeshes.values()) bd = Math.min(bd, Math.hypot(g.position.x - local.x, g.position.z - local.z)); return bd; }
let lastPrompt = '';
function updatePrompt() {
  const nn = nearestNpc(3.4), cd = nearestClueDist();
  let text = '', on = false;
  if (nn && nn.d < cd) { text = 'Press <b>E</b> to talk to ' + nn.n.name.replace(/[<>&]/g, ''); on = true; } else if (cd < 3.6) { text = 'Press <b>E</b> to search'; on = true; }
  if (text !== lastPrompt) { lastPrompt = text; if (text) $('#prompt').innerHTML = text; }
  show($('#prompt'), on && talking < 0);
  if (talking >= 0) { const a = avatars.get('npc' + talking); if (!a || Math.hypot(a.obj.position.x - local.x, a.obj.position.z - local.z) > 7) closeTalk(); }
}
function openTalk(i) { const n = npcs[i]; if (!n) return; if (talking >= 0 && talking !== i) sendHold(talking, false); talking = i; sendHold(i, true); $('#talkHead').textContent = n.name + ', the ' + n.role; $('#talkText').textContent = 'Ask a question.'; show($('#talk'), true); }
function closeTalk() { if (talking >= 0) sendHold(talking, false); talking = -1; show($('#talk'), false); }
for (const q in TALK_Q) { const b = document.createElement('button'); b.textContent = TALK_Q[q]; b.onclick = () => { if (talking >= 0) sendTalk(talking, q); }; $('#talkBtns').append(b); }
$('#talkClose').onclick = closeTalk;
function showNpcSays(d) {          // d: { npc, q, text, by, byId }
  const n = npcs[d.npc]; if (!n) return;
  if (d.byId === myId && talking === d.npc) $('#talkText').textContent = '“' + d.text + '”';
  const key = d.npc + d.q; if (stmtSeen.has(key)) return; stmtSeen.add(key);
  const li = document.createElement('li'); li.className = 'stmt';
  const b = document.createElement('b'); b.textContent = n.name + ' (' + n.role + '):';
  const t = document.createElement('div'); t.textContent = '“' + d.text + '”';
  const by = document.createElement('div'); by.className = 'by'; by.textContent = TALK_Q[d.q] + ' · asked by ' + d.by;
  li.append(b, t, by); $('#evidence').append(li);
}
function applyRoundWorld(d) {
  stmtSeen.clear(); lastPrompt = '';
  setWeather(d.weather || 'clear'); $('#caseWx').textContent = 'Weather: ' + (!d.weather || d.weather === 'clear' ? 'clear night' : d.weather);
  spawnNpcs(d.npcs || [], d.seed || '0');
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;

  grassTime.value = t;
  flies.position.y = Math.sin(t * 0.5) * 0.3; flies.rotation.y = t * 0.01;
  const nowMs = performance.now(), dark = nowMs < blackoutUntil, lit = nowMs < lightningUntil && Math.random() < 0.7;
  for (const f of flicker) f.l.intensity = dark ? (Math.random() < 0.3 ? f.base : 0) : f.base * (0.92 + Math.sin(t * 7 + f.base) * 0.05 + Math.random() * 0.04);
  hemi.intensity = baseHemi * (dark ? 0.35 : 1) * (lit ? 3.2 : 1);
  updateWeather(dt, t);
  for (const m of mists) { m.position.x += m.userData.v * dt; if (m.position.x > 60) m.position.x = -60; }

  if (mode === 'playing') {
    updateNpcs();
    stepLocal(dt);
    const me = avatars.get(myId);
    if (me) { me.obj.position.set(local.x, 0, local.z); me.obj.rotation.y = lerpAngle(me.obj.rotation.y, local.ry, 0.2); }
    for (const [id, a] of avatars) {
      if (id === myId) continue;
      a.obj.position.x += (a.tx - a.obj.position.x) * 0.2;
      a.obj.position.z += (a.tz - a.obj.position.z) * 0.2;
      a.obj.rotation.y = lerpAngle(a.obj.rotation.y, a.try, 0.2);
    }
    sendT += dt;
    if (sendT > 0.066) { sendT = 0; socket.volatile.emit('move', { x: local.x, z: local.z, ry: local.ry }); }

    const d = 8, h = Math.sin(camPitch) * d, r = Math.cos(camPitch) * d;
    const want = new THREE.Vector3(local.x + Math.sin(camYaw) * r, h + 1.5 + local.y, local.z + Math.cos(camYaw) * r);
    camera.position.lerp(want, 0.15);
    camera.lookAt(local.x, 1.6 + local.y, local.z);
    flash.intensity = dark ? (Math.random() < 0.4 ? 70 : 6) : 70;
    if (nowMs < shakeUntil) camera.position.x += (Math.random() - 0.5) * 0.25;
    updatePrompt();

    const left = Math.max(0, round.endsAt - Date.now());
    const mm = String(Math.floor(left / 60000)).padStart(2, '0'), ss = String(Math.floor(left / 1000) % 60).padStart(2, '0');
    $('#timer').textContent = `${mm}:${ss}`;
    $('#timer').classList.toggle('low', left < 60000);
  } else {
    flash.intensity = 0;
    const a = t * 0.06;
    camera.position.set(Math.sin(a) * 42, 13 + Math.sin(t * 0.1) * 2, -20 + Math.cos(a) * 42);
    camera.lookAt(0, 5, -20);
  }
  animateAvatars(dt);
  composer.render();
}
loop();

/* ---------- audio: ambient music + footsteps (all synthesised, no files) ---------- */
try { musicOn = localStorage.getItem('ma_sound') !== 'off'; } catch (e) { /* storage blocked */ }
function applyVolume() { if (!ac) return; master.gain.value = musicOn ? 0.18 : 0; sfx.gain.value = musicOn ? 0.5 : 0; }
function startMusic() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try { ac = new AC(); } catch (e) { ac = null; return; }
  ac.onstatechange = () => { if (ac.state === 'running') audioUnlocked(); };   // the browser let us start: stop waiting for a gesture
  if (ac.state !== 'running') ac.resume().catch(() => {});
  master = ac.createGain(); master.connect(ac.destination);
  sfx = ac.createGain(); sfx.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  applyVolume(); setWeatherSound(wx.kind);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.connect(master);
  [55, 55.4, 82.4, 110.3].forEach((f, i) => {
    const o = ac.createOscillator(); o.type = i % 2 ? 'sawtooth' : 'sine'; o.frequency.value = f;
    const g = ac.createGain(); g.gain.value = i % 2 ? 0.05 : 0.12;
    o.connect(g); g.connect(lp); o.start();
  });
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
  const lg = ac.createGain(); lg.gain.value = 200; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
  const notes = [329.6, 392, 440, 493.9, 587.3];
  (function bell() {
    if (musicOn && ac.state === 'running') {
      const o = ac.createOscillator(), g = ac.createGain(), n = ac.currentTime;
      o.type = 'sine'; o.frequency.value = notes[Math.floor(Math.random() * notes.length)];
      g.gain.setValueAtTime(0, n); g.gain.linearRampToValueAtTime(0.06, n + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, n + 4);
      o.connect(g); g.connect(master); o.start(); o.stop(n + 4.2);
    }
    setTimeout(bell, 3000 + Math.random() * 6000);
  })();
}
// footstep recipes: filtered noise bursts (+ a low thump on hard floors), one per surface
const STEP = {
  grass:  { type: 'bandpass', f: 1400, q: 0.7, dur: 0.14, gain: 0.55 },
  sand:   { type: 'bandpass', f: 2200, q: 0.5, dur: 0.18, gain: 0.35 },
  snow:   { type: 'highpass', f: 3000, q: 0.8, dur: 0.1, gain: 0.5, bursts: 2 },
  gravel: { type: 'bandpass', f: 3400, q: 1.2, dur: 0.06, gain: 0.5, bursts: 3 },
  wood:   { type: 'bandpass', f: 900, q: 1, dur: 0.09, gain: 0.55, thump: 140 },
  stone:  { type: 'bandpass', f: 1700, q: 1.4, dur: 0.06, gain: 0.5, thump: 95 },
  mud:    { type: 'lowpass', f: 520, q: 0.9, dur: 0.22, gain: 0.8 },
  dirt:   { type: 'lowpass', f: 1100, q: 0.8, dur: 0.1, gain: 0.65 }
};
function footstep(surface, vol = 1, pan = 0) {
  if (!ac || !musicOn || vol < 0.03 || ac.state !== 'running') return;
  const S = STEP[surface] || STEP.grass, t = ac.currentTime;
  const out = ac.createStereoPanner ? ac.createStereoPanner() : ac.createGain();
  if (out.pan) out.pan.value = pan; out.connect(sfx);
  for (let i = 0; i < (S.bursts || 1); i++) {
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 0.9 + Math.random() * 0.25;
    const flt = ac.createBiquadFilter(); flt.type = S.type; flt.frequency.value = S.f * (0.85 + Math.random() * 0.3); flt.Q.value = S.q;
    const g = ac.createGain(), st = t + i * 0.02;
    g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(S.gain * vol, st + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, st + S.dur);
    src.connect(flt); flt.connect(g); g.connect(out); src.start(st, Math.random() * 0.7); src.stop(st + S.dur + 0.05);
  }
  if (S.thump) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(S.thump * (0.9 + Math.random() * 0.2), t); o.frequency.exponentialRampToValueAtTime(S.thump * 0.5, t + 0.09);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.12);
  }
}
/* Browsers only allow sound after a real user gesture, and Chrome does not count `pointerdown` as one. So we keep trying on every
   gesture type (click, key, touch, pointer-up) until the audio engine reports "running", instead of giving up after the first click. */
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'];
function audioUnlocked() { for (const e of UNLOCK_EVENTS) removeEventListener(e, startMusic, true); $('#mute').classList.remove('wait'); }
for (const e of UNLOCK_EVENTS) addEventListener(e, startMusic, true);
$('#mute').classList.add('wait');   // gentle pulse on the sound button until the first click unlocks the audio
document.addEventListener('visibilitychange', () => { if (!document.hidden && ac && ac.state === 'suspended') ac.resume(); });
const muteBtn = $('#mute');
function paintMute() { muteBtn.classList.toggle('off', !musicOn); muteBtn.setAttribute('aria-pressed', String(musicOn)); muteBtn.title = musicOn ? 'Sound on' : 'Sound off'; }
paintMute();
muteBtn.onclick = () => {
  startMusic(); musicOn = !musicOn;
  try { localStorage.setItem('ma_sound', musicOn ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
  applyVolume(); paintMute();
};

/* ---------- UI flow ---------- */
const nameInput = $('#name');
nameInput.value = localStorage.getItem('ma_name') || '';
function getName() {
  const n = nameInput.value.trim();
  if (!n) { $('#homeError').textContent = 'Enter a name first.'; nameInput.focus(); return null; }
  localStorage.setItem('ma_name', n); $('#homeError').textContent = ''; return n;
}
function setScreen(m) {
  mode = m;
  show($('#home'), m === 'home'); show($('#lobby'), m === 'lobby');
  show($('#hud'), m === 'playing'); show($('#end'), m === 'ended');
  document.body.classList.toggle('playing', m === 'playing');
  social.setActive(m !== 'home');     // chat + voice are available in the lobby, during a round and on the results screen
}
const social = initSocial({ socket, $, show, toast, avatars, THREE, getState: () => ({ myId, mode, local, camYaw, keys }) });

if (inviteCode) {
  $('#joinCode').value = inviteCode;
  const b = $('#inviteBanner'); show(b);
  b.textContent = `You were invited to server ${inviteCode}. Enter your name and press Join.`;
}

/* ---------- connection handling ---------- */
const netEl = $('#net'), netText = $('#netText'), netRetry = $('#netRetry');
let netTimer, hadConnection = false, lostWhileInRoom = false, attempts = 0, pending = false;
function banner(kind, text, retry) { clearTimeout(netTimer); netEl.className = 'show ' + kind; netText.textContent = text; show(netRetry, !!retry); }
function bannerOff(delay = 0) { clearTimeout(netTimer); netTimer = setTimeout(() => netEl.classList.remove('show'), delay); }
function updateButtons() {
  const on = socket.connected && !pending;
  $('#createBtn').disabled = !on; $('#joinBtn').disabled = !on;
  document.querySelectorAll('#roomList button').forEach((b) => { b.disabled = !on; });
  $('#startBtn').disabled = !socket.connected; $('#backBtn').disabled = !socket.connected;
}
function resetToHome(msg) { clearWorldState(); closeDoc(); round = null; room = null; myId = null; setScreen('home'); $('#homeError').textContent = msg || ''; }
// emit with a timeout so a silent network never leaves the player staring at a dead button
function request(ev, payload, done) {
  if (!socket.connected) { $('#homeError').textContent = "You're offline. Waiting for the connection…"; return; }
  pending = true; updateButtons();
  let settled = false;
  const finish = (r, err) => { if (settled) return; settled = true; clearTimeout(timer); pending = false; updateButtons(); done(r, err); };
  const timer = setTimeout(() => finish(null, 'timeout'), 8000);
  socket.emit(ev, payload, (r) => finish(r || { ok: false, error: 'The server sent an empty reply.' }));
}
const TIMEOUT_MSG = 'The server took too long to answer. Check your connection and try again.';

socket.on('connect', () => {
  myId = socket.id; attempts = 0;
  if (lostWhileInRoom) { lostWhileInRoom = false; resetToHome('The connection dropped, so you left the case. Join a server again to continue.'); }
  socket.emit('browse');
  if (hadConnection) { banner('ok', 'Back online.'); bannerOff(2200); } else bannerOff(0);
  hadConnection = true; updateButtons();
});
socket.on('disconnect', (reason) => {
  if (reason === 'io client disconnect') return;
  if (mode !== 'home') lostWhileInRoom = true;
  pending = false;
  banner('warn', 'Connection lost. Trying to reconnect…');
  $('#roomList').innerHTML = '<em>Server list unavailable while offline.</em>';
  updateButtons();
});
socket.on('connect_error', () => {
  attempts++;
  const bad = attempts >= 4;
  banner(bad ? 'bad' : 'warn', hadConnection ? `Reconnecting… (attempt ${attempts})` : `Can't reach the server. Retrying… (attempt ${attempts})`, bad);
  updateButtons();
});
netRetry.onclick = () => { banner('warn', 'Trying to connect…'); socket.connect(); };
addEventListener('offline', () => banner('bad', "You're offline. The game reconnects automatically when your network is back."));
addEventListener('online', () => { if (!socket.connected) { banner('warn', 'Network is back. Reconnecting…'); socket.connect(); } });

$('#createBtn').onclick = () => {
  const name = getName(); if (!name) return;
  request('create', { name, roomName: $('#roomName').value, isPrivate: $('#isPrivate').checked }, (r, err) => {
    if (err) return ($('#homeError').textContent = TIMEOUT_MSG);
    if (!r.ok) return ($('#homeError').textContent = r.error);
    myId = r.id;
  });
};
function joinCode(code) {
  const name = getName(); if (!name) return;
  if (!code) return ($('#homeError').textContent = 'Enter an invite code first.');
  request('join', { name, code }, (r, err) => {
    if (err) return ($('#homeError').textContent = TIMEOUT_MSG);
    if (!r.ok) return ($('#homeError').textContent = r.error);
    myId = r.id;
    history.replaceState(null, '', location.pathname);
  });
}
$('#joinBtn').onclick = () => joinCode($('#joinCode').value.trim());
$('#leaveBtn').onclick = () => { socket.emit('leave'); room = null; setScreen('home'); socket.emit('browse'); };
$('#startBtn').onclick = () => { if (socket.connected) socket.emit('start'); };
$('#backBtn').onclick = () => { if (socket.connected) socket.emit('backToLobby'); };
$('#copyBtn').onclick = async () => {
  try { await navigator.clipboard.writeText($('#inviteLink').value); toast('Invite link copied'); }
  catch { $('#inviteLink').select(); toast('Press Ctrl+C to copy'); }
};

socket.on('rooms', (list) => {
  const el = $('#roomList');
  if (!list.length) { el.innerHTML = '<em>No public servers yet. Create one!</em>'; return; }
  el.innerHTML = '';
  for (const r of list) {
    const d = document.createElement('div'); d.className = 'item';
    const s = document.createElement('span'); s.textContent = `${r.name} (${r.count}/${r.max})`;
    const b = document.createElement('button'); b.textContent = 'Join'; b.onclick = () => joinCode(r.code);
    d.append(s, b); el.append(d);
  }
  updateButtons();
});

function renderLobby() {
  $('#lobbyName').textContent = room.name;
  $('#lobbyKind').textContent = room.isPrivate ? 'Private server · invite only' : 'Public server';
  $('#inviteLink').value = `${location.origin}/?room=${room.code}`;
  $('#lobbyCount').textContent = `(${room.players.length}/${room.max})`;
  const ul = $('#lobbyPlayers'); ul.innerHTML = '';
  for (const p of room.players) {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = p.skin;
    const nm = document.createElement('span'); nm.textContent = p.name + (p.id === room.hostId ? ' ★' : '') + (p.id === myId ? ' (you)' : '');
    li.append(dot, nm); ul.append(li);
  }
  const host = room.hostId === myId;
  show($('#startBtn'), host); show($('#waitMsg'), !host);
}

socket.on('lobby', (r) => {
  room = r;
  if (mode === 'playing' || mode === 'ended') {
    if (r.state === 'lobby') { clearWorldState(); round = null; setScreen('lobby'); }
  } else if (myId && r.players.some(p => p.id === myId)) {
    setScreen('lobby');
  }
  if (mode === 'lobby') renderLobby();
});

socket.on('left', (id) => { removeAvatar(id); });

socket.on('started', (d) => {
  clearWorldState(); loadMap(d.location.id); docs.clear();
  round = { endsAt: Date.now() + d.remaining, mystery: d.mystery, votes: {}, clues: d.clues };
  for (const p of d.players) addAvatar(p);
  applyRoundWorld(d);
  const mine = d.players.find(p => p.id === myId);
  if (mine) local = { x: mine.x, z: mine.z, ry: mine.ry, y: 0 };
  camYaw = 0; camera.position.set(local.x, 6, local.z + 8);
  for (const c of d.clues) addClueMarker(c);
  $('#caseLoc').textContent = d.location.name;
  $('#caseIntro').textContent = d.location.intro + ' ' + (d.mystery.briefing || '');
  $('#caseTitle').textContent = d.mystery.title;
  $('#evidence').innerHTML = '';
  $('#voteQ').textContent = d.mystery.question;
  renderVotes();
  setScreen('playing');
  toast('Search the grounds. Press E at the little tables to pick up letters, photos and tickets.');
});

socket.on('event', (ev) => { if (mode === 'playing') onEvent(ev); });
socket.on('npcSays', (d) => { if (mode === 'playing') showNpcSays(d); });
socket.on('npcHold', (d) => { if (mode === 'playing') applyHold(d); });
function sendHold(i, on) { if (socket.connected && mode === 'playing') socket.emit('talkHold', { npc: i, on }); }
function sendTalk(i, q) { if (socket.connected) socket.emit('talk', { npc: i, q }); else toast('Connection lost. Waiting to reconnect…'); }

socket.on('moved', (d) => {
  const a = avatars.get(d.id); if (!a) return;
  a.tx = d.x; a.tz = d.z; a.try = d.ry;
});

const docs = new Map();
const KIND = { letter: 'a letter', diary: 'a diary page', note: 'a scribbled note', photo: 'a photograph', receipt: 'a receipt', ticket: 'a ticket' };
socket.on('clueFound', (c) => {
  removeClueMarker(c.id);
  const cv = makeDoc(c); docs.set(c.id, { c, cv });
  const li = document.createElement('li');
  const th = document.createElement('canvas'); const k = 150 / cv.width; th.width = 150; th.height = Math.round(cv.height * k); th.getContext('2d').drawImage(cv, 0, 0, th.width, th.height);
  th.className = 'thumb'; th.title = 'Click to read';
  const b = document.createElement('b'); b.textContent = c.label + ': ' + (KIND[c.type] || 'evidence');
  const by = document.createElement('div'); by.className = 'by'; by.textContent = `found by ${c.by} · click to read`;
  li.append(th, b, by); li.onclick = () => openDoc(c.id); $('#evidence').append(li);
  if (c.byId === myId) openDoc(c.id); else toast(`${c.by} found ${KIND[c.type] || 'evidence'} at ${c.label}. Click it on the evidence board.`);
});
let viewing = false;
function openDoc(id) {
  const d = docs.get(id); if (!d) return;
  const box = $('#docCanvas'); box.innerHTML = ''; const cv = d.cv; cv.className = 'docimg'; box.append(cv);
  $('#docTitle').textContent = `${d.c.label}: ${KIND[d.c.type] || 'evidence'}`; show($('#docView'), true); viewing = true;
}
function closeDoc() { show($('#docView'), false); viewing = false; }
$('#docClose').onclick = closeDoc;
$('#docView').addEventListener('pointerdown', (e) => { if (e.target.id === 'docView') closeDoc(); });
addEventListener('keydown', (e) => { if (viewing && (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Enter')) { closeDoc(); e.preventDefault(); } });
socket.on('nothing', () => toast('Nothing to find here.'));

function renderVotes() {
  if (!round) return;
  const box = $('#voteOpts'); box.innerHTML = '';
  const total = room ? room.players.length : 1;
  round.mystery.options.forEach((opt, i) => {
    const names = Object.entries(round.votes).filter(([, v]) => v === i).map(([id]) => id);
    const b = document.createElement('button');
    b.textContent = `${opt}${names.length ? `  [${names.length}]` : ''}`;
    if (round.votes[myId] === i) b.classList.add('mine');
    b.onclick = () => { if (socket.connected) socket.emit('vote', i); else toast('Connection lost. Your vote was not sent.'); };
    box.append(b);
  });
  const counts = {}; Object.values(round.votes).forEach(v => counts[v] = (counts[v] || 0) + 1);
  const top = Math.max(0, ...Object.values(counts));
  $('#voteStatus').textContent = `Everyone must pick the same answer to submit. Best agreement: ${top}/${total}.`;
}
let rateId = null;
const authorToken = (() => { try { let t = localStorage.getItem('ma_author'); if (!t || t.length < 16) { t = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('ma_author', t); } return t; } catch (e) { return 'session-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); } })();
// promise version of an acknowledged emit, with a timeout
const ask = (ev, payload) => new Promise((res) => {
  if (!socket.connected) return res({ ok: false, errors: ["You're offline. Reconnect and try again."] });
  let done = false; const t = setTimeout(() => { if (!done) { done = true; res({ ok: false, errors: [TIMEOUT_MSG] }); } }, 8000);
  socket.emit(ev, payload, (r) => { if (done) return; done = true; clearTimeout(t); res(r || { ok: false, errors: ['The server sent an empty reply.'] }); });
});
$('#likeBtn').onclick = async () => { $('#likeBtn').disabled = true; const r = await ask('rateMystery', { id: rateId, token: authorToken }); toast(r.ok ? 'Thanks! Liked.' : (r.error || 'Could not like it.')); };
$('#reportBtn').onclick = async () => { if (!confirm('Report this mystery as offensive or broken?')) return; $('#reportBtn').disabled = true; const r = await ask('reportMystery', { id: rateId, token: authorToken }); toast(r.ok ? 'Reported. Thank you.' : (r.error || 'Could not report it.')); };
$('#createMysteryBtn').onclick = () => openCreator({
  save: (c) => ask('createMystery', { case: c, token: authorToken, author: ($('#name').value || '').trim() }),
  mine: async () => { const r = await ask('myMysteries', { token: authorToken }); return r.list || []; },
  remove: (id) => ask('deleteMystery', { id, token: authorToken })
});

socket.on('votes', (v) => { if (round) { round.votes = v; renderVotes(); } });

socket.on('ended', (d) => {
  if (!round) return;
  setScreen('ended');
  const win = d.correct;
  const t = $('#endTitle');
  t.textContent = win ? 'Case solved!' : (d.reason === 'time' ? 'Time ran out' : 'Wrong answer');
  t.className = win ? 'win' : 'lose';
  $('#endAnswer').textContent = `The answer: ${round.mystery.options[d.answer]}`;
  $('#endExplain').textContent = d.explanation;
  const ul = $('#endClues'); ul.innerHTML = '';
  for (const c of d.allClues) { const li = document.createElement('li'); li.textContent = `${c.label} (${KIND[c.type] || c.type}): ${c.body.replace(/\n/g, ' / ')}${c.sign ? ' ' + c.sign : ''}`; ul.append(li); }
  const cu = d.custom; show($('#endCredit'), !!cu); show($('#endRate'), !!cu);
  if (cu) { $('#endCredit').textContent = 'A player-made mystery by ' + cu.by + '.'; rateId = cu.id; $('#likeBtn').disabled = false; $('#reportBtn').disabled = false; }
  const host = room && room.hostId === myId;
  show($('#backBtn'), host); show($('#endWait'), !host);
  show($('#prompt'), false);
});

setScreen('home');
updateButtons();
if (netMissing) {
  LOAD.fail('Cannot reach the game server', 'The multiplayer client did not load. Make sure the server is running (npm start), then reload the page.');
} else {
  LOAD.set(86, 'Warming up the lanterns…'); composer.render(); await tick();   // compile the shaders now instead of at the first click
  LOAD.set(92, 'Connecting to the server…');
  const online = await new Promise((res) => { if (socket.connected) return res(true); socket.once('connect', () => res(true)); setTimeout(() => res(false), 7000); });
  if (!online) banner('warn', "Can't reach the server yet. Still trying…");
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fonts are optional */ }
  LOAD.done();
}
