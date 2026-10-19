import { BOSS_WAVES, ENEMIES, MAX_LEVEL, MAX_WAVE, MECHS, MECH_TYPES, SYMBOLS, SYMBOL_COLORS, SYMBOL_NAMES, waveRoster, waveSpawns, type EnemyType, type SymbolId } from './data';
import { className, slotsFor, tierOf, xpToNext, type Game, type Mech } from './game';
import { DEPLOY_X, FIELD_TOP, FIELD_X, H, LX, LY, MAX_UNITS, PANEL_W, ROWS, SLOT, W, clampToDeploy, project, slotCellRect, unproject, type Vec } from './layout';
import { winChance } from './slot';
import { MECH_HEIGHT, drawEnemy, drawEquipIcon, drawMech, drawSymbol, enemyHeight, mechScale } from './sprites';
import type { AudioEngine } from './audio';
import { ARMORY_SIZE, SPECIAL_TEXT, equipById, variantById, type EquipId, type VariantDef } from './upgrades';

export interface Button {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
  enabled: boolean;
  style: 'primary' | 'secondary' | 'card' | 'danger';
  onClick: () => void;
}

export interface RenderContext {
  buttons: Button[];
  mouse: { x: number; y: number };
  restart: () => void;
  audio: AudioEngine;
  /** Whether the audio settings panel is open. */
  audioUi: { open: boolean };
}

const FONT = 'ui-monospace, Menlo, Consolas, monospace';

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left'): void {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

function wrap(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, maxW: number, size: number, color: string, lineH = size + 5, align: CanvasTextAlign = 'left'): number {
  ctx.font = `bold ${size}px ${FONT}`;
  let line = '';
  for (const word of s.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      text(ctx, line, x, y, size, color, align);
      y += lineH;
      line = word;
    } else line = test;
  }
  if (line) text(ctx, line, x, y, size, color, align);
  return y + lineH;
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = '#121722', stroke = '#262e40'): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: string, bg = '#0a0d13'): void {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
}

function hit(b: { x: number; y: number; w: number; h: number }, m: { x: number; y: number }): boolean {
  return m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h;
}

function button(ctx: CanvasRenderingContext2D, rc: RenderContext, b: Button): void {
  rc.buttons.push(b);
  const hover = b.enabled && hit(b, rc.mouse);
  const palette = {
    primary: ['#ffc23d', '#ffd66e', '#1a1305'],
    secondary: ['#2a5d9e', '#3a74bf', '#ffffff'],
    danger: ['#7a2a2a', '#9e3636', '#ffffff'],
    card: ['#161c2a', '#1f2740', '#ffffff'],
  }[b.style];
  ctx.fillStyle = !b.enabled ? '#1a1f2b' : hover ? palette[1] : palette[0];
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(b.x, b.y + b.h - 4, b.w, 4);
  const fg = b.enabled ? palette[2] : '#4a5262';
  if (b.style === 'card') return;
  const cy = b.sub ? b.y + b.h / 2 - 2 : b.y + b.h / 2 + 7;
  text(ctx, b.label, b.x + b.w / 2, cy, 20, fg, 'center');
  if (b.sub) text(ctx, b.sub, b.x + b.w / 2, cy + 20, 12, fg, 'center');
}

export function isOverPanel(p: { x: number; y: number }): boolean {
  return p.x >= 0 && p.x < PANEL_W && p.y > FIELD_TOP;
}

