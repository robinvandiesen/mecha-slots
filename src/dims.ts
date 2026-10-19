import type { EnemyType, MechType } from './data';

// Sizes of the 3D models in world units, shared by the game logic (projectile
// origins and targets), the models themselves and the 2D overlay (HP bars).

/** Height of a Mk-I mech model. */
export const MECH_HEIGHT = 50;

/** Model scale per promotion tier: Mk-II and Mk-III mechs are bigger. */
export function mechScale(tier: number): number {
  return 1 + 0.1 * (tier - 1);
}

/** Where each mech's weapon fires from, before tier scaling: distance in front of the mech and height. */
export const MUZZLE: Record<MechType, { fwd: number; h: number }> = {
  gunner: { fwd: 22, h: 27 },
  lancer: { fwd: 24, h: 27 },
  artillery: { fwd: 14, h: 56 },
  bulwark: { fwd: 20, h: 26 },
};

/** Height of each enemy model's top, including any hover or flight height. */
const ENEMY_TOP: Record<EnemyType, number> = {
  drone: 34,
  crawler: 50,
  brute: 62,
  titan: 74,
  bomber: 26,
  jet: 52,
  sniper: 50,
  shield: 54,
  medic: 28,
};

/** How far above the deck an enemy floats or flies. */
export const ENEMY_HOVER: Record<EnemyType, number> = {
  drone: 16,
  crawler: 0,
  brute: 0,
  titan: 0,
  bomber: 9,
  jet: 44,
  sniper: 0,
  shield: 0,
  medic: 0,
};

export function enemyHeight(type: EnemyType): number {
  return ENEMY_TOP[type];
}
