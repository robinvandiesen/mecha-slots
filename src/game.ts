import {
  CORES,
  ENEMIES,
  IMPRINT_CHANCE,
  IMPRINTS,
  MAX_LEVEL,
  MAX_WAVE,
  MECHS,
  MECH_TYPES,
  baseModifiers,
  baseDamageFor,
  enemyDmgScale,
  enemyHpScale,
  waveRoster,
  waveSpawns,
  type CoreDef,
  type EnemyType,
  type Imprint,
  type MechType,
  type Modifiers,
  type Spawn,
  type SymbolId,
} from './data';
import { DEPLOY_X, FIELD_X, LX, LY, MAX_UNITS, ROWS, W, clampToDeploy, slotCellRect, type Vec } from './layout';
import { MUZZLE, enemyHeight, mechScale } from './dims';
import { project } from './view';
import type { Sfx } from './audio';
import { findLines, rollGrid, rollSymbol, type LineMatch } from './slot';
import { ARMORY_SIZE, BOOST_MAX, EQUIPMENT, boostCost, boostDef, emptyBoosts, equipById, variantById, variantsFor, type BoostId, type EquipId, type Special, type StatMods, type VariantDef } from './upgrades';

export type Phase = 'build' | 'spinning' | 'combat' | 'reward' | 'over' | 'victory';

export interface Mech {
  type: MechType;
  level: number;
  xp: number;
  hp: number;
  cd: number;
  roll: number;
  imprint: Imprint | null;
  recoil: number;
  flash: number;
  wrecked: boolean;
  /** Seconds until the unit finishes launching onto the field. */
  spawn: number;
  /** World position. */
  x: number;
  y: number;
  /** Where the player placed the unit; it returns here after every wave. */
  hx: number;
  hy: number;
  flip: boolean;
  moving: boolean;
  /** Facing direction on the deck in radians (0 = towards the enemy edge). */
  face: number;
  /** Chosen specialisations. */
  mk2: string | null;
  mk3: string | null;
  equipment: EquipId[];
  /** Scrap upgrade ranks, and the scrap spent on them (half is refunded on salvage). */
  boosts: Record<BoostId, number>;
  boostSpent: number;
}

export interface Enemy {
  type: EnemyType;
  x: number;
  y: number;
  /** Lateral line the enemy drifts back to when it isn't fighting. */
  lane: number;
  hp: number;
  maxHp: number;
  cd: number;
  flash: number;
  attack: number;
  dead: boolean;
  flip: boolean;
  /** Facing direction on the deck in radians (PI = towards the mothership). */
  face: number;
  /** Cooldown of the ranged attack, for enemies that have one. */
  rcd: number;
}

/** A 3D explosion requested by the game logic (the scene consumes these each frame). */
export interface Blast {
  x: number;
  y: number;
  h: number;
  size: number;
  color: string;
}

export interface Projectile {
  kind: 'bullet' | 'shell';
  /** World position plus height above the deck in screen pixels. */
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  ty: number;
  tz: number;
  target: Enemy | null;
  dmg: number;
  splash: number;
  p: number;
  duration: number;
  owner: Mech;
  done: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  gravity: number;
}

/** Screen-space visual effects. */
export interface Effect {
  kind: 'slash' | 'ring' | 'orb' | 'drop' | 'tracer';
  x: number;
  y: number;
  tx?: number;
  ty?: number;
  r: number;
  color: string;
  life: number;
  max: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  size: number;
}

export interface Reel {
  result: SymbolId[];
  t: number;
  /** When each column (reel) stops; the reels stop in a random order. */
  stops: number[];
  /** Column order in which the reels stop, and the column that stops last. */
  order: number[];
  last: number;
  /** Spin speed of each reel, in symbols per second. */
  speeds: number[];
  strips: SymbolId[][];
  /** The first two reels to stop genuinely line up, so the last reel spins longer for suspense. */
  anticipation: boolean;
  /** Last suspense tick played (for the rising pitch). */
  tension: number;
}

export type WinTier = 'none' | 'scrap' | 'win' | 'big' | 'jackpot';

/** Slot machine celebration state, read by the renderer. */
export interface WinFx {
  t: number;
  tier: WinTier;
  label: string;
  sub: string;
  lines: LineMatch[];
}

/** Rows and diagonals span all three reels (one cell per column, in column order); columns sit on one reel, so they can't build suspense. */
const CROSS_REEL_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 4, 8],
  [6, 4, 2],
];

/** Lines where the two reels other than `last` show the same mech: a real pair the last reel could complete. */
function mechPairs(grid: SymbolId[], last: number): number {
  return CROSS_REEL_LINES.filter((line) => {
    const [a, b] = line.filter((_, col) => col !== last).map((i) => grid[i]);
    return a === b && a !== 'wild' && a !== 'scrap';
  }).length;
}

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}

export interface MechStats {
  maxHp: number;
  dmg: number;
  cooldown: number;
  range: number;
  splash: number;
  regen: number;
  speed: number;
  dmgTaken: number;
  specials: Special[];
}

export type RewardOption = { kind: 'core'; core: CoreDef } | { kind: 'equip'; id: EquipId };

/** Equipment slots: one per promotion tier. */
export function slotsFor(level: number): number {
  return tierOf(level);
}

export function tierOf(level: number): number {
  return level >= 5 ? 3 : level >= 3 ? 2 : 1;
}

export function className(level: number): string {
  return ['Mk-I', 'Mk-II', 'Mk-III'][tierOf(level) - 1];
}

/** XP needed to go from `level` to `level + 1`. A unit's level equals the number of units merged into it. */
export function xpToNext(_level: number): number {
  return 1;
}

/** XP a unit is worth when merged into another one. */
export function mergeValue(m: Mech): number {
  return m.level + m.xp;
}

/** Stat multiplier: one unit's worth per level, plus a bonus for each promotion. */
export function levelMultiplier(level: number): number {
  return level * [1, 1.15, 1.3][tierOf(level) - 1];
}

const MECH_RADIUS = 14;
const BULLET_SPEED = 650;
const START_SCRAP = 25;
const HANGAR_FULL_SCRAP = 5;
const SCRAP_LINE = 10;
const SPAWN_TIME = 0.6;
/** The slot machine can be spun at most this many times per wave. */
export const MAX_SPINS_PER_WAVE = 6;
/** How far beyond its weapon range a unit can spot enemies. */
const SIGHT = 160;
/** Enemies count as on the field once they are past the red spawn strip. */
const ENTRY_X = LX - 16;
/** With nothing to fight, units wait here, well short of the spawn edge, so they can't camp it. */
const FRONT_LINE = LX - 130;
/** Units chasing an enemy can go right up to the spawn strip, leaving room for enemies to step onto the field. */
const CHASE_LIMIT = ENTRY_X - 40;

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Moves `a` towards `b` by up to `step`; returns true if it moved. */
function stepTowards(a: Vec, b: Vec, step: number): boolean {
  const d = dist(a, b);
  if (d < 0.5) return false;
  const k = Math.min(1, step / d);
  a.x += (b.x - a.x) * k;
  a.y += (b.y - a.y) * k;
  return true;
}

