# Notes for AI agents

Static GitHub Pages site hosting several incremental games on one shared engine. German UI. No build step, no runtime deps,
native ES modules, ALL paths relative (site is served from `/<repo>/`).

**Read `docs/LESSONS.md` before designing or changing a game** (balancing, autobuyers, mobile UI, PWA/deploy, story, portraits,
workflow). Add new findings there when you learn something from sims, saves or player feedback.

## Layout
- `index.html`, `hub.js`, `games.json` - launcher; cards are generated from `games.json` (`id,title,description,path,icon,status`).
- `sw.js` - one root service worker (network-first with cache fallback + precache). `VERSION`/`PRECACHE` blocks are GENERATED:
  run `node tools/update-precache.mjs` after adding/changing files (tests fail if stale; CI regenerates before deploy).
- `engine/` - game-agnostic:
  - `vendor/break_infinity.js` (Decimal, MIT), `decimal.js` (`D`, `ZERO`, `ONE`, helpers), `format.js` (notations, `formatNumber/Duration`, `parseNumber`)
  - `save.js` (localStorage wrapper, Decimal-aware JSON, base64 export/import, migrations `{fromVersion: fn}`, `mergeDefaults`)
  - `core.js` (`createRuntime(logic)`: 50 ms loop with real dt, offline catch-up via `advance()`, autosave, `visibilitychange`/`pagehide`, event bus)
  - `kit/` - data-driven DOM-free game model: `Game` class (`game.js`) + mixins `generators.js`, `upgrades.js`, `challenges.js`, `state.js`
    (state factory) and the optional subsystems `producers.js` (parallel producers with synergies), `spells.js` (active abilities), `tap.js`
    (clicker with charges), `story.js` (Chronik helpers). A subsystem's state only exists when the def uses it (old saves/games unchanged).
  - `ui/` - DOM helpers (`dom.js`: `h`, cached setters), `hold.js` (hold-to-repeat, long-press), `modal.js`, `toast.js`, `tabs.js`, `app.js` (shell + ~15 fps render loop),
    `story-view.js` (Chronik as chat log + modal controller), `story-bubbles.js` (messenger-style bubbles for non-modal story entries; logic in `kit/story-bubbles.js`; settings `storyBubbles`/`storyTempo`, only when `def.chronicle`),
    `kit-views.js` (generator list, upgrade cards, prestige panel, challenges, research tree, achievements), `settings.js`, `stats.js`,
    `tap-view.js`, `spell-view.js` (bar + cards), `producer-view.js`, `story-view.js` (Chronik + modal controller), `avatar.js` (round portrait with image/fallback),
    `standard-app.js` (assembles a complete mobile UI from a `Game`), `engine.css` (variables; games theme via `:root` overrides)
- `games/<id>/` - `def.js` (data + hooks), `logic.js` (`new Game(def)`), `main.js`, `index.html`, `style.css`, `manifest.webmanifest`, `icons/`.
  `games/_template` is a minimal working example; copy it with `node tools/new-game.mjs <id> "<Titel>"`.
- `games/merlin/` - second game (id `merlin`, "Rückwärts durch die Zeit"): `tune.js`, `eras.js` (8 eras: names, slot labels, rules; Anachronismen = `IDEAS`), `story.js`, `characters.js`
  (names + portraits, the ONLY place for names), `def.js`, `ui.js` + `era-view.js` (custom tabs on `mountApp`), `art.js` (hourglass SVG), `img/*.webp` (portraits), own theme in `style.css`.
- `tools/` - `simulate-merlin.mjs` (Merlin sim, see below), `simulate.mjs` (balance sim; `--offline` = check in every 8 h for 2 min, real offline catch-up in between), `runlength-replikator.mjs` (gain/s and time-to-next-layer per fixed run length and phase), `new-game.mjs`, `update-precache.mjs`, `make-icons.mjs` (needs playwright installed elsewhere).
- `tests/*.test.mjs` - `npm test` (= `node --test "tests/*.test.mjs"`).

