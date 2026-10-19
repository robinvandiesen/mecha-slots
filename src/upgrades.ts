import type { MechType } from './data';

/** Multiplicative stat changes: +0.3 means +30%. `regenPct` is max HP repaired per second. */
export interface StatMods {
  dmg?: number;
  rate?: number;
  hp?: number;
  range?: number;
  speed?: number;
  splash?: number;
  dmgTaken?: number;
  regenPct?: number;
}

export type Special = 'multishot' | 'splashShots' | 'cleave' | 'taunt' | 'aura';

export const SPECIAL_TEXT: Record<Special, string> = {
  multishot: 'Fires at two targets at once',
  splashShots: 'Shots explode on impact',
  cleave: 'Sabre hits everything around the target',
  taunt: 'Nearby enemies attack this unit first',
  aura: 'Nearby allies deal +20% damage',
};

export interface VariantDef {
  id: string;
  /** Mk-II variants belong to one mech type; Mk-III variants apply to all. */
  type: MechType | 'any';
  tier: 2 | 3;
  name: string;
  desc: string;
  mods: StatMods;
  special?: Special;
}

export const VARIANTS: VariantDef[] = [
  // Gunner
  { id: 'sniper', type: 'gunner', tier: 2, name: 'Sniper', desc: 'Long-barrel beam rifle. Huge range and damage, slow to fire.', mods: { range: 0.8, dmg: 0.9, rate: -0.4 } },
  { id: 'assault', type: 'gunner', tier: 2, name: 'Assault', desc: 'Twin rifles. Fires much faster.', mods: { rate: 0.7, dmg: -0.1, speed: 0.2 } },
  { id: 'bazooka', type: 'gunner', tier: 2, name: 'Bazooka', desc: 'Hyper bazooka. Every shot explodes.', mods: { dmg: 0.25, rate: -0.2 }, special: 'splashShots' },
  // Lancer
  { id: 'twinsabre', type: 'lancer', tier: 2, name: 'Twin Sabre', desc: 'A beam sabre in each hand. Attacks 60% faster.', mods: { rate: 0.6 } },
  { id: 'beamaxe', type: 'lancer', tier: 2, name: 'Beam Axe', desc: 'Heavy axe that cleaves through groups.', mods: { dmg: 0.4 }, special: 'cleave' },
  { id: 'interceptor', type: 'lancer', tier: 2, name: 'Interceptor', desc: 'Wing binders. Much faster, hits a bit harder.', mods: { speed: 0.7, dmg: 0.2 } },
  // Artillery
  { id: 'missiles', type: 'artillery', tier: 2, name: 'Missile Rack', desc: 'Back-mounted missiles. Fires at two targets.', mods: { dmg: -0.1 }, special: 'multishot' },
  { id: 'railgun', type: 'artillery', tier: 2, name: 'Railgun', desc: 'Massive single-target damage, small blast.', mods: { dmg: 1.0, rate: -0.25, splash: -0.5 } },
  { id: 'cluster', type: 'artillery', tier: 2, name: 'Cluster Mortar', desc: 'Much bigger blast radius.', mods: { splash: 0.7, dmg: 0.1 } },
  // Bulwark
  { id: 'fortress', type: 'bulwark', tier: 2, name: 'Fortress', desc: 'Extra plating. Far more HP and faster repairs.', mods: { hp: 0.6, regenPct: 0.01 } },
  { id: 'guardian', type: 'bulwark', tier: 2, name: 'Guardian', desc: 'Tower shield. Draws enemy fire onto itself.', mods: { hp: 0.3, dmgTaken: -0.2 }, special: 'taunt' },
  { id: 'commander', type: 'bulwark', tier: 2, name: 'Commander', desc: 'Command antenna. Boosts the damage of nearby allies.', mods: { dmg: 0.2 }, special: 'aura' },
  // Mk-III, shared by every type
  { id: 'fullarmour', type: 'any', tier: 3, name: 'Full Armour', desc: 'Bolt-on armour and extra weapons. Tough but slower.', mods: { hp: 0.7, dmg: 0.3, speed: -0.25, dmgTaken: -0.15 } },
  { id: 'ace', type: 'any', tier: 3, name: 'Ace Custom', desc: 'Custom paint for an ace pilot. Faster in every way.', mods: { rate: 0.45, speed: 0.6, dmg: 0.15 } },
  { id: 'awakened', type: 'any', tier: 3, name: 'Awakened', desc: 'Energy wings unfold. Big damage boost and self-repair.', mods: { dmg: 0.45, regenPct: 0.02 } },
];