export class Game {
  phase: Phase = 'build';
  wave = 1;
  baseHp = 40;
  baseMax = 40;
  scrap = START_SCRAP;
  spinsThisWave = 0;
  /** Unit slots. The index is just an identity; positions are free. */
  bays: (Mech | null)[] = Array(MAX_UNITS).fill(null);
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  effects: Effect[] = [];
  blasts: Blast[] = [];
  floaters: Floater[] = [];
  mods: Modifiers = baseModifiers();
  cores: CoreDef[] = [];
  reel: Reel | null = null;
  winFx: WinFx | null = null;
  /** Particles for the slot machine panel (confetti, sparks), in screen space. */
  uiParticles: Particle[] = [];
  panelShake = 0;
  panelFlash = 0;
  spinPress = 0;
  lastGrid: SymbolId[] = rollGrid(baseModifiers().weights);
  lineFlash: { lines: LineMatch[]; t: number } | null = null;
  rewardChoices: RewardOption[] = [];
  /** Bays waiting for the player to choose a specialisation. */
  pendingUpgrades: number[] = [];
  armory: EquipId[] = ['rifle'];
  dragItem: { index: number } | null = null;
  spawnQueue: Spawn[] = [];
  waveT = 0;
  speed = 1;
  time = 0;
  hover: number | null = null;
  /** Unit clicked by the player; shows its action card (upgrade, salvage). */
  selected: number | null = null;
  drag: { from: number; x: number; y: number } | null = null;
  message = 'Match a line on the reels to launch a unit';
  messageT = 4;
  shake = 0;
  kills = 0;
  /** Sound hook. The app plugs the audio engine in here; simulations leave it silent. */
  sound: (name: Sfx, opts?: { count?: number; pan?: number }) => void = () => {};

  constructor() {
    // A starter squad so wave 1 is survivable before your first win.
    this.deploy('gunner', 1, null, { x: 120, y: 150 });
    this.deploy('bulwark', 1, null, { x: 170, y: 210 });
    for (const m of this.bays) if (m) m.spawn = 0;
  }

  /** Each spin costs 2 more than the last; the base rises by 1 every wave. The extra resets when a new wave starts. */
  get spinCost(): number {
    return 4 + (this.wave - 1) + 2 * this.spinsThisWave;
  }

  spinsLeft(): number {
    return MAX_SPINS_PER_WAVE - this.spinsThisWave;
  }

  canSpin(): boolean {
    return this.phase === 'build' && !this.upgradeChoice() && this.spinsLeft() > 0 && this.scrap >= this.spinCost;
  }

  stats(m: Mech): MechStats {
    const d = MECHS[m.type];
    const lvl = levelMultiplier(m.level);
    const armour = m.imprint?.id === 'armored' ? 1.5 : 1;
    const overclock = m.imprint?.id === 'overclocked' ? 1.35 : 1;

    const sources: StatMods[] = [];
    const specials: Special[] = [];
    for (const v of [variantById(m.mk2), variantById(m.mk3)]) {
      if (!v) continue;
      sources.push(v.mods);
      if (v.special) specials.push(v.special);
    }
    for (const id of m.equipment) sources.push(equipById(id).mods);
    for (const [id, rank] of Object.entries(m.boosts) as [BoostId, number][]) {
      if (!rank) continue;
      const per = boostDef(id, m.type).perRank;
      sources.push(Object.fromEntries(Object.entries(per).map(([k, v]) => [k, (v as number) * rank])) as StatMods);
    }
    const mul = (key: keyof StatMods) => sources.reduce((acc, src) => acc * (1 + (src[key] ?? 0)), 1);
    const regenPct = sources.reduce((acc, src) => acc + (src.regenPct ?? 0), 0);

    const maxHp = Math.round(d.hp * lvl * this.mods.hp * armour * mul('hp'));
    return {
      maxHp,
      dmg: d.dmg * lvl * m.roll * this.mods.dmg[m.type] * mul('dmg'),
      cooldown: d.cooldown / (this.mods.rate[m.type] * overclock * mul('rate')),
      range: d.range * (d.attack === 'melee' ? 1 : mul('range')),
      splash: d.splash * this.mods.splash * mul('splash'),
      regen: d.regen * lvl * this.mods.regen + maxHp * regenPct,
      speed: d.speed * mul('speed'),
      dmgTaken: mul('dmgTaken'),
      specials,
    };
  }

  // ---------- Specialisation and equipment ----------

  /** The next promotion waiting for a choice, if any. */
  upgradeChoice(): { bay: number; tier: 2 | 3; options: VariantDef[] } | null {
    while (this.pendingUpgrades.length) {
      const bay = this.pendingUpgrades[0];
      const m = this.bays[bay];
      const tier = m ? tierOf(m.level) : 0;
      if (m && tier >= 2 && !m.mk2) return { bay, tier: 2, options: variantsFor(m.type, 2) };
      if (m && tier >= 3 && !m.mk3) return { bay, tier: 3, options: variantsFor(m.type, 3) };
      this.pendingUpgrades.shift();
    }
    return null;
  }

  chooseVariant(index: number): void {
    const choice = this.upgradeChoice();
    const v = choice?.options[index];
    if (!choice || !v) return;
    const m = this.bays[choice.bay]!;
    this.sound('upgrade');
    if (choice.tier === 2) m.mk2 = v.id;
    else m.mk3 = v.id;
    m.hp = this.stats(m).maxHp;
    const pos = this.screenPos(m);
    this.floater(pos.x, pos.y - 100, v.name.toUpperCase(), '#ffe066', 15);
    this.burst(pos.x, pos.y - 35, '#ffe066', 30, 180);
    this.effects.push({ kind: 'ring', x: pos.x, y: pos.y - 35, r: 60, color: '#ffe066', life: 0.4, max: 0.4 });
  }

  /** Adds an item to the armory, or scraps it if the armory is full. */
  stashItem(id: EquipId, at?: Vec): void {
    if (this.armory.length < ARMORY_SIZE) this.armory.push(id);
    else {
      this.scrap += 5;
      if (at) this.floater(at.x, at.y, 'ARMORY FULL +5', '#ffb347', 11);
    }
  }

  canEquip(bay: number): boolean {
    const m = this.bays[bay];
    return this.phase === 'build' && !this.upgradeChoice() && !!m && !m.wrecked && m.spawn <= 0;
  }

  /** Fits an armory item to a mech. When the mech's slots are full, its oldest item goes back to the armory. */
  equip(itemIndex: number, bay: number): void {
    const m = this.bays[bay];
    const id = this.armory[itemIndex];
    if (!m || !id || !this.canEquip(bay)) return;
    this.armory.splice(itemIndex, 1);
    if (m.equipment.length >= slotsFor(m.level)) this.armory.push(m.equipment.shift()!);
    m.equipment.push(id);
    this.sound('equip');
    const before = m.hp;
    m.hp = Math.max(before, this.stats(m).maxHp);
    const pos = this.screenPos(m);
    this.floater(pos.x, pos.y - 95, equipById(id).name.toUpperCase(), equipById(id).color, 12);
    this.burst(pos.x, pos.y - 35, equipById(id).color, 14, 120);
  }

  /** Returns items that no longer fit (after a level loss) to the armory. */
  private trimEquipment(m: Mech): void {
    while (m.equipment.length > slotsFor(m.level)) this.stashItem(m.equipment.pop()!);
  }

  // ---------- Spinning ----------

