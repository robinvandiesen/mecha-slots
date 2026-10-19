import * as THREE from 'three';
import type { EnemyType, MechType } from './data';
import { ENEMY_HOVER } from './dims';

// Low-poly 3D models built from boxes and cylinders. Model space: +x is forward,
// +y is up, +z is the side facing the camera. Each model keeps handles to its
// moving parts so the scene can animate it.

interface Pal {
  white: string;
  whiteS: string;
  main: string;
  mainS: string;
  acc: string;
  trim: string;
  eye: string;
  frame: string;
  frameS: string;
}

const FRAME = '#454c5c';
const FRAME_S = '#2b303b';

const MECH_PAL: Record<MechType, Pal> = {
  gunner: { white: '#eef1f6', whiteS: '#a9b4c6', main: '#2f5fe0', mainS: '#1c3a94', acc: '#dc3540', trim: '#ffd23f', eye: '#6dffb8', frame: FRAME, frameS: FRAME_S },
  lancer: { white: '#eef1f6', whiteS: '#a9b4c6', main: '#e2364a', mainS: '#94202f', acc: '#2f5fe0', trim: '#ffd23f', eye: '#6dffb8', frame: FRAME, frameS: FRAME_S },
  artillery: { white: '#eef1f6', whiteS: '#a9b4c6', main: '#ff9a1f', mainS: '#b0620c', acc: FRAME, trim: '#ffe066', eye: '#6dffb8', frame: FRAME, frameS: FRAME_S },
  bulwark: { white: '#eef1f6', whiteS: '#a9b4c6', main: '#3aa65a', mainS: '#246a3a', acc: '#dc3540', trim: '#ffd23f', eye: '#7df4ff', frame: FRAME, frameS: FRAME_S },
};
const ACE_RED: Pal = { white: '#f0687a', whiteS: '#a8344a', main: '#8e1d2e', mainS: '#5a1020', acc: '#2b2b38', trim: '#ffd23f', eye: '#ffef5c', frame: FRAME, frameS: FRAME_S };
const ACE_BLACK: Pal = { white: '#4a4d62', whiteS: '#2c2e3a', main: '#1e1f29', mainS: '#121219', acc: '#ffd23f', trim: '#ffd23f', eye: '#ff3b6b', frame: FRAME, frameS: FRAME_S };
const ACE_PAL: Record<MechType, Pal> = { gunner: ACE_RED, lancer: ACE_BLACK, artillery: ACE_RED, bulwark: ACE_BLACK };

const GRUNT_PAL: Pal = { white: '#6f9a55', whiteS: '#46663a', main: '#3c5a32', mainS: '#26391f', acc: '#58663f', trim: '#d8bf5a', eye: '#ff3b7f', frame: '#3a3f4a', frameS: '#23262e' };
const HEAVY_PAL: Pal = { white: '#7a56b0', whiteS: '#4e3778', main: '#33264f', mainS: '#1e1632', acc: '#4a4560', trim: '#e0c860', eye: '#ff3b7f', frame: '#3a3f4a', frameS: '#23262e' };
const SNIPER_PAL: Pal = { white: '#5f7896', whiteS: '#3c4e66', main: '#2c3a50', mainS: '#1a2433', acc: '#465264', trim: '#d8bf5a', eye: '#ff3b7f', frame: '#3a3f4a', frameS: '#23262e' };
const SHIELD_PAL: Pal = { white: '#b59a62', whiteS: '#7d6a40', main: '#5c4c2c', mainS: '#3a301b', acc: '#6a5a3a', trim: '#e0c860', eye: '#ff3b7f', frame: '#3a3f4a', frameS: '#23262e' };
const TITAN_PAL: Pal = { white: '#c0485e', whiteS: '#86283c', main: '#7a2236', mainS: '#4a1322', acc: '#5a2a36', trim: '#ff9d2f', eye: '#ffef5c', frame: '#3a3f4a', frameS: '#23262e' };

export const BEAM_PINK = '#ff5ad8';
const WING = '#5fe3ff';

// ---------- Shared geometry and glow materials ----------

