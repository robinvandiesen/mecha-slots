import { ROWS } from './layout';

export type MechType = 'gunner' | 'lancer' | 'artillery' | 'bulwark';
export type SymbolId = MechType | 'scrap' | 'wild';
export type EnemyType = 'drone' | 'crawler' | 'brute' | 'titan' | 'bomber' | 'jet' | 'sniper' | 'shield' | 'medic';

export const MECH_TYPES: MechType[] = ['gunner', 'lancer', 'artillery', 'bulwark'];
export const SYMBOLS: SymbolId[] = [...MECH_TYPES, 'scrap', 'wild'];

export const MAX_WAVE = 10;
export const BOSS_WAVES = [5, 10];
export const MAX_LEVEL = 5;

export interface MechDef {
  name: string;
  role: string;
  hp: number;
  dmg: number;
  cooldown: number;
  /** Attack reach in world units, measured from the edge of the target. */
  range: number;
  /** Movement speed in world units per second. */
  speed: number;
  splash: number;
  regen: number;
  attack: 'bullet' | 'shell' | 'melee';
  colors: { main: string; dark: string; accent: string };
}

export const MECHS: Record<MechType, MechDef> = {
  gunner: {
    name: 'Gunner',
    role: 'Beam rifle with steady mid-range fire',
    hp: 40,
    dmg: 6,
    cooldown: 0.5,
    range: 230,
    speed: 44,
    splash: 0,
    regen: 0,
    attack: 'bullet',
    colors: { main: '#5b8cff', dark: '#2f5fe0', accent: '#ffd23f' },
  },
  lancer: {
    name: 'Lancer',
    role: 'Beam sabre bruiser, best at the front',
    hp: 75,
    dmg: 20,
    cooldown: 0.8,
    range: 10,
    speed: 64,
    splash: 0,
    regen: 0,
    attack: 'melee',
    colors: { main: '#ff5a74', dark: '#e2364a', accent: '#ff5ad8' },
  },
  artillery: {
    name: 'Artillery',
    role: 'Splash damage anywhere on the field',
    hp: 30,
    dmg: 13,
    cooldown: 1.8,
    range: 2000,
    speed: 0,
    splash: 55,
    regen: 0,
    attack: 'shell',
    colors: { main: '#ffa22e', dark: '#ff9a1f', accent: '#ffe066' },
  },
  bulwark: {
    name: 'Bulwark',
    role: 'Shielded tank that blocks and self-repairs',
    hp: 150,
    dmg: 4,
    cooldown: 0.7,
    range: 130,
    speed: 36,
    splash: 0,
    regen: 3,
    attack: 'bullet',
    colors: { main: '#4fd47a', dark: '#3aa65a', accent: '#7df4ff' },
  },
};

export const SYMBOL_NAMES: Record<SymbolId, string> = {
  gunner: 'Gunner',
  lancer: 'Lancer',
  artillery: 'Artillery',
  bulwark: 'Bulwark',
  scrap: 'Scrap',
  wild: 'Core',
};

