# Zombie Idle

An idle zombie shooter with smooth HD cartoon art and endless levels. Call hordes, shred zombies for their DNA, grow an endless upgrade
tree, build a squad of up to 4 that counters each strain, and Retreat for Veterancy.

Runs in the browser on laptops, iPhones (portrait and landscape), and iPhone Duo folded or unfolded. The layout
switches live when you rotate or fold.

- Design: [`docs/game-spec.md`](docs/game-spec.md)
- Balance math: [`docs/scaling-model.md`](docs/scaling-model.md)

## Play it on your phone
The game is published to GitHub Pages at https://hameierj.github.io/Zombie-Shooter/ on every push to `main`
(see `.github/workflows/deploy.yml`).
Open the Pages address in Safari on iPhone, then **Share → Add to Home Screen**. It runs full-screen, works offline,
and saves progress on the device. Use ⚙ → Export / Import save to move progress between devices.

## Run it
```bash
npm install
```
```bash
npm run dev
```
`dev` serves on your local network, so you can open the printed Network URL on an iPhone that's on the same Wi-Fi.

```bash
npm run build
```
Outputs a static site in `dist/` that you can host anywhere (GitHub Pages, Netlify, Cloudflare Pages). On iPhone, open it in Safari →
Share → **Add to Home Screen** to play full screen like an app.

## Balance
```bash
npm run sim -- 200
```
Plays four bot players through 200 hours of the real model.

## Code layout
- `src/core/model.ts`: every formula, number and upgrade-tree node (shared with the simulator)
- `src/core/state.ts`: game state, actions, horde flow, loadouts, save/load, offline progress
- `src/core/format.ts`: big-number formatting, names and colours
- `src/game/BattleScene.ts`: Phaser battlefield (re-maps to horizontal or vertical to fit the screen)
- `src/ui/ui.ts` + `src/styles.css`: HUD, Call Horde panel, tabs and modals (touch-first, safe-area aware)
- `tools/sim.ts`: balance simulator