const boxCache = new Map<string, THREE.BoxGeometry>();
function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `${w}:${h}:${d}`;
  let g = boxCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    boxCache.set(key, g);
  }
  return g;
}

const cylCache = new Map<string, THREE.CylinderGeometry>();
function cylGeo(rTop: number, rBot: number, len: number, seg = 8): THREE.CylinderGeometry {
  const key = `${rTop}:${rBot}:${len}:${seg}`;
  let g = cylCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rTop, rBot, len, seg);
    cylCache.set(key, g);
  }
  return g;
}

const glowCache = new Map<string, THREE.MeshBasicMaterial>();
/** Unlit, bright material that the bloom pass picks up. */
export function glowMat(color: string, opacity = 1): THREE.MeshBasicMaterial {
  const key = `${color}:${opacity}`;
  let m = glowCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), toneMapped: false, transparent: opacity < 1, opacity });
    glowCache.set(key, m);
  }
  return m;
}

/** Per-model material set, so each model can flash white or fade independently. */
class Kit {
  readonly mats: THREE.MeshStandardMaterial[] = [];
  private byColor = new Map<string, THREE.MeshStandardMaterial>();

  mat(color: string): THREE.MeshStandardMaterial {
    let m = this.byColor.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, flatShading: true });
      m.userData.base = new THREE.Color(color);
      this.byColor.set(color, m);
      this.mats.push(m);
    }
    return m;
  }

  box(parent: THREE.Object3D, w: number, h: number, d: number, color: string, x: number, y: number, z: number, rot?: [number, number, number]): THREE.Mesh {
    const mesh = new THREE.Mesh(boxGeo(w, h, d), this.mat(color));
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  cyl(parent: THREE.Object3D, rTop: number, rBot: number, len: number, color: string, x: number, y: number, z: number, rot?: [number, number, number]): THREE.Mesh {
    const mesh = new THREE.Mesh(cylGeo(rTop, rBot, len), this.mat(color));
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  glow(parent: THREE.Object3D, w: number, h: number, d: number, color: string, x: number, y: number, z: number, rot?: [number, number, number]): THREE.Mesh {
    const mesh = new THREE.Mesh(boxGeo(w, h, d), glowMat(color));
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(mesh);
    return mesh;
  }

  glowCyl(parent: THREE.Object3D, r: number, len: number, color: string, x: number, y: number, z: number, rot?: [number, number, number]): THREE.Mesh {
    const mesh = new THREE.Mesh(cylGeo(r, r, len, 6), glowMat(color));
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(mesh);
    return mesh;
  }
}

/** Rotation that turns a cylinder (built along y) to point along +x. */
const ALONG_X: [number, number, number] = [0, 0, -Math.PI / 2];

// ---------- Model handles ----------

export interface Model {
  root: THREE.Group;
  /** Everything above the legs; bobs and tips over when wrecked. */
  body: THREE.Group;
  legs: THREE.Group[];
  /** Arm (with weapon) on the camera side: recoils and swings. */
  arm: THREE.Group | null;
  eye: THREE.Object3D | null;
  flames: THREE.Object3D[];
  blink: THREE.Object3D | null;
  mats: THREE.MeshStandardMaterial[];
  height: number;
}

function emptyModel(kit: Kit, height: number): Model {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  return { root, body, legs: [], arm: null, eye: null, flames: [], blink: null, mats: kit.mats, height };
}

// ---------- Humanoid suits ----------

type Head = 'vfin' | 'goggle' | 'mono';

interface SuitOpts {
  head: Head;
  bulky?: boolean;
  tier?: number;
  noBackpackSabres?: boolean;
}

function buildSuit(kit: Kit, pal: Pal, o: SuitOpts): Model {
  const model = emptyModel(kit, 50);
  const { root, body } = model;
  const b = o.bulky ? 1.15 : 1;

  for (const side of [1, -1]) {
    const leg = new THREE.Group();
    leg.position.set(0, 22, 5.5 * side * b);
    kit.box(leg, 6, 10, 6, pal.frame, 0, -5, 0);
    kit.box(leg, 7 * b, 4, 7 * b, pal.white, 0.5, -11, 0);
    kit.box(leg, 8 * b, 11, 7 * b, side > 0 ? pal.white : pal.whiteS, 0.5, -16, 0);
    kit.box(leg, 1, 6, 4, pal.main, 4.6 * b, -16, 0);
    kit.box(leg, 12 * b, 4, 8 * b, pal.acc, 1.5, -20, 0);
    root.add(leg);
    model.legs.push(leg);
  }

  kit.box(body, 12 * b, 5, 16 * b, pal.white, 0, 24, 0);
  kit.box(body, 5, 6, 6, pal.acc, 3.5, 23, 0);
  kit.box(body, 1, 2, 2, pal.trim, 6.2, 24, 0);
  for (const side of [1, -1]) kit.box(body, 2, 6, 6, pal.white, 6 * b, 21.5, 5 * side * b);
  kit.box(body, 9, 4, 12 * b, pal.acc, 0.5, 28.5, 0);
  kit.box(body, 13 * b, 10, 18 * b, pal.main, 0, 35, 0);
  kit.box(body, 9, 2, 12 * b, pal.white, 0, 40.5, 0);
  for (const side of [1, -1]) {
    kit.box(body, 1, 1.4, 4, pal.trim, 6.6 * b, 36.5, 5 * side);
    kit.box(body, 1, 1.4, 4, pal.trim, 6.6 * b, 34, 5 * side);
  }

  // Backpack with thrusters (flames show while moving).
  kit.box(body, 6, 11, 12 * b, pal.white, -9.5 * b, 35, 0);
  for (const side of [1, -1]) {
    kit.cyl(body, 1.6, 2.2, 4, pal.frame, -12 * b, 28.5, 4 * side);
    const flame = new THREE.Mesh(cylGeo(0.2, 1.8, 7, 6), glowMat(WING));
    flame.position.set(-12 * b, 23, 4 * side);
    flame.visible = false;
    body.add(flame);
    model.flames.push(flame);
    if (!o.noBackpackSabres) kit.box(body, 1.4, 5, 1.4, pal.white, -10 * b, 42.5, 4 * side);
  }
  if ((o.tier ?? 1) >= 2) {
    for (const side of [1, -1]) {
      kit.box(body, 2, 12, 2, pal.white, -13 * b, 44, 6 * side, [0.3 * side, 0, 0.3]);
      kit.box(body, 2, 6, 2, pal.main, -15 * b, 49, 8 * side, [0.3 * side, 0, 0.3]);
    }
  }

  // Head.
  const head = new THREE.Group();
  head.position.set(0, 43, 0);
  body.add(head);
  kit.box(head, 3, 2, 3, pal.frame, 0, 0, 0);
  if (o.head === 'mono') {
    kit.box(head, 9, 7, 9, pal.white, 0, 4.5, 0);
    kit.box(head, 6, 1.5, 7, pal.white, -0.5, 8.5, 0);
    kit.box(head, 1, 2.2, 7.4, pal.frameS, 4.5, 4.4, 0);
    model.eye = kit.glow(head, 0.6, 1.8, 1.8, pal.eye, 5.1, 4.4, 0);
    kit.box(head, 4, 1.4, 1.4, pal.frameS, 2.5, 1.5, 3, [0, 0.4, 0]);
  } else {
    kit.box(head, 8, 7, 8, pal.white, 0, 4.5, 0);
    if (o.head === 'goggle') {
      kit.glow(head, 0.6, 2, 6.4, pal.eye, 4.3, 4.6, 0);
      kit.box(head, 0.6, 5, 0.6, pal.whiteS, -2, 10, 2.5);
    } else {
      kit.box(head, 1, 3.4, 5.4, pal.frame, 4.3, 4, 0);
      for (const side of [1, -1]) kit.glow(head, 0.6, 1, 1.4, pal.eye, 4.9, 4.7, 1.4 * side);
      kit.box(head, 1.2, 1, 3, pal.acc, 4.4, 2, 0);
      kit.box(head, 3, 1.5, 1.5, pal.acc, 3, 8.4, 0);
      // V-fin.
      for (const side of [1, -1]) kit.box(head, 1, 7, 1, pal.trim, 3.6, 10.5, 2.4 * side, [0.65 * side, 0, 0]);
    }
  }

  // Shoulders and arms.
  for (const side of [1, -1]) {
    kit.box(body, 10 * b, 9, 9, side > 0 ? pal.white : pal.whiteS, 0, 39, 13 * side * b);
    if ((o.tier ?? 1) >= 2) kit.box(body, 10.2 * b, 1.5, 9.2, pal.main, 0, 40, 13 * side * b);
    const arm = new THREE.Group();
    arm.position.set(0, 38, 13 * side * b);
    kit.box(arm, 5, 8, 5, pal.frame, 0, -6, 0);
    kit.box(arm, 7, 8, 7, pal.white, 1, -12, 0);
    kit.box(arm, 4, 4, 4, pal.frame, 3, -17, 0);
    body.add(arm);
    if (side > 0) model.arm = arm;
    else arm.name = 'farArm';
  }
  return model;
}

function farArm(model: Model): THREE.Object3D {
  return model.body.getObjectByName('farArm')!;
}

function energyWings(kit: Kit, body: THREE.Object3D): void {
  for (const side of [1, -1]) {
    for (let k = 0; k < 3; k++) kit.glow(body, 1, 22 - k * 3, 3, k === 0 ? '#e3fbff' : WING, -15 - k * 2, 46 + k, (10 + k * 5) * side, [0.9 * side - k * 0.25 * side, 0, 0.5]);
  }
}

function fullArmourParts(kit: Kit, pal: Pal, model: Model): void {
  const { body } = model;
  kit.box(body, 14, 6, 20, pal.white, 0.5, 36, 0);
  kit.box(body, 1, 3, 18, pal.main, 7.6, 36, 0);
  for (const side of [1, -1]) {
    kit.box(body, 12, 11, 11, pal.white, 0, 40, 14 * side);
    kit.box(body, 6, 12, 5, pal.main, -12, 38, 9 * side);
    kit.glow(body, 0.4, 1, 1, '#dc3540', -9, 41, 9 * side);
  }
  for (const leg of model.legs) kit.box(leg, 9, 9, 8.5, pal.white, 1, -14, 0);
}

export function buildMech(type: MechType, tier: number, mk2: string | null, mk3: string | null): Model {
  const kit = new Kit();
  const pal = mk3 === 'ace' ? ACE_PAL[type] : MECH_PAL[type];
  let model: Model;

  if (type === 'artillery') {
    model = emptyModel(kit, 50);
    const { body } = model;
    for (const side of [1, -1]) {
      kit.box(body, 30, 8, 7, pal.frameS, 0, 4, 9 * side);
      kit.box(body, 30, 1.5, 7.2, pal.frame, 0, 8, 9 * side);
      for (let k = 0; k < 5; k++) kit.cyl(body, 2.5, 2.5, 7.4, '#6a7385', -11 + k * 5.5, 3.5, 9 * side, [Math.PI / 2, 0, 0]);
    }
    if (tier >= 2) kit.box(body, 31, 2, 26, pal.main, 0, 9.5, 0);
    kit.box(body, 22, 8, 18, pal.main, 0, 13, 0);
    kit.box(body, 14, 12, 14, pal.white, -2, 23, 0);
    kit.box(body, 1, 5, 6, pal.main, 5.2, 23, 0);
    kit.box(body, 9, 6, 8, pal.white, 2, 32, 0);
    kit.glow(body, 0.6, 1.6, 5, pal.eye, 6.6, 32.5, 0);
    const thick = mk2 === 'cluster' ? 3 : 2;
    for (const side of [1, -1]) {
      kit.box(body, 7, 7, 5, pal.mainS, -4, 30, 8 * side);
      const barrel = new THREE.Group();
      barrel.position.set(-4, 30, 8 * side);
      barrel.rotation.z = -0.6;
      kit.cyl(barrel, thick, thick, 32, side > 0 ? pal.frame : pal.frameS, 0, 16, 0);
      kit.cyl(barrel, thick + 0.8, thick + 0.8, 3, pal.frameS, 0, 31, 0);
      if (mk2 === 'railgun') for (let k = 0; k < 4; k++) kit.glowCyl(barrel, thick + 0.5, 1, '#7df4ff', 0, 8 + k * 6, 0);
      body.add(barrel);
      if (side > 0) model.arm = barrel;
    }
    kit.box(body, 9, 6, 5, pal.frame, 4, 22, 9.5);
    for (let k = 0; k < 3; k++) kit.glow(body, 0.5, 1.2, 1.2, '#dc3540', 8.6, 22, 8 + k * 1.6);
    if (mk2 === 'missiles') {
      kit.box(body, 9, 12, 14, pal.main, -11, 30, 0);
      for (const [y, z] of [[33, -3], [33, 3], [28, -3], [28, 3]]) kit.glow(body, 0.6, 2, 2, '#dc3540', -6.4, y, z);
    }
    if (mk3 === 'fullarmour') {
      kit.box(body, 32, 4, 27, pal.white, 0, 11, 0);
      kit.box(body, 8, 6, 15, pal.white, -2, 27, 0);
    }
  } else {
    model = buildSuit(kit, pal, { head: type === 'bulwark' ? 'goggle' : 'vfin', bulky: type === 'bulwark', tier, noBackpackSabres: type === 'lancer' && mk2 === 'twinsabre' });
    const arm = model.arm!;
    const far = farArm(model);

    if (type === 'gunner') {
      // Beam rifle in the near hand, shield on the far arm.
      kit.box(arm, 22, 3, 3, pal.frame, 11, -12, 2.5);
      kit.box(arm, 5, 2, 2, pal.frameS, 7, -9.5, 2.5);
      kit.glow(arm, 0.5, 1, 1, pal.eye, 9.6, -9.5, 2.5);
      kit.box(arm, 2, 4, 2, pal.frame, 4, -15, 2.5);
      kit.box(far, 3, 18, 11, pal.acc, 3, -12, -5);
      kit.box(far, 3.2, 1.2, 11.2, pal.white, 3, -3, -5);
      kit.box(far, 3.4, 8, 1, pal.trim, 3, -12, -5);
      kit.box(far, 3.4, 1, 6, pal.trim, 3, -10, -5);
      if (mk2 === 'sniper') {
        kit.box(arm, 14, 1.6, 1.6, pal.frame, 28, -12, 2.5);
        kit.box(arm, 8, 3, 3, pal.frameS, 8, -8, 2.5);
      }
      if (mk2 === 'assault') {
        kit.box(far, 20, 3, 3, pal.frame, 11, -14, -1);
        kit.cyl(far, 2, 2, 3, pal.frameS, 6, -17, -1, [Math.PI / 2, 0, 0]);
      }
      if (mk2 === 'bazooka') {
        kit.cyl(model.body, 2.6, 2.6, 26, '#5a6273', 4, 46, 13, ALONG_X);
        kit.cyl(model.body, 3.2, 3.2, 3, FRAME_S, 16, 46, 13, ALONG_X);
      }
    } else if (type === 'lancer') {
      kit.box(arm, 2, 2, 4, pal.white, 4, -17, 1);
      if (mk2 === 'beamaxe') {
        kit.glowCyl(arm, 1, 14, BEAM_PINK, 11, -17, 1, ALONG_X);
        kit.glow(arm, 4, 12, 1.2, BEAM_PINK, 18, -17, 1);
      } else kit.glowCyl(arm, 1.1, 26, BEAM_PINK, 17, -17, 1, ALONG_X);
      if (mk2 === 'twinsabre') {
        kit.box(far, 2, 2, 4, pal.white, 4, -17, -1);
        kit.glowCyl(far, 1.1, 24, BEAM_PINK, 16, -17, -1, ALONG_X);
      }
      if (mk2 === 'interceptor') {
        for (const side of [1, -1]) {
          kit.box(model.body, 4, 20, 3, pal.main, -15, 42, 7 * side, [0.5 * side, 0, 0.4]);
          kit.box(model.body, 3, 14, 2.5, pal.white, -18, 40, 10 * side, [0.7 * side, 0, 0.5]);
        }
      }
    } else {
      // Bulwark: tower shield in front with a short gun poking past it.
      const big = mk2 === 'guardian';
      const sh = big ? 46 : 38;
      const sw = big ? 26 : 20;
      kit.box(model.body, 3, sh, sw, pal.main, 13, sh / 2 + 2, 3);
      kit.box(model.body, 3.2, sh, 1.2, pal.white, 13, sh / 2 + 2, 3 + sw / 2);
      kit.box(model.body, 3.2, 1.2, sw, pal.white, 13, sh + 2, 3);
      kit.box(model.body, 3.4, 10, 1.4, pal.trim, 13, sh / 2 + 4, 3);
      kit.box(model.body, 3.4, 1.4, 6, pal.trim, 13, sh / 2 + 6, 3);
      kit.box(arm, 9, 2.5, 2.5, pal.frame, 9, -12, 3);
      if (mk2 === 'commander') {
        kit.box(model.body, 0.8, 12, 0.8, pal.whiteS, -2, 55, 3);
        kit.box(model.body, 4, 0.8, 0.8, pal.acc, -2, 58, 3);
        kit.glow(model.body, 0.8, 0.8, 0.8, '#ff3b6b', -2, 61.4, 3);
      }
      if (mk2 === 'fortress') {
        for (const side of [1, -1]) kit.box(model.body, 13, 12, 12, pal.white, 0, 40, 15 * side);
        for (const leg of model.legs) kit.box(leg, 10, 9, 9, pal.white, 1, -14, 0);
      }
    }
    if (mk3 === 'fullarmour') fullArmourParts(kit, pal, model);
  }

  if (mk3 === 'awakened') energyWings(kit, model.body);
  model.root.scale.setScalar(1 + 0.1 * (tier - 1));
  return model;
}

// ---------- Enemies ----------

function buildSoldier(kind: 'grunt' | 'sniper' | 'shield' | 'heavy'): Model {
  const kit = new Kit();
  const pal = { grunt: GRUNT_PAL, sniper: SNIPER_PAL, shield: SHIELD_PAL, heavy: HEAVY_PAL }[kind];
  const model = buildSuit(kit, pal, { head: 'mono', bulky: kind === 'shield' || kind === 'heavy', noBackpackSabres: true });
  const arm = model.arm!;
  const far = farArm(model);
  const b = kind === 'shield' || kind === 'heavy' ? 1.15 : 1;

  // Spiked shoulder on the near side, shield plate on the far side.
  if (kind !== 'sniper') for (let k = 0; k < 3; k++) kit.cyl(model.body, 0, 1.4, 4, pal.trim, -3 + k * 3, 45, 13 * b, [0, 0, 0]);
  kit.box(model.body, 11, 3, 10, pal.white, 0, 44, -14 * b, [0.3, 0, 0]);

  if (kind === 'grunt') {
    kit.box(arm, 16, 3, 3, pal.frame, 8, -12, 2.5);
    kit.cyl(arm, 2.4, 2.4, 3, pal.frameS, 6, -15.5, 2.5, [Math.PI / 2, 0, 0]);
  } else if (kind === 'sniper') {
    kit.box(arm, 30, 2, 2, pal.frame, 14, -12, 2.5);
    kit.box(arm, 7, 3, 3, pal.frameS, 7, -9, 2.5);
    kit.glow(arm, 0.5, 1, 1, pal.eye, 10.6, -9, 2.5);
    kit.box(model.body, 0.8, 12, 0.8, pal.whiteS, -6, 52, -3);
  } else if (kind === 'shield') {
    kit.box(model.body, 3, 38, 22, '#6a7385', 13, 21, 3);
    kit.box(model.body, 3.2, 38, 1.4, '#9aa4b5', 13, 21, 14);
    kit.box(model.body, 3.4, 8, 6, pal.trim, 13, 26, 3);
    kit.box(arm, 8, 2.5, 2.5, pal.frame, 6, -12, 3);
  } else {
    // Heavy: heat sword held up, swung on attack.
    kit.box(arm, 2, 4, 2, pal.frame, 4, -18, 1);
    kit.glow(arm, 2.6, 24, 1.2, '#ff7a2f', 4, -5, 1);
    kit.glow(arm, 1, 22, 0.6, '#ffd8a0', 4.6, -5, 1.2);
    kit.box(far, 4, 4, 4, pal.frame, 3, -17, 0);
  }
  model.height = kind === 'heavy' ? 62 : kind === 'shield' ? 54 : 50;
  if (kind === 'heavy') model.root.scale.setScalar(1.2);
  return model;
}

function buildDrone(): Model {
  const kit = new Kit();
  const pal = GRUNT_PAL;
  const model = emptyModel(kit, 34);
  const { body } = model;
  kit.box(body, 12, 9, 12, pal.white, 0, 0, 0);
  kit.box(body, 8, 3, 8, pal.main, -1, 5.5, 0);
  kit.box(body, 1, 3, 6, pal.frameS, 6, 0, 0);
  model.eye = kit.glow(body, 0.6, 2, 2, pal.eye, 6.6, 0, 0);
  for (const side of [1, -1]) kit.box(body, 3, 2, 10, pal.frame, -2, -5, 6 * side);
  const flame = kit.glow(body, 4, 1, 4, '#ffb347', -7, 0, 0);
  model.flames.push(flame);
  body.position.y = ENEMY_HOVER.drone;
  return model;
}

function buildBomber(): Model {
  const kit = new Kit();
  const model = emptyModel(kit, 26);
  const { body } = model;
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(7, 0), kit.mat('#b8323f'));
  shell.castShadow = true;
  body.add(shell);
  for (const [x, y, z] of [[7, 0, 0], [-7, 0, 0], [0, 7, 0], [0, -7, 0], [0, 0, 7], [0, 0, -7]]) {
    const spike = kit.cyl(body, 0, 1.6, 4, '#3a3f4a', x, y, z);
    spike.lookAt(new THREE.Vector3(x * 2, y * 2, z * 2));
    spike.rotateX(Math.PI / 2);
  }
  kit.glow(body, 1, 2, 2, '#ff3b7f', 6.8, 1, 0);
  model.blink = kit.glow(body, 1.4, 1.4, 1.4, '#ffef5c', 0, 8.5, 0);
  body.position.y = ENEMY_HOVER.bomber + 7;
  return model;
}

