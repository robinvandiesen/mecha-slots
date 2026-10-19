import { DIFFICULTY } from './data';
import { LX } from './layout';
import { Game, slotsFor } from './game';
import { BOOST_IDS, type BoostId } from './upgrades';

// Balance bot for development. In the browser console (dev server only): sim() or sim(100).
// It plays whole games headlessly: spends all scrap, merges duplicates (keeping at least
// five units), buys scrap upgrades with leftover scrap, picks random specialisations and rewards,
// and fits every item it gets. sim(40, { upgrades: false }) skips upgrades.
// The difficulty curve can be tweaked live through `difficulty` in the console.

export { DIFFICULTY };

function mergeAll(g: Game, keep: number): void {
  let changed = true;
  while (changed) {
    changed = false;
    if (g.bays.filter(Boolean).length <= keep) return;
    for (let a = 0; a < g.bays.length && !changed; a++) {
      for (let b = 0; b < g.bays.length && !changed; b++) {
        const A = g.bays[a];
        const B = g.bays[b];
        if (A && B && a !== b && A.type === B.type && B.level >= A.level && g.canMerge(a, b)) {
          g.drop(a, b);
          changed = true;
          while (g.upgradeChoice()) g.chooseVariant(Math.floor(Math.random() * 3));
        }
      }
    }
  }
}

function equipAll(g: Game): void {
  while (g.armory.length) {
    const target = g.bays
      .map((m, i) => ({ m, i }))
      .filter((o) => o.m && o.m.equipment.length < slotsFor(o.m.level))
      .sort((a, b) => b.m!.level - a.m!.level)[0];
    if (!target) return;
    g.equip(0, target.i);
  }
}

/** Spends leftover scrap on scrap upgrades, cheapest rank first. */
function buyUpgrades(g: Game): void {
  for (;;) {
    let best: { i: number; id: BoostId; cost: number } | null = null;
    g.bays.forEach((m, i) => {
      if (!m) return;
      for (const id of BOOST_IDS) {
        if (!g.canBoost(i, id)) continue;
        const cost = g.boostCost(m, id);
        if (!best || cost < best.cost) best = { i, id, cost };
      }
    });
    if (!best) return;
    const pick = best as { i: number; id: BoostId };
    g.boost(pick.i, pick.id);
  }
}

export function simulate(runs = 40, opts: { upgrades?: boolean } = { upgrades: true }) {
  let wins = 0;
  const endedOn = Array(11).fill(0);
  const baseLeft: number[][] = Array.from({ length: 10 }, () => []);
  let spawnZoneHits = 0;

  for (let run = 0; run < runs; run++) {
    const g = new Game();
    // Count any hit that lands while the enemy is still in the spawn zone (should always be 0).
    const g2 = g as unknown as { damageEnemy: (e: { x: number; hp: number }, ...rest: unknown[]) => void };
    const damage = g2.damageEnemy.bind(g);
    g2.damageEnemy = (e, ...rest) => {
      const hp = e.hp;
      const x = e.x;
      damage(e, ...rest);
      if (e.hp < hp && x > LX - 16) spawnZoneHits++;
    };
    let guard = 0;
    while (g.phase !== 'over' && g.phase !== 'victory' && guard++ < 400000) {
      if (g.phase === 'build') {
        for (const m of g.bays) if (m) m.spawn = 0;
        while (g.upgradeChoice()) g.chooseVariant(Math.floor(Math.random() * 3));
        if (g.canSpin()) g.spin();
        else {
          mergeAll(g, 5);
          if (opts.upgrades) buyUpgrades(g);
          equipAll(g);
          g.launch();
        }
      } else if (g.phase === 'reward') {
        baseLeft[g.wave - 1].push(g.baseHp / g.baseMax);
        g.pickReward(Math.floor(Math.random() * 3));
      }
      g.update(1 / 30);
    }
    if (g.phase === 'victory') {
      wins++;
      endedOn[10]++;
    } else endedOn[g.wave - 1]++;
  }

  const pct = (a: number[]) => (a.length ? `${Math.round((100 * a.reduce((x, y) => x + y, 0)) / a.length)}%` : '-');
  return {
    winRate: wins / runs,
    lostOnWave: endedOn.slice(0, 10).map((n, i) => `W${i + 1}:${n}`).join(' '),
    avgBaseHpAfterWave: baseLeft.map((a, i) => `W${i + 1}:${pct(a)}`).join(' '),
    spawnZoneHits,
  };
}
