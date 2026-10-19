import type { EnemyType, MechType, SymbolId } from './data';
import type { EquipId } from './upgrades';

// Sprites are pixel art painted once into small offscreen canvases (1 unit = 1 pixel),
// given a dark outline, cached, and scaled up with nearest-neighbour when drawn.
// Coordinates are relative to the unit's feet (centre-bottom); x grows forward
// (right), y grows downward, so body parts use negative y. Enemies are painted
// facing right like the player's mechs and mirrored when drawn.

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

interface Sprite {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
}

interface Pal {
  white: string;
  whiteS: string;
  main: string;
  mainS: string;
  acc: string;
  accS: string;
  trim: string;
  eye: string;
  frame: string;
  frameS: string;
}

const FRAME = '#3e4554';
const FRAME_S = '#262b36';
const WHITE = '#eef1f6';
const WHITE_S = '#a9b4c6';
const BEAM = '#ff5ad8';
const BEAM_CORE = '#ffe3f8';
const WING = '#5fe3ff';
const WING_TIP = '#e3fbff';

const MECH_PAL: Record<MechType, Pal> = {
  gunner: { white: WHITE, whiteS: WHITE_S, main: '#2f5fe0', mainS: '#1c3a94', acc: '#dc3540', accS: '#8f1f27', trim: '#ffd23f', eye: '#6dffb8', frame: FRAME, frameS: FRAME_S },
  lancer: { white: WHITE, whiteS: WHITE_S, main: '#e2364a', mainS: '#94202f', acc: '#2f5fe0', accS: '#1c3a94', trim: '#ffd23f', eye: '#6dffb8', frame: FRAME, frameS: FRAME_S },
  artillery: { white: WHITE, whiteS: WHITE_S, main: '#ff9a1f', mainS: '#b0620c', acc: FRAME, accS: FRAME_S, trim: '#ffe066', eye: '#6dffb8', frame: FRAME, frameS: FRAME_S },
  bulwark: { white: WHITE, whiteS: WHITE_S, main: '#3aa65a', mainS: '#246a3a', acc: '#dc3540', accS: '#8f1f27', trim: '#ffd23f', eye: '#7df4ff', frame: FRAME, frameS: FRAME_S },
};

const GRUNT_PAL: Pal = { white: '#6f9a55', whiteS: '#46663a', main: '#3c5a32', mainS: '#26391f', acc: '#58663f', accS: '#353e26', trim: '#d8bf5a', eye: '#ff3b7f', frame: '#3a3f4a', frameS: '#23262e' };
const HEAVY_PAL: Pal = { white: '#7a56b0', whiteS: '#4e3778', main: '#33264f', mainS: '#1e1632', acc: '#4a4560', accS: '#2c2a3a', trim: '#e0c860', eye: '#ff3b7f', frame: '#3a3f4a', frameS: '#23262e' };
const TITAN_PAL: Pal = { white: '#c0485e', whiteS: '#86283c', main: '#7a2236', mainS: '#4a1322', acc: '#5a2a36', accS: '#341820', trim: '#ff9d2f', eye: '#ffef5c', frame: '#3a3f4a', frameS: '#23262e' };

const cache = new Map<string, Sprite>();

function cached(key: string, make: () => Sprite): Sprite {
  let s = cache.get(key);
  if (!s) {
    s = make();
    cache.set(key, s);
  }
  return s;
}

/** Paints a sprite, then outlines every opaque shape. `glow` is painted after the outline pass. */
function build(w: number, h: number, ax: number, ay: number, draw: (p: Px) => void, glow?: (p: Px) => void): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  const p: Px = (x, y, rw, rh, col) => {
    c.fillStyle = col;
    c.fillRect(ax + x, ay + y, rw, rh);
  };
  draw(p);
  outline(c, w, h);
  glow?.(p);
  return { canvas, ax, ay };
}

function outline(c: CanvasRenderingContext2D, w: number, h: number): void {
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  const edge: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push((y * w + x) * 4);
    }
  }
  for (const i of edge) {
    d[i] = 7;
    d[i + 1] = 9;
    d[i + 2] = 13;
    d[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
}

function whiteOf(s: Sprite): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = s.canvas.width;
  canvas.height = s.canvas.height;
  const c = canvas.getContext('2d')!;
  c.drawImage(s.canvas, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ax: s.ax, ay: s.ay };
}