function buildJet(): Model {
  const kit = new Kit();
  const pal = GRUNT_PAL;
  const model = emptyModel(kit, 52);
  const { body } = model;
  kit.box(body, 30, 5, 6, pal.white, 0, 0, 0);
  kit.cyl(body, 0, 3, 8, pal.white, 19, 0, 0, ALONG_X);
  kit.glow(body, 6, 2, 3.4, pal.eye, 6, 3, 0);
  kit.box(body, 10, 1, 34, pal.main, -3, -1, 0, [0, 0.35, 0]);
  kit.box(body, 6, 7, 1, pal.main, -12, 4, 0, [0, 0, 0.4]);
  kit.box(body, 5, 1, 12, pal.mainS, -13, 1, 0);
  model.flames.push(kit.glow(body, 5, 2.6, 3.4, '#ffb347', -17, 0, 0));
  body.position.y = ENEMY_HOVER.jet;
  return model;
}

function buildMedic(): Model {
  const kit = new Kit();
  const model = emptyModel(kit, 28);
  const { body } = model;
  for (const side of [1, -1]) kit.box(body, 26, 6, 6, '#23262e', 0, 3, 8 * side);
  kit.box(body, 22, 10, 16, '#d8d2b8', 0, 11, 0);
  kit.box(body, 10, 5, 10, '#d8d2b8', -3, 18.5, 0);
  kit.glow(body, 1, 7, 2.4, '#6dffb8', 11.2, 12, 0);
  kit.glow(body, 1, 2.4, 7, '#6dffb8', 11.2, 12, 0);
  kit.glow(body, 2.4, 0.6, 7, '#6dffb8', 0, 16.4, 0);
  kit.glow(body, 2.4, 0.6, 7, '#6dffb8', 0, 16.4, 0, [0, Math.PI / 2, 0]);
  kit.box(body, 2, 14, 2, '#3a3f4a', 5, 22, 5, [0, 0, -0.3]);
  kit.box(body, 10, 2, 2, '#3a3f4a', 11, 28, 5);
  model.eye = kit.glow(body, 0.6, 1.6, 1.6, '#ff3b7f', 11.2, 7, 0);
  return model;
}

