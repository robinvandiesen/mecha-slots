import { audio, type MusicMode } from './audio';
import { BOSS_WAVES } from './data';
import { Game } from './game';
import { H, W, project } from './layout';
import { armorySlot, isOverPanel, placementSpot, render, type Button } from './render';
import { ARMORY_SIZE } from './upgrades';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function newGame(): Game {
  const g = new Game();
  g.sound = (name, opts) => audio.play(name, opts);
  return g;
}

let game = newGame();
let buttons: Button[] = [];
const audioUi = { open: false };
const mouse = { x: -1, y: -1 };

function resize(): void {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${Math.floor(W * scale)}px`;
  canvas.style.height = `${Math.floor(H * scale)}px`;
  canvas.width = Math.floor(W * scale * dpr);
  canvas.height = Math.floor(H * scale * dpr);
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

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  const p = toGame(e);
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
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  const i = unitAt(p);
  if (i !== null && game.canDrag(i)) {
    game.drag = { from: i, x: p.x, y: p.y };
    audio.play('pickup');
    canvas.setPointerCapture(e.pointerId);
  }
});

canvas.addEventListener('pointermove', (e) => {
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
  else if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
    const n = Number(e.code.slice(-1)) - 1;
    if (game.upgradeChoice()) game.chooseVariant(n);
    else game.pickReward(n);
  } else if (e.code === 'Escape') {
    game.drag = null;
    game.dragItem = null;
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
