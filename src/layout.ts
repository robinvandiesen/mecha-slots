export const W = 1280;
export const H = 720;

export const FIELD_TOP = 56;

/** Left-hand panel that holds the slot machine. */
export const PANEL_W = 380;
export const FIELD_X = PANEL_W;

// ---------- Isometric battlefield ----------
// World space is a flat LX by LY deck. X runs from the mothership (X = 0) towards
// the enemy spawn edge (X = LX); Y runs across the deck. Screen projection is
// classic 2:1 isometric, scaled by ISO_K.

export const LX = 600;
export const LY = 360;
export const ISO_K = 0.9;
export const ISO_OX = 740;
export const ISO_OY = 196;

export interface Vec {
  x: number;
  y: number;
}

export function project(x: number, y: number): Vec {
  return { x: ISO_OX + (x - y) * ISO_K, y: ISO_OY + ((x + y) * ISO_K) / 2 };
}

export function unproject(sx: number, sy: number): Vec {
  const a = (sx - ISO_OX) / ISO_K;
  const b = ((sy - ISO_OY) * 2) / ISO_K;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** World offset that moves a point purely horizontally on screen by `dx` pixels. */
export function screenXToWorld(dx: number): Vec {
  return { x: dx / (2 * ISO_K), y: -dx / (2 * ISO_K) };
}

// ---------- Deployment ----------

/** Enemy spawn lanes across the deck (enemies drift along these when not fighting). */
export const ROWS = 5;

/** Maximum number of units on the field. */
export const MAX_UNITS = 20;

/** Deployment zone depth in world units, measured from the mothership. */
export const DEPLOY_X = 250;

/** Keeps a placement point inside the deployment zone. */
export function clampToDeploy(p: Vec): Vec {
  return { x: Math.max(24, Math.min(DEPLOY_X - 10, p.x)), y: Math.max(16, Math.min(LY - 16, p.y)) };
}

export const SLOT = { x: 47, y: 96, cell: 90, gap: 8 };

export function slotCellRect(i: number): { x: number; y: number; w: number; h: number } {
  const c = i % 3;
  const r = Math.floor(i / 3);
  return {
    x: SLOT.x + c * (SLOT.cell + SLOT.gap),
    y: SLOT.y + r * (SLOT.cell + SLOT.gap),
    w: SLOT.cell,
    h: SLOT.cell,
  };
}