- `games/replikator/` Chronik (Paket 1): `characters.js` (Sonde R-1, Wartungsroutine WR-0, Missionsleitung und Echo = Akt II, nur Namen/Rollen/Farben/SVG-Embleme), `story.js` (54 Einträge, Platzhalter `P`/`W`),
  `STIMMEN.md` (Stimmen-Bibel), `def.version = 2` mit Migration 1 -> 2 (`chronicle.read/shown`, `hooks.onLoad` -> `Game.storyBackfill()`). `node tools/story-replikator.mjs [--idle]` = Transkript + Lücken; Tests in `tests/replikator-story.test.mjs` (inkl. echtem v1-Spielstand).
  `mountStandardApp` bekommt die Chronik über `options.chronicle = { cast, figures(g), lineText?, defaultWho? }` (Tab Chronik mit Ungelesen-Punkt statt Erfolge-Tab, Erfolge wandern nach „Mehr“, Modals + Blasen); `avatar()` zeichnet `emblem` (SVG-Innenmarkup) statt Foto.

## Def schema (engine/kit)
`currencies[{id,name,short?,layer,start}]`, `chains[{id,currency,layer,bundle,bundleMult,tiers[{name,desc,baseCost,costMult,unlock?}]}]` (tier n produces tier n-1,
cost per purchase = base * costMult^(1/bundle)^owned), `layers[{id,name,plural,verb,layer,currency,basis,formula{threshold,exp,softcap?},mult?,unlockWhen?,blurb}]`
(gain = floor(mult*(basisRun/threshold)^exp); prestige of layer L wipes currencies/chains/upgrades with `layer < L` unless `upgrade.keep(g,L)`),
`upgrades[{id,group,layer,currency,cost(l),max,requires,requiresAny,excl,effect(l,g),fmt,keep,show}]` (research nodes are upgrades too),
`milestones[{id,layer,at|cond}]`, `challenges[{id,rules,goal,reward,resetLayer,unlock?(g),lockText?}]` (`unlock` = extra per-challenge gate, see `g.chAvailable`) (`g.rule(key,default)` reads the active challenge),
`achievements[{id,cond(g)}]`, `story`, `autos[{id,unlock,interval,run,kind,defaults?}]` (`kind` 'gen'|'upg'|'misc' show as toggles in the generator tab, 'prestige' = `prestigeAuto({...,on,mode,value,minGain})` helper with its own config row; `defaults` may be a function when it holds mutable data), `hooks` (`genGlobalMult`, `genTierMult`, `genCostDiv`, `genGrowthPow`,
`genMaxTier`, `bundleMult`, `genRate0`, `upgradeDisabled`, `afterReset`, `offlineCapBonusHours`, ...).
IMPORTANT: the global multiplier is applied only to tier 0 (final output). Multipliers applied per tier compound along the 8-tier chain and explode.

## Additions used by Merlin (engine/kit)
- `def.producers[{id,currency,layer,bundleAt[],bundleMult,label?(g,i),slots[{name,desc,baseCost,costMult(ratio per purchase),rate,synergies[{from,per}]}]}]` - every slot produces
  the currency directly; synergy = +`per` x owned(from) (x `hooks.prodSynergyScale`); every threshold in `bundleAt` multiplies the slot by `bundleMult`. Hooks: `prodGlobalMult`, `prodSlotMult`,
  `prodCostDiv`, `prodBundleAt`, `prodBundleMult`, `prodSynergyScale`, `prodLiveMult(g,dt)` (time-limited effects, dt=0 -> display value). API: `prodBuy`, `prodBuyAll` (best payback first), `prodBuyInfo`, `prodIncome`.
- `def.spells[{id,name,desc,lockText?,autoDefault?,unlock(g),duration(g),cooldown(g),cast?(g),info?(g)}]` -> `spellCast(id)`, `spellReady/Active/Frac(id,dt)` (use `spellFrac` for time-weighted
  effects: it is correct for the large steps of offline catch-up), `spellAutoRun()` (call from an auto, per-spell switch `state.spells[id].auto`).
- `def.tap = {currency,start,max(g),regen(g),gain(g)}` -> `tapDo(auto)`, `tapRefill()`, `tapCharges()`; charges regenerate in `tick` (also offline), manual taps never run offline, autos do.
- `def.story[{id,chapter,lines:[{who,t}],modal?,cond(g)}]` + `def.chapters` + `def.chronicle:true` (read/shown flags in the save) -> `storyList/storyUnread/storyMarkRead/storyPendingModals`.
  Modal entries are shown once by `createStoryController` (also those that happened while the app was closed). Replikator's old `{id,text,cond}` entries still work.