function buildTitan(): Model {
  const kit = new Kit();
  const pal = TITAN_PAL;
  const model = emptyModel(kit, 74);
  const { root, body } = model;
  for (let k = 0; k < 4; k++) {
    for (const side of [1, -1]) {
      const leg = new THREE.Group();
      leg.position.set(-22 + k * 14, 26, 16 * side);
      kit.box(leg, 6, 18, 6, pal.frame, 0, -9, 4 * side, [0.35 * side, 0, 0]);
      kit.box(leg, 10, 6, 10, pal.acc, 0, -22, 8 * side);
      root.add(leg);
      model.legs.push(leg);
    }
  }
  kit.box(body, 56, 20, 40, pal.main, 0, 36, 0);
  kit.box(body, 46, 8, 32, pal.main, -2, 50, 0);
  kit.box(body, 30, 6, 22, pal.white, -2, 57, 0);
  kit.box(body, 56.4, 3, 40.4, pal.mainS, 0, 26, 0);
  for (let k = 0; k < 4; k++) kit.glow(body, 4, 2, 2, pal.trim, -14 + k * 8, 54.5, 16.2);
  kit.box(body, 2, 8, 20, pal.frameS, 28.2, 40, 0);
  model.eye = kit.glow(body, 1, 5, 5, pal.eye, 29.4, 40, 0);
  for (const side of [1, -1]) {
    kit.box(body, 14, 5, 5, pal.frame, 33, 30, 12 * side);
    kit.box(body, 5, 9, 5, pal.trim, 41, 30, 12 * side);
  }
  kit.cyl(body, 3, 3, 20, pal.frame, -20, 62, 0, ALONG_X);
  return model;
}