  spin(): void {
    if (!this.canSpin()) return;
    this.scrap -= this.spinCost;
    this.spinsThisWave++;
    this.lineFlash = null;
    this.winFx = null;
    this.spinPress = 0.15;
    const result = rollGrid(this.mods.weights);
    // Reels stop in a random order, with a little random timing, so no two spins feel the same.
    const order = shuffled([0, 1, 2]);
    const last = order[2];
    // Suspense only on a genuine pair, and not every time, so it stays special:
    // always for two pairs, sometimes for one.
    const pairs = mechPairs(result, last);
    const anticipation = pairs >= 2 || (pairs === 1 && Math.random() < 0.3);
    const stops = [0, 0, 0];
    let at = 0.5 + Math.random() * 0.2;
    order.forEach((col, k) => {
      if (k > 0) at += 0.2 + Math.random() * 0.18;
      if (k === 2 && anticipation) at += 0.9;
      stops[col] = at;
    });
    this.reel = {
      result,
      t: 0,
      stops,
      order,
      last,
      speeds: [0, 1, 2].map(() => 13 + Math.random() * 6),
      strips: [0, 1, 2].map(() => Array.from({ length: 40 }, () => rollSymbol(this.mods.weights))),
      anticipation,
      tension: 0,
    };
    this.phase = 'spinning';
    this.sound('spinStart', { pan: -0.45 });
  }

  /** Plays a sound panned to where it happens on the battlefield. */
  private soundAt(name: Sfx, x: number, y: number): void {
    const sx = project(x, y).x;
    this.sound(name, { pan: Math.max(-0.85, Math.min(0.85, ((sx - FIELD_X) / (W - FIELD_X)) * 1.7 - 0.85)) });
  }

  private reelStopped(col: number): void {
    // Each reel has its own thud (by stop order) and sits slightly left (the slot machine is on the left).
    const order = this.reel ? this.reel.order.indexOf(col) : 0;
    this.sound('reelStop', { count: order, pan: -0.6 + col * 0.15 });
    this.panelShake = Math.max(this.panelShake, col === this.reel?.last && this.reel.anticipation ? 7 : 3);
    for (let row = 0; row < 3; row++) {
      const r = slotCellRect(row * 3 + col);
      for (let k = 0; k < 4; k++) this.uiParticle(r.x + Math.random() * r.w, r.y + r.h, (Math.random() - 0.5) * 160, -60 - Math.random() * 120, '#ffe066', 2 + Math.random() * 2, 0.35);
    }
  }

  private uiParticle(x: number, y: number, vx: number, vy: number, color: string, size: number, life: number): void {
    this.uiParticles.push({ x, y, vx, vy, color, size, life, max: life, gravity: 500 });
  }

  /** Confetti fountain from the reels; scrap wins throw grey cogs. */
  private confetti(count: number, colors: string[]): void {
    const r = slotCellRect(4);
    for (let k = 0; k < count; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 260 + Math.random() * 380;
      this.uiParticle(r.x + r.w / 2 + (Math.random() - 0.5) * 60, r.y + r.h / 2, Math.cos(a) * v, Math.sin(a) * v, colors[k % colors.length], 3 + Math.random() * 4, 1 + Math.random() * 0.9);
    }
  }

  private resolveSpin(): void {
    if (!this.reel) return;
    const grid = this.reel.result;
    this.lastGrid = grid;
    this.reel = null;
    this.phase = 'build';

    const centre = slotCellRect(4);
    const cx = centre.x + centre.w / 2;
    const cy = centre.y + centre.h / 2;
    const scrapSymbols = grid.filter((s) => s === 'scrap').length;
    if (scrapSymbols) {
      this.addScrap(scrapSymbols * (1 + this.mods.scrapSymbol), cx, cy + 40);
      this.sound('scrap');
    }

    const lines = findLines(grid);
    if (!lines.length) {
      this.winFx = { t: 0, tier: 'none', label: 'NO MATCH', sub: '', lines: [] };
      this.sound('noMatch');
      return;
    }

    for (const line of lines) {
      const mid = slotCellRect(line.cells[1]);
      const from = { x: mid.x + mid.w / 2, y: mid.y + mid.h / 2 };
      if (line.symbol === 'scrap') {
        this.addScrap(SCRAP_LINE, from.x, from.y - 20);
        continue;
      }
      if (line.symbol === 'wild') {
        const type = MECH_TYPES[Math.floor(Math.random() * MECH_TYPES.length)];
        this.deploy(type, 2, from);
        continue;
      }
      const type = line.symbol as MechType;
      this.deploy(type, 1, from);
      if (Math.random() < this.mods.extraUnit) this.deploy(type, 1, from);
    }
    this.lineFlash = { lines, t: 2 };
    this.celebrate(lines);
  }

  private celebrate(lines: LineMatch[]): void {
    const units = lines.filter((l) => l.symbol !== 'scrap').length;
    const core = lines.some((l) => l.symbol === 'wild');
    const tier: WinTier = core || lines.length >= 3 ? 'jackpot' : lines.length === 2 ? 'big' : units ? 'win' : 'scrap';
    const label = { jackpot: 'JACKPOT!', big: 'BIG WIN!', win: 'LAUNCH!', scrap: 'SCRAP!', none: '' }[tier];
    const parts: string[] = [];
    if (units) parts.push(`${units} unit${units > 1 ? 's' : ''} launching`);
    if (core) parts.push('elite unit');
    if (lines.length - units) parts.push(`+${SCRAP_LINE * (lines.length - units)} scrap`);
    this.winFx = { t: 0, tier, label, sub: parts.join(' · '), lines };

    const colors = tier === 'scrap' ? ['#9aa4b5', '#d6dde8', '#7d8798'] : ['#ffe066', '#ff5ad8', '#6dffb8', '#5b8cff', '#ffffff', '#c77dff'];
    this.confetti({ jackpot: 140, big: 80, win: 45, scrap: 30, none: 0 }[tier], colors);
    this.panelFlash = tier === 'jackpot' ? 0.5 : 0.3;
    this.panelShake = tier === 'jackpot' ? 12 : tier === 'big' ? 8 : 5;
    this.sound(tier === 'jackpot' ? 'jackpot' : 'win', { count: lines.length });
    this.shake = tier === 'jackpot' ? 10 : 6;
  }

