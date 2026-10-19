import { audio, type MusicMode } from './audio';
import { BOSS_WAVES } from './data';
import { Game } from './game';
import { FIELD_TOP, FIELD_X, H, W } from './layout';
import { armorySlot, isOverPanel, placementSpot, render, type Button } from './render';
import { Scene3D } from './scene3d';
import { ARMORY_SIZE, BOOST_IDS } from './upgrades';
import { FIELD_H, FIELD_W, project, rotateView, zoomView } from './view';

const stage = document.getElementById('stage') as HTMLDivElement;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const worldCanvas = document.getElementById('world') as HTMLCanvasElement;
const world = new Scene3D(worldCanvas);

function newGame(): Game {
  const g = new Game();
  g.sound = (name, opts) => audio.play(name, opts);
  return g;
}

let game = newGame();
let buttons: Button[] = [];
const audioUi = { open: false };
const mouse = { x: -1, y: -1 };

let viewScale = 1;

function resize(): void {
  viewScale = Math.min(window.innerWidth / W, window.innerHeight / H);
  const dpr = window.devicePixelRatio || 1;
  stage.style.width = `${Math.floor(W * viewScale)}px`;
  stage.style.height = `${Math.floor(H * viewScale)}px`;
  canvas.style.width = stage.style.width;
  canvas.style.height = stage.style.height;
  canvas.width = Math.floor(W * viewScale * dpr);
  canvas.height = Math.floor(H * viewScale * dpr);
  // The 3D canvas covers only the battlefield, to the right of the panel and below the top bar.
  worldCanvas.style.left = `${FIELD_X * viewScale}px`;
  worldCanvas.style.top = `${FIELD_TOP * viewScale}px`;
  worldCanvas.style.width = `${FIELD_W * viewScale}px`;
  worldCanvas.style.height = `${FIELD_H * viewScale}px`;
  world.resize(Math.floor(FIELD_W * viewScale), Math.floor(FIELD_H * viewScale), dpr);
}
window.addEventListener('resize', resize);
resize();