export function variantById(id: string | null): VariantDef | null {
  return VARIANTS.find((v) => v.id === id) ?? null;
}

export function variantsFor(type: MechType, tier: 2 | 3): VariantDef[] {
  return VARIANTS.filter((v) => v.tier === tier && (v.type === type || v.type === 'any'));
}

export type EquipId = 'rifle' | 'thruster' | 'armour' | 'funnels' | 'barrel' | 'repair' | 'coating' | 'targeting';

export interface EquipDef {
  id: EquipId;
  name: string;
  desc: string;
  mods: StatMods;
  color: string;
}

export const EQUIPMENT: EquipDef[] = [
  { id: 'rifle', name: 'Beam Amplifier', desc: '+30% damage', mods: { dmg: 0.3 }, color: '#ff5ad8' },
  { id: 'thruster', name: 'Thruster Pack', desc: '+60% move speed', mods: { speed: 0.6 }, color: '#5fe3ff' },
  { id: 'armour', name: 'Reactive Armour', desc: '+40% max HP', mods: { hp: 0.4 }, color: '#e8edf4' },
  { id: 'funnels', name: 'Funnel Pod', desc: '+30% attack speed', mods: { rate: 0.3 }, color: '#c77dff' },
  { id: 'barrel', name: 'Long Barrel', desc: '+35% range, +20% blast radius', mods: { range: 0.35, splash: 0.2 }, color: '#ffd23f' },
  { id: 'repair', name: 'Repair Module', desc: 'Repairs 2% max HP per second', mods: { regenPct: 0.02 }, color: '#6dffb8' },
  { id: 'coating', name: 'Anti-Beam Coating', desc: 'Takes 25% less damage', mods: { dmgTaken: -0.25 }, color: '#ffb347' },
  { id: 'targeting', name: 'Targeting AI', desc: '+15% damage, +15% attack speed', mods: { dmg: 0.15, rate: 0.15 }, color: '#7df4ff' },
];

export function equipById(id: EquipId): EquipDef {
  return EQUIPMENT.find((e) => e.id === id)!;
}

export const ARMORY_SIZE = 6;

// ---------- Scrap upgrades ----------
// Bought per mech with scrap, separate from levels (which only come from merging).

export type BoostId = 'firepower' | 'armour' | 'reactor' | 'mobility';

export const BOOST_IDS: BoostId[] = ['firepower', 'armour', 'reactor', 'mobility'];
export const BOOST_MAX = 5;

export interface BoostDef {
  id: BoostId;
  name: string;
  color: string;
  /** Effect of one rank. */
  perRank: StatMods;
  desc: string;
}

export function boostDef(id: BoostId, type: MechType): BoostDef {
  switch (id) {
    case 'firepower':
      return { id, name: 'Firepower', color: '#ff5ad8', perRank: { dmg: 0.12 }, desc: '+12% damage' };
    case 'armour':
      return { id, name: 'Armour', color: '#e8edf4', perRank: { hp: 0.15 }, desc: '+15% max HP' };
    case 'reactor':
      return { id, name: 'Reactor', color: '#7df4ff', perRank: { rate: 0.1 }, desc: '+10% attack speed' };
    case 'mobility':
      // Artillery never moves, so it gets a bigger blast instead.
      return type === 'artillery'
        ? { id, name: 'Blast Radius', color: '#ffb347', perRank: { splash: 0.12 }, desc: '+12% blast radius' }
        : { id, name: 'Thrusters', color: '#5fe3ff', perRank: { speed: 0.12 }, desc: '+12% move speed' };
  }
}

/** Scrap for the next rank of an upgrade: 16, 28, 40, 52, 64. */
export function boostCost(rank: number): number {
  return 16 + 12 * rank;
}

export function emptyBoosts(): Record<BoostId, number> {
  return { firepower: 0, armour: 0, reactor: 0, mobility: 0 };
}
