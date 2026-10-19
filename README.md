# Mecha Slots (prototype)

A slot-machine auto-battler with mechs, inspired by the gameplay of Slotbound. Spin the 3x3 reels on the left. When you match a line, a unit launches onto a 3D battlefield on the right. Merge units by dragging them onto each other and hold the line against waves of mono-eye enemy mechs. The art is in a Gundam-inspired "real robot" style, using original designs. It's built with TypeScript, [Three.js](https://threejs.org) for the 3D battlefield and HTML Canvas for the UI. There are no art or audio files: the low-poly 3D models are built from shapes in code, the UI icons are pixel art drawn in code, and all sound is synthesised.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open the URL Vite prints (by default http://localhost:5173).

## How it plays

- **Spinning:** you can spin at most **6 times per wave** (the pips above the reels show how many are left). Each spin costs scrap, and every spin costs 2 more than the last (4, 6, 8, 10, 12, 14 in wave 1). The extra cost and the spin count reset when a new wave starts, and the base price rises by 1 every wave. Leftover scrap goes into upgrades.
- **Winning:** three of the same symbol in a row, column or diagonal is a win. Core is wild. The panel shows the exact win chance per spin.
  - Wins are celebrated by tier (LAUNCH!, BIG WIN! for two lines, JACKPOT! for three or more lines or a Core line). The reels stop in a random order with slightly varied timing and speed. When the first two reels to stop show a real pair of the same mech that the last reel could complete, the last reel sometimes spins longer for suspense (always when there are two such pairs; about 1 spin in 4 overall). It is never faked: it only reflects what is really on the reels, and the last reel can still miss.
  - A mech line launches that mech into an open spot in the deployment zone.
  - A line of three Cores launches a random level 2 elite.
  - A scrap line pays 10 scrap. Each scrap symbol also refunds 1.
  - If you already have 20 units, a win pays 5 scrap instead.