export function buildEnemy(type: EnemyType): Model {
  switch (type) {
    case 'crawler':
      return buildSoldier('grunt');
    case 'sniper':
      return buildSoldier('sniper');
    case 'shield':
      return buildSoldier('shield');
    case 'brute':
      return buildSoldier('heavy');
    case 'drone':
      return buildDrone();
    case 'bomber':
      return buildBomber();
    case 'jet':
      return buildJet();
    case 'medic':
      return buildMedic();
    case 'titan':
      return buildTitan();
  }
}

// ---------- Animation helpers ----------

/** Tints every lit material: white for hit flashes, dark for wrecks, faded for ghosts. */
export function tint(model: Model, flash: number, dark: boolean, opacity: number): void {
  for (const m of model.mats) {
    m.emissive.setScalar(flash > 0 ? 0.9 : 0);
    const base = m.userData.base as THREE.Color;
    if (dark) m.color.copy(base).multiplyScalar(0.3);
    else m.color.copy(base);
    const transparent = opacity < 1;
    if (m.transparent !== transparent) {
      m.transparent = transparent;
      m.needsUpdate = true;
    }
    m.opacity = opacity;
  }
}

/** Walk cycle: legs swing in opposite directions and the body bobs. */
export function walk(model: Model, t: number, amount: number): void {
  model.legs.forEach((leg, k) => {
    leg.rotation.z = Math.sin(t * 9 + k * Math.PI) * 0.55 * amount;
  });
  model.body.position.y = (model.body.userData.baseY ?? 0) + Math.abs(Math.sin(t * 9)) * 0.8 * amount;
}
