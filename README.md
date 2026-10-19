# Mecha Slots (prototype)

A slot-machine auto-battler with mechs, inspired by the gameplay of Slotbound. Spin the 3x3 reels on the left. When you match a line, a unit launches onto an isometric battlefield on the right. Merge units by dragging them onto each other and hold the line against waves of mono-eye enemy mechs. The art is in a Gundam-inspired "real robot" style, using original designs. It's built with TypeScript and HTML Canvas, with no game engine and no art files: every sprite is drawn in code as pixel art.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open the URL Vite prints (by default http://localhost:5173).

## How it plays

- **Spinning:** each spin costs scrap, and every spin costs 1 more than the last. The extra cost resets when a new wave starts, and the base price rises every two waves.
- **Winning:** three of the same symbol in a row, column or diagonal is a win. Core is wild. The panel shows the exact win chance per spin.
  - A mech line launches that mech into an open spot in the deployment zone.
  - A line of three Cores launches a random level 2 elite.
  - A scrap line pays 10 scrap. Each scrap symbol also refunds 1.
  - If you already have 20 units, a win pays 5 scrap instead.
- **Battlefield:** an isometric deck floating in space, with the mothership docked along the upper-left edge. There is no grid and there are no lanes:
  - In combat, units always march forward towards the enemy edge. They stop to fight anything in range, chase enemies ahead of them, and never turn back (they still shoot enemies behind them if they're in range). Artillery never moves and fires anywhere on the field.
  - When a wave ends, every unit instantly returns to the spot where you placed it.
  - Enemies enter from the lower-right edge and head for the mothership. They break off to attack any unit that comes within their aggro range.
  - Anything that reaches the mothership damages it.
  - Hover a unit to see its weapon range and stats.
- **Free placement (between waves):** drag a unit anywhere inside the deployment zone (the blue area up to the dashed line).
  - Onto the same type: merge. A unit's level equals the number of units merged into it, up to 5.
  - Onto open ground: the unit is placed there (points outside the zone snap to its edge).
  - Onto a different type: the two units swap places.
  - Onto the slot machine panel: salvage for scrap.
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
  | Mobile Armour | 5, 10 | Boss; drops equipment |
- **Random stats:** every unit rolls a damage quality (85 to 115%) and has a 15% chance of an **Imprint** (Overclocked, Armoured, Salvager or Critical). Merging keeps the better roll and passes an imprint on if the target had none.
- **Wrecks:** a destroyed unit comes back one level lower after the wave. If it was level 1, it's lost.
- **Rewards:** after each wave, pick 1 of 3: two cores (stat or reel-odds upgrades such as Lucky Reel or Twin Launch) and one piece of equipment.
- **Judgement waves:** waves 5 and 10 bring Mobile Armour bosses. Survive wave 10 to win.

- **Music and sound:** everything is synthesised in code, with no audio files. The music changes with the game: a calm track while building, a battle track during waves and a faster, darker track on boss waves. The **SOUND** button in the top bar opens volume and mute controls for music and effects; your settings are remembered.

Controls: `Space` spins, `Enter` launches the wave, `1` `2` `3` pick a reward or specialisation, `S` changes combat speed, `M` mutes all sound, `Esc` cancels a drag, and `R` restarts after a game over.

## Code map

| File | What it does |
| --- | --- |
| `src/data.ts` | Mech and enemy stats, cores, imprints, reel weights, wave generation |
| `src/upgrades.ts` | Specialisations (Mk-II and Mk-III) and equipment |
| `src/slot.ts` | Reel rolling and line detection |
| `src/game.ts` | Game state and rules: spins, merging, combat, waves, rewards |
| `src/sprites.ts` | Procedural pixel-art mechs, enemies and reel symbols |
| `src/render.ts` | Battlefield, HUD, reels, info panels and overlays |
| `src/layout.ts` | Screen layout, isometric projection and the deployment zone |
| `src/audio.ts` | Synthesised sound effects, the music sequencer and volume settings |
| `src/main.ts` | Canvas setup, game loop, mouse and keyboard input |

Most balancing happens in `src/data.ts`.

## Balance check

In the browser console, `game()` returns the live game instance. A simulated bot that spends all its scrap, merges duplicates, picks random specialisations and fits every item wins about 45% of runs. A bot that never merges loses every run.

## Path to Steam

1. `npm run build` produces a static `dist/` folder, which you can host anywhere (itch.io works well for web playtests).
2. Wrap `dist/` as a desktop app with Electron or Tauri.
3. Add Steam features (achievements, cloud saves) with `steamworks.js`.
4. Pay the Steam Direct fee, set up the store page, and submit for review.

If the project grows, think about moving it to Godot or Phaser. The rules in `game.ts` and `data.ts` don't depend on how the game is drawn, so they port across easily.