function blit(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, scale: number, flip = false): void {
  const w = s.canvas.width * scale;
  const h = s.canvas.height * scale;
  const top = Math.round(y - s.ay * scale);
  if (!flip) {
    ctx.drawImage(s.canvas, Math.round(x - s.ax * scale), top, w, h);
    return;
  }
  ctx.save();
  ctx.translate(Math.round(x), 0);
  ctx.scale(-1, 1);
  ctx.drawImage(s.canvas, Math.round(-s.ax * scale), top, w, h);
  ctx.restore();
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- Humanoid body parts ----------

type Head = 'vfin' | 'goggle' | 'mono';

function leg(p: Px, pal: Pal, lx: number, back: boolean, lift: number, bulky: boolean): void {
  const W = back ? pal.whiteS : pal.white;
  const S = back ? pal.frame : pal.whiteS;
  const b = bulky ? 1 : 0;
  const y = -lift;
  p(lx - 1, -20, 5, 6 - lift, pal.frame);
  p(lx - 2 - b, y - 12, 7 + b * 2, 9, W);
  p(lx - 2 - b, y - 12, 2, 9, S);
  p(lx + 3 + b, y - 10, 1, 5, back ? pal.mainS : pal.main);
  p(lx - 1, y - 15, 6, 3, W);
  p(lx, y - 14, 4, 1, pal.frameS);
  p(lx - 3 - b, y - 3, 9 + b * 2, 3, back ? pal.accS : pal.acc);
  p(lx - 3 - b, y - 1, 9 + b * 2, 1, back ? pal.frameS : pal.accS);
}

function hips(p: Px, pal: Pal): void {
  p(-7, -22, 14, 3, pal.white);
  p(-7, -20, 14, 1, pal.whiteS);
  p(4, -22, 4, 6, pal.white);
  p(4, -17, 4, 1, pal.whiteS);
  p(-1, -22, 4, 4, pal.acc);
  p(0, -21, 2, 2, pal.trim);
}

function torso(p: Px, pal: Pal, bulky: boolean): void {
  const b = bulky ? 1 : 0;
  p(-7 - b, -31, 14 + b * 2, 9, pal.main);
  p(-7 - b, -31, 14 + b * 2, 1, pal.white);
  p(-7 - b, -24, 14 + b * 2, 2, pal.mainS);
  p(-4, -24, 8, 2, pal.acc);
  p(-3, -29, 4, 3, pal.mainS);
  p(3, -29, 4, 1, pal.trim);
  p(3, -27, 4, 1, pal.trim);
  p(-4, -33, 9, 2, pal.white);
}

function backpack(p: Px, pal: Pal, tier: number): void {
  if (tier >= 2) {
    p(-15, -39, 2, 9, pal.white);
    p(-17, -41, 2, 6, pal.main);
  }
  p(-12, -32, 5, 10, pal.white);
  p(-12, -24, 5, 2, pal.whiteS);
  p(-13, -25, 2, 3, pal.frame);
  p(-11, -36, 2, 4, pal.white);
  p(-8, -35, 1, 3, pal.whiteS);
}

function head(p: Px, pal: Pal, kind: Head, eyeShift = 0): void {
  p(-1, -34, 3, 2, pal.frame);
  if (kind === 'mono') {
    p(-3, -40, 9, 6, pal.white);
    p(-3, -40, 2, 6, pal.whiteS);
    p(-1, -41, 5, 1, pal.white);
    p(1, -38, 5, 2, pal.frameS);
    p(2 + eyeShift, -38, 2, 2, pal.eye);
    p(-1, -35, 6, 1, pal.frameS);
    return;
  }
  p(-3, -39, 8, 5, pal.white);
  p(-3, -39, 2, 5, pal.whiteS);
  if (kind === 'goggle') {
    p(1, -37, 4, 2, pal.frameS);
    p(2, -37, 3, 1, pal.eye);
    p(-2, -42, 1, 3, pal.whiteS);
    p(2, -35, 3, 1, pal.acc);
    return;
  }
  p(2, -37, 3, 3, pal.frame);
  p(3, -37, 2, 1, pal.eye);
  p(2, -35, 3, 1, pal.acc);
  p(0, -40, 3, 1, pal.acc);
  p(-1, -38, 1, 1, pal.trim);
  // V-fin: one prong sweeps back, one sweeps forward.
  p(0, -42, 2, 2, pal.trim);
  p(-2, -44, 2, 2, pal.trim);
  p(-3, -45, 1, 1, pal.trim);
  p(2, -43, 1, 1, pal.trim);
  p(3, -45, 1, 2, pal.trim);
  p(4, -46, 1, 1, pal.trim);
}

function shoulder(p: Px, pal: Pal, tier: number, spikes = false): void {
  p(-5, -35, 9, 7, pal.white);
  p(-5, -29, 9, 1, pal.whiteS);
  if (tier >= 2) p(-5, -33, 9, 1, pal.main);
  if (spikes) {
    p(-3, -37, 2, 2, pal.trim);
    p(0, -38, 2, 3, pal.trim);
    p(3, -37, 2, 2, pal.trim);
  }
}

function arm(p: Px, pal: Pal, reach = 0): void {
  p(-2, -28, 4, 4, pal.frame);
  p(-1 + reach, -25, 6, 4, pal.white);
  p(-1 + reach, -22, 6, 1, pal.whiteS);
  p(5 + reach, -25, 3, 3, pal.frame);
}

/** Energy wings for fully promoted (Mk-III) mechs. */
function wings(p: Px): void {
  for (let k = 0; k < 3; k++) {
    for (let j = 0; j < 9; j++) p(-11 - j, -30 - j + k * 4, 2, 2, j > 6 ? WING_TIP : WING);
  }
}

// ---------- Player mechs ----------

const MECH_W = 60;
const MECH_H = 56;
const MECH_AX = 24;
const MECH_AY = 53;

/** Weapon muzzle in sprite units, used by the game for projectile origins. */
export const MUZZLE: Record<MechType, { x: number; y: number }> = {
  gunner: { x: 21, y: -23 },
  lancer: { x: 20, y: -23 },
  artillery: { x: -1, y: -46 },
  bulwark: { x: 22, y: -25 },
};

export const MECH_HEIGHT = 46;

export function mechScale(tier: number, base = 1.45): number {
  return base * (1 + 0.1 * (tier - 1));
}

const ACE_RED: Pal = { white: '#f0687a', whiteS: '#a8344a', main: '#8e1d2e', mainS: '#5a1020', acc: '#2b2b38', accS: '#16161d', trim: '#ffd23f', eye: '#ffef5c', frame: FRAME, frameS: FRAME_S };
const ACE_BLACK: Pal = { white: '#4a4d62', whiteS: '#2c2e3a', main: '#1e1f29', mainS: '#121219', acc: '#ffd23f', accS: '#b8901a', trim: '#ffd23f', eye: '#ff3b6b', frame: FRAME, frameS: FRAME_S };
const ACE_PAL: Record<MechType, Pal> = { gunner: ACE_RED, lancer: ACE_BLACK, artillery: ACE_RED, bulwark: ACE_BLACK };

/** Bolt-on armour plates for the Full Armour Mk-III. */
function fullArmour(p: Px, pal: Pal, type: MechType): void {
  if (type === 'artillery') {
    p(-14, -12, 28, 4, pal.white);
    p(-14, -9, 28, 1, pal.whiteS);
    p(-8, -30, 6, 5, pal.white);
    return;
  }
  p(-8, -39, 12, 9, pal.white);
  p(-8, -39, 12, 1, '#ffffff');
  p(-8, -36, 12, 2, pal.main);
  p(-8, -31, 12, 1, pal.whiteS);
  p(0, -13, 7, 8, pal.white);
  p(0, -13, 7, 1, '#ffffff');
  p(0, -9, 7, 1, pal.main);
  p(-17, -38, 4, 11, pal.main);
  p(-17, -38, 4, 1, pal.white);
  p(-16, -36, 2, 1, '#dc3540');
  p(-16, -33, 2, 1, '#dc3540');
}

function mechSprite(type: MechType, tier: number, r: number, mk2: string | null, mk3: string | null): Sprite {
  const pal = mk3 === 'ace' ? ACE_PAL[type] : MECH_PAL[type];
  const winged = mk3 === 'awakened';
  return cached(`m:${type}:${tier}:${r}:${mk2}:${mk3}`, () => {
    switch (type) {
      case 'gunner':
        return build(MECH_W, MECH_H, MECH_AX, MECH_AY, (p) => {
          if (winged) wings(p);
          if (mk2 === 'bazooka') {
            p(-12, -43, 2, 6, pal.frameS);
          }
          p(-17, -31, 6, 15, pal.acc);
          p(-17, -31, 6, 1, pal.white);
          p(-15, -28, 1, 8, pal.trim);
          p(-17, -25, 5, 1, pal.trim);
          backpack(p, pal, tier);
          leg(p, pal, -4, true, 0, false);
          leg(p, pal, 1, false, 0, false);
          hips(p, pal);
          torso(p, pal, false);
          head(p, pal, 'vfin');
          shoulder(p, pal, tier);
          arm(p, pal);
          if (mk3 === 'fullarmour') fullArmour(p, pal, type);
          if (mk2 === 'assault') {
            p(1 - r, -21, 13, 2, pal.frame);
            p(14 - r, -21, 3, 1, pal.frame);
            p(5 - r, -19, 3, 3, pal.frameS);
          }
          p(2 - r, -25, 15, 3, pal.frame);
          p(2 - r, -25, 15, 1, '#5a6273');
          p(17 - r, -24, 4, 1, pal.frame);
          p(6 - r, -28, 5, 2, pal.frameS);
          p(10 - r, -28, 1, 1, pal.eye);
          p(5 - r, -22, 2, 3, pal.frame);
          if (mk2 === 'sniper') {
            p(21 - r, -24, 10, 1, pal.frame);
            p(29 - r, -25, 2, 3, pal.frameS);
            p(4 - r, -31, 8, 3, pal.frameS);
            p(11 - r, -30, 1, 1, pal.eye);
          }
          if (mk2 === 'bazooka') {
            p(-10, -42, 22, 4, '#5a6273');
            p(-10, -42, 22, 1, '#7d8798');
            p(12, -43, 2, 6, pal.frameS);
            p(2, -38, 3, 2, pal.frame);
          }
          if (tier >= 2 && mk2 !== 'bazooka') p(-9, -42, 3, 8, pal.frame);
        });
      case 'lancer':
        return build(MECH_W, MECH_H, MECH_AX, MECH_AY, (p) => {
          if (winged) wings(p);
          if (mk2 === 'interceptor') {
            p(-19, -41, 4, 17, pal.main);
            p(-19, -41, 4, 1, pal.white);
            p(-22, -37, 3, 12, pal.white);
          }
          backpack(p, pal, tier);
          leg(p, pal, -4, true, 0, false);
          leg(p, pal, 1, false, 0, false);
          hips(p, pal);
          torso(p, pal, false);
          head(p, pal, 'vfin');
          shoulder(p, pal, tier);
          if (mk3 === 'fullarmour') fullArmour(p, pal, type);
          arm(p, pal, r);
          p(6 + r, -25, 3, 3, pal.white);
        }, (p) => {
          const t = r * 2;
          if (mk2 === 'beamaxe') {
            p(9 + t, -26, 14, 2, BEAM);
            p(21 + t, -34, 6, 13, BEAM);
            p(22 + t, -33, 3, 11, BEAM_CORE);
          } else {
            p(9 + t, -26, 20, 3, BEAM);
            p(9 + t, -25, 20, 1, BEAM_CORE);
            p(29 + t, -25, 2, 1, BEAM);
          }
          if (mk2 === 'twinsabre') {
            p(-10, -46, 2, 14, BEAM);
            p(-10, -45, 1, 12, BEAM_CORE);
            p(-11, -33, 4, 2, pal.white);
          }
        });
      case 'artillery':
        return build(MECH_W, MECH_H, MECH_AX, MECH_AY, (p) => {
          if (winged) wings(p);
          const thick = mk2 === 'cluster' ? 4 : 3;
          const barrel = (x0: number, col: string) => {
            p(x0 - 2, -31, 6, 6, pal.mainS);
            for (let j = 0; j < 8; j++) p(x0 + j - r, -32 - j * 2 + r, thick, thick, col);
            p(x0 + 7 - r, -47 + r, thick, 2, pal.frameS);
          };
          barrel(-12, pal.frameS);
          if (mk2 === 'missiles') {
            p(-17, -39, 8, 11, pal.main);
            p(-17, -39, 8, 1, pal.white);
            for (const [mx, my] of [[-16, -37], [-13, -37], [-16, -33], [-13, -33]]) p(mx, my, 2, 2, '#dc3540');
          } else if (tier >= 2) p(-14, -36, 6, 9, pal.main);
          p(-13, -8, 26, 8, pal.frameS);
          p(-13, -8, 26, 2, pal.frame);
          for (let k = 0; k < 5; k++) p(-11 + k * 5, -5, 3, 3, '#6a7385');
          if (tier >= 2) p(-13, -10, 26, 2, pal.main);
          p(-10, -16, 20, 7, pal.main);
          p(-10, -16, 20, 1, '#ffc266');
          p(-10, -10, 20, 1, pal.mainS);
          p(-7, -27, 14, 11, pal.white);
          p(-7, -27, 2, 11, pal.whiteS);
          p(-2, -25, 6, 5, pal.main);
          p(4, -23, 3, 1, pal.trim);
          barrel(-9, pal.frame);
          p(1, -29, 3, 2, pal.frame);
          p(0, -34, 9, 5, pal.white);
          p(0, -34, 2, 5, pal.whiteS);
          p(2, -35, 5, 1, pal.main);
          p(4, -32, 5, 2, pal.frameS);
          p(5, -32, 4, 1, pal.eye);
          p(4, -24, 8, 5, pal.frame);
          p(4, -24, 8, 1, '#5a6273');
          p(4, -20, 8, 1, pal.frameS);
          p(6, -22, 1, 1, '#dc3540');
          p(8, -22, 1, 1, '#dc3540');
          p(10, -22, 1, 1, '#dc3540');
          if (mk3 === 'fullarmour') fullArmour(p, pal, type);
        }, (p) => {
          if (mk2 !== 'railgun') return;
          for (let j = 0; j < 8; j += 2) p(-9 + j - r, -31 - j * 2 + r, 1, 1, '#7df4ff');
          p(-2 - r, -49 + r, 4, 1, '#7df4ff');
        });
      case 'bulwark':
        return build(MECH_W, MECH_H, MECH_AX, MECH_AY, (p) => {
          if (winged) wings(p);
          backpack(p, pal, tier);
          leg(p, pal, -5, true, 0, true);
          leg(p, pal, 1, false, 0, true);
          hips(p, pal);
          torso(p, pal, true);
          head(p, pal, 'goggle');
          if (mk2 === 'commander') {
            p(-2, -50, 1, 9, pal.whiteS);
            p(-4, -46, 5, 1, pal.acc);
            p(1, -48, 1, 6, pal.trim);
          }
          shoulder(p, pal, tier);
          if (mk2 === 'fortress' || mk3 === 'fullarmour') fullArmour(p, pal, type);
          arm(p, pal);
          const big = mk2 === 'guardian';
          const top = big ? -45 : -38;
          const hgt = big ? 41 : 33;
          const w = big ? 10 : 8;
          p(8, top, w, hgt, pal.main);
          p(8, top, 2, hgt, pal.mainS);
          p(8, top, w, 1, pal.white);
          p(7 + w, top, 1, hgt, pal.white);
          p(9, -5, w - 2, 1, pal.mainS);
          p(10, -4, w - 4, 1, pal.mainS);
          p(10 + (big ? 1 : 1), -25, 3, 1, pal.trim);
          p(11 + (big ? 1 : 1), -27, 1, 5, pal.trim);
          p(16 + (big ? 2 : 0) - r, -26, 6, 2, pal.frame);
          if (tier >= 2) {
            p(10, top - 2, 4, 2, pal.white);
            p(8 + w, -32, 2, 3, pal.trim);
            p(8 + w, -16, 2, 3, pal.trim);
          }
        });
    }
  });
}

function wreckSprite(type: MechType): Sprite {
  const pal = MECH_PAL[type];
  return cached(`w:${type}`, () =>
    build(MECH_W, MECH_H, MECH_AX, MECH_AY, (p) => {
      p(-14, -4, 28, 4, pal.frameS);
      p(-9, -9, 11, 5, pal.whiteS);
      p(2, -8, 7, 4, pal.mainS);
      p(-13, -9, 6, 5, pal.whiteS);
      p(-11, -8, 2, 1, pal.frameS);
      p(6, -5, 8, 2, pal.accS);
    }),
  );
}

export interface MechDrawOpts {
  t: number;
  tier: number;
  recoil: number;
  flash: number;
  wrecked?: boolean;
  scale?: number;
  shadow?: boolean;
  thrust?: boolean;
  /** Face left instead of right. */
  flip?: boolean;
  mk2?: string | null;
  mk3?: string | null;
}

export function drawMech(ctx: CanvasRenderingContext2D, type: MechType, x: number, y: number, o: MechDrawOpts): void {
  const s = mechScale(o.tier, o.scale ?? 1.45);
  const dir = o.flip ? -1 : 1;
  if (o.shadow !== false) shadow(ctx, x, y, 15 * s, 2.5 * s);

  if (o.wrecked) {
    blit(ctx, wreckSprite(type), x, y, s, o.flip);
    const flick = Math.sin(o.t * 14 + x) > 0;
    ctx.fillStyle = flick ? '#ff7a2f' : '#ffd23f';
    ctx.fillRect(x - 4 * s * dir, y - 10 * s, 2 * s, 2 * s);
    return;
  }

  const r = Math.min(2, Math.round(o.recoil * 2));
  const mk2 = o.mk2 ?? null;
  const mk3 = o.mk3 ?? null;
  let sprite = mechSprite(type, o.tier, r, mk2, mk3);
  if (o.flash > 0) sprite = cached(`m:${type}:${o.tier}:${r}:${mk2}:${mk3}:white`, () => whiteOf(mechSprite(type, o.tier, r, mk2, mk3)));
  const bob = Math.round(Math.sin(o.t * 2.2 + x * 0.05)) * (s / 2);

  if (o.thrust && type !== 'artillery') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const len = (3 + Math.random() * 4) * s;
    ctx.fillStyle = 'rgba(95,227,255,0.8)';
    ctx.fillRect(x - 13 * s * dir - (o.flip ? 2 * s : 0), y - 22 * s + bob, 2 * s, len);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(x - 12.5 * s * dir - (o.flip ? 1 * s : 0), y - 22 * s + bob, 1 * s, len * 0.5);
    ctx.restore();
  }
  blit(ctx, sprite, x, y + bob, s, o.flip);
}

