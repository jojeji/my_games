# Notes for AI agents

Static GitHub Pages site hosting several incremental games on one shared engine. German UI. No build step, no runtime deps,
native ES modules, ALL paths relative (site is served from `/<repo>/`).

## Layout
- `index.html`, `hub.js`, `games.json` - launcher; cards are generated from `games.json` (`id,title,description,path,icon,status`).
- `sw.js` - one root service worker (network-first with cache fallback + precache). `VERSION`/`PRECACHE` blocks are GENERATED:
  run `node tools/update-precache.mjs` after adding/changing files (tests fail if stale; CI regenerates before deploy).
- `engine/` - game-agnostic:
  - `vendor/break_infinity.js` (Decimal, MIT), `decimal.js` (`D`, `ZERO`, `ONE`, helpers), `format.js` (notations, `formatNumber/Duration`, `parseNumber`)
  - `save.js` (localStorage wrapper, Decimal-aware JSON, base64 export/import, migrations `{fromVersion: fn}`, `mergeDefaults`)
  - `core.js` (`createRuntime(logic)`: 50 ms loop with real dt, offline catch-up via `advance()`, autosave, `visibilitychange`/`pagehide`, event bus)
  - `kit/` - data-driven DOM-free game model: `Game` class (`game.js`) + mixins `generators.js`, `upgrades.js`, `challenges.js`, `state.js`
  - `ui/` - DOM helpers (`dom.js`: `h`, cached setters), `hold.js` (hold-to-repeat, long-press), `modal.js`, `toast.js`, `tabs.js`, `app.js` (shell + ~15 fps render loop),
    `kit-views.js` (generator list, upgrade cards, prestige panel, challenges, research tree, achievements), `settings.js`, `stats.js`,
    `standard-app.js` (assembles a complete mobile UI from a `Game`), `engine.css` (variables; games theme via `:root` overrides)
- `games/<id>/` - `def.js` (data + hooks), `logic.js` (`new Game(def)`), `main.js`, `index.html`, `style.css`, `manifest.webmanifest`, `icons/`.
  `games/_template` is a minimal working example; copy it with `node tools/new-game.mjs <id> "<Titel>"`.
- `tools/` - `simulate.mjs` (balance sim), `new-game.mjs`, `update-precache.mjs`, `make-icons.mjs` (needs playwright installed elsewhere).
- `tests/*.test.mjs` - `npm test` (= `node --test "tests/*.test.mjs"`).

## Def schema (engine/kit)
`currencies[{id,name,short?,layer,start}]`, `chains[{id,currency,layer,bundle,bundleMult,tiers[{name,desc,baseCost,costMult,unlock?}]}]` (tier n produces tier n-1,
cost per purchase = base * costMult^(1/bundle)^owned), `layers[{id,name,plural,verb,layer,currency,basis,formula{threshold,exp,softcap?},mult?,unlockWhen?,blurb}]`
(gain = floor(mult*(basisRun/threshold)^exp); prestige of layer L wipes currencies/chains/upgrades with `layer < L` unless `upgrade.keep(g,L)`),
`upgrades[{id,group,layer,currency,cost(l),max,requires,requiresAny,excl,effect(l,g),fmt,keep,show}]` (research nodes are upgrades too),
`milestones[{id,layer,at|cond}]`, `challenges[{id,rules,goal,reward,resetLayer,unlock?(g),lockText?}]` (`unlock` = extra per-challenge gate, see `g.chAvailable`) (`g.rule(key,default)` reads the active challenge),
`achievements[{id,cond(g)}]`, `story`, `autos[{id,unlock,interval,run,kind,defaults?}]` (`kind` 'gen'|'upg'|'misc' show as toggles in the generator tab, 'prestige' = `prestigeAuto({...,on,mode,value,minGain})` helper with its own config row; `defaults` may be a function when it holds mutable data), `hooks` (`genGlobalMult`, `genTierMult`, `genCostDiv`, `genGrowthPow`,
`genMaxTier`, `bundleMult`, `genRate0`, `upgradeDisabled`, `afterReset`, `offlineCapBonusHours`, ...).
IMPORTANT: the global multiplier is applied only to tier 0 (final output). Multipliers applied per tier compound along the 8-tier chain and explode.

## Conventions
- Currency amounts are always `Decimal`; never mutate a Decimal in place. Counts of purchases (`bought`) are plain numbers.
- Logic must stay DOM-free (runs in Node for tests/sim). UI builds DOM once and only writes changed text (`txt`, `setCls`, ...).
- Save format changes: bump `def.version`, add `migrations[oldVersion] = data => data`. New state keys are filled by `mergeDefaults`.
- No hover-only information; tap targets >= 44 px; use `holdRepeat` for buy buttons.
- Balance lives in `games/replikator/tune.js`. Quick experiments: `TUNE_OVERRIDE='{"singUnlock":500}' node tools/simulate.mjs --hours 20`
  (`--act N` = player acts every N s, `--idle` = act 120 s for a 20 s session, `--both` = active vs idle comparison, `--verbose` prints every prestige).
Pacing targets (active + idle) are asserted in `tests/sim.test.mjs` / `tests/sim-idle.test.mjs` (deterministic, fixed time step, ~5 s total; they block deployment).
The in-game Auto-Challenges (def.js, `chPower`) and the sim's manual challenge logic share the same retry rule; keep them in sync.