  /** Finds an open spot in the deployment zone, away from other units and towards the rear. */
  private findSpot(): Vec {
    let best: Vec = { x: 60, y: LY / 2 };
    let bestScore = -Infinity;
    for (let k = 0; k < 60; k++) {
      const c = clampToDeploy({ x: 40 + Math.random() * (DEPLOY_X - 70), y: 24 + Math.random() * (LY - 48) });
      let nearest = 80;
      for (const m of this.bays) if (m) nearest = Math.min(nearest, Math.hypot(m.hx - c.x, m.hy - c.y));
      const score = nearest - c.x * 0.08;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  /** Puts a new unit on the field. Returns false when the hangar is full. */
  private deploy(type: MechType, level: number, from: Vec | null, at?: Vec): boolean {
    const i = this.bays.findIndex((m) => !m);
    if (i < 0) {
      if (from) {
        this.addScrap(HANGAR_FULL_SCRAP, from.x, from.y);
        this.floater(from.x, from.y - 20, 'HANGAR FULL', '#ffb347', 13);
      }
      return false;
    }

    const home = at ?? this.findSpot();
    const m: Mech = {
      type,
      level,
      xp: 0,
      hp: 0,
      cd: 0,
      roll: 0.85 + Math.random() * 0.3,
      imprint: Math.random() < IMPRINT_CHANCE ? IMPRINTS[Math.floor(Math.random() * IMPRINTS.length)] : null,
      recoil: 0,
      flash: 0,
      wrecked: false,
      spawn: SPAWN_TIME,
      x: home.x,
      y: home.y,
      hx: home.x,
      hy: home.y,
      flip: false,
      moving: false,
      face: 0,
      mk2: null,
      mk3: null,
      equipment: [],
      boosts: emptyBoosts(),
      boostSpent: 0,
    };
    m.hp = this.stats(m).maxHp;
    this.bays[i] = m;

    const pos = project(home.x, home.y);
    if (from) this.sound('launch');
    if (from) this.effects.push({ kind: 'orb', x: from.x, y: from.y, tx: pos.x, ty: pos.y - 35, r: 10, color: MECHS[type].colors.main, life: SPAWN_TIME - 0.1, max: SPAWN_TIME - 0.1 });
    return true;
  }

  // ---------- Drag and drop ----------

  canDrag(i: number): boolean {
    const m = this.bays[i];
    return this.phase === 'build' && !this.upgradeChoice() && !!m && !m.wrecked && m.spawn <= 0;
  }

  canMerge(from: number, to: number): boolean {
    const a = this.bays[from];
    const b = this.bays[to];
    return from !== to && !!a && !!b && a.type === b.type && b.level < MAX_LEVEL;
  }

  /** Drop a dragged unit onto another unit: merge with the same type, swap places with a different one. */
  drop(from: number, to: number): void {
    if (!this.canDrag(from) || from === to) return;
    const a = this.bays[from]!;
    const b = this.bays[to];
    const pos = this.screenPos(b ?? a);

    if (b && this.canMerge(from, to)) {
      b.roll = Math.max(b.roll, a.roll);
      if (!b.imprint && a.imprint) {
        b.imprint = a.imprint;
        this.floater(pos.x, pos.y - 110, `+${a.imprint.name.toUpperCase()}`, '#c77dff', 11);
      }
      this.bays[from] = null;
      this.addXp(b, mergeValue(a), to);
      this.sound(this.pendingUpgrades.includes(to) ? 'promote' : 'merge');
      // Scrap upgrades add together, so nothing spent is wasted (up to the maximum rank).
      for (const id of Object.keys(b.boosts) as BoostId[]) b.boosts[id] = Math.min(BOOST_MAX, b.boosts[id] + a.boosts[id]);
      b.boostSpent += a.boostSpent;
      for (const id of a.equipment) {
        if (b.equipment.length < slotsFor(b.level)) b.equipment.push(id);
        else this.stashItem(id, pos);
      }
      b.hp = this.stats(b).maxHp;
      this.burst(pos.x, pos.y - 35, MECHS[b.type].colors.main, 20, 160);
      this.effects.push({ kind: 'ring', x: pos.x, y: pos.y - 35, r: 50, color: MECHS[b.type].colors.main, life: 0.35, max: 0.35 });
      return;
    }
    if (!b || b.type === a.type) return;
    // A different type: the two units swap places.
    const home = { x: a.hx, y: a.hy };
    this.place(a, { x: b.hx, y: b.hy });
    this.place(b, home);
    this.sound('place');
  }

  /** Moves a unit to a new spot in the deployment zone. */
  moveUnit(i: number, to: Vec): void {
    const m = this.bays[i];
    if (!m || !this.canDrag(i)) return;
    this.place(m, clampToDeploy(to));
    const p = project(m.x, m.y);
    this.effects.push({ kind: 'drop', x: p.x, y: p.y, r: 0, color: MECHS[m.type].colors.main, life: 0.3, max: 0.3 });
    this.sound('place');
  }

  private place(m: Mech, at: Vec): void {
    m.x = m.hx = at.x;
    m.y = m.hy = at.y;
    m.flip = false;
    m.face = 0;
  }

  /** Scrap for the next rank of a scrap upgrade on this mech. */
  boostCost(m: Mech, id: BoostId): number {
    return boostCost(m.boosts[id]);
  }

  canBoost(i: number, id: BoostId): boolean {
    const m = this.bays[i];
    return this.canDrag(i) && !!m && m.boosts[id] < BOOST_MAX && this.scrap >= this.boostCost(m, id);
  }

  /** Buys one rank of a scrap upgrade (Firepower, Armour, Reactor or Thrusters). */
  boost(i: number, id: BoostId): void {
    const m = this.bays[i];
    if (!m || !this.canBoost(i, id)) return;
    const cost = this.boostCost(m, id);
    this.scrap -= cost;
    m.boostSpent += cost;
    m.boosts[id]++;
    m.hp = this.stats(m).maxHp;
    const def = boostDef(id, m.type);
    const pos = this.screenPos(m);
    this.floater(pos.x, pos.y - 95, `${def.name.toUpperCase()} ${m.boosts[id]}`, def.color, 13);
    this.burst(pos.x, pos.y - 35, def.color, 18, 150);
    this.effects.push({ kind: 'ring', x: pos.x, y: pos.y - 35, r: 46, color: def.color, life: 0.35, max: 0.35 });
    this.sound('equip');
  }

  salvageValue(m: Mech): number {
    return 2 * mergeValue(m) + Math.floor(m.boostSpent / 2);
  }

  salvage(i: number): void {
    const m = this.bays[i];
    if (!this.canDrag(i) || !m) return;
    const pos = this.screenPos(m);
    this.addScrap(this.salvageValue(m), pos.x, pos.y - 40);
    this.burst(pos.x, pos.y - 20, '#8a93a3', 20, 140);
    for (const id of m.equipment) this.stashItem(id, pos);
    this.bays[i] = null;
    this.sound('salvage');
  }

  private addXp(m: Mech, amount: number, bay: number): void {
    const pos = this.screenPos(m);
    const before = tierOf(m.level);
    m.xp += amount;
    while (m.level < MAX_LEVEL && m.xp >= xpToNext(m.level)) {
      m.xp -= xpToNext(m.level);
      m.level++;
    }
    if (m.level >= MAX_LEVEL) m.xp = 0;
    const promoted = tierOf(m.level) > before;
    this.floater(pos.x, pos.y - 100, promoted ? `PROMOTED ${className(m.level)}` : `LV ${m.level}`, promoted ? '#ffe066' : '#ffffff', promoted ? 15 : 13);
    if (promoted) {
      this.burst(pos.x, pos.y - 30, '#ffe066', 30, 180);
      if (!this.pendingUpgrades.includes(bay)) this.pendingUpgrades.push(bay);
    }
    m.hp = this.stats(m).maxHp;
  }

  screenPos(u: Vec): Vec {
    return project(u.x, u.y);
  }

  // ---------- Waves ----------

  launch(): void {
    if (this.phase !== 'build' || this.upgradeChoice()) return;
    this.selected = null;
    this.dragItem = null;
    this.phase = 'combat';
    this.drag = null;
    this.lineFlash = null;
    this.waveT = 0;
    this.spawnQueue = waveSpawns(this.wave);
    this.bays.forEach((m) => {
      if (!m) return;
      m.hp = this.stats(m).maxHp;
      m.cd = Math.random() * 0.3;
      m.spawn = 0;
    });
    const boss = this.spawnQueue.some((s) => s.type === 'titan');
    const before = new Set(this.wave > 1 ? waveRoster(this.wave - 1) : []);
    const fresh = waveRoster(this.wave).filter((t) => t !== 'titan' && !before.has(t));
    this.sound(boss ? 'bossStart' : 'waveStart');
    if (boss) this.announce(`WAVE ${this.wave}: JUDGEMENT WAVE`);
    else if (fresh.length && this.wave > 1) this.announce(`WAVE ${this.wave}: NEW ${fresh.map((t) => ENEMIES[t].name.toUpperCase()).join(' + ')}`);
    else this.announce(`WAVE ${this.wave}`);
  }

  pickReward(index: number): void {
    const choice = this.rewardChoices[index];
    if (this.phase !== 'reward' || !choice) return;
    if (choice.kind === 'core') {
      this.sound('equip');
      choice.core.apply(this.mods, this);
      this.cores.push(choice.core);
      this.announce(`${choice.core.name} installed`);
    } else {
      this.sound('equip');
      this.stashItem(choice.id);
      this.announce(`${equipById(choice.id).name} added to the armory`);
    }
    for (const m of this.bays) if (m) m.hp = this.stats(m).maxHp;
    this.wave++;
    this.spinsThisWave = 0;
    this.phase = 'build';
  }

  toggleSpeed(): void {
    this.speed = this.speed >= 3 ? 1 : this.speed + 1;
  }

  // ---------- Update ----------

  update(dt: number): void {
    this.time += dt;
    this.messageT = Math.max(0, this.messageT - dt);
    this.shake = Math.max(0, this.shake - dt * 30);
    if (this.lineFlash) {
      this.lineFlash.t -= dt;
      if (this.lineFlash.t <= 0) this.lineFlash = null;
    }

    if (this.phase === 'spinning' && this.reel) {
      const before = this.reel.t;
      this.reel.t += dt;
      this.reel.stops.forEach((stop, col) => {
        if (before < stop && this.reel!.t >= stop) this.reelStopped(col);
      });
      const r = this.reel;
      const second = r.stops[r.order[1]];
      const final = r.stops[r.last];
      if (r.anticipation && r.t > second && r.t < final) {
        // Suspense: ticks speed up and rise in pitch until the last reel lands.
        const step = Math.floor(((r.t - second) / (final - second)) * 14);
        if (step > r.tension) {
          r.tension = step;
          this.sound('tension', { count: step, pan: -0.45 });
        }
      } else if (r.t < final) this.sound('tick');
      if (this.reel.t >= final + 0.2) this.resolveSpin();
    }

    const steps = this.phase === 'combat' ? this.speed : 1;
    for (let s = 0; s < steps; s++) {
      if (this.phase === 'combat') this.updateCombat(dt);
      this.updateEffects(dt);
    }
  }

  private updateCombat(dt: number): void {
    this.waveT += dt;

    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.waveT) {
      const s = this.spawnQueue.shift()!;
      const hp = ENEMIES[s.type].hp * enemyHpScale(this.wave);
      const lane = ((s.row + 0.5) / ROWS) * LY + (Math.random() - 0.5) * 40;
      this.enemies.push({ type: s.type, x: LX + 20, y: lane, lane, hp, maxHp: hp, cd: 0.5, flash: 0, attack: 0, dead: false, flip: false, face: Math.PI, rcd: 1.5 });
    }

    for (const m of this.bays) if (m && !m.wrecked) this.updateMech(m, this.stats(m), dt);
    for (const e of this.enemies) if (!e.dead) this.updateEnemy(e, dt);
    this.separate();

    for (const p of this.projectiles) this.updateProjectile(p, dt);

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((p) => !p.done);

    if (this.baseHp <= 0) {
      this.phase = 'over';
      this.sound('gameOver');
      return;
    }
    if (this.spawnQueue.length === 0 && this.enemies.length === 0) this.endWave();
  }

  /** Only beam weapons can track flying enemies. */
  private canHit(m: Mech, e: Enemy): boolean {
    return !ENEMIES[e.type].flying || MECHS[m.type].attack === 'bullet';
  }

  private updateMech(m: Mech, st: MechStats, dt: number): void {
    m.hp = Math.min(st.maxHp, m.hp + st.regen * dt);
    m.recoil = Math.max(0, m.recoil - dt * 6);
    m.cd -= dt;

    // Pick the best visible target: anything already in range first, then whoever is closest to the mothership.
    let target: Enemy | null = null;
    let best = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.x > ENTRY_X || !this.canHit(m, e)) continue;
      const gap = dist(m, e) - MECH_RADIUS - ENEMIES[e.type].radius;
      if (gap > st.range + SIGHT) continue;
      // Never turn round to chase: enemies behind us only count if we can shoot them from here.
      const behind = e.x < m.x - 10;
      if (behind && gap > st.range) continue;
      const score = (gap <= st.range ? -10000 : 0) + e.x + gap * 0.5 - (ENEMIES[e.type].heal ? 150 : 0);
      if (score < best) {
        best = score;
        target = e;
      }
    }