// ---------- Enemies ----------

const SNIPER_PAL: Pal = { white: '#5f7896', whiteS: '#3c4e66', main: '#2c3a50', mainS: '#1a2433', acc: '#465264', accS: '#2a313d', trim: '#d8bf5a', eye: '#ff3b7f', frame: '#3a3f4a', frameS: '#23262e' };
const SHIELD_PAL: Pal = { white: '#b59a62', whiteS: '#7d6a40', main: '#5c4c2c', mainS: '#3a301b', acc: '#6a5a3a', accS: '#433924', trim: '#e0c860', eye: '#ff3b7f', frame: '#3a3f4a', frameS: '#23262e' };
const BOMB = { main: '#b8323f', light: '#e85a66', dark: '#5a1520' };

export const ENEMY_SCALE: Record<EnemyType, number> = { drone: 1.8, crawler: 1.3, brute: 1.6, titan: 1.9, bomber: 1.7, jet: 1.8, sniper: 1.3, shield: 1.5, medic: 1.6 };

type Soldier = 'grunt' | 'sniper' | 'shield';

/** Mono-eye infantry suits that share a body: grunt (machine gun), sniper (long rifle) and shield trooper. */
function soldierSprite(kind: Soldier, step: number, atk: boolean, eye: number): Sprite {
  const pal = kind === 'sniper' ? SNIPER_PAL : kind === 'shield' ? SHIELD_PAL : GRUNT_PAL;
  return cached(`e:${kind}:${step}:${atk}:${eye}`, () =>
    build(MECH_W, MECH_H, MECH_AX, MECH_AY, (p) => {
      p(-12, -32, 5, 9, pal.white);
      p(-14, -28, 3, 4, pal.frame);
      if (kind === 'sniper') {
        p(-11, -44, 1, 10, pal.whiteS);
        p(-12, -44, 3, 1, pal.trim);
      }
      const bulky = kind === 'shield';
      leg(p, pal, -4 + (step ? 1 : -1), true, step ? 0 : 2, bulky);
      leg(p, pal, 1 + (step ? -1 : 1), false, step ? 2 : 0, bulky);
      hips(p, pal);
      torso(p, pal, bulky);
      head(p, pal, 'mono', eye);
      if (kind === 'sniper') p(1, -41, 5, 2, pal.frameS);
      p(-11, -36, 7, 9, pal.white);
      p(-11, -36, 7, 1, pal.whiteS);
      shoulder(p, pal, 1, kind === 'shield');
      arm(p, pal, atk ? 1 : 0);
      const k = atk ? -1 : 0;
      if (kind === 'grunt') {
        p(3 + k, -25, 13, 3, pal.frame);
        p(6 + k, -22, 4, 4, pal.frameS);
        p(16 + k, -24, 4, 1, pal.frame);
      } else if (kind === 'sniper') {
        p(2 + k, -25, 26, 2, pal.frame);
        p(6 + k, -28, 7, 3, pal.frameS);
        p(12 + k, -27, 1, 1, pal.eye);
        p(26 + k, -26, 2, 4, pal.frameS);
      } else {
        p(3, -22, 8, 2, pal.frame);
        p(9 + (atk ? 3 : 0), -41, 7, 37, '#6a7385');
        p(9 + (atk ? 3 : 0), -41, 2, 37, '#4a5262');
        p(15 + (atk ? 3 : 0), -41, 1, 37, '#9aa4b5');
        p(11 + (atk ? 3 : 0), -30, 3, 6, pal.trim);
      }
    }),
  );
}

