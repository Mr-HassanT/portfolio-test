# Hassan City — interactive portfolio

An interactive 3D portfolio for **Muhammad Hassan Tariq** (Quantitative
Developer, Abu Dhabi). Visitors take a flying tour through a procedurally
generated city whose **weather tracks the live US market** — a SPY/QQQ
basket turns green days into sunshine and sell-offs into storms.

**Live site:** https://mr-hassant.github.io/portfolio-test/

## Project structure

```
index.html                 entry page: metadata, UI markup, written fallback tour
favicon.svg
styles/                    CSS split by concern (base, hud, panels, a11y, responsive)
src/
  main.js                  boot: UI init, market feed, lazy Three.js load, WebGL fallback
  state.js                 shared mutable state between UI and scene
  market-weather.js        feed fetch + live/closed/stale/fallback classification
  data/tour-content.js     all tour copy (chapters, billboards, ticker, contact)
  ui/hud.js                2D interface: HUD, panels, pop-ups, keyboard shortcuts
  scene/
    index.js               Three.js core, story camera, animation loop, scene API
    city.js                procedural buildings, landmarks, metro, traffic
    sky.js                 lighting, sun/moon, clouds, rain, day->night grading
    cards.js               floating chapter cards + their carriers
    controls.js            free-roam input (keyboard/mouse/touch) + raycast clicks
    textures.js            canvas painters for all generated textures
data/market-weather.json   the market feed (committed by the GitHub Action)
scripts/
  update-market-weather.mjs  feed updater (run by the Action)
  check-site.mjs             production checks (run by CI and locally)
.github/workflows/
  update-market-weather.yml  feed refresh around US market hours
  ci.yml                     site checks on push/PR
```

No build step and no npm dependencies — plain ES modules, deployable
straight to GitHub Pages. Three.js r128 is loaded from a CDN at runtime
(lazily, with a graceful prose fallback if it can't load).

## Local development

ES modules need an HTTP server (opening `index.html` via `file://` won't
work). Any static server does:

```bash
# pick one
npx serve .
python -m http.server 8000
```

Then open http://localhost:8000 (or the port `serve` prints).

## Checks

```bash
node scripts/check-site.mjs        # syntax + asset references + feed shape
node scripts/update-market-weather.mjs   # refresh the market feed locally
```

CI (`.github/workflows/ci.yml`) runs the same checks on every push/PR.

## Market-weather feed

- `scripts/update-market-weather.mjs` fetches SPY/QQQ from the Yahoo
  Finance chart API and writes `data/market-weather.json`.
- The Action runs every 30 min during US market hours (Mon–Fri) plus one
  Saturday run, and **skips the commit when the basket hasn't meaningfully
  moved** (see `MIN_CHANGE_PP` / `HEARTBEAT_HOURS` in the script).
- The front end labels the data **Live**, **Latest (market closed)**,
  **Older data (stale)**, or falls back to calm skies if the JSON can't be
  loaded — it never claims "live" for old data.

## Deployment (GitHub Pages)

The site is served from the repository root on the `main` branch. All
asset paths are relative, so it works both at
`https://<user>.github.io/<repo>/` and on any other static host. Just push
to `main`; no build step required.

## Accessibility & fallback

- A full written version of the tour lives in `index.html` (`#fallback`).
  It is always available to screen readers and search engines, and becomes
  the visible page when WebGL/Three.js is unavailable or JS is disabled.
- `prefers-reduced-motion` disables ambient animation, camera bob, and
  the ticker crawl.
- Keyboard: `Tab` reaches all controls, `Esc` closes panels/pop-ups,
  `N`/`P` (or `.`/`,`) jump between story stops, WASD/arrows fly in free
  roam.

## Placeholders / TODO

- `assets/portfolio-preview.png` — 1200x630 social share image
  (see `assets/README.md`); the OG/Twitter tags already point at it.
- Contact email in `index.html` and `src/data/tour-content.js` is
  `htariq0601@gmail.com` — change it if you prefer another inbox.
- Project case studies: planned, not yet added.