- Replikator's BP/expansion upgrade autos use `buyRepUpgrades` = `upgBuyBest(group, repObjective)` (def.js); the sim calls the same function. New upgrades need an effect that `repObjective` can see (production, cost divisor, gain mult ...), else they are bought last.
- `engine/kit/rng.js`: seeded PRNG (mulberry32), state = one number in the save (`rngNext(seed)` pure, `rngRoll({seed})` in place). `engine/ui/auto-hints.js`: toast with the switch's place for a newly unlocked auto (`def.where` or the standard tab). Export: `runtime.exportString({short:true})` omits the play-test log.
- Autobuyers (engine, used by the in-game autos AND the sims): `prodBuyAll` = `prodChoose` (payback = cost / income gained incl. bundle thresholds + synergies, PLUS time to save up; plans "up to the next bundle", saves instead of feeding poor slots);
  `upgBuyBest(group, objective)` (value = benefit of the next level / cost, benefit = rise of a game-supplied log objective, e.g. Merlin `memObjective`; saves for the best upgrade, side purchases only if cheap and far from the goal).
- Layers: `layer.postMult(g)` = factor applied AFTER the softcap (Merlin: Reife of the Erinnerungen). `formula.threshold` and `formula.softcap.{at,pow}` may be functions of the game; `layer.available(g)` gates `canPrestige`; `prestigeAuto` supports `modes:['time',...]` ('time' = run time >= value s).
- `def.extraState(def)` adds game specific save keys; `hooks.upgradeExclusionOff(g,u)` lifts `excl`.

## Merlin specifics
- Era counter `state.mer.era` (0 Ende der Zeit ... 7 Anbeginn), `eraDone`, `finished`. Epochensprung = layer 2 (resets Zeitsand, Quellen, Erinnerungen + upgrades), Zyklus = layer 3 (new game plus, Ewigkeit).
  Ideas (Anachronismen) are layer-2 upgrades (survive jumps, wiped by the Zyklus unless Ewigkeit upgrade keeps them), `excl` pairs; the story text of each idea lives in `eras.js`.
- Run length: Erinnerungen gain x `gainRipeness` = (run time / `ripeGainSecs`)^`ripeGainExp` (capped at 1, floor 0.01) -> Erinnerungen per second peak at ~`ripeGainSecs` (3 min); default auto-Verjüngung = 'time' `autoRejuvTime`.
  Never add a softcap/exponent that makes short runs optimal again: `node tools/runlength-merlin.mjs [--verbose]` prints the Erinnerungen/s per fixed run length (12 s ... 16 min) from snapshots in the middle of every era (asserted in `tests/sim-merlin-runlength.test.mjs`).
- Balance: `games/merlin/tune.js`. `eraThr[]` (Erinnerungen needed per era) was calibrated with the sim (bisection per era); after changing the economy re-run the sim and adjust `eraThr`.
  `node tools/simulate-merlin.mjs --both --cycles 2` (active vs idle, cycle 2), `--verbose`, `--pick b` (other idea branch), `TUNE_OVERRIDE='{"rateScale":0.3}'`. Pacing is asserted in `tests/sim-merlin*.test.mjs`.
- Offline: production, tap-charge regeneration, auto-tap and auto-cast (both unlocked by milestones) run; manual taps/casts never do.
- Names/portraits: only `characters.js` (`CAST[..].img/.sm`, Merlin has one image per age stage, younger with every era). Story texts use template strings with `J`/`L`; a test forbids hard-coded names.
- Portraits are swappable: replace the webp files; the UI falls back to the initial when an image is missing.

## Replikator Akt II (Paket 2: Galaxiekarte)
- State `state.rep2` via `def.extraState` (`act2`, `act2At`, `anchor`, `rng.seed`, `ruins`, `map{cells,claimed,occupied,seed}`); `def.version = 3`, migration `2 -> 3` seeds the map from `time.created`. `hooks.onLoad/onTick -> act2Check` starts Akt II
  when v1 is finished (`z_horizont` + 8 challenges, same as `st_end`): flag, time stamp, price anchor, map (seeded RNG). The real end-of-v1 save (`tests/fixtures/replikator-end-v1.json`) starts Akt II on load.
- `games/replikator/map.js` (pure): hex disc radius 2 (19 axial cells), fog (type visible next to own cells), claim only next to own territory (claiming starts an Erschließung: one at a time, `mapTripBase * mapTripGrow^n` s, runs offline, the sector counts in `arrive`), price `10^(anchor + mapCostOffset + mapCostStep n)` in Sternsysteme (from the current amount),
  adjacency `base^(1 + 0.5 * same-type neighbours <= 3)` (`mapBase`), effects via `gainMult` (layer `mult`) and `productionParts` (`globalParts`, labeled), the Echo takes a cell per 2 claims (`echoChoice`: pure in map seed + count, never cuts a free cell off, so 12 sectors are always possible).
  `holdSingularity` makes the Auto-Singularität and the sim wait for the next sector (`prestigeAuto({hold})`); `autoClaim`/`bestClaim` (value = rise of `repObjective`) = `mapAutoClaim` in def.js = the Auto-Erkundung (`auto_map`, off by default, unlocks at `mapAutoAt` sectors) = what the sim's player calls. Everything is tuned in `tune.js` (`map*`).