- **Battlefield:** a 3D deck floating in space above a planet, with the mothership docked along the far edge. Lighting, shadows and glowing beams and explosions are real-time. There is no grid and there are no lanes:
  - Enemies first have to walk onto the deck: nothing can hit them, and they can't attack, while they're still in the red spawn zone. Your units hold position until enemies are on the field.
  - In combat, units then march forward towards the enemy edge. With nothing to fight, Lancers march all the way to the end (up to the spawn zone) while other mechs wait in mid-field; chasing an enemy, any mech can go right up to the spawn zone. They stop to fight anything in range, chase enemies ahead of them, and never turn back (they still shoot enemies behind them if they're in range). Artillery never moves and fires anywhere on the field.
  - When a wave ends, every unit instantly returns to the spot where you placed it.
  - Enemies enter from the lower-right edge and head for the mothership. They break off to attack any unit that comes within their aggro range.
  - Anything that reaches the mothership damages it.
  - Hover a unit to see its weapon range and stats.
- **Free placement (between waves):** drag a unit anywhere inside the deployment zone (the blue area up to the dashed line).
  - Onto the same type: merge. A unit's level equals the number of units merged into it, up to 5.
  - Onto open ground: the unit is placed there (points outside the zone snap to its edge).
  - Onto a different type: the two units swap places.
  - Onto the slot machine panel: salvage for scrap.
- **Scrap upgrades:** levels only come from merging. On top of that, click a unit (between waves) to open its card and spend scrap on four upgrade tracks, 5 ranks each (16, 28, 40, 52, 64 scrap per rank), or press `1` to `4`: **Firepower** (+12% damage per rank), **Armour** (+15% max HP), **Reactor** (+10% attack speed) and **Thrusters** (+12% move speed; Artillery gets **Blast Radius** +12% instead). Merging adds both units' upgrades together (up to the maximum), and salvaging refunds half the scrap spent on them.
- **Levels and promotion:** each level adds a full unit's worth of stats. Level 3 promotes to Mk-II (+15%) and level 5 to Mk-III (+30%). Merging gives you stronger units, but fewer of them to cover the field.
- **Specialisations:** at each promotion you choose a version of the mech, which changes its stats, sometimes adds a special ability, and changes how it looks.
  - Mk-II (per type):
    - Gunner: Sniper, Assault or Bazooka (exploding shots).
    - Lancer: Twin Sabre, Beam Axe (cleave) or Interceptor.
    - Artillery: Missile Rack (two targets), Railgun or Cluster Mortar.
    - Bulwark: Fortress, Guardian (draws enemy fire) or Commander (boosts nearby allies).
  - Mk-III (any type): Full Armour, Ace Custom (red or black and gold paint) or Awakened (energy wings).
- **Equipment:** items wait in the Armory on the left panel (up to 6). Drag one onto a mech to fit it. Mechs have 1 slot at Mk-I, 2 at Mk-II and 3 at Mk-III; fitting a full mech sends its oldest item back. Items: Beam Amplifier, Thruster Pack, Reactive Armour, Funnel Pod, Long Barrel, Repair Module, Anti-Beam Coating and Targeting AI. You get them from wave rewards and from every Mobile Armour you destroy. Merged, salvaged or lost mechs return their items to the Armory.
- **Enemies** (new types unlock as the waves go on, and the panel warns you about them):

  | Enemy | From wave | Behaviour |
  | --- | --- | --- |
  | Scout Pod | 1 | Fast and fragile, short-range gun |
  | Grunt | 1 | Standard mono-eye trooper with a machine gun |
  | Bomb Pod | 2 | Rushes the nearest mech and explodes |
  | Heavy | 3 | Slow brawler with a heat sword |
  | Fighter Jet | 3 | Flies straight at the mothership; only Gunners and Bulwarks can hit it |
  | Sniper | 4 | Hangs back and fires long-range beam shots |
  | Shield Trooper | 4 | Blocks half of all shot and shell damage; use melee |
  | Repair Unit | 6 | Repairs nearby enemies; your units target it first |
  | Mobile Armour | 5, 10 | Boss. Fast, fires an exploding cannon at range (also shells the mothership), crushing claws up close; drops equipment |
- **Random stats:** every unit rolls a damage quality (85 to 115%) and has a 15% chance of an **Imprint** (Overclocked, Armoured, Salvager or Critical). Merging keeps the better roll and passes an imprint on if the target had none.
- **Wrecks:** a destroyed unit is rebuilt after the wave. It comes back one level lower, except at level 1, where it is simply rebuilt (units are never lost).
- **Rewards:** after each wave, pick 1 of 3: two cores (stat or reel-odds upgrades such as Lucky Reel or Twin Launch) and one piece of equipment.
- **Difficulty:** every wave is tougher than the last. Enemy HP, enemy damage (against mechs: about ×2.8 by wave 5 and ×6.5 by wave 10) and the damage enemies do to the mothership all grow each wave, and waves get bigger. The panel shows the next wave's enemy HP and damage multipliers. Tunable in `DIFFICULTY` in `src/data.ts`.
- **Judgement waves:** waves 5 and 10 bring Mobile Armour bosses. Survive wave 10 to win.

- **Music and sound:** everything is synthesised in code, with no audio files. Every effect is generated slightly differently each time it plays (pitch, waveform, sweep, length), battlefield sounds are panned left and right to where they happen, each reel lands with its own thud, and win jingles change key and melody. The music changes with the game: a calm track while building, a battle track during waves and a faster, darker track on boss waves. The **SOUND** button in the top bar opens volume and mute controls for music and effects; your settings are remembered.

Controls: `Space` spins, `Enter` launches the wave, `1` `2` `3` pick a reward or specialisation, `S` changes combat speed, `1` to `4` buy upgrades for the selected unit, `M` mutes all sound, right-drag rotates the camera, the mouse wheel zooms, `Esc` cancels a drag, and `R` restarts after a game over.

## Code map

| File | What it does |
| --- | --- |
| `src/data.ts` | Mech and enemy stats, cores, imprints, reel weights, wave generation |
| `src/upgrades.ts` | Specialisations (Mk-II and Mk-III) and equipment |
| `src/slot.ts` | Reel rolling and line detection |
| `src/game.ts` | Game state and rules: spins, merging, combat, waves, rewards |
| `src/scene3d.ts` | The 3D scene: space, deck, mothership, lighting, bloom, explosions, and syncing the game state to models |
| `src/models.ts` | Low-poly 3D mech and enemy models built from shapes, including every specialisation |
| `src/view.ts` | 3D camera, rotation and zoom, and conversion between deck and screen positions |
| `src/dims.ts` | Model sizes shared by the game logic and the renderers |
| `src/sprites.ts` | Pixel-art icons for the UI: reel symbols, mech previews, equipment |
| `src/render.ts` | 2D UI on top of the 3D scene: HUD, reels, panels, tooltips, overlays, HP bars |
| `src/layout.ts` | Screen layout, deck size and the deployment zone |
| `src/audio.ts` | Synthesised sound effects, the music sequencer and volume settings |
| `src/sim.ts` | Dev-only balance bot (`sim()` in the browser console) |
| `src/main.ts` | Canvas setup, game loop, mouse and keyboard input |

Most balancing happens in `src/data.ts`.

## Balance check

With the dev server running, open the browser console and run `sim()` (or `sim(100)` for more games). A bot plays whole games headlessly: it spends all its scrap, merges duplicates, picks random specialisations and rewards, and fits every item. It reports the win rate, which wave each lost run ended on, and how much base HP was left after each wave.

You can try a different difficulty curve live, for example `Object.assign(difficulty, { hpLinear: 1.2 })`, then run `sim()` again. Copy the values you like into `DIFFICULTY` in `src/data.ts`.

The current curve gives the bot about a 40 to 45% win rate, with losses spread across the run and most at the boss waves.

## Path to Steam

1. `npm run build` produces a static `dist/` folder, which you can host anywhere (itch.io works well for web playtests).
2. Wrap `dist/` as a desktop app with Electron or Tauri.
3. Add Steam features (achievements, cloud saves) with `steamworks.js`.
4. Pay the Steam Direct fee, set up the store page, and submit for review.

If the project grows, think about moving it to Godot or Phaser. The rules in `game.ts` and `data.ts` don't depend on how the game is drawn, so they port across easily.