function heavySprite(step: number, atk: boolean, eye: number): Sprite {
  const pal = HEAVY_PAL;
  return cached(`e:heavy:${step}:${atk}:${eye}`, () =>
    build(MECH_W, MECH_H, MECH_AX, MECH_AY, (p) => {
      p(-13, -33, 6, 11, pal.white);
      leg(p, pal, -5 + (step ? 1 : -1), true, step ? 0 : 1, true);
      leg(p, pal, 1 + (step ? -1 : 1), false, step ? 1 : 0, true);
      p(-9, -22, 18, 6, pal.white);
      p(-9, -17, 18, 1, pal.whiteS);
      torso(p, pal, true);
      head(p, pal, 'mono', eye);
      shoulder(p, pal, 1, true);
      arm(p, pal, atk ? 2 : 0);
      if (!atk) p(6, -36, 2, 12, pal.frame);
      else p(8, -26, 4, 2, pal.frame);
    }, (p) => {
      if (!atk) {
        p(4, -46, 6, 11, '#ff7a2f');
        p(6, -45, 2, 9, '#ffd8a0');
      } else {
        p(12, -27, 16, 4, '#ff7a2f');
        p(12, -26, 15, 2, '#ffd8a0');
      }
    }),
  );
}

function droneSprite(flap: boolean): Sprite {
  const pal = GRUNT_PAL;
  return cached(`e:drone:${flap}`, () =>
    build(30, 22, 14, 19, (p) => {
      p(-8, -8, 3, 4, pal.frame);
      p(-6, -10, 12, 9, pal.white);
      p(-6, -10, 12, 1, '#9fc483');
      p(-6, -3, 12, 2, pal.whiteS);
      p(-3, -13, 7, 3, pal.main);
      p(2, -7, 5, 3, pal.frameS);
      p(3, -7, 3, 2, pal.eye);
      p(-5, flap ? -1 : 0, 3, 2, pal.frame);
      p(2, flap ? 0 : -1, 3, 2, pal.frame);
      p(-1, -15, 1, 2, pal.trim);
    }),
  );
}