- UI: `map-view.js` (SVG hex map, sector card, bonus list) as `options.extraTabs` entry in `main.js`. Engine: `extraTabs`, folding of the layer tabs into "Ebenen" when more than `maxTabs` (6) tabs would show, `formatCompact` for header chips.
- Sim: `node tools/simulate.mjs --act2 --hours 20 --dt 2` (continues after v1; prints Akt II start, each Erschließung and arrival, Echo occupations; `node tools/story-replikator.mjs --act2 [--fixture f]` prints the Akt II story with times), `--fixture <save file>`, `--seed N`. Pacing: `tests/sim-replikator-act2-map.test.mjs` (fresh AND fixture), logic: `tests/replikator-map.test.mjs`.
- Story: chapter `a2` in `story.js` (opening modal `a2_start`, `a2_first`, `a2_ruin0..3`, `a2_echo`, `a2_echo_take`); the Echo is a cast member from `a2_echo` on and does not speak yet; the Missionsleitung stays `later`.

## Conventions
- Currency amounts are always `Decimal`; never mutate a Decimal in place. Counts of purchases (`bought`) are plain numbers.
- Logic must stay DOM-free (runs in Node for tests/sim). UI builds DOM once and only writes changed text (`txt`, `setCls`, ...).
- Save format changes: bump `def.version`, add `migrations[oldVersion] = data => data`. New state keys are filled by `mergeDefaults`.
- No hover-only information; tap targets >= 44 px; use `holdRepeat` for buy buttons.
- Balance lives in `games/replikator/tune.js`. Quick experiments: `TUNE_OVERRIDE='{"singUnlock":500}' node tools/simulate.mjs --hours 20`
  (`--act N` = player acts every N s, `--idle` = act 120 s for a 20 s session, `--both` = active vs idle comparison, `--verbose` prints every prestige).
Pacing targets (active + idle) are asserted in `tests/sim.test.mjs` / `tests/sim-idle.test.mjs` (deterministic, fixed time step, ~5 s total; they block deployment).
The in-game Auto-Challenges (def.js, `chPower`) and the sim's manual challenge logic share the same retry rule; keep them in sync.

## Psst! multiplayer (games/psst, workers/psst-room)
Vocabulary: `games/psst/GLOSSARY.md`; decision: `docs/adr/0002-*`. The single-phone mode is untouched; "Mehrere Handys (Online)" on the start screen opens it. Needs internet.
- **Worker** `workers/psst-room/src/index.js` (Durable Object, hibernation API) + pure `routing.js` (tested in Node): envelope `{to?:"<id>"|"host"|"all", t, ...}`, the room sets `from`;
  `host-hello {hostKey}` makes a socket the host (same key takes over again), `peer-join/peer-leave` go to the host, `welcome {id,hosted,hostPresent}` is the first frame, `host-gone`, `error {code}`;
  16 KB / 20 sockets limits; client ids come from `?cid=` (reconnects keep their id). Deployed by Workers Builds on push to `main` -> keep changes backward compatible.
  Test it for real with `npm i wrangler` in a scratch dir and `wrangler dev -c workers/psst-room/wrangler.toml --local --port 8787` (client: `localStorage['psst:server']='ws://localhost:8787'`; Origin `http://localhost:8765` is allowed).
