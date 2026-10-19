export const W = 1280;
export const H = 720;

export const FIELD_TOP = 56;

/** Left-hand panel that holds the slot machine. */
export const PANEL_W = 380;
export const FIELD_X = PANEL_W;

// ---------- Battlefield ----------
// World space is a flat LX by LY deck. X runs from the mothership (X = 0) towards
// the enemy spawn edge (X = LX); Y runs across the deck. See view.ts for the 3D camera.

export const LX = 600;
export const LY = 360;

export interface Vec {
  x: number;
  y: number;
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