function bomberSprite(blink: boolean): Sprite {
  return cached(`e:bomber:${blink}`, () =>
    build(30, 24, 14, 21, (p) => {
      p(-6, -12, 12, 10, BOMB.main);
      p(-5, -13, 10, 1, BOMB.light);
      p(-7, -10, 1, 6, BOMB.main);
      p(6, -10, 1, 6, BOMB.main);
      p(-6, -3, 12, 2, BOMB.dark);
      for (const [x, y] of [[-8, -8], [7, -8], [-1, -15], [-4, -1], [3, -1]]) p(x, y, 2, 2, '#3a3f4a');
      p(2, -9, 3, 3, '#23262e');
      p(-2, -16, 3, 2, '#3a3f4a');
    }, (p) => {
      p(3, -8, 2, 2, '#ff3b7f');
      if (blink) p(-1, -17, 1, 1, '#ffef5c');
    }),
  );
}

function jetSprite(flame: boolean): Sprite {
  const pal = GRUNT_PAL;
  return cached(`e:jet:${flame}`, () =>
    build(40, 20, 20, 16, (p) => {
      p(-14, -12, 4, 6, pal.main);
      p(-12, -7, 22, 4, pal.white);
      p(-12, -7, 22, 1, '#9fc483');
      p(-12, -4, 22, 1, pal.whiteS);
      p(10, -6, 4, 2, pal.white);
      p(14, -5, 2, 1, pal.whiteS);
      p(1, -9, 6, 2, pal.frameS);
      p(3, -9, 3, 1, pal.eye);
      p(-6, -3, 10, 2, pal.main);
      p(-4, -1, 6, 1, pal.mainS);
      p(-15, -6, 3, 2, pal.frame);
    }, (p) => {
      p(flame ? -19 : -18, -6, flame ? 4 : 3, 2, '#ffb347');
      p(-17, -6, 2, 1, '#fff3c0');
    }),
  );
}