- **Client** (DOM-free, Node-testable with `tests/helpers/memory-room.mjs`, which runs the real `routing.js`): `net.js` (WebSocket, backoff reconnect, ping/pong clock offset, falls back to the plain broadcast relay when no `welcome` arrives: client-side `to` filter, no hostKey on the wire),
  `host.js` (host session: lobby, game via unchanged `logic.js`, intent -> logic mapping with role checks, pushes per-role views, persists `psst:mp-host`, resume after reload), `views.js` (`roleOf`, `buildView`: the ONLY place deciding who sees the Karte),
  `client.js` (guest + `createLocalSession` for the host's own screen), UI: `mp-ui.js` (start/join/lobby/host menu), `mp-views.js` (game screens per role + Anzeige), `mp.css`, `qr.js` + `vendor/qrcode.js` (MIT).
- **Spielform** `settings.form` = 'teams' (default; old saves without the field) | 'ffa' (Jeder gegen jeden, >=3 players): in `logic.js` every player is a scoring unit (a "team" of one), `turnInfo` has `raters/raterNames`; Wächter = player `1 + (Runde mod (n-1))` places after the Erklärer;
  `richtig(guesser)` scores Erklärer +1 and the named Rater +1 (auto with one Rater), `korrigiere(i,result,guesser)`, `zugAussetzen()`/`tauscheErklaerer(unit)` for absent players. Teams need >=2 players each (`host.check()` -> `suggestFfa`, one-phone `setupProblem()`). Tests: `tests/psst-ffa.test.mjs`, `tests/psst-mp-ffa.test.mjs`.
- Rules: never put a card into a view of Rater/Zuschauer/Anzeige (`tests/psst-mp-game.test.mjs` checks views and wire frames); intents that depend on the screen carry `ref` (card id / buzz number) so the first valid tap wins;
  card frames are only ever sent with `to` = one client id. Add new intents in `host.js` `intent()` with a role check and a test.


## Replikator Akt II (Paket 3: Mutationen)
- `games/replikator/mutations.js` (pure): `MUTATIONS` (15, je Nutzen + Haken + `report` für die Chronik), State `state.rep2.mut` (`queue`, `offer`, `genome`, `rng`, ...), `def.version = 4` (Migration 3 -> 4 = `migrateToMut`).
  Angebote laden nach **Spielzeit** (`mutEvery` 25 min * `mutGrow`^n, max 3 wartend), nicht pro Replikation (Mikro-Läufe!). Wirkung nur über `mutParts/mutGain/mutTier/mutCostDiv/mutBundle/mutAutoSlow/mutMapCost/mutTrip/mutAdj`, aufgerufen aus den Hooks in def.js und map.js. Zahlen: `tune.js` (`mut*`, `genome*`, `mutFx`).
- Auto-Genom (`auto_genom`, startet aus): `mutChoose(g)`/`mutAutoGenom(g)` in def.js (`mutObjective` = `repObjective` + `mutExtra`), dieselbe Funktion ruft die Sim. Engine: `game.offlineNow` (true im Offline-Catch-up).
- UI: `genome-view.js` als `extraTabs`-Eintrag „Genom“ (max. 6 Tabs, bei 360 px geprüft). Story: Kapitel `a2m` in `story.js` (`mut_*`, Modal `mut_first`, Berichte aus `MUTATIONS[].report`, `mut_fill1..8`).
- Tools/Tests: `node tools/simulate.mjs --act2 --verbose` druckt Angebote und Entscheidungen; `tests/replikator-mutations.test.mjs`, `tests/sim-replikator-mutations.test.mjs`, `tests/sim-replikator-mutation-runlength.test.mjs`.

## Replikator Akt II: Mutationen-Rebalance
- Gewinn-Faktoren der Mutationen stehen in `layer.postMult` (nach dem Softcap), Faktoren > 1 auf Sternsysteme/Quantenkerne reifen mit der Laufzeit (`ripen`, `mutRipe` in tune.js); `mutGainParts(g,kind)` = beschriftete Faktoren (Genom-Tab zeigt sie). Reisedauer (`trip`), Sektorpreis (`mapCost`) sind die Fortschrittshebel der Karte.
- Messung: `node tools/mutations-replikator.mjs [--only id] [--offline --hours 30]` (Tabelle vorher/nachher in `docs/replikator-akt2.md`); Test `every mutation alone changes something that moves progress` in `tests/replikator-mutations.test.mjs`.


## Replikator Akt II (Paket 4: Sondenbefehle, Anomalien)
- **Kartenboni nach dem Softcap:** `def.js postGain(g, kind)` = `mutGain x mapGain x cmdGain x anoGain` ist das `postMult` aller drei Gewinn-Layer; Faktoren > 1 auf Sternsysteme/Quantenkerne reifen mit der Laufzeit (`ripen()`, mutations.js). Neue Gewinnfaktoren dort einhängen, nie ins Layer-`mult`.
- `games/replikator/commands.js`: `COMMANDS` = `def.spells` (Übertakten, Sonnenwind-Ernte, Tiefenscan), `cmdRate` (Pulsare, Sonnenhunger), `hooks.tripSpeed(g, dt)` (zeitgewichtet, in `mapTick`), Auto `auto_befehl` ruft `g.spellAutoRun()` (Engine: `spell.autoWhen(g)` hält Auto-Casts zurück; `Game.tick` zählt Zauber vor den Autos herunter). Sim: `player()` ruft dieselbe Funktion.
- `games/replikator/anomalies.js` (`rep2.ano`): Quellen = Anomalie-Sektoren (`owed`) + alle 60-90 min (Seed-RNG), höchstens eine wartet, nichts verfällt; Beutel statt Würfel, `ANOMALIES` (Gezeitenwelle, Zeitriss, Strahl, Spiegel, Signal, Umkehr), `anoStart/anoChoose` (= `chooseAnomaly` in def.js, die Sim nutzt es), Effekte über `tripSpeed`, `tierMult`, `postGain`, `mutAddOffer` (mutations.js, Seltenheits-Garantie über `mut.rare`). Auto-Erkundung bewertet Anomalie-Sektoren (`mapObjective`, `T.anoSectorW`).
- UI: `commands-view.js` (Leiste, Karten, Anomalie-Karte, `statusBanner` = `options.banner` der Standard-App) im Galaxie-Tab (`map-view.js`). Story: Kapitel `a2c` (`cmd_*`, `ano_*`, `sig_0..3`), Signalfragmente ohne Absender (STIMMEN.md).
- `def.version = 5`, Migration 4 -> 5 (`migrateToAno`). Dev-Schalter `T.anoForce` (Typ-ID oder `'none'`), `runSim({ commands:false, anomalies:false })` isoliert Karte bzw. Mutationen (die älteren Pacing-Tests laufen so).
- Messung: `node tools/commands-replikator.mjs`, `node tools/anomalies-replikator.mjs` (Tabellen in `docs/replikator-akt2.md`), Tests `tests/replikator-commands.test.mjs`, `tests/replikator-anomalies.test.mjs`, `tests/sim-replikator-commands.test.mjs` (Pacing, Story, „jeder Effekt ist spürbar“, Laufdauer).
- Folgearbeiten: `def.js singRipeness` (`T.singRipe`, nur Akt II) ist ein Reife-Faktor auf den Quantenkern-Gewinn (Laufdauer-Optimum 20-30 min, `tests/sim-replikator-runlength-akt2.test.mjs`, Tool `takeAct2Snapshots`); `mapTripBase` 360 (Ziel ~2 h bis 10 Sektoren MIT allem, Tests laufen mit allem); `mapAutoAt` 2 (Offline-Spieler, `node tools/simulate.mjs --offline --fixture tests/fixtures/replikator-end-v1.json --hours 400`, `tests/sim-replikator-offline-akt2.test.mjs`).


## Replikator Akt II (Paket 5: Galaxiensprung)
- Layer 4 `jump` (Saatkerne, Basis `cores.run`, `floor((cores/4)^0,25)`), offen bei `jumpSectors` (10) Sektoren + Silhouette gesehen (`jump.js jumpReady`). `afterReset(L>=4) -> galJump`: Karte weg, Wahl `rep2.gal.choice` (zwei Typen, im Spielstand, Dialog `jump-view.js mountGalaxyChoice` nicht schließbar), `galChoose` baut die neue Karte (`galAnchor`, Echo wieder am Rand).
- `galaxy.js`: Zustand `rep2.gal` / `rep2.archive`, 6 Typen (`tune.js galFx` = Regeln, `galArchive` = Dauerbonus, Texte daraus), Effekte über `galTrip/galCmdRate/galOfferRate/galGainParts/galProdParts/collisionFactor` (Mittel über `game.tickDt`). Der Sprung behält Genom, Archiv, Meilensteine, Challenges, Zähler; alles andere nur über Saatkern-Upgrades (`def.js` Gruppe `seed`, kein Autokäufer, Sim kauft nach `SEED_PLAN`).
- Sektor-Rekord `gal.best` (`map.js bestClaimed`) statt aktueller Karte für Auto-Freischaltungen und Genom-Plätze. `auto_jump` (nach 3 Typen, startet aus) und die Sim nutzen `jumpPlay`/`galPick`.
- Sim: `node tools/simulate.mjs --act2 --hours 24` (Galaxien-Tabelle; `runSim({jump:true})`, `--jump` bei `--fixture`); `tools/runlength-replikator.mjs takeGalaxySnapshots`; `node tools/story-replikator.mjs --act2 --jump`. Save-Version 6. Details und Messwerte: `docs/replikator-akt2.md`.