    m.moving = false;
    if (target) {
      m.flip = project(target.x, target.y).x < project(m.x, m.y).x;
      m.face = Math.atan2(target.y - m.y, target.x - m.x);
      const gap = dist(m, target) - MECH_RADIUS - ENEMIES[target.type].radius;
      if (gap <= st.range) {
        if (m.cd <= 0) {
          this.fire(m, st, target);
          m.cd = st.cooldown;
        }
        return;
      }
      if (st.speed > 0) {
        const x0 = m.x;
        m.moving = stepTowards(m, target, st.speed * dt);
        m.x = Math.max(x0, m.x);
      }
      return;
    }

    // Nothing in reach: advance towards the enemy edge, but only once enemies are on the field.
    m.flip = false;
    m.face = 0;
    const enemiesOnField = this.enemies.some((e) => !e.dead && e.x <= ENTRY_X);
    // Lancers march all the way to the end; other mechs wait in mid-field.
    const limit = m.type === 'lancer' ? CHASE_LIMIT : FRONT_LINE;
    if (enemiesOnField && st.speed > 0 && m.x < limit) {
      m.x = Math.min(limit, m.x + st.speed * dt);
      m.moving = true;
    }
  }

  /** The mech an enemy should go for: taunting units first, otherwise the nearest one within aggro range. */
  private enemyTarget(e: Enemy): { m: Mech; i: number; gap: number } | null {
    const def = ENEMIES[e.type];
    if (def.aggro <= 0) return null;
    let found: { m: Mech; i: number; gap: number } | null = null;
    let best = Infinity;
    this.bays.forEach((m, i) => {
      if (!m || m.wrecked) return;
      const gap = dist(m, e) - MECH_RADIUS - def.radius;
      const taunting = gap < 170 && this.stats(m).specials.includes('taunt');
      if (gap > def.aggro && !taunting) return;
      const score = gap - (taunting ? 1000 : 0);
      if (score < best) {
        best = score;
        found = { m, i, gap };
      }
    });
    return found;
  }

  private updateEnemy(e: Enemy, dt: number): void {
    const def = ENEMIES[e.type];
    e.attack = Math.max(0, e.attack - dt * 4);
    e.cd -= dt;
    e.rcd -= dt;

    if (def.heal) this.healAround(e, dt);

    // Enemies march onto the field before they can engage (and be engaged).
    const target = e.x > ENTRY_X ? null : this.enemyTarget(e);
    if (target) {
      const { m, i, gap } = target;
      e.flip = project(m.x, m.y).x > project(e.x, e.y).x;
      e.face = Math.atan2(m.y - e.y, m.x - e.x);
      if (gap > def.range) {
        stepTowards(e, m, def.speed * dt);
        // Bosses shell targets with their cannon while closing in.
        if (def.ranged && gap <= def.ranged.range && e.rcd <= 0) this.fireCannon(e, { x: m.x, y: m.y }, i);
      } else if (def.explode) {
        this.explodeBomber(e);
        return;
      } else if (e.cd <= 0) {
        e.cd = def.cooldown;
        e.attack = 1;
        const from = project(e.x + Math.cos(e.face) * def.radius, e.y + Math.sin(e.face) * def.radius, enemyHeight(e.type) * 0.55);
        const to = project(m.x, m.y, 30);
        const fy = from.y;
        const fx = from.x;
        if (e.type === 'sniper') this.effects.push({ kind: 'tracer', x: fx, y: fy, tx: to.x, ty: to.y, r: 3, color: '#ff3b7f', life: 0.18, max: 0.18 });
        else if (def.range > 30) this.effects.push({ kind: 'tracer', x: fx, y: fy, tx: to.x, ty: to.y, r: 0, color: '#ffef5c', life: 0.08, max: 0.08 });
        this.particle(fx, fy, 0, 0, e.type === 'sniper' ? '#ff9ae6' : '#ffef5c', 7, 0.08, 0);
        this.soundAt(e.type === 'sniper' ? 'sniper' : def.range > 30 ? 'enemyShot' : 'mechHit', e.x, e.y);
        this.damageMech(i, def.dmg * enemyDmgScale(this.wave));
      }
    } else {
      e.flip = false;
      e.face = Math.PI;
      // Repair units hang back behind the front line.
      const ahead = def.heal ? this.enemies.some((o) => o !== e && !o.dead && o.x < e.x && o.x > e.x - 140) : true;
      if (ahead || e.x > 200) e.x -= def.speed * dt;
      // With nothing to fight, a boss in range shells the mothership.
      if (def.ranged && e.x <= ENTRY_X && e.x < def.ranged.range && e.rcd <= 0) this.fireCannon(e, { x: 0, y: e.y }, null);
      e.y += (e.lane - e.y) * Math.min(1, dt * (def.flying ? 0.3 : 0.8));
    }

    e.y = Math.max(8, Math.min(LY - 8, e.y));
    if (e.x <= def.radius) {
      e.dead = true;
      this.sound('baseHit', { pan: -0.5 });
      const hit = baseDamageFor(def.baseDamage, this.wave);
      this.baseHp = Math.max(0, this.baseHp - hit);
      this.shake = 10;
      const p = project(0, e.y);
      this.burst(p.x, p.y - 30, '#ff3b6b', 24, 200);
      this.floater(p.x + 20, p.y - 60, `-${hit}`, '#ff3b6b', 16);
    }
  }

  /** Boss cannon: a heavy beam that explodes on impact. `bay` is null when shelling the mothership. */
  private fireCannon(e: Enemy, at: Vec, bay: number | null): void {
    const def = ENEMIES[e.type];
    const gun = def.ranged!;
    e.rcd = gun.cooldown;
    e.attack = 1;
    const from = project(e.x + Math.cos(e.face) * def.radius, e.y + Math.sin(e.face) * def.radius, enemyHeight(e.type) * 0.55);
    const to = project(at.x, at.y, bay === null ? 30 : 20);
    this.effects.push({ kind: 'tracer', x: from.x, y: from.y, tx: to.x, ty: to.y, r: 7, color: '#ffef5c', life: 0.22, max: 0.22 });
    this.effects.push({ kind: 'ring', x: to.x, y: to.y, r: gun.splash * 1.4, color: '#ff9d2f', life: 0.35, max: 0.35 });
    this.burst(to.x, to.y, '#ffef5c', 22, 200);
    this.blasts.push({ x: at.x, y: at.y, h: 18, size: gun.splash * 0.8, color: '#ffd23f' });
    this.soundAt('sniper', e.x, e.y);
    this.soundAt('explosion', at.x, at.y);
    this.shake = Math.max(this.shake, 6);
    if (bay === null) {
      const hit = baseDamageFor(2, this.wave);
      this.baseHp = Math.max(0, this.baseHp - hit);
      this.floater(to.x + 20, to.y - 30, `-${hit}`, '#ff3b6b', 16);
      this.sound('baseHit', { pan: -0.5 });
      return;
    }
    // Direct hit on the target, splash on mechs around it.
    const dmg = gun.dmg * enemyDmgScale(this.wave);
    this.damageMech(bay, dmg);
    this.bays.forEach((m, k) => {
      if (m && k !== bay && !m.wrecked && dist(m, at) <= gun.splash + MECH_RADIUS) this.damageMech(k, dmg * 0.5);
    });
  }

  private healAround(e: Enemy, dt: number): void {
    const def = ENEMIES[e.type];
    const amount = (def.heal ?? 0) * enemyHpScale(this.wave) * dt;
    let healed = false;
    for (const o of this.enemies) {
      if (o.dead || o === e || o.hp >= o.maxHp || dist(o, e) > 110) continue;
      o.hp = Math.min(o.maxHp, o.hp + amount);
      healed = true;
      if (Math.random() < dt * 3) {
        const p = project(o.x, o.y, enemyHeight(o.type) * 0.6);
        this.particle(p.x + (Math.random() - 0.5) * 16, p.y, 0, -40, '#6dffb8', 4, 0.5, 0);
      }
    }
    if (healed) this.sound('heal');
    if (healed && Math.random() < dt * 1.5) {
      const p = project(e.x, e.y);
      this.effects.push({ kind: 'ring', x: p.x, y: p.y - 10, r: 90, color: '#6dffb8', life: 0.5, max: 0.5 });
    }
  }

  private explodeBomber(e: Enemy): void {
    const def = ENEMIES[e.type];
    e.dead = true;
    const p = project(e.x, e.y);
    this.burst(p.x, p.y - 20, '#ff9d2f', 40, 240);
    this.burst(p.x, p.y - 20, '#ffef5c', 16, 140);
    this.effects.push({ kind: 'ring', x: p.x, y: p.y - 10, r: (def.explode ?? 0) * 1.4, color: '#ff9d2f', life: 0.4, max: 0.4 });
    this.shake = Math.max(this.shake, 8);
    this.soundAt('bigExplosion', e.x, e.y);
    this.bays.forEach((m, i) => {
      if (m && !m.wrecked && dist(m, e) <= (def.explode ?? 0) + MECH_RADIUS) this.damageMech(i, def.dmg * enemyDmgScale(this.wave));
    });
  }

  /** Keeps units from stacking: mechs push each other apart, enemies push each other apart, enemies give way to mechs. */
  private separate(): void {
    const mechs = this.bays.filter((m): m is Mech => !!m && !m.wrecked);
    const startX = mechs.map((m) => m.x);
    for (let a = 0; a < mechs.length; a++) {
      for (let b = a + 1; b < mechs.length; b++) {
        const A = mechs[a];
        const B = mechs[b];
        const d = dist(A, B);
        const min = MECH_RADIUS * 2;
        if (d >= min || d === 0) continue;
        const push = (min - d) / 2 / d;
        const dx = (A.x - B.x) * push;
        const dy = (A.y - B.y) * push;
        A.x += dx;
        A.y += dy;
        B.x -= dx;
        B.y -= dy;
      }
    }
    // Units only ever give way sideways or forwards, never backwards.
    mechs.forEach((m, k) => (m.x = Math.max(m.x, startX[k])));
    for (const m of mechs) {
      m.x = Math.max(10, Math.min(CHASE_LIMIT, m.x));
      m.y = Math.max(10, Math.min(LY - 10, m.y));
    }
    for (let a = 0; a < this.enemies.length; a++) {
      const A = this.enemies[a];
      const ra = ENEMIES[A.type].radius;
      for (let b = a + 1; b < this.enemies.length; b++) {
        const B = this.enemies[b];
        const d = dist(A, B);
        const min = ra + ENEMIES[B.type].radius;
        if (d >= min) continue;
        if (d === 0) {
          A.y += 1;
          continue;
        }
        const push = (min - d) / 2 / d;
        const dx = (A.x - B.x) * push;
        const dy = (A.y - B.y) * push;
        A.x += dx;
        A.y += dy;
        B.x -= dx;
        B.y -= dy;
      }
      for (const m of mechs) {
        const d = dist(A, m);
        const min = ra + MECH_RADIUS;
        if (d >= min || d === 0) continue;
        const push = (min - d) / d;
        if (A.x > ENTRY_X - 30) {
          // An enemy still stepping onto the field: the mech gives way, so nobody gets stuck in the spawn zone.
          m.x -= (A.x - m.x) * push;
          m.y -= (A.y - m.y) * push;
        } else {
          A.x += (A.x - m.x) * push;
          A.y += (A.y - m.y) * push;
        }
      }
    }
  }

  /** +20% damage for each Commander within range (not counting itself). */
  private auraBonus(m: Mech): number {
    let bonus = 1;
    for (const o of this.bays) {
      if (o && o !== m && !o.wrecked && dist(o, m) < 140 && this.stats(o).specials.includes('aura')) bonus *= 1.2;
    }
    return bonus;
  }

  private fire(m: Mech, st: MechStats, target: Enemy): void {
    const crit = m.imprint?.id === 'critical' && Math.random() < 0.25;
    const dmg = st.dmg * (crit ? 2 : 1) * this.auraBonus(m);
    const attack = MECHS[m.type].attack;
    const scale = mechScale(tierOf(m.level));
    const muzzle = MUZZLE[m.type];
    m.face = Math.atan2(target.y - m.y, target.x - m.x);
    m.recoil = 1;

    if (attack === 'melee') {
      this.damageEnemy(target, dmg, m, crit, true);
      this.soundAt('slash', m.x, m.y);
      const tp = project(target.x, target.y, enemyHeight(target.type) * 0.5);
      const ty = tp.y;
      const cleave = st.specials.includes('cleave');
      this.effects.push({ kind: 'slash', x: tp.x + (m.flip ? 6 : -6), y: ty, r: cleave ? 40 : 24, color: cleave ? '#ffb347' : '#ff5ad8', life: 0.18, max: 0.18 });
      for (let k = 0; k < 8; k++) this.particle(tp.x, ty + (Math.random() - 0.5) * 24, (m.flip ? -1 : 1) * (60 + Math.random() * 140), (Math.random() - 0.5) * 140, '#ff9ae6', 3, 0.25, 0);
      if (cleave) {
        for (const e of this.enemies) {
          if (e !== target && !e.dead && !ENEMIES[e.type].flying && dist(e, target) < 45) this.damageEnemy(e, dmg * 0.6, m, false, true);
        }
      }
      return;
    }

    const sx = m.x + Math.cos(m.face) * muzzle.fwd * scale;
    const sy = m.y + Math.sin(m.face) * muzzle.fwd * scale;
    const sz = muzzle.h * scale;
    if (attack === 'bullet') {
      const tz = enemyHeight(target.type) * 0.6;
      const splash = st.specials.includes('splashShots') ? 40 : 0;
      this.soundAt(m.type === 'bulwark' ? 'pellet' : 'beam', m.x, m.y);
      this.projectiles.push({ kind: 'bullet', x: sx, y: sy, z: sz, sx, sy, sz, tx: target.x, ty: target.y, tz, target, dmg, splash, p: 0, duration: 0, owner: m, done: false });
      const mp = project(sx, sy);
      this.particle(mp.x, mp.y - sz, 0, 0, '#fff3a0', 6, 0.06, 0);
      return;
    }

    const targets = [target];
    if (st.specials.includes('multishot')) {
      const other = this.enemies.filter((e) => e !== target && !e.dead && e.x <= ENTRY_X && !ENEMIES[e.type].flying);
      if (other.length) targets.push(other[Math.floor(Math.random() * other.length)]);
    }
    this.soundAt('shell', m.x, m.y);
    targets.forEach((t, k) => {
      // Shell: lob at where the target will roughly be on landing.
      const d = dist({ x: sx, y: sy }, t);
      const duration = Math.max(0.6, d / 380) + k * 0.15;
      const tx = t.x - ENEMIES[t.type].speed * duration * 0.8;
      this.projectiles.push({ kind: 'shell', x: sx, y: sy, z: sz, sx, sy, sz, tx, ty: t.y, tz: 0, target: null, dmg, splash: st.splash, p: 0, duration, owner: m, done: false });
    });
    const mp = project(sx, sy);
    this.burst(mp.x, mp.y - sz, '#ffc23d', 6, 80);
  }

  private updateProjectile(p: Projectile, dt: number): void {
    if (p.kind === 'bullet') {
      if (p.target && !p.target.dead) {
        p.tx = p.target.x;
        p.ty = p.target.y;
      }
      const total = Math.max(1, dist({ x: p.sx, y: p.sy }, { x: p.tx, y: p.ty }));
      const d = dist(p, { x: p.tx, y: p.ty });
      const step = BULLET_SPEED * dt;
      if (d <= step) {
        p.done = true;
        const victim = p.target;
        if (victim && !victim.dead) this.damageEnemy(victim, p.dmg, p.owner, false, false);
        const hp = project(p.tx, p.ty);
        if (p.splash > 0) {
          this.burst(hp.x, hp.y - p.tz, '#ff9d2f', 16, 150);
          this.soundAt('explosion', p.tx, p.ty);
          this.effects.push({ kind: 'ring', x: hp.x, y: hp.y - p.tz, r: p.splash * 1.2, color: '#ff9d2f', life: 0.25, max: 0.25 });
          for (const e of this.enemies) {
            if (e !== victim && !e.dead && !ENEMIES[e.type].flying && dist(e, { x: p.tx, y: p.ty }) <= p.splash + ENEMIES[e.type].radius) this.damageEnemy(e, p.dmg * 0.6, p.owner, false, false);
          }
        } else this.burst(hp.x, hp.y - p.tz, '#ffe066', 3, 60);
        return;
      }
      p.x += ((p.tx - p.x) / d) * step;
      p.y += ((p.ty - p.y) / d) * step;
      const t = 1 - Math.min(1, (d - step) / total);
      p.z = p.sz + (p.tz - p.sz) * t;
      return;
    }

    p.p += dt / p.duration;
    const t = Math.min(1, p.p);
    p.x = p.sx + (p.tx - p.sx) * t;
    p.y = p.sy + (p.ty - p.sy) * t;
    p.z = p.sz * (1 - t) + Math.sin(Math.PI * t) * 150;
    const sp = project(p.x, p.y);
    if (Math.random() < 0.6) this.particle(sp.x, sp.y - p.z, 0, 0, 'rgba(200,200,200,0.5)', 3, 0.35, -20);
    if (t < 1) return;

    p.done = true;
    this.shake = Math.max(this.shake, 4);
    this.soundAt('explosion', p.tx, p.ty);
    const hp = project(p.tx, p.ty);
    this.burst(hp.x, hp.y - 6, '#ff9d2f', 22, 180);
    this.burst(hp.x, hp.y - 6, '#fff3a0', 8, 90);
    this.effects.push({ kind: 'ring', x: hp.x, y: hp.y - 4, r: p.splash * 1.2, color: '#ff9d2f', life: 0.3, max: 0.3 });
    for (const e of this.enemies) {
      if (e.dead || ENEMIES[e.type].flying) continue;
      if (dist(e, { x: p.tx, y: p.ty }) <= p.splash + ENEMIES[e.type].radius) this.damageEnemy(e, p.dmg, p.owner, false, false);
    }
  }

  private damageEnemy(e: Enemy, rawDmg: number, owner: Mech, crit: boolean, melee: boolean): void {
    // Enemies can't be hurt until they have entered the field (splash damage included).
    if (e.dead || e.x > ENTRY_X) return;
    const armour = melee ? 0 : (ENEMIES[e.type].armour ?? 0);
    const dmg = rawDmg * (1 - armour);
    e.hp -= dmg;
    e.flash = 0.08;
    const sp = project(e.x, e.y);
    const top = project(e.x, e.y, enemyHeight(e.type) + 8);
    if (armour > 0 && Math.random() < 0.3) this.particle(sp.x - 10, (sp.y + top.y) / 2, -30, -30, '#7df4ff', 4, 0.2, 0);
    this.floater(top.x + (Math.random() - 0.5) * 16, top.y, `${Math.round(dmg)}${crit ? '!' : ''}`, crit ? '#ff9d2f' : armour > 0 ? '#9fb3c8' : '#ffffff', crit ? 14 : 10);
    if (e.hp > 0) return;

    e.dead = true;
    this.kills++;
    this.soundAt(e.type === 'titan' ? 'bigExplosion' : 'enemyDie', e.x, e.y);
    const def = ENEMIES[e.type];
    const reward = Math.ceil(def.reward * (1 + 0.15 * (this.wave - 1))) + this.mods.killScrap + (owner.imprint?.id === 'salvager' ? 1 : 0);
    const ey = project(e.x, e.y, enemyHeight(e.type) * 0.4).y;
    this.addScrap(reward, sp.x, ey - 20);
    this.burst(sp.x, ey, '#c77dff', e.type === 'titan' ? 60 : 16, e.type === 'titan' ? 260 : 150);
    this.burst(sp.x, ey, '#ff9d2f', e.type === 'titan' ? 30 : 6, 120);
    this.effects.push({ kind: 'ring', x: sp.x, y: ey, r: e.type === 'titan' ? 140 : 40, color: e.type === 'titan' ? '#ffef5c' : '#ff9d2f', life: 0.35, max: 0.35 });
    if (e.type === 'titan') {
      this.shake = 16;
      const drop = EQUIPMENT[Math.floor(Math.random() * EQUIPMENT.length)];
      this.stashItem(drop.id, sp);
      this.floater(sp.x, ey - 50, `DROP: ${drop.name.toUpperCase()}`, drop.color, 15);
    }
  }

  private damageMech(i: number, dmg: number): void {
    const m = this.bays[i];
    if (!m || m.wrecked) return;
    m.hp -= dmg * this.stats(m).dmgTaken;
    m.flash = 0.1;
    const pos = this.screenPos(m);
    this.particle(pos.x, pos.y - 30, (Math.random() - 0.5) * 80, -60, '#ff3b6b', 3, 0.3, 200);
    if (m.hp > 0) return;
    m.hp = 0;
    m.wrecked = true;
    this.soundAt('explosion', m.x, m.y);
    m.moving = false;
    this.shake = 8;
    this.burst(pos.x, pos.y - 25, '#ff9d2f', 30, 200);
    this.effects.push({ kind: 'ring', x: pos.x, y: pos.y - 30, r: 50, color: '#ff9d2f', life: 0.35, max: 0.35 });
    this.floater(pos.x, pos.y - 70, 'WRECKED', '#ff3b6b', 13);
  }

  private endWave(): void {
    this.bays.forEach((m) => {
      if (!m || !m.wrecked) return;
      const pos = this.screenPos(m);
      if (m.level > 1) {
        m.level--;
        m.xp = 0;
        m.wrecked = false;
        if (tierOf(m.level) < 3) m.mk3 = null;
        if (tierOf(m.level) < 2) m.mk2 = null;
        this.trimEquipment(m);
        this.floater(pos.x, pos.y - 70, 'REBUILT -1 LV', '#ffb347', 12);
      } else {
        // Level 1 can't drop any lower: the unit is simply rebuilt and stays in the army.
        m.wrecked = false;
        this.floater(pos.x, pos.y - 70, 'REBUILT', '#ffb347', 12);
      }
    });
    // Everyone is recalled to where the player placed them.
    for (const m of this.bays) {
      if (!m) continue;
      m.hp = this.stats(m).maxHp;
      m.x = m.hx;
      m.y = m.hy;
      m.flip = false;
      m.face = 0;
      m.moving = false;
      const p = project(m.x, m.y);
      this.effects.push({ kind: 'drop', x: p.x, y: p.y, r: 0, color: MECHS[m.type].colors.main, life: 0.35, max: 0.35 });
    }
    this.projectiles = [];
    this.blasts = [];

    this.scrap += 12 + 3 * this.wave;
    if (this.wave < MAX_WAVE) this.sound('waveClear');

    if (this.wave >= MAX_WAVE) {
      this.phase = 'victory';
      this.sound('victory');
      return;
    }
    // Two cores and one piece of equipment.
    const pool = [...CORES];
    this.rewardChoices = [];
    for (let k = 0; k < 2; k++) this.rewardChoices.push({ kind: 'core', core: pool.splice(Math.floor(Math.random() * pool.length), 1)[0] });
    this.rewardChoices.splice(Math.floor(Math.random() * 3), 0, { kind: 'equip', id: EQUIPMENT[Math.floor(Math.random() * EQUIPMENT.length)].id });
    this.phase = 'reward';
  }

  private updateEffects(dt: number): void {
    if (this.winFx) {
      this.winFx.t += dt;
      if (this.winFx.t > (this.winFx.tier === 'none' ? 0.8 : 2.6)) this.winFx = null;
    }
    this.panelShake = Math.max(0, this.panelShake - dt * 40);
    this.panelFlash = Math.max(0, this.panelFlash - dt * 1.8);
    this.spinPress = Math.max(0, this.spinPress - dt);
    for (const p of this.uiParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 1 - dt * 0.8;
      p.life -= dt;
    }
    this.uiParticles = this.uiParticles.filter((p) => p.life > 0);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.y -= 28 * dt;
      f.life -= dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const m of this.bays) {
      if (!m) continue;
      m.flash = Math.max(0, m.flash - dt);
      if (m.spawn <= 0) continue;
      const before = m.spawn;
      m.spawn = Math.max(0, m.spawn - dt);
      if (before > 0.1 && m.spawn <= 0.1) {
        this.sound('land');
        const pos = this.screenPos(m);
        m.flash = 0.12;
        this.effects.push({ kind: 'drop', x: pos.x, y: pos.y, r: 0, color: MECHS[m.type].colors.main, life: 0.4, max: 0.4 });
        this.effects.push({ kind: 'ring', x: pos.x, y: pos.y - 30, r: 55, color: MECHS[m.type].colors.main, life: 0.35, max: 0.35 });
        this.burst(pos.x, pos.y - 30, MECHS[m.type].colors.main, 18, 150);
        if (m.imprint) this.floater(pos.x, pos.y - 90, m.imprint.name.toUpperCase(), '#c77dff', 11);
      }
    }
    for (const e of this.enemies) e.flash = Math.max(0, e.flash - dt);
    for (const fx of this.effects) fx.life -= dt;
    this.effects = this.effects.filter((fx) => fx.life > 0);
  }

  // ---------- Effects helpers ----------

  private addScrap(n: number, x: number, y: number): void {
    this.scrap += n;
    this.floater(x, y, `+${n}`, '#9aa4b5', 11);
  }

  private announce(text: string): void {
    this.message = text;
    this.messageT = 2.5;
  }

  floater(x: number, y: number, text: string, color: string, size: number): void {
    this.floaters.push({ x, y, text, color, size, life: 1.1 });
  }

  private particle(x: number, y: number, vx: number, vy: number, color: string, size: number, life: number, gravity: number): void {
    this.particles.push({ x, y, vx, vy, color, size, life, max: life, gravity });
  }

  private burst(x: number, y: number, color: string, count: number, speed: number): void {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.particle(x, y, Math.cos(a) * v, Math.sin(a) * v - 40, color, 2 + Math.random() * 3, 0.3 + Math.random() * 0.5, 300);
    }
  }
}