function toGame(e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

/** Unit under the point on the battlefield (matched on its body), or null. */
function unitAt(p: { x: number; y: number }): number | null {
  let best: number | null = null;
  let bestD = 30;
  game.bays.forEach((m, i) => {
    if (!m || m.spawn > 0.1) return;
    const s = project(m.x, m.y);
    const d = Math.hypot(p.x - s.x, (p.y - (s.y - 28)) * 0.6);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

function buttonAt(p: { x: number; y: number }): Button | null {
  for (let k = buttons.length - 1; k >= 0; k--) {
    const b = buttons[k];
    if (b.enabled && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
  }
  return null;
}

const overlayOpen = () => game.phase === 'reward' || game.phase === 'over' || game.phase === 'victory' || !!game.upgradeChoice();

function armoryAt(p: { x: number; y: number }): number | null {
  for (let k = 0; k < ARMORY_SIZE; k++) {
    const r = armorySlot(k);
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return k;
  }
  return null;
}

const restart = () => {
  game = newGame();
};

/** Keeps receiving pointer events while dragging outside the canvas (best effort). */
function capture(e: PointerEvent): void {
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // Pointer already released: dragging still works while it stays over the canvas.
  }
}

const orbit = { active: false, lastX: 0 };
const overField = (p: { x: number; y: number }) => p.x >= FIELD_X && p.y >= FIELD_TOP;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener(
  'wheel',
  (e) => {
    if (!overField(toGame(e as unknown as PointerEvent))) return;
    e.preventDefault();
    zoomView(e.deltaY > 0 ? 0.92 : 1.08);
  },
  { passive: false },
);

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  const p = toGame(e);
  // Right mouse button rotates the camera.
  if (e.button === 2) {
    if (overField(p)) {
      orbit.active = true;
      orbit.lastX = e.clientX;
      capture(e);
    }
    return;
  }
  Object.assign(mouse, p);
  const b = buttonAt(p);
  if (b) {
    audio.play('click');
    b.onClick();
    return;
  }
  if (audioUi.open) {
    // Clicking anywhere else closes the audio panel.
    audioUi.open = false;
    return;
  }
  if (overlayOpen()) return;
  const slot = armoryAt(p);
  if (slot !== null && game.armory[slot] && game.phase === 'build') {
    game.dragItem = { index: slot };
    audio.play('pickup');
    capture(e);
    return;
  }
  const i = unitAt(p);
  if (i === null) game.selected = null;
  if (i !== null && game.canDrag(i)) {
    game.drag = { from: i, x: p.x, y: p.y };
    audio.play('pickup');
    capture(e);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (orbit.active) {
    rotateView(-(e.clientX - orbit.lastX) * 0.006);
    orbit.lastX = e.clientX;
    return;
  }
  Object.assign(mouse, toGame(e));
  game.hover = overlayOpen() ? null : unitAt(mouse);
  if (game.drag || game.dragItem) {
    canvas.style.cursor = 'grabbing';
    return;
  }
  const overItem = armoryAt(mouse);
  const canGrab = (game.hover !== null && game.canDrag(game.hover)) || (overItem !== null && !!game.armory[overItem] && game.phase === 'build');
  canvas.style.cursor = buttonAt(mouse) ? 'pointer' : canGrab ? 'grab' : 'default';
});

canvas.addEventListener('pointerup', (e) => {
  if (orbit.active) {
    orbit.active = false;
    return;
  }
  if (game.dragItem) {
    const item = game.dragItem;
    game.dragItem = null;
    canvas.style.cursor = 'default';
    const to = unitAt(toGame(e));
    if (to !== null) game.equip(item.index, to);
    return;
  }
  const drag = game.drag;
  if (!drag) return;
  const p = toGame(e);
  game.drag = null;
  canvas.style.cursor = 'default';
  if (isOverPanel(p)) {
    game.salvage(drag.from);
    return;
  }
  // Released without really moving: that's a click, which selects (or deselects) the unit.
  if (Math.hypot(p.x - drag.x, p.y - drag.y) < 6) {
    game.selected = game.selected === drag.from ? null : drag.from;
    return;
  }
  game.selected = null;
  const to = unitAt(p);
  if (to !== null && to !== drag.from) game.drop(drag.from, to);
  else game.moveUnit(drag.from, placementSpot(p));
});

canvas.addEventListener('pointerleave', () => {
  if (game.drag || game.dragItem) return;
  mouse.x = mouse.y = -1;
  game.hover = null;
});

window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.code === 'KeyM') audio.toggleMuteAll();
  else if (e.code === 'Space') {
    e.preventDefault();
    game.spin();
  } else if (e.code === 'Enter') game.launch();
  else if (e.code === 'KeyS' && game.phase === 'combat') game.toggleSpeed();
  else if (e.code === 'KeyR' && (game.phase === 'over' || game.phase === 'victory')) restart();
  else if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
    const n = Number(e.code.slice(-1)) - 1;
    if (game.upgradeChoice()) game.chooseVariant(n);
    else if (game.phase === 'reward') game.pickReward(n);
    else if (game.selected !== null) game.boost(game.selected, BOOST_IDS[n]);
  } else if (e.code === 'Escape') {
    game.drag = null;
    game.dragItem = null;
    game.selected = null;
    audioUi.open = false;
  }
});

function musicFor(g: Game): MusicMode {
  if (g.phase === 'over' || g.phase === 'victory') return 'none';
  if (g.phase === 'combat') return BOSS_WAVES.includes(g.wave) ? 'boss' : 'combat';
  return 'build';
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  audio.setMusic(musicFor(game));

  // 3D battlefield: the dragged unit is previewed where it would land.
  let ghost: { from: number; at: { x: number; y: number } | null } | null = null;
  if (game.drag) {
    const overUnit = game.hover !== null && game.hover !== game.drag.from;
    ghost = { from: game.drag.from, at: overUnit || isOverPanel(mouse) ? null : placementSpot(mouse) };
  }
  world.sync(game, dt * (game.phase === 'combat' ? game.speed : 1), ghost);
  world.render();
  const shake = game.shake > 0 ? game.shake * viewScale : 0;
  worldCanvas.style.transform = shake ? `translate(${(Math.random() - 0.5) * shake}px, ${(Math.random() - 0.5) * shake}px)` : '';
  if (game.drag && !game.canDrag(game.drag.from)) game.drag = null;

  const scale = canvas.width / W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  buttons = [];
  render(ctx, game, { buttons, mouse, restart, audio, audioUi });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exposed for debugging in the browser console.
(window as unknown as { game: () => Game }).game = () => game;
if (import.meta.env.DEV) {
  void import('./sim').then((m) => Object.assign(window, { sim: m.simulate, difficulty: m.DIFFICULTY }));
}