function medicSprite(step: number, eye: number): Sprite {
  const pal = { body: '#d8d2b8', shade: '#9c967e', frame: '#3a3f4a', frameS: '#23262e' };
  return cached(`e:medic:${step}:${eye}`, () =>
    build(36, 30, 17, 27, (p) => {
      p(4, -24, 2, 10, pal.frame);
      p(4, -24, 9, 2, pal.frame);
      p(12, -24, 2, 5, pal.frameS);
      p(-12, -6, 24, 6, pal.frameS);
      p(-12, -6, 24, 1, pal.frame);
      for (let k = 0; k < 5; k++) p(-10 + k * 5 + step, -4, 2, 2, '#6a7385');
      p(-10, -15, 20, 9, pal.body);
      p(-10, -15, 20, 1, '#f0ecdc');
      p(-10, -7, 20, 1, pal.shade);
      p(-6, -19, 10, 4, pal.body);
      p(5, -12, 4, 3, pal.frameS);
      p(5 + eye, -12, 2, 2, '#ff3b7f');
    }, (p) => {
      p(-4, -14, 2, 6, '#6dffb8');
      p(-6, -12, 6, 2, '#6dffb8');
    }),
  );
}

function titanSprite(step: number, atk: boolean, eye: number): Sprite {
  const pal = TITAN_PAL;
  return cached(`e:titan:${step}:${atk}:${eye}`, () =>
    build(76, 56, 36, 53, (p) => {
      for (let k = 0; k < 4; k++) {
        const lx = -22 + k * 13;
        const lift = (k + step) % 2 ? 2 : 0;
        p(lx, -18, 4, 10 - lift, pal.frame);
        p(lx - 2, -8 - lift, 8, 4, pal.frameS);
        p(lx - 3, -4 - lift, 10, 2, pal.acc);
      }
      p(-26, -36, 50, 18, pal.main);
      p(-22, -42, 42, 6, pal.main);
      p(-14, -46, 26, 4, pal.white);
      p(-14, -46, 26, 1, '#e87a8a');
      p(-26, -20, 50, 3, pal.mainS);
      p(-26, -36, 4, 18, pal.mainS);
      for (let k = 0; k < 4; k++) p(-16 + k * 7, -40, 4, 2, pal.trim);
      p(8, -34, 16, 6, pal.frameS);
      p(14 + eye * 2, -33, 4, 4, pal.eye);
      p(-20, -30, 16, 2, pal.white);
      p(-20, -26, 16, 2, pal.whiteS);
      const claw = atk ? 4 : 0;
      p(22, -24, 8 + claw, 4, pal.frame);
      p(28 + claw, -28, 4, 4, pal.trim);
      p(28 + claw, -20, 4, 4, pal.trim);
      p(-30, -40, 6, 4, pal.frame);
      p(-34, -44, 6, 6, pal.frameS);
    }, (p) => {
      if (atk) {
        p(32, -26, 6, 4, '#ffef5c');
        p(34, -25, 3, 2, '#ffffff');
      }
    }),
  );
}