export function render(ctx: CanvasRenderingContext2D, g: Game, rc: RenderContext): void {
  ctx.fillStyle = '#0b0e15';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (g.shake > 0) ctx.translate((Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake);
  drawField(ctx, g);
  ctx.restore();

  drawPanel(ctx, g, rc);
  drawHud(ctx, g, rc);
  drawEffectsOverlay(ctx, g);
  drawDragged(ctx, g, rc);
  drawTooltip(ctx, g);
  drawPanelTip(ctx, rc);

  if (g.phase === 'reward') drawReward(ctx, g, rc);
  drawUpgradeChoice(ctx, g, rc);
  if (g.phase === 'over' || g.phase === 'victory') drawEnd(ctx, g, rc);
  drawAudioPanel(ctx, rc);
}

// ---------- Battlefield ----------

const STARS = Array.from({ length: 170 }, () => ({
  x: FIELD_X + Math.random() * (W - FIELD_X),
  y: FIELD_TOP + Math.random() * (H - FIELD_TOP),
  s: Math.random() < 0.12 ? 2 : 1,
  p: Math.random() * 6,
}));

function poly(ctx: CanvasRenderingContext2D, pts: Vec[], fill: string, stroke?: string): void {
  ctx.beginPath();
  pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Ground-plane rectangle in world space, as a screen polygon raised by `lift` pixels. */
function worldRect(x0: number, y0: number, x1: number, y1: number, lift = 0): Vec[] {
  return [project(x0, y0), project(x1, y0), project(x1, y1), project(x0, y1)].map((p) => ({ x: p.x, y: p.y - lift }));
}

function drawSpace(ctx: CanvasRenderingContext2D, g: Game): void {
  const fw = W - FIELD_X;
  const sky = ctx.createLinearGradient(0, FIELD_TOP, 0, H);
  sky.addColorStop(0, '#05071a');
  sky.addColorStop(1, '#0b1026');
  ctx.fillStyle = sky;
  ctx.fillRect(FIELD_X, FIELD_TOP, fw, H - FIELD_TOP);

  for (const st of STARS) {
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(g.time * 0.8 + st.p));
    ctx.fillStyle = `rgba(220,230,255,${tw})`;
    const sx = FIELD_X + ((st.x - FIELD_X - g.time * 4 * st.s + fw * 10) % fw);
    ctx.fillRect(sx, st.y, st.s, st.s);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(FIELD_X, FIELD_TOP, fw, H - FIELD_TOP);
  ctx.clip();
  const px = 1150;
  const py = 900;
  const glow = ctx.createRadialGradient(px, py, 420, px, py, 470);
  glow.addColorStop(0, 'rgba(110,190,255,0.4)');
  glow.addColorStop(1, 'rgba(110,190,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(px, py, 470, 0, Math.PI * 2);
  ctx.fill();
  const planet = ctx.createRadialGradient(px - 120, py - 300, 40, px, py, 430);
  planet.addColorStop(0, '#3f8fd8');
  planet.addColorStop(0.6, '#1d4f8f');
  planet.addColorStop(1, '#0c2347');
  ctx.fillStyle = planet;
  ctx.beginPath();
  ctx.arc(px, py, 425, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.ellipse(px - 220 + k * 120, py - 380 + (k % 2) * 30, 60, 7, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawDeck(ctx: CanvasRenderingContext2D, g: Game): void {
  const T = 22;
  // Platform thickness on the two visible sides.
  const a = project(LX, 0);
  const b = project(LX, LY);
  const c = project(0, LY);
  poly(ctx, [a, b, { x: b.x, y: b.y + T }, { x: a.x, y: a.y + T }], '#141a28');
  poly(ctx, [b, c, { x: c.x, y: c.y + T }, { x: b.x, y: b.y + T }], '#1b2232');
  for (let k = 0; k <= 10; k++) {
    const on = (Math.floor(g.time * 5) + k) % 5 === 0;
    const p = project(LX, (LY * k) / 10);
    ctx.fillStyle = on ? '#ff5a74' : '#5a1f2c';
    ctx.fillRect(p.x - 2, p.y + T / 2 - 1, 4, 3);
    const q = project((LX * k) / 10, LY);
    ctx.fillStyle = on ? '#7df4ff' : '#2f6d7a';
    ctx.fillRect(q.x - 2, q.y + T / 2 - 1, 4, 3);
  }

  // Deck surface and deployment zone (brighter while placing a unit).
  poly(ctx, worldRect(0, 0, LX, LY), '#1f2636');
  const placing = !!g.drag;
  poly(ctx, worldRect(0, 0, DEPLOY_X, LY), placing ? `rgba(79,140,255,${0.16 + Math.sin(g.time * 6) * 0.04})` : 'rgba(79,140,255,0.08)');
  // Deck edge highlight, deployment line and spawn edge warning stripe.
  ctx.strokeStyle = '#46526b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  [project(0, 0), project(LX, 0), project(LX, LY), project(0, LY)].forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = 'rgba(255,224,102,0.45)';
  const d0 = project(DEPLOY_X, 0);
  const d1 = project(DEPLOY_X, LY);
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.stroke();
  ctx.setLineDash([]);
  poly(ctx, worldRect(LX - 14, 0, LX, LY), 'rgba(255,59,107,0.16)');
}

function drawMothership(ctx: CanvasRenderingContext2D, g: Game): void {
  const hpFrac = g.baseHp / g.baseMax;
  const h = 70;
  const x0 = -46;
  const y0 = -24;
  const y1 = LY + 6;
  const top = worldRect(x0, y0, 0, y1, h);
  const fr = [project(0, y0), project(0, y1)];
  // Face towards the deck (X = 0) and the near end cap (Y = y1).
  poly(ctx, [fr[0], fr[1], { x: fr[1].x, y: fr[1].y - h }, { x: fr[0].x, y: fr[0].y - h }], '#c4ccd9');
  const e0 = project(x0, y1);
  poly(ctx, [e0, fr[1], { x: fr[1].x, y: fr[1].y - h }, { x: e0.x, y: e0.y - h }], '#a3aec0');
  poly(ctx, top, '#e8edf4');
  // Stripes along the top.
  const stripe = (xa: number, xb: number, col: string) => poly(ctx, worldRect(xa, y0, xb, y1, h), col);
  stripe(-38, -32, '#2f5fe0');
  stripe(-29, -26, '#dc3540');
  // Hangar doors facing the deck, one per bay row.
  for (let r = 0; r < ROWS; r++) {
    const yc = ((r + 0.5) / ROWS) * LY;
    const a = project(0, yc - 20);
    const b = project(0, yc + 20);
    poly(ctx, [a, b, { x: b.x, y: b.y - 46 }, { x: a.x, y: a.y - 46 }], '#10141e');
    const lit = 0.5 + 0.5 * Math.sin(g.time * 3 + r);
    ctx.strokeStyle = `rgba(255,210,63,${0.3 + lit * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - 42);
    ctx.lineTo(b.x, b.y - 42);
    ctx.stroke();
    const l = project(0, yc + 26);
    ctx.fillStyle = hpFrac > 0.5 ? '#6dffb8' : hpFrac > 0.25 ? '#ffd23f' : Math.sin(g.time * 10) > 0 ? '#ff3b6b' : '#5a1020';
    ctx.fillRect(l.x - 2, l.y - 56, 4, 4);
  }
  // Bridge tower near the far end.
  const tw = worldRect(-36, 10, -10, 60, h + 34);
  const tf = [project(-10, 10), project(-10, 60)].map((p) => ({ x: p.x, y: p.y - h }));
  poly(ctx, [tf[0], tf[1], { x: tf[1].x, y: tf[1].y - 34 }, { x: tf[0].x, y: tf[0].y - 34 }], '#c4ccd9');
  const te = project(-36, 60);
  poly(ctx, [{ x: te.x, y: te.y - h }, tf[1], { x: tf[1].x, y: tf[1].y - 34 }, { x: te.x, y: te.y - h - 34 }], '#a3aec0');
  poly(ctx, tw, '#f4f7fb');
  const win = [project(-10, 18), project(-10, 52)];
  ctx.strokeStyle = '#6dffb8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(win[0].x, win[0].y - h - 22);
  ctx.lineTo(win[1].x, win[1].y - h - 22);
  ctx.stroke();

  if (hpFrac < 0.5 && Math.random() < (0.5 - hpFrac) * 0.6) {
    const p = project(-Math.random() * 40, Math.random() * LY);
    ctx.fillStyle = Math.random() < 0.5 ? '#ff9d2f' : '#ffef5c';
    ctx.fillRect(p.x, p.y - Math.random() * h, 3, 3);
  }
}

function dropTargetStyle(g: Game, i: number): 'merge' | 'swap' | 'blocked' | null {
  if (!g.drag || g.drag.from === i) return null;
  const a = g.bays[g.drag.from];
  const b = g.bays[i];
  if (!a || !b) return null;
  if (g.canMerge(g.drag.from, i)) return 'merge';
  return b.type === a.type ? 'blocked' : 'swap';
}

function diamond(ctx: CanvasRenderingContext2D, c: Vec, r: number, color: string, width: number, alpha = 1): void {
  const pts = worldRect(c.x - r, c.y - r, c.x + r, c.y + r);
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.beginPath();
  pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Ground markers under units: drop targets while dragging, equip targets while dragging an item, and hover. */
function drawUnitMarkers(ctx: CanvasRenderingContext2D, g: Game): void {
  g.bays.forEach((m, i) => {
    if (!m || m.spawn > 0.1) return;
    const under = g.hover === i;
    const pulse = 0.45 + Math.sin(g.time * 8) * 0.2;
    if (g.dragItem) {
      if (g.canEquip(i)) diamond(ctx, m, 18, '#7df4ff', under ? 3 : 2, under ? 1 : pulse);
      return;
    }
    const style = dropTargetStyle(g, i);
    if (style) {
      const col = style === 'merge' ? '#6dffb8' : style === 'blocked' ? '#ff3b6b' : '#ffe066';
      diamond(ctx, m, 18, col, under ? 3 : 2, under ? 1 : style === 'merge' ? pulse + 0.1 : 0.3);
      if (under) {
        const p = project(m.x, m.y);
        text(ctx, { merge: 'MERGE', swap: 'SWAP', blocked: 'MAX LEVEL' }[style], p.x, p.y + 30, 12, col, 'center');
      }
    } else if (!g.drag && under && g.canDrag(i)) diamond(ctx, m, 18, 'rgba(255,224,102,0.7)', 2);
  });
}

function drawField(ctx: CanvasRenderingContext2D, g: Game): void {
  drawSpace(ctx, g);
  drawDeck(ctx, g);
  drawMothership(ctx, g);
  drawUnitMarkers(ctx, g);

  // Weapon range ring for the hovered unit.
  if (g.hover !== null && !g.drag && !g.dragItem) {
    const m = g.bays[g.hover];
    if (m && !m.wrecked && m.type !== 'artillery') {
      const w = { x: m.x, y: m.y };
      const r = g.stats(m).range + 14;
      ctx.strokeStyle = 'rgba(255,224,102,0.35)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k <= 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        const p = project(w.x + Math.cos(a) * r, w.y + Math.sin(a) * r);
        if (k) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Depth-sorted units: further back (smaller x + y) first.
  type Item = { depth: number; draw: () => void };
  const items: Item[] = [];
  g.bays.forEach((m, i) => {
    if (!m || m.spawn > 0.1) return;
    items.push({
      depth: m.x + m.y,
      draw: () => {
        const p = project(m.x, m.y);
        if (g.drag?.from === i) ctx.globalAlpha = 0.3;
        drawUnit(ctx, g, m, p.x, p.y);
        ctx.globalAlpha = 1;
      },
    });
  });
  for (const e of g.enemies) {
    items.push({
      depth: e.x + e.y,
      draw: () => {
        const p = project(e.x, e.y);
        drawEnemy(ctx, e.type, p.x, p.y, { t: g.time, flash: e.flash, attack: e.attack, flip: e.flip });
        if (e.hp < e.maxHp) {
          const w = e.type === 'titan' ? 80 : 30;
          bar(ctx, p.x - w / 2, p.y - enemyHeight(e.type) - 4, w, 4, e.hp / e.maxHp, '#ff3b6b');
        }
      },
    });
  }
  items.sort((a, b) => a.depth - b.depth).forEach((it) => it.draw());

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of g.projectiles) {
    const sp = project(p.x, p.y);
    const y = sp.y - p.z;
    if (p.kind === 'bullet') {
      const tp = project(p.tx, p.ty);
      const ang = Math.atan2(tp.y - p.tz - y, tp.x - sp.x);
      const pal = p.owner.type === 'bulwark' ? ['rgba(125,244,255,0.5)', '#e3fdff'] : ['rgba(255,90,216,0.55)', '#ffe3f8'];
      const len = p.owner.type === 'bulwark' ? 10 : 28;
      ctx.save();
      ctx.translate(sp.x, y);
      ctx.rotate(ang);
      ctx.fillStyle = pal[0];
      ctx.fillRect(-len, -3, len + 4, 6);
      ctx.fillStyle = pal[1];
      ctx.fillRect(-len + 4, -1, len, 2);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,157,47,0.5)';
      ctx.beginPath();
      ctx.arc(sp.x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff3c0';
      ctx.beginPath();
      ctx.arc(sp.x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const p of g.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.globalCompositeOperation = p.color.startsWith('rgba') ? 'source-over' : 'lighter';
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.restore();

  if (g.messageT > 0) {
    const cx = (FIELD_X + W) / 2 + 60;
    ctx.globalAlpha = Math.min(1, g.messageT * 2);
    ctx.fillStyle = 'rgba(5,7,11,0.75)';
    ctx.fillRect(cx - 220, FIELD_TOP + 14, 440, 40);
    text(ctx, g.message, cx, FIELD_TOP + 40, 15, '#ffe066', 'center');
    ctx.globalAlpha = 1;
  }
}

function drawUnit(ctx: CanvasRenderingContext2D, g: Game, m: Mech, x: number, y: number, ghost = false): void {
  const tier = tierOf(m.level);
  drawMech(ctx, m.type, x, y, { t: g.time, tier, recoil: m.recoil, flash: m.flash, wrecked: m.wrecked, thrust: m.moving, shadow: !ghost, flip: m.flip, mk2: m.mk2, mk3: m.mk3 });
  if (m.wrecked || ghost) return;
  const maxHp = g.stats(m).maxHp;
  const top = y - MECH_HEIGHT * mechScale(tier) - 4;
  if (g.phase === 'combat' || m.hp < maxHp) bar(ctx, x - 20, top, 40, 4, m.hp / maxHp, '#6dffb8');
  for (let k = 0; k < m.level; k++) {
    ctx.fillStyle = tier === 3 ? '#ffe066' : tier === 2 ? '#e8f1ff' : MECHS[m.type].colors.main;
    ctx.fillRect(x - 21 + k * 9, y + 8, 6, 3);
  }
  m.equipment.forEach((id, k) => {
    ctx.fillStyle = equipById(id).color;
    ctx.fillRect(x - 21 + k * 9, y + 13, 6, 3);
  });
  if (m.imprint) {
    ctx.fillStyle = '#c77dff';
    ctx.save();
    ctx.translate(x + 28, y + 9);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }
}

/** Effects that cross from the panel to the field (launch orbs) and floating text, drawn on top of everything. */
function drawEffectsOverlay(ctx: CanvasRenderingContext2D, g: Game): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const fx of g.effects) {
    const k = fx.life / fx.max;
    ctx.globalAlpha = Math.min(1, k * 1.5);
    ctx.strokeStyle = fx.color;
    if (fx.kind === 'ring') {
      ctx.lineWidth = 4 * k + 1;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r * (1 - k * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    } else if (fx.kind === 'slash') {
      ctx.lineWidth = 6 * k + 2;
      ctx.beginPath();
      ctx.arc(fx.x - fx.r * 0.6, fx.y, fx.r, -1.1, 1.1);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (fx.kind === 'orb') {
      const t = 1 - k;
      const ease = t * t * (3 - 2 * t);
      const ox = fx.x + ((fx.tx ?? fx.x) - fx.x) * ease;
      const oy = fx.y + ((fx.ty ?? fx.y) - fx.y) * ease - Math.sin(Math.PI * t) * 120;
      ctx.globalAlpha = 1;
      ctx.fillStyle = fx.color;
      ctx.beginPath();
      ctx.arc(ox, oy, fx.r * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ox, oy, fx.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      for (let s = 1; s <= 4; s++) {
        const tt = Math.max(0, t - s * 0.04);
        const e2 = tt * tt * (3 - 2 * tt);
        ctx.globalAlpha = 0.5 - s * 0.1;
        ctx.fillStyle = fx.color;
        ctx.beginPath();
        ctx.arc(fx.x + ((fx.tx ?? fx.x) - fx.x) * e2, fx.y + ((fx.ty ?? fx.y) - fx.y) * e2 - Math.sin(Math.PI * tt) * 120, fx.r * (1.2 - s * 0.2), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (fx.kind === 'tracer') {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx.x, fx.y);
      ctx.lineTo(fx.tx ?? fx.x, fx.ty ?? fx.y);
      ctx.stroke();
    } else if (fx.kind === 'drop') {
      ctx.fillStyle = fx.color;
      ctx.globalAlpha = k * 0.6;
      ctx.fillRect(fx.x - 26 * k, FIELD_TOP, 52 * k, fx.y - FIELD_TOP);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(fx.x - 6 * k, FIELD_TOP, 12 * k, fx.y - FIELD_TOP);
    }
  }
  ctx.restore();

  for (const f of g.floaters) {
    ctx.globalAlpha = Math.min(1, f.life * 2);
    ctx.font = `bold ${f.size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#05070b';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawDragged(ctx: CanvasRenderingContext2D, g: Game, rc: RenderContext): void {
  if (g.dragItem) {
    const id = g.armory[g.dragItem.index];
    if (id) {
      ctx.fillStyle = 'rgba(10,13,20,0.8)';
      ctx.fillRect(rc.mouse.x - 22, rc.mouse.y - 22, 44, 44);
      drawEquipIcon(ctx, id, rc.mouse.x, rc.mouse.y, 34);
      text(ctx, equipById(id).name, rc.mouse.x, rc.mouse.y + 36, 11, equipById(id).color, 'center');
    }
    return;
  }
  if (!g.drag) return;
  const m = g.bays[g.drag.from];
  if (!m) return;
  const overUnit = g.hover !== null && g.hover !== g.drag.from;
  if (overUnit || isOverPanel(rc.mouse)) {
    ctx.globalAlpha = 0.85;
    drawUnit(ctx, g, m, rc.mouse.x, rc.mouse.y + 30, true);
    ctx.globalAlpha = 1;
    return;
  }
  // Placement ghost, snapped into the deployment zone.
  const spot = placementSpot(rc.mouse);
  const p = project(spot.x, spot.y);
  diamond(ctx, spot, 18, '#ffe066', 2, 0.9);
  ctx.globalAlpha = 0.7;
  drawUnit(ctx, g, m, p.x, p.y, true);
  ctx.globalAlpha = 1;
}

/** Ground point in the deployment zone under the cursor (the cursor holds the unit by its body). */
export function placementSpot(mouse: { x: number; y: number }): Vec {
  return clampToDeploy(unproject(mouse.x, mouse.y + 30));
}

function drawTooltip(ctx: CanvasRenderingContext2D, g: Game): void {
  if (g.drag || g.dragItem || g.hover === null || g.phase === 'reward' || g.upgradeChoice()) return;
  const m = g.bays[g.hover];
  if (!m || m.spawn > 0) return;
  const pos = project(m.x, m.y);
  const d = MECHS[m.type];
  const st = g.stats(m);
  const variants = [variantById(m.mk2), variantById(m.mk3)].filter((v): v is VariantDef => !!v);
  const slots = slotsFor(m.level);

  const w = 280;
  const h = 150 + variants.length * 15 + (st.specials.length ? st.specials.length * 13 : 0) + 22 + (m.equipment.length ? m.equipment.length * 13 + 4 : 0) + (m.imprint ? 30 : 0) + 16;
  const x = pos.x + w + 60 > W ? pos.x - w - 40 : pos.x + 40;
  const y = Math.max(FIELD_TOP + 4, Math.min(H - h - 4, pos.y - 110));
  panel(ctx, x, y, w, h, 'rgba(10,13,20,0.95)', d.colors.main);
  const title = variants.length ? `${variants[variants.length - 1].name.toUpperCase()} ${d.name.toUpperCase()}` : d.name.toUpperCase();
  text(ctx, title, x + 12, y + 22, 14, d.colors.main);
  text(ctx, `${className(m.level)} Lv ${m.level}/${MAX_LEVEL}`, x + w - 12, y + 22, 10, '#e8f1ff', 'right');
  if (m.level < MAX_LEVEL) bar(ctx, x + 12, y + 30, w - 24, 4, m.xp / xpToNext(m.level), '#ffe066', '#1a1f2b');
  text(ctx, d.role, x + 12, y + 48, 10, '#8a93a3');
  const rows: [string, string][] = [
    ['HP', `${Math.ceil(m.hp)}/${st.maxHp}`],
    ['Damage', st.dmg.toFixed(1)],
    ['Attacks/s', (1 / st.cooldown).toFixed(2)],
    ['Range / speed', m.type === 'artillery' ? 'Whole field / static' : `${Math.round(st.range)} / ${Math.round(st.speed)}`],
    ['Stat roll', `${Math.round(m.roll * 100)}%`],
  ];
  let ly = y + 66;
  rows.forEach(([k, v]) => {
    text(ctx, k, x + 12, ly, 11, '#8a93a3');
    text(ctx, v, x + w - 12, ly, 11, '#e8f1ff', 'right');
    ly += 15;
  });
  ly += 4;
  for (const v of variants) {
    text(ctx, `${v.tier === 2 ? 'Mk-II' : 'Mk-III'}: ${v.name}`, x + 12, ly, 11, '#ffe066');
    ly += 15;
  }
  for (const sp of st.specials) {
    text(ctx, SPECIAL_TEXT[sp], x + 12, ly, 10, '#6dffb8');
    ly += 13;
  }
  text(ctx, `EQUIPMENT ${m.equipment.length}/${slots}`, x + 12, ly, 10, '#7df4ff');
  for (let k = 0; k < slots; k++) {
    const id = m.equipment[k];
    const sx = x + 110 + k * 24;
    ctx.fillStyle = '#1a1f2b';
    ctx.fillRect(sx, ly - 13, 20, 20);
    if (id) drawEquipIcon(ctx, id, sx + 10, ly - 3, 16);
  }
  ly += 22;
  for (const id of m.equipment) {
    const e = equipById(id);
    text(ctx, e.name, x + 12, ly, 10, e.color);
    text(ctx, e.desc, x + w - 12, ly, 9, '#8a93a3', 'right');
    ly += 13;
  }
  if (m.equipment.length) ly += 4;
  if (m.imprint) {
    text(ctx, `IMPRINT: ${m.imprint.name}`, x + 12, ly, 11, '#c77dff');
    text(ctx, m.imprint.desc, x + 12, ly + 13, 10, '#8a93a3');
    ly += 30;
  }
  if (g.canDrag(g.hover)) text(ctx, 'Drag to merge, move or salvage', x + 12, y + h - 6, 9, '#4a5262');
}

// ---------- HUD ----------

function drawHud(ctx: CanvasRenderingContext2D, g: Game, rc: RenderContext): void {
  ctx.fillStyle = '#080a10';
  ctx.fillRect(0, 0, W, FIELD_TOP);
  ctx.fillStyle = '#262e40';
  ctx.fillRect(0, FIELD_TOP - 2, W, 2);
  text(ctx, 'MECHA SLOTS', 20, 35, 22, '#ffc23d');

  const boss = BOSS_WAVES.includes(g.wave);
  text(ctx, `WAVE ${g.wave}/${MAX_WAVE}`, 250, 35, 18, '#e8f1ff');
  if (boss) text(ctx, 'JUDGEMENT', 395, 35, 13, '#ff3b6b');

  text(ctx, 'BASE', 520, 35, 14, '#8a93a3');
  bar(ctx, 570, 22, 180, 16, g.baseHp / g.baseMax, g.baseHp / g.baseMax > 0.3 ? '#4fa3ff' : '#ff3b6b', '#1a1f2b');
  text(ctx, `${g.baseHp}/${g.baseMax}`, 660, 35, 12, '#ffffff', 'center');

  drawSymbol(ctx, 'scrap', 800, 29, 34, g.time);
  text(ctx, `${g.scrap}`, 822, 36, 22, '#e8f1ff');
  text(ctx, 'SCRAP', 880, 35, 12, '#8a93a3');

  text(ctx, `UNITS ${g.bays.filter(Boolean).length}/${MAX_UNITS}`, 945, 35, 13, '#8a93a3');

  if (g.phase === 'combat') {
    button(ctx, rc, { x: 1062, y: 8, w: 92, h: 40, label: `x${g.speed}`, sub: 'SPEED [S]', enabled: true, style: 'secondary', onClick: () => g.toggleSpeed() });
  } else {
    text(ctx, `KILLS ${g.kills}`, 1152, 35, 14, '#8a93a3', 'right');
  }

  // Audio settings toggle.
  const muted = rc.audio.settings.musicMuted && rc.audio.settings.sfxMuted;
  const sb: Button = { x: 1168, y: 8, w: 100, h: 40, label: '', enabled: true, style: 'card', onClick: () => (rc.audioUi.open = !rc.audioUi.open) };
  button(ctx, rc, sb);
  ctx.strokeStyle = rc.audioUi.open || hit(sb, rc.mouse) ? '#ffc23d' : '#3a4258';
  ctx.lineWidth = 2;
  ctx.strokeRect(sb.x + 1, sb.y + 1, sb.w - 2, sb.h - 2);
  drawSpeaker(ctx, sb.x + 22, sb.y + 20, muted);
  text(ctx, 'SOUND', sb.x + 62, sb.y + 25, 13, muted ? '#8a93a3' : '#e8f1ff', 'center');
}

function drawSpeaker(ctx: CanvasRenderingContext2D, cx: number, cy: number, muted: boolean): void {
  ctx.fillStyle = muted ? '#8a93a3' : '#e8f1ff';
  ctx.fillRect(cx - 8, cy - 4, 5, 8);
  ctx.beginPath();
  ctx.moveTo(cx - 3, cy - 4);
  ctx.lineTo(cx + 3, cy - 9);
  ctx.lineTo(cx + 3, cy + 9);
  ctx.lineTo(cx - 3, cy + 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = muted ? '#ff5a74' : '#e8f1ff';
  ctx.lineWidth = 2;
  if (muted) {
    ctx.beginPath();
    ctx.moveTo(cx + 6, cy - 5);
    ctx.lineTo(cx + 13, cy + 5);
    ctx.moveTo(cx + 13, cy - 5);
    ctx.lineTo(cx + 6, cy + 5);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx + 4, cy, 6, -0.8, 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 4, cy, 10, -0.8, 0.8);
    ctx.stroke();
  }
}

function drawAudioPanel(ctx: CanvasRenderingContext2D, rc: RenderContext): void {
  if (!rc.audioUi.open) return;
  const a = rc.audio;
  const x = 1000;
  const y = FIELD_TOP + 6;
  const w = 268;
  const h = 168;
  panel(ctx, x, y, w, h, 'rgba(10,13,20,0.97)', '#ffc23d');
  text(ctx, 'AUDIO', x + 14, y + 24, 14, '#ffc23d');
  text(ctx, '[M] mute all', x + w - 14, y + 24, 10, '#4a5262', 'right');

  const row = (label: string, kind: 'music' | 'sfx', ry: number) => {
    const level = a.settings[kind];
    const muted = kind === 'music' ? a.settings.musicMuted : a.settings.sfxMuted;
    text(ctx, label, x + 14, ry - 8, 11, '#c2cad6');
    button(ctx, rc, { x: x + 14, y: ry, w: 28, h: 28, label: '-', enabled: level > 0, style: 'secondary', onClick: () => a.changeVolume(kind, -1) });
    for (let k = 0; k < a.steps; k++) {
      ctx.fillStyle = k < level ? (muted ? '#4a5262' : kind === 'music' ? '#c77dff' : '#6dffb8') : '#1a1f2b';
      ctx.fillRect(x + 48 + k * 12, ry + 6 + (a.steps - k) * 0.8, 9, 16 - (a.steps - k) * 0.8);
    }
    button(ctx, rc, { x: x + 172, y: ry, w: 28, h: 28, label: '+', enabled: level < a.steps, style: 'secondary', onClick: () => a.changeVolume(kind, 1) });
    button(ctx, rc, { x: x + 206, y: ry, w: 48, h: 28, label: muted ? 'OFF' : 'ON', enabled: true, style: muted ? 'danger' : 'primary', onClick: () => a.toggleMute(kind) });
  };
  row('MUSIC', 'music', y + 52);
  row('EFFECTS', 'sfx', y + 112);
}

// ---------- Left panel: slot machine ----------

let chanceKey = '';
let chanceValue = 0;

// ---------- Panel tooltips ----------

interface TipLine {
  text: string;
  color?: string;
  size?: number;
  gap?: number;
}

let panelTip: TipLine[] | null = null;

const SYMBOL_HELP: Record<SymbolId, string> = {
  gunner: 'A line of 3 launches a Gunner: beam rifle with steady mid-range fire. Can hit Fighter Jets.',
  lancer: 'A line of 3 launches a Lancer: beam sabre brawler that charges into melee. Best against Shield Troopers.',
  artillery: 'A line of 3 launches an Artillery tank: stays put and shells anywhere on the field.',
  bulwark: 'A line of 3 launches a Bulwark: shielded tank that blocks and repairs itself. Can hit Fighter Jets.',
  scrap: 'Each Scrap symbol refunds scrap. A line of 3 Scrap pays +10.',
  wild: 'Wild: counts as any symbol when checking lines. 3 Cores in a line launch a random level 2 elite.',
};

/** Chance that one particular line pays out with symbol `s` (Cores count as wild). */
function lineChance(g: Game, s: SymbolId): number {
  const total = SYMBOLS.reduce((acc, k) => acc + g.mods.weights[k], 0);
  const pw = g.mods.weights.wild / total;
  if (s === 'wild') return pw ** 3;
  const ps = g.mods.weights[s] / total;
  return (ps + pw) ** 3 - pw ** 3;
}

function symbolTip(g: Game, s: SymbolId): TipLine[] {
  const total = SYMBOLS.reduce((acc, k) => acc + g.mods.weights[k], 0);
  const perCell = g.mods.weights[s] / total;
  const lines: TipLine[] = [
    { text: SYMBOL_NAMES[s].toUpperCase(), color: SYMBOL_COLORS[s], size: 14 },
    { text: SYMBOL_HELP[s], color: '#c2cad6', gap: 4 },
    { text: `Chance per reel cell: ${(perCell * 100).toFixed(1)}%`, color: '#e8f1ff', gap: 6 },
  ];
  if (s === 'scrap') lines.push({ text: `Pays ${1 + g.mods.scrapSymbol} scrap per symbol on the reels`, color: '#e8f1ff' });
  // 8 lines are not independent, so this is an estimate.
  const perSpin = 1 - (1 - lineChance(g, s)) ** 8;
  const what = s === 'scrap' ? 'a Scrap line' : s === 'wild' ? 'a line of 3 Cores' : `a ${SYMBOL_NAMES[s]} line`;
  lines.push({ text: `Chance of ${what} per spin: ~${(perSpin * 100).toFixed(1)}%`, color: '#6dffb8' });
  if (s !== 'wild') lines.push({ text: 'Includes lines completed by Cores', color: '#4a5262', size: 10 });
  if (s !== 'scrap' && s !== 'wild') lines.push({ text: `A ${SYMBOL_NAMES[s]} Beacon core makes it more common`, color: '#4a5262', size: 10 });
  return lines;
}

function equipTip(g: Game, id: EquipId): TipLine[] {
  const e = equipById(id);
  const free = g.bays.filter((m) => m && !m.wrecked && m.equipment.length < slotsFor(m.level)).length;
  return [
    { text: e.name.toUpperCase(), color: e.color, size: 14 },
    { text: e.desc, color: '#e8f1ff', gap: 4 },
    { text: 'Drag onto a mech to fit it. Mechs have 1 slot at Mk-I, 2 at Mk-II and 3 at Mk-III.', color: '#c2cad6', gap: 6 },
    { text: 'If the mech is full, its oldest item comes back here.', color: '#c2cad6' },
    { text: free ? `${free} of your mechs have a free slot` : 'None of your mechs has a free slot', color: free ? '#6dffb8' : '#ffb347', gap: 6 },
    { text: g.phase === 'build' ? 'Equipment can only be changed between waves' : 'Wait for the wave to end to fit it', color: '#4a5262', size: 10, gap: 4 },
  ];
}

function winChanceTip(g: Game, chance: number): TipLine[] {
  const unit = MECH_TYPES.reduce((acc, t) => acc + lineChance(g, t), 0) + lineChance(g, 'wild');
  const scrap = lineChance(g, 'scrap');
  return [
    { text: 'WIN CHANCE PER SPIN', color: '#6dffb8', size: 14 },
    { text: `${(chance * 100).toFixed(1)}% of spins have at least one winning line.`, color: '#e8f1ff', gap: 4 },
    { text: 'There are 8 lines: 3 rows, 3 columns and 2 diagonals. A line wins when all 3 symbols match, with Cores counting as any symbol.', color: '#c2cad6', gap: 6 },
    { text: `Expected per spin: ${(unit * 8).toFixed(2)} unit launches, ${(scrap * 8).toFixed(2)} scrap lines`, color: '#e8f1ff', gap: 6 },
    { text: `Spin cost now: ${g.spinCost} scrap, going up 1 per spin this wave`, color: '#ffc23d' },
    { text: 'Estimated from 6000 simulated spins with your current odds. Cores that change symbol odds update it.', color: '#4a5262', size: 10, gap: 6 },
  ];
}

function drawPanelTip(ctx: CanvasRenderingContext2D, rc: RenderContext): void {
  if (!panelTip) return;
  const w = 280;
  const pad = 12;
  // Measure by wrapping off-screen first.
  const layout: { line: TipLine; rows: string[] }[] = panelTip.map((line) => {
    ctx.font = `bold ${line.size ?? 11}px ${FONT}`;
    const rows: string[] = [];
    let cur = '';
    for (const word of line.text.split(' ')) {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width > w - pad * 2 && cur) {
        rows.push(cur);
        cur = word;
      } else cur = test;
    }
    if (cur) rows.push(cur);
    return { line, rows };
  });
  const h = layout.reduce((acc, l) => acc + (l.line.gap ?? 2) + l.rows.length * ((l.line.size ?? 11) + 4), pad * 2 - 2);
  const x = Math.min(W - w - 8, rc.mouse.x + 16);
  const y = Math.max(FIELD_TOP + 4, Math.min(H - h - 8, rc.mouse.y - h - 12));
  panel(ctx, x, y, w, h, 'rgba(10,13,20,0.97)', '#46526b');
  let ly = y + pad;
  for (const { line, rows } of layout) {
    ly += line.gap ?? 2;
    for (const row of rows) {
      ly += (line.size ?? 11) + 4;
      text(ctx, row, x + pad, ly - 4, line.size ?? 11, line.color ?? '#e8f1ff');
    }
  }
}

function cachedWinChance(weights: Record<SymbolId, number>): number {
  const key = JSON.stringify(weights);
  if (key !== chanceKey) {
    chanceKey = key;
    chanceValue = winChance(weights, 6000);
  }
  return chanceValue;
}

const ARMORY_Y = 620;
const ARMORY_SLOT = 42;

/** Screen rectangle of an armory slot in the left panel. */
export function armorySlot(k: number): { x: number; y: number; w: number; h: number } {
  return { x: SLOT.x + k * (ARMORY_SLOT + 6.8), y: ARMORY_Y, w: ARMORY_SLOT, h: ARMORY_SLOT };
}

function newThreats(wave: number): EnemyType[] {
  const before = new Set(wave > 1 ? waveRoster(wave - 1) : []);
  return waveRoster(wave).filter((t) => t !== 'titan' && !before.has(t));
}

function drawPanel(ctx: CanvasRenderingContext2D, g: Game, rc: RenderContext): void {
  panelTip = null;
  ctx.fillStyle = '#0a0d14';
  ctx.fillRect(0, FIELD_TOP, PANEL_W, H - FIELD_TOP);
  ctx.fillStyle = '#262e40';
  ctx.fillRect(PANEL_W - 2, FIELD_TOP, 2, H - FIELD_TOP);

  drawReels(ctx, g);

  const x = SLOT.x;
  const w = SLOT.cell * 3 + SLOT.gap * 2;
  let y = SLOT.y + w + 22;

  if (g.phase === 'combat') {
    panel(ctx, x, y, w, 108);
    text(ctx, 'WAVE IN PROGRESS', x + w / 2, y + 30, 16, '#ffe066', 'center');
    text(ctx, `${g.spawnQueue.length + g.enemies.length} hostiles left`, x + w / 2, y + 56, 13, '#e8f1ff', 'center');
    wrap(ctx, 'Units fight on their own. Enemies that reach the mothership damage it.', x + w / 2, y + 80, w - 30, 11, '#8a93a3', 15, 'center');
  } else {
    button(ctx, rc, {
      x,
      y,
      w,
      h: 60,
      label: g.phase === 'spinning' ? 'SPINNING...' : `SPIN  ${g.spinCost}`,
      sub: `next spin costs ${g.spinCost + 1}  [Space]`,
      enabled: g.canSpin(),
      style: 'primary',
      onClick: () => g.spin(),
    });
    button(ctx, rc, { x, y: y + 68, w, h: 40, label: 'LAUNCH WAVE  [Enter]', enabled: g.phase === 'build' && !g.upgradeChoice(), style: 'secondary', onClick: () => g.launch() });
  }
  y += 128;

  const chance = cachedWinChance(g.mods.weights);
  const tipsAllowed = !g.drag && !g.dragItem && !g.upgradeChoice() && g.phase !== 'reward' && g.phase !== 'over' && g.phase !== 'victory';
  text(ctx, 'SYMBOL ODDS', x, y, 11, '#ffc23d');
  const chanceLabel = `WIN CHANCE ${Math.round(chance * 100)}% / SPIN`;
  ctx.font = `bold 11px ${FONT}`;
  const chanceRect = { x: x + w - ctx.measureText(chanceLabel).width - 14, y: y - 12, w: ctx.measureText(chanceLabel).width + 14, h: 16 };
  const chanceHover = tipsAllowed && hit(chanceRect, rc.mouse);
  text(ctx, chanceLabel, x + w, y, 11, chanceHover ? '#b8ffd9' : '#6dffb8', 'right');
  text(ctx, 'ⓘ', chanceRect.x, y, 10, '#4a5262');
  if (chanceHover) panelTip = winChanceTip(g, chance);

  const total = SYMBOLS.reduce((s, k) => s + g.mods.weights[k], 0);
  SYMBOLS.forEach((s, n) => {
    const cx = x + 24 + n * 47.6;
    const cy = y + 22;
    const cell = { x: cx - 17, y: cy - 15, w: 34, h: 44 };
    const hover = tipsAllowed && hit(cell, rc.mouse);
    ctx.fillStyle = hover ? '#1e2638' : '#121722';
    ctx.fillRect(cx - 17, cy - 15, 34, 30);
    if (hover) {
      ctx.strokeStyle = SYMBOL_COLORS[s];
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 16.5, cy - 14.5, 33, 29);
    }
    drawSymbol(ctx, s, cx, cy, 30, g.time);
    text(ctx, `${Math.round((g.mods.weights[s] / total) * 100)}%`, cx, cy + 27, 9, SYMBOL_COLORS[s], 'center');
    if (hover) panelTip = symbolTip(g, s);
  });

  text(ctx, 'ARMORY', x, ARMORY_Y - 6, 11, '#7df4ff');
  text(ctx, 'drag onto a mech to equip', x + w, ARMORY_Y - 6, 9, '#4a5262', 'right');
  for (let k = 0; k < ARMORY_SIZE; k++) {
    const r = armorySlot(k);
    const id = g.armory[k];
    const dragging = g.dragItem?.index === k;
    const hover = !!id && !g.dragItem && hit(r, rc.mouse);
    ctx.fillStyle = hover ? '#1e2638' : '#121722';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = id ? equipById(id).color : '#262e40';
    ctx.globalAlpha = id ? 0.7 : 1;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.globalAlpha = 1;
    if (id && !dragging) drawEquipIcon(ctx, id, r.x + r.w / 2, r.y + r.h / 2, 30);
    if (hover && tipsAllowed) panelTip = equipTip(g, id);
  }

  y = ARMORY_Y + ARMORY_SLOT + 16;
  const preview = waveSpawns(g.wave, () => 0.5);
  text(ctx, `NEXT: ~${preview.length} hostiles`, x, y, 11, '#e8f1ff');
  if (BOSS_WAVES.includes(g.wave)) text(ctx, 'MOBILE ARMOUR!', x + w, y, 11, '#ff3b6b', 'right');
  const fresh = newThreats(g.wave);
  if (fresh.length) {
    y += 15;
    text(ctx, `NEW: ${fresh.map((t) => ENEMIES[t].name).join(', ')}`, x, y, 10, '#ff9ae6');
  }
  y += 15;
  if (y < H - 6) {
    const coreText = g.cores.length ? `Cores: ${g.cores.map((c) => c.name).join(', ')}` : 'Match 3 in a line to launch a unit. Drag the same type together to merge.';
    wrap(ctx, coreText, x, y, w, 9, g.cores.length ? '#c2cad6' : '#8a93a3', 12);
  }

  if (g.drag) {
    const m = g.bays[g.drag.from];
    const over = isOverPanel(rc.mouse);
    ctx.fillStyle = over ? 'rgba(122,42,42,0.85)' : 'rgba(122,42,42,0.35)';
    ctx.fillRect(0, FIELD_TOP, PANEL_W - 2, H - FIELD_TOP);
    ctx.strokeStyle = '#ff5a74';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(12, FIELD_TOP + 12, PANEL_W - 26, H - FIELD_TOP - 24);
    ctx.setLineDash([]);
    text(ctx, 'DROP HERE TO SALVAGE', PANEL_W / 2, H / 2, 18, '#ffffff', 'center');
    if (m) text(ctx, `+${g.salvageValue(m)} scrap`, PANEL_W / 2, H / 2 + 28, 15, '#ffd0d8', 'center');
    if (m?.equipment.length) text(ctx, 'Equipment returns to the armory', PANEL_W / 2, H / 2 + 50, 11, '#ffd0d8', 'center');
  }
}

function drawReels(ctx: CanvasRenderingContext2D, g: Game): void {
  const size = SLOT.cell * 3 + SLOT.gap * 2;
  panel(ctx, SLOT.x - 12, SLOT.y - 30, size + 24, size + 42, '#121722', '#ffc23d');
  text(ctx, 'REACTOR REELS', SLOT.x, SLOT.y - 10, 13, '#ffc23d');
  text(ctx, `Spins this wave: ${g.spinsThisWave}`, SLOT.x + size, SLOT.y - 10, 10, '#8a93a3', 'right');

  const reel = g.reel;
  for (let i = 0; i < 9; i++) {
    const r = slotCellRect(i);
    const col = i % 3;
    const row = Math.floor(i / 3);
    ctx.fillStyle = '#0d111a';
    ctx.fillRect(r.x, r.y, r.w, r.h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    if (reel && reel.t < reel.stops[col]) {
      const pos = reel.t * 16;
      const base = Math.floor(pos);
      const frac = pos - base;
      const strip = reel.strips[col];
      for (let k = -1; k <= 0; k++) {
        const sym = strip[(base + row - k + strip.length * 4) % strip.length];
        drawSymbol(ctx, sym, r.x + r.w / 2, r.y + r.h / 2 + (frac + k) * r.h, r.w, g.time);
      }
      ctx.fillStyle = 'rgba(13,17,26,0.35)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    } else {
      const sym = reel ? reel.result[i] : g.lastGrid[i];
      const since = reel ? reel.t - reel.stops[col] : 1;
      const bounce = since < 0.2 ? Math.sin((since / 0.2) * Math.PI) * 6 : 0;
      drawSymbol(ctx, sym, r.x + r.w / 2, r.y + r.h / 2 + bounce, r.w, g.time);
    }
    ctx.restore();
  }

  if (g.lineFlash) {
    ctx.globalAlpha = Math.min(1, g.lineFlash.t);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    for (const line of g.lineFlash.lines) {
      const a = slotCellRect(line.cells[0]);
      const b = slotCellRect(line.cells[2]);
      ctx.strokeStyle = SYMBOL_COLORS[line.symbol];
      ctx.beginPath();
      ctx.moveTo(a.x + a.w / 2, a.y + a.h / 2);
      ctx.lineTo(b.x + b.w / 2, b.y + b.h / 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- Overlays ----------

function drawCard(ctx: CanvasRenderingContext2D, rc: RenderContext, b: Button, accent: string): void {
  button(ctx, rc, b);
  ctx.strokeStyle = hit(b, rc.mouse) ? accent : '#3a3157';
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
}

function drawReward(ctx: CanvasRenderingContext2D, g: Game, rc: RenderContext): void {
  ctx.fillStyle = 'rgba(5,7,11,0.82)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, `WAVE ${g.wave} CLEARED`, W / 2, 170, 34, '#ffe066', 'center');
  text(ctx, 'Choose a reward [1] [2] [3]', W / 2, 205, 16, '#8a93a3', 'center');

  const cw = 300;
  const gap = 30;
  const x0 = W / 2 - (cw * 3 + gap * 2) / 2;
  g.rewardChoices.forEach((choice, n) => {
    const isCore = choice.kind === 'core';
    const name = isCore ? choice.core.name : equipById(choice.id).name;
    const desc = isCore ? choice.core.desc : `${equipById(choice.id).desc}. Goes to the armory; drag it onto a mech.`;
    const accent = isCore ? '#c77dff' : equipById((choice as { id: EquipId }).id).color;
    const b: Button = { x: x0 + n * (cw + gap), y: 250, w: cw, h: 210, label: name, enabled: true, style: 'card', onClick: () => g.pickReward(n) };
    drawCard(ctx, rc, b, accent);
    text(ctx, isCore ? 'CORE UPGRADE' : 'EQUIPMENT', b.x + cw / 2, b.y + 24, 11, accent, 'center');
    if (isCore) drawSymbol(ctx, 'wild', b.x + cw / 2, b.y + 64, 56, g.time + n);
    else drawEquipIcon(ctx, choice.id, b.x + cw / 2, b.y + 64, 52);
    text(ctx, name.toUpperCase(), b.x + cw / 2, b.y + 122, 17, '#e8d4ff', 'center');
    wrap(ctx, desc, b.x + cw / 2, b.y + 150, cw - 40, 13, '#c2cad6', 18, 'center');
    text(ctx, `[${n + 1}]`, b.x + cw / 2, b.y + 200, 11, '#4a5262', 'center');
  });
}

function modLines(v: VariantDef): string[] {
  const names: Record<string, string> = { dmg: 'damage', rate: 'attack speed', hp: 'max HP', range: 'range', speed: 'speed', splash: 'blast radius', dmgTaken: 'damage taken' };
  const lines = Object.entries(v.mods).map(([k, val]) => {
    if (k === 'regenPct') return `repairs ${Math.round((val as number) * 100)}% HP/s`;
    const pct = Math.round((val as number) * 100);
    return `${pct > 0 ? '+' : ''}${pct}% ${names[k]}`;
  });
  if (v.special) lines.push(SPECIAL_TEXT[v.special]);
  return lines;
}

function drawUpgradeChoice(ctx: CanvasRenderingContext2D, g: Game, rc: RenderContext): void {
  const choice = g.upgradeChoice();
  if (!choice) return;
  const m = g.bays[choice.bay]!;
  ctx.fillStyle = 'rgba(5,7,11,0.85)';
  ctx.fillRect(0, 0, W, H);
  const mk = choice.tier === 2 ? 'Mk-II' : 'Mk-III';
  text(ctx, `${MECHS[m.type].name.toUpperCase()} PROMOTED TO ${mk}`, W / 2, 140, 30, '#ffe066', 'center');
  text(ctx, 'Choose its specialisation [1] [2] [3]', W / 2, 172, 15, '#8a93a3', 'center');

  const cw = 300;
  const gap = 30;
  const x0 = W / 2 - (cw * choice.options.length + gap * (choice.options.length - 1)) / 2;
  choice.options.forEach((v, n) => {
    const b: Button = { x: x0 + n * (cw + gap), y: 200, w: cw, h: 380, label: v.name, enabled: true, style: 'card', onClick: () => g.chooseVariant(n) };
    drawCard(ctx, rc, b, '#ffe066');
    const mk2 = choice.tier === 2 ? v.id : m.mk2;
    const mk3 = choice.tier === 3 ? v.id : null;
    ctx.fillStyle = 'rgba(79,140,255,0.08)';
    ctx.fillRect(b.x + 20, b.y + 16, cw - 40, 170);
    drawMech(ctx, m.type, b.x + cw / 2 - 6, b.y + 170, { t: g.time, tier: choice.tier, recoil: 0, flash: 0, scale: 2.4, mk2, mk3 });
    text(ctx, v.name.toUpperCase(), b.x + cw / 2, b.y + 220, 20, '#ffffff', 'center');
    let ly = wrap(ctx, v.desc, b.x + cw / 2, b.y + 248, cw - 40, 12, '#c2cad6', 17, 'center') + 6;
    for (const line of modLines(v)) {
      text(ctx, line, b.x + cw / 2, ly, 12, line.startsWith('-') && !line.includes('damage taken') ? '#ff9a9a' : '#6dffb8', 'center');
      ly += 17;
    }
    text(ctx, `[${n + 1}]`, b.x + cw / 2, b.y + 368, 11, '#4a5262', 'center');
  });
}

function drawEnd(ctx: CanvasRenderingContext2D, g: Game, rc: RenderContext): void {

  ctx.fillStyle = 'rgba(5,7,11,0.85)';
  ctx.fillRect(0, 0, W, H);
  const won = g.phase === 'victory';
  text(ctx, won ? 'ALL WAVES SURVIVED' : 'MOTHERSHIP DESTROYED', W / 2, 260, 44, won ? '#ffe066' : '#ff3b6b', 'center');
  text(ctx, won ? 'The Mobile Armours have fallen. Your squadron holds the line.' : `You reached wave ${g.wave} of ${MAX_WAVE}.`, W / 2, 305, 18, '#c2cad6', 'center');
  text(ctx, `Kills: ${g.kills}   Cores: ${g.cores.length}   Bosses: ${BOSS_WAVES.filter((w) => w < g.wave || won).length}`, W / 2, 340, 14, '#8a93a3', 'center');
  button(ctx, rc, { x: W / 2 - 120, y: 390, w: 240, h: 64, label: 'PLAY AGAIN', sub: '[R]', enabled: true, style: 'primary', onClick: rc.restart });
}