export const SYMBOL_COLORS: Record<SymbolId, string> = {
  gunner: MECHS.gunner.colors.main,
  lancer: MECHS.lancer.colors.main,
  artillery: MECHS.artillery.colors.main,
  bulwark: MECHS.bulwark.colors.main,
  scrap: '#9aa4b5',
  wild: '#c77dff',
};

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  cooldown: number;
  reward: number;
  baseDamage: number;
  radius: number;
  /** Attack reach in world units, measured from the edge of the target. */
  range: number;
  /** Distance at which the enemy breaks off to attack a nearby unit. 0 = never engages. */
  aggro: number;
  /** Flies over the deck: only Gunners and Bulwarks can hit it, and it can't be blocked. */
  flying?: boolean;
  /** Fraction of damage blocked from shots and shells (not from melee). */
  armour?: number;
  /** Self-destructs on contact, dealing its damage to every mech within this radius. */
  explode?: number;
  /** Heals nearby enemies by this much HP per second instead of attacking. */
  heal?: number;
  /** One-line description for the enemy guide. */
  blurb: string;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  drone: { name: 'Scout Pod', hp: 14, speed: 60, dmg: 4, cooldown: 0.8, reward: 1, baseDamage: 1, radius: 10, range: 70, aggro: 140, blurb: 'Fast, fragile, shoots from short range' },
  crawler: { name: 'Grunt', hp: 32, speed: 34, dmg: 7, cooldown: 1, reward: 1, baseDamage: 2, radius: 12, range: 100, aggro: 150, blurb: 'Standard mono-eye trooper with a machine gun' },
  brute: { name: 'Heavy', hp: 120, speed: 20, dmg: 16, cooldown: 1.4, reward: 3, baseDamage: 4, radius: 16, range: 6, aggro: 130, blurb: 'Slow brawler with a heat sword' },
  titan: { name: 'Mobile Armour', hp: 600, speed: 11, dmg: 35, cooldown: 1.6, reward: 20, baseDamage: 10, radius: 30, range: 20, aggro: 180, blurb: 'Boss. Drops equipment when destroyed' },
  bomber: { name: 'Bomb Pod', hp: 18, speed: 75, dmg: 30, cooldown: 1, reward: 1, baseDamage: 4, radius: 10, range: 2, aggro: 200, explode: 55, blurb: 'Rushes the nearest mech and explodes' },
  jet: { name: 'Fighter Jet', hp: 26, speed: 105, dmg: 0, cooldown: 1, reward: 2, baseDamage: 4, radius: 12, range: 0, aggro: 0, flying: true, blurb: 'Flies straight at the mothership. Only Gunners and Bulwarks can hit it' },
  sniper: { name: 'Sniper', hp: 38, speed: 26, dmg: 20, cooldown: 2.6, reward: 2, baseDamage: 2, radius: 12, range: 260, aggro: 290, blurb: 'Hangs back and fires long-range beam shots' },
  shield: { name: 'Shield Trooper', hp: 150, speed: 22, dmg: 10, cooldown: 1.2, reward: 3, baseDamage: 3, radius: 16, range: 6, aggro: 120, armour: 0.5, blurb: 'Blocks half of all shot and shell damage. Use melee' },
  medic: { name: 'Repair Unit', hp: 55, speed: 30, dmg: 0, cooldown: 1, reward: 3, baseDamage: 1, radius: 12, range: 0, aggro: 0, heal: 9, blurb: 'Repairs nearby enemies. Kill it first' },
};

export interface Imprint {
  id: 'overclocked' | 'armored' | 'salvager' | 'critical';
  name: string;
  desc: string;
}

export const IMPRINTS: Imprint[] = [
  { id: 'overclocked', name: 'Overclocked', desc: '+35% fire rate' },
  { id: 'armored', name: 'Armoured', desc: '+50% max HP' },
  { id: 'salvager', name: 'Salvager', desc: '+1 scrap per kill' },
  { id: 'critical', name: 'Critical', desc: '25% chance of double damage' },
];

export const IMPRINT_CHANCE = 0.15;

export interface Modifiers {
  dmg: Record<MechType, number>;
  rate: Record<MechType, number>;
  hp: number;
  splash: number;
  regen: number;
  scrapSymbol: number;
  extraUnit: number;
  killScrap: number;
  weights: Record<SymbolId, number>;
}

export function baseModifiers(): Modifiers {
  return {
    dmg: { gunner: 1, lancer: 1, artillery: 1, bulwark: 1 },
    rate: { gunner: 1, lancer: 1, artillery: 1, bulwark: 1 },
    hp: 1,
    splash: 1,
    regen: 1,
    scrapSymbol: 0,
    extraUnit: 0,
    killScrap: 0,
    weights: { gunner: 3, lancer: 3, artillery: 2, bulwark: 3, scrap: 3, wild: 0.7 },
  };
}

export interface BaseState {
  baseHp: number;
  baseMax: number;
}

export interface CoreDef {
  id: string;
  name: string;
  desc: string;
  apply: (m: Modifiers, base: BaseState) => void;
}

const beaconCores: CoreDef[] = MECH_TYPES.map((t) => ({
  id: `beacon-${t}`,
  name: `${MECHS[t].name} Beacon`,
  desc: `${MECHS[t].name} symbols appear more often on the reels.`,
  apply: (m: Modifiers) => {
    m.weights[t] += 1.5;
  },
}));