export interface EnemyDrawOpts {
  t: number;
  flash: number;
  attack: number;
  /** Face right instead of left. */
  flip?: boolean;
}

export function drawEnemy(ctx: CanvasRenderingContext2D, type: EnemyType, x: number, y: number, o: EnemyDrawOpts): void {
  const s = ENEMY_SCALE[type];
  const atk = o.attack > 0.4;
  const step = Math.floor(o.t * 4 + x * 0.05) % 2;
  const eye = Math.round(Math.sin(o.t * 1.5 + x * 0.1) + 1) as 0 | 1 | 2;

  let sprite: Sprite;
  let hover = 0;
  switch (type) {
    case 'drone':
      sprite = droneSprite(Math.sin(o.t * 30 + x) > 0);
      hover = Math.round(Math.sin(o.t * 5 + x * 0.1) * 2 - 12);
      shadow(ctx, x, y, 8 * s, 1.5 * s);
      break;
    case 'bomber':
      sprite = bomberSprite(Math.sin(o.t * 12 + x) > 0);
      hover = Math.round(Math.sin(o.t * 7 + x * 0.1) * 1.5 - 6);
      shadow(ctx, x, y, 7 * s, 1.5 * s);
      break;
    case 'jet':
      sprite = jetSprite(Math.sin(o.t * 40 + x) > 0);
      hover = Math.round(Math.sin(o.t * 3 + x * 0.05) * 2 - 28);
      shadow(ctx, x, y, 12 * s, 1.5 * s);
      break;
    case 'crawler':
      sprite = soldierSprite('grunt', step, atk, eye);
      shadow(ctx, x, y, 12 * s, 2 * s);
      break;
    case 'sniper':
      sprite = soldierSprite('sniper', step, atk, eye);
      shadow(ctx, x, y, 12 * s, 2 * s);
      break;
    case 'shield':
      sprite = soldierSprite('shield', step, atk, eye);
      shadow(ctx, x, y, 14 * s, 2.5 * s);
      break;
    case 'medic':
      sprite = medicSprite(step, eye);
      shadow(ctx, x, y, 12 * s, 2 * s);
      break;
    case 'brute':
      sprite = heavySprite(step, atk, eye);
      shadow(ctx, x, y, 14 * s, 2.5 * s);
      break;
    case 'titan':
      sprite = titanSprite(step, atk, eye);
      shadow(ctx, x, y, 28 * s, 3 * s);
      break;
  }
  if (o.flash > 0) sprite = whiteOfCached(sprite);
  blit(ctx, sprite, x, y + hover * s, s, !o.flip);
}