export const CORES: CoreDef[] = [
  {
    id: 'ballistics',
    name: 'Ballistics Core',
    desc: 'Gunners deal +30% damage.',
    apply: (m) => {
      m.dmg.gunner *= 1.3;
    },
  },
  {
    id: 'servo',
    name: 'Servo Core',
    desc: 'Lancers attack 30% faster.',
    apply: (m) => {
      m.rate.lancer *= 1.3;
    },
  },
  {
    id: 'ordnance',
    name: 'Ordnance Core',
    desc: 'Artillery deals +20% damage with a 35% bigger blast.',
    apply: (m) => {
      m.dmg.artillery *= 1.2;
      m.splash *= 1.35;
    },
  },
  {
    id: 'plating',
    name: 'Reactive Plating',
    desc: 'Bulwarks repair twice as fast and deal +50% damage.',
    apply: (m) => {
      m.regen *= 2;
      m.dmg.bulwark *= 1.5;
    },
  },
  {
    id: 'aegis',
    name: 'Aegis Core',
    desc: 'All mechs get +20% max HP.',
    apply: (m) => {
      m.hp *= 1.2;
    },
  },
  {
    id: 'magnet',
    name: 'Magnet Core',
    desc: 'Scrap symbols give +1 extra scrap.',
    apply: (m) => {
      m.scrapSymbol += 1;
    },
  },
  {
    id: 'lucky',
    name: 'Lucky Reel',
    desc: 'Core (wild) symbols appear more often.',
    apply: (m) => {
      m.weights.wild += 0.6;
    },
  },
  {
    id: 'twin',
    name: 'Twin Launch',
    desc: 'Each winning line has a 30% chance to launch a second unit.',
    apply: (m) => {
      m.extraUnit += 0.3;
    },
  },
  {
    id: 'salvage',
    name: 'Salvage Core',
    desc: 'Every kill gives +1 scrap.',
    apply: (m) => {
      m.killScrap += 1;
    },
  },
  {
    id: 'repair',
    name: 'Repair Core',
    desc: 'Base gets +5 max HP and is fully repaired.',
    apply: (_m, base) => {
      base.baseMax += 5;
      base.baseHp = base.baseMax;
    },
  },
  ...beaconCores,
];

export interface Spawn {
  type: EnemyType;
  row: number;
  at: number;
}

export function enemyHpScale(wave: number): number {
  return 1 + 0.42 * (wave - 1) + 0.03 * (wave - 1) ** 2;
}

/** Spawn weights per enemy type and the first wave each one can appear in. */
const WAVE_TABLE: { type: EnemyType; from: number; weight: (wave: number) => number }[] = [
  { type: 'drone', from: 1, weight: () => 4 },
  { type: 'crawler', from: 1, weight: () => 5 },
  { type: 'bomber', from: 2, weight: (w) => 1 + w * 0.2 },
  { type: 'brute', from: 3, weight: (w) => 1 + w * 0.3 },
  { type: 'jet', from: 3, weight: (w) => 0.8 + w * 0.15 },
  { type: 'sniper', from: 4, weight: (w) => 0.8 + w * 0.15 },
  { type: 'shield', from: 4, weight: (w) => 0.6 + w * 0.2 },
  { type: 'medic', from: 6, weight: () => 0.8 },
];

/** Enemy types that can appear in a given wave. */
export function waveRoster(wave: number): EnemyType[] {
  const types = WAVE_TABLE.filter((e) => wave >= e.from).map((e) => e.type);
  if (BOSS_WAVES.includes(wave)) types.push('titan');
  return types;
}

export function waveSpawns(wave: number, rng: () => number = Math.random): Spawn[] {
  const spawns: Spawn[] = [];
  const count = 5 + wave * 2;
  const interval = Math.max(0.35, 1.1 - wave * 0.07);
  const table = WAVE_TABLE.filter((e) => wave >= e.from);
  const total = table.reduce((sum, e) => sum + e.weight(wave), 0);

  for (let i = 0; i < count; i++) {
    let r = rng() * total;
    let type: EnemyType = table[0].type;
    for (const e of table) {
      r -= e.weight(wave);
      if (r < 0) {
        type = e.type;
        break;
      }
    }
    spawns.push({ type, row: Math.floor(rng() * ROWS), at: i * interval + rng() * 0.3 });
  }

  if (BOSS_WAVES.includes(wave)) {
    spawns.push({ type: 'titan', row: 2, at: count * interval * 0.5 });
    if (wave === MAX_WAVE) {
      spawns.push({ type: 'titan', row: rng() < 0.5 ? 1 : 3, at: count * interval * 0.8 });
    }
  }

  return spawns.sort((a, b) => a.at - b.at);
}