const whiteCache = new WeakMap<Sprite, Sprite>();

function whiteOfCached(s: Sprite): Sprite {
  let w = whiteCache.get(s);
  if (!w) {
    w = whiteOf(s);
    whiteCache.set(s, w);
  }
  return w;
}

export function enemyHeight(type: EnemyType): number {
  return { drone: 54, crawler: 60, brute: 78, titan: 92, bomber: 44, jet: 84, sniper: 60, shield: 68, medic: 40 }[type];
}

// ---------- Equipment icons ----------

export function drawEquipIcon(ctx: CanvasRenderingContext2D, id: EquipId, cx: number, cy: number, size: number): void {
  const u = size / 16;
  const r = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(cx + x * u), Math.round(cy + y * u), Math.ceil(w * u), Math.ceil(h * u));
  };
  const dark = '#2b303b';
  switch (id) {
    case 'rifle':
      r(-7, -1, 11, 3, '#4a5262');
      r(-3, 2, 2, 3, '#4a5262');
      r(4, 0, 4, 1, '#ff5ad8');
      r(-2, -3, 4, 2, dark);
      break;
    case 'thruster':
      r(-5, -6, 4, 7, '#9aa4b5');
      r(1, -6, 4, 7, '#9aa4b5');
      r(-4, 1, 2, 4, '#5fe3ff');
      r(2, 1, 2, 4, '#5fe3ff');
      r(-4, 1, 2, 1, '#ffffff');
      r(2, 1, 2, 1, '#ffffff');
      break;
    case 'armour':
      r(-6, -6, 12, 10, '#e8edf4');
      r(-6, -6, 12, 2, '#ffffff');
      r(-4, 4, 8, 2, '#a9b4c6');
      r(-1, -3, 2, 6, '#2f5fe0');
      break;
    case 'funnels':
      for (const [x, y] of [[-6, -5], [1, -6], [-3, 2]]) {
        r(x, y, 5, 2, '#c77dff');
        r(x + 1, y + 2, 3, 1, '#7a3bbd');
        r(x + 2, y + 3, 1, 1, '#f3e1ff');
      }
      break;
    case 'barrel':
      r(-8, -1, 16, 2, '#ffd23f');
      r(-8, -2, 4, 4, '#4a5262');
      r(6, -2, 2, 4, dark);
      break;
    case 'repair':
      r(-2, -6, 4, 12, '#6dffb8');
      r(-6, -2, 12, 4, '#6dffb8');
      r(-1, -5, 2, 10, '#e3fff2');
      break;
    case 'coating':
      r(-5, -6, 10, 2, '#ffb347');
      r(-6, -4, 12, 6, '#ffb347');
      r(-4, 2, 8, 2, '#ffb347');
      r(-2, 4, 4, 2, '#ffb347');
      r(-3, -3, 3, 3, '#fff0d8');
      break;
    case 'targeting':
      r(-6, -1, 4, 2, '#7df4ff');
      r(2, -1, 4, 2, '#7df4ff');
      r(-1, -6, 2, 4, '#7df4ff');
      r(-1, 2, 2, 4, '#7df4ff');
      r(-1, -1, 2, 2, '#ffffff');
      break;
  }
}

// ---------- Reel symbols ----------

function drawCog(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.6);
  ctx.fillStyle = '#7d8798';
  for (let k = 0; k < 8; k++) {
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-r * 0.2, -r * 1.15, r * 0.4, r * 0.4);
  }
  ctx.fillStyle = '#9aa4b5';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#161b27';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCore(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number): void {
  const pulse = 1 + Math.sin(t * 4) * 0.08;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = 'rgba(199,125,255,0.25)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2);
  ctx.fill();
  const star = (rad: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const ang = (k * Math.PI) / 4 - Math.PI / 2;
      const rr = k % 2 === 0 ? rad : rad * 0.4;
      ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fill();
  };
  star(r, '#c77dff');
  star(r * 0.55, '#f3e1ff');
  ctx.restore();
}

/** A reel symbol, centred on (cx, cy) inside a square of the given size. */
export function drawSymbol(ctx: CanvasRenderingContext2D, sym: SymbolId, cx: number, cy: number, size: number, t: number): void {
  if (sym === 'scrap') drawCog(ctx, cx, cy, size * 0.3, t);
  else if (sym === 'wild') drawCore(ctx, cx, cy, size * 0.34, t);
  else drawMech(ctx, sym, cx - size * 0.1, cy + size * 0.42, { t, tier: 1, recoil: 0, flash: 0, scale: size / 56, shadow: false });
}
