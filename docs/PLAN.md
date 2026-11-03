# GEO CHOP — Product & Technical Plan

> *Measure twice, chop once.*
> A daily geography puzzle for iOS and Android: draw one straight line across a country so that it splits the **population**, not the land, as close to 50/50 as you can.

Status: **planning** · Last updated: 2026-11-03

---

## 0. TL;DR — key decisions (recommended)

| Area | Decision |
|---|---|
| Name | ✅ **CONFIRMED (2026-11-03): GEO CHOP.** "GEO Slice" was rejected because it's too close to the reference game's name, "Slice". |
| Platforms | iOS + Android from one codebase |
| Stack | ✅ **CONFIRMED (2026-11-03): Expo (React Native) + TypeScript + `@shopify/react-native-skia` + Reanimated + Gesture Handler.** No Xcode needed. |
| iOS builds from Windows | **EAS Build / EAS Submit** (cloud Macs). No Mac needed. |
| Population data | **GHSL GHS-POP R2023A, epoch 2025** (JRC), cross-checked against WorldPop |
| Borders | **Natural Earth 1:10m Admin-0** (public domain) |
| Cities (hint) | GHSL Urban Centre Database, with GeoNames as a fallback |
| Night-lights hint | NASA Black Marble VNP46A4 annual composite (public domain) |
| Data processing | Offline **Python pipeline** bakes compact per-country binary packs. The app does not do GIS at runtime. |
| On-device math | Weighted point cloud (≤ 20k points/country). Splitting is an O(N) half-plane sum, under 1 ms. |
| Signature visual | "Tabletop cartography": the country is a thick slab, the **chop** splits it, then the camera tilts and **population columns rise** in two team colours. |
| Backend v1 | None. Content and daily schedule come from a CDN (Cloudflare R2), with an offline fallback bundled in the app. |
| Monetisation | Free daily game, no ads at launch. One-time **GEO CHOP+** unlock (~$3.99) for the archive, all countries and extra modes. |

---

## 1. Concept

### 1.1 The core loop (one round)
1. A country silhouette appears with the goal: **"Chop the population in half."**
2. The player drags across the map to draw a straight line. Both endpoints can be dragged to adjust it. The line extends infinitely; a dashed line shows the part beyond the handles.
3. The player presses **CHOP**. A cleaver sound plays, with haptics, and the country splits along the line. The two pieces slide apart.
4. The camera tilts, and population columns rise from the map in two colours, orange (side A) and teal (side B).
5. Counters roll up to the result, e.g. **48.7% / 51.3%**, giving a score and a grade.
6. An insight card follows, e.g. *"Half of Egypt's 116M people live on just 3.4% of its land."* The **perfect chop** at your angle is shown as a ghost line.

### 1.2 Why it's fun
- **Intuition vs. reality:** shapes lie. Most people live along coasts, rivers and in one or two megacities, so the "obvious" middle is almost always wrong.
- **There is always a perfect answer at any angle.** By the intermediate value theorem, every direction has a line that splits exactly 50/50. Skill is about *where*, not *which angle*. This keeps the game fair.
- **Short, daily and shareable.** It takes 2–3 minutes a day, and the share text produces streaks and social pull.
- **Educational without feeling like it.** Players genuinely learn where humanity lives.

### 1.3 Differentiation (we are *inspired by* the genre, not cloning anything)
GEO CHOP must have its own name, art, copy, scoring, UI and features. It must not copy the reference site's text, layout, colours or scoring formula. What makes it distinct:

| Feature | What it is |
|---|---|
| **Hint ladder** | Three escalating hints, each costing points: Terrain & rivers → Night lights from space → Big cities. Night lights are thematic, beautiful and educational. |
| **One chop, no retries in the daily** | "Measure twice, chop once." Before chopping, you can adjust the line as much as you like. |
| **3D population reveal** | Tilted hex columns, not flat bars. |
| **Then & Now mode** | GHSL has epochs from 1975 to 2030. Chop Nigeria in 1975, then see how your line does in 2025. Nobody else does this. |
| **Target chops** | "Chop off exactly 25%", "Isolate 10%", and "Three equal parts" with two parallel chops. |
| **Insight cards** | A data fact after every round: area holding half the people, biggest city's share, rural vs. urban. |
| **Atlas collection** | Every country you chop is stamped into your atlas, with your best accuracy. It works as a collection meta-game. |
| **Subnational packs (later)** | US states, Indian states, Brazilian states, Chinese provinces, UK nations, etc. |

---

## 2. Game design

### 2.1 Modes

| Mode | v1? | Description |
|---|---|---|
| **Daily Chop** | ✅ | 5 countries per day, the same for everyone (keyed on UTC date). Difficulty ramps from easy to hard. Max 500 points. Streaks and stats are tracked. |
| **Practice / Atlas** | ✅ | Pick any country. Doesn't affect streaks. Free tier gets a rotating set of ~30 countries; GEO CHOP+ unlocks all of them. |
| **Archive** | ✅ (+) | Replay any past daily. |
| **Target Chop** | v1.1 | Goals other than 50% (e.g., 20/80, 33/67). |
| **Three-Way** | v1.1 | Two parallel lines → three equal thirds. |
| **Then & Now** | v1.2 | The same chop is scored against 1975 and 2025 population. |
| **Continents & World** | v1.2 | Chop Africa, Europe, the world (in Equal Earth projection). |
| **Duel** | v2 | Async challenge link: chop the same country as a friend and compare. |
| **Subnational packs** | v2 | US states, Indian states, etc. |

### 2.2 Round rules
- **Goal:** a line splitting population 50/50 (or the target ratio in other modes).
- **Line semantics:** the line is **infinite**. All land on one side counts as A and the other side as B, including islands and exclaves. Only the error from the target counts; which side is A doesn't matter.
- **Validity:** CHOP is disabled until the line actually crosses the country's land.
- **Daily:** one chop per round. In Practice, there are unlimited re-chops.
- **"Show perfect chop":** after scoring, a ghost line shows the exact 50/50 line *at your angle*, plus the global-best angle animation.

### 2.3 Scoring (our own curve; tune with playtest data)
Let `e = |your % − target %|` in percentage points.

```
base  = round(100 * exp(-e / 7))
bonus = +10 "Clean Chop" if e < 0.5   (round cap 100 → displayed as 100 + ✨)
hint penalty multiplies base: Terrain ×0.9, Night lights ×0.75, Cities ×0.6 (cumulative ladder)
```

| Error (pp) | Score | Grade |
|---|---|---|
| < 0.5 | 100 ✨ | **Surgical** |
| 1 | 87 | **Razor** |
| 2 | 75 | **Sharp** |
| 3 | 65 | **Clean** |
| 5 | 49 | **Rough** |
| 10 | 24 | **Hacked** |
| 20 | 6 | **Butchered** |

The daily total is out of 500, plus a bonus count of ✨ marks. Grade names give a voice to the game and work well in share text.

### 2.4 Daily structure
- **5 countries/day**, ordered by the computed difficulty score (see §4.7): 1 easy, 2 medium, 1 hard, 1 "boss".
- Countries can't repeat within 60 days. Neighbours shouldn't appear in the same day.
- Schedule data: `schedule.json` on the CDN, generated 1 year ahead. The app bundles 90 days as an offline fallback. This lets us **hot-fix** a bad puzzle without an app release.
- Puzzle number = days since launch (`GEO CHOP #142`).

### 2.5 Share text (no spoilers)
```
GEO CHOP #142 🔪 412/500
🟩🟩🟩🟩🟩  Japan     99 ✨
🟩🟩🟩🟩⬜  Brazil    81
🟩🟩🟩⬜⬜  Egypt     64 💡
🟩🟩🟩🟩⬜  Canada    83
🟩⬜⬜⬜⬜  Indonesia 24
geochop.app
```
Each row has five squares, one per 20 points. 💡 means a hint was used. Country names are shown *after* the day is over; before that, show flags or "Round 1–5". Decide in playtest.

### 2.6 Meta & retention
- Streaks: current and best, with a calendar heatmap.
- Stats: average error, score distribution, best and worst countries.
- Atlas: a world map that fills in as you chop countries. Tap one to see your best chop.
- Achievements: "Chop every country in Africa", "10 Surgicals", "No-hint week"…
- Local daily reminder notification (opt-in, at a time the user picks).
- Later: Game Center and Google Play Games leaderboards. "You beat 73% of players today" needs a light backend (v1.1).

### 2.7 Line-drawing UX (critical to feel)
- Drag anywhere to draw. Endpoint handles have 44 pt touch targets.
- **Magnifier loupe** while dragging a handle, so the finger doesn't hide the line.
- **Fine mode:** dragging a handle slowly reduces its speed (a 0.35× multiplier when finger velocity is low).
- A small **rotate dial** (optional) rotates the line around its midpoint.
- Pinch-zoom and pan on the map: important for Indonesia, Chile and Japan.
- No live percentage while drawing; that would defeat the puzzle.
- Haptic tick when the line first crosses the coast. Strong thud plus sound on CHOP.

### 2.8 Accessibility
- Team colours orange/teal are distinguishable in common colour-vision deficiencies. Pieces also carry **A/B labels** and different column hatching.
- Dynamic type for UI text, a reduce-motion setting (skips the tilt, uses a fade), and VoiceOver/TalkBack summaries of results.
- Left/right-handed layout toggle for the CHOP button.

---

## 3. Graphics & art direction

### 3.1 Style: "Tabletop cartography"
The country looks like a physical **cut-paper/wood slab** lying on a tinted paper ocean. It has a soft drop shadow and a slightly thick edge, so it feels like something you can *chop*. Everything is drawn in Skia at 60 fps; there is no raster map imagery except optional hint layers.

**The three visual moments:**
1. **Calm (planning):** flat, top-down silhouette on textured paper with a faint graticule. Minimal and readable.
2. **The Chop (≈ 400 ms):** a steel-white streak runs along the line with a tiny motion blur. The screen shakes 2–3 px, the haptic fires, the two pieces separate ~10 px along the line normal, and the cut edges show a darker "core" colour.
3. **The Reveal (≈ 1.8 s):** the camera tilts ~35° (faux-3D). Hex columns rise in a ripple from the line outward, A in orange and B in teal, with height ∝ √population. Two big counters roll up, then the score badge stamps in.

### 3.2 Palette (draft)

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` (ocean/bg) | `#F3EEE4` | `#0F1626` | background |
| `land` | `#E6D6B8` | `#2A3550` | country slab |
| `landEdge` | `#BFA67A` | `#3D4B6E` | slab edge / shadow side |
| `ink` | `#1C2233` | `#E9EDF5` | text, outlines |
| `sideA` | `#FF7A3D` (Tangerine) | `#FF8A50` | piece/columns A |
| `sideB` | `#1FB5A8` (Lagoon) | `#33CFC1` | piece/columns B |
| `blade` | `#FFFFFF` | `#FFFFFF` | chop streak |
| `gold` | `#FFC23D` | `#FFCB52` | Surgical ✨, perfect line |
| `muted` | `#8A8F9C` | `#7E879B` | secondary text |

Run the validator from the dataviz guidelines on the A/B pair before locking it in.

### 3.3 Typography (all SIL OFL, free for apps)
- **Display / logo:** *Bricolage Grotesque* ExtraBold (chunky and characterful), or *Archivo Black*.
- **UI:** *Inter* or *Space Grotesk*.
- **Numbers:** tabular figures (`font-variant-numeric: tabular-nums`) so rolling counters don't jitter.

### 3.4 Logo & app icon
- **Icon concept:** a globe/sphere cut diagonally. The top half is offset up and right, with the halves in orange and teal, on a deep-navy square. A thin white "blade" gap separates them. It reads at 29 px.
- **Wordmark:** `GEO CHOP` in Bricolage ExtraBold with a slash cut through the "O" of CHOP.
- Deliverables: 1024² iOS icon (no alpha), Android adaptive icon (foreground + background layers, 432² safe zone), monochrome themed icon for Android 13+, and a splash screen.

### 3.5 Population visualisation
- **Columns:** a pointy-top hex grid in each country's projected space, with ~1,500–3,000 hexes depending on size. Heights use `√pop` normalised to the country's max, with a 2 px floor so empty land stays visible.
- **Colour per side:** each hex is assigned by its centre (visual only; the *score* uses the exact point cloud).
- **Depth:** faux-3D by drawing each prism's top face plus two visible side faces, shaded −15% and −30%. Prisms are painter-sorted back-to-front once when the tilt starts.
- **Alternative for Lite/low-end devices:** a flat dot-density reveal (dots fade in by side).

### 3.6 Hint layers (pre-rendered per country, 512–1024 px WebP)
1. **Terrain & rivers:** Natural Earth shaded relief, plus rivers in soft blue, masked to the country.
2. **Night lights:** NASA Black Marble, gamma-tuned, glowing gold on a dark slab. This is the "wow" hint.
3. **Big cities:** the top 3 urban centres as pulsing dots. Names are shown after the round.

### 3.7 Motion & sound
- **Motion:** Reanimated springs everywhere. The chop is a 120 ms streak, 220 ms separation, then a 600 ms tilt and 900 ms column-rise ripple. Everything respects reduce-motion.
- **Sound (CC0 or commissioned):** cleaver *thunk*, wood *creak* on tilt, rising pitch ticks while counters roll, a stamp *thock* for the grade, and a bright chime for Surgical. There's a mute toggle; respect the iOS silent switch.
- **Haptics:** `expo-haptics`. Light on line placement, heavy impact on chop, success/warning notification by grade.

### 3.8 Screens (wireframe list)
1. **Home:** today's puzzle card (#, streak 🔥, "Play"), plus Practice, Atlas and Stats.
2. **Round:** top bar (round 2/5, score so far), goal pill, full-bleed map canvas, bottom bar (Hint 💡, CHOP 🔪).
3. **Result (overlay on canvas):** % split, grade stamp, insight card, "Show perfect chop", Next.
4. **Daily summary:** 5 rows, total, Share, countdown to the next puzzle.
5. **Atlas:** world map coloured by best accuracy, with a list view.
6. **Stats:** streaks, histogram, calendar.
7. **Settings:** sound, haptics, theme, reduce motion, notifications, credits & data attribution, privacy.
8. **Onboarding:** a 3-step interactive tutorial on an easy country (e.g., Iceland, "half the people live in one corner!").

### 3.9 Store creative
- iOS screenshots: 6.9" (1320×2868) is required; add 13" iPad only if we ship iPad. Android: phone screenshots plus a **1024×500 feature graphic**.
- 5 shots: (1) hero chop moment, (2) columns reveal, (3) night-lights hint, (4) daily summary/share, (5) atlas collection.
- A 15–30 s preview video of the chop → reveal → share moment.

---

## 4. Population & geographic data

### 4.1 Sources & licences

| Data | Source | Licence | Notes |
|---|---|---|---|
| Population grid | **GHSL GHS-POP R2023A**, epoch 2025 (also 1975…2030 for Then & Now) | CC BY 4.0 (verify the licence field on the JRC catalogue page) | 3″ (~100 m) and 30″ (~1 km) WGS84 grids |
| Population cross-check | **WorldPop** constrained 2020+ / Global2 | CC BY 4.0 | QA only, or a per-country override when GHSL is poor |
| Alt. (pre-aggregated) | **Kontur Population** (H3 r8 hexes) | CC BY 4.0 | A handy shortcut for prototyping |
| National totals | **UN World Population Prospects 2024** | CC BY 3.0 IGO | Calibrate/compare grid sums |
| Borders | **Natural Earth 1:10m Admin-0** (+ "map units"/"subunits" for things like contiguous USA) | Public domain | Has "point-of-view" variants for disputes |
| Subnational (later) | geoBoundaries ADM1 | CC BY 4.0 | For US/India/etc. packs |
| Cities | **GHSL Urban Centre Database 2025** (fallback: GeoNames cities15000) | CC BY 4.0 | Hint dots, insight facts |
| Night lights | **NASA Black Marble VNP46A4** (annual) | Public domain (NASA) | Hint layer |
| Relief, rivers | Natural Earth shaded relief, rivers & lake centerlines | Public domain | Hint layer |

The in-app **Credits** screen must show the CC BY attribution: source, authors, year, licence link and "modified". This is also required for store compliance.

### 4.2 The projection problem (important!)
A "straight line" is only straight in the projection the player sees, so **the score must be computed in exactly the same projected 2D space that's drawn on screen.**
- Each country gets its own **Lambert Azimuthal Equal-Area** (LAEA) projection, centred on the country's centroid, north up. LAEA preserves area, so column density matches visual area and shapes look natural at country scale.
- All geometry and population points are baked *already projected* and normalised to `[0,1]` within the country's bounding box (with the aspect ratio stored).
- Projection centring also handles **antimeridian** countries (Russia, Fiji, Kiribati, the US with the Aleutians) for free.
- The World/continent modes use **Equal Earth**.

### 4.3 "Playable geometry" (curation per country)
Some countries need a defined playable area. Rule: **population counted = population inside the displayed geometry**, and the UI says what is excluded.
- USA → Contiguous US by default ("excludes Alaska & Hawaii, 0.6% of population"). Full USA can be a hard variant.
- France → Metropolitan France (overseas regions excluded). The same applies to the Netherlands, Norway (Svalbard), Spain (Canaries? keep, it's close), Portugal (Azores/Madeira), Denmark (Greenland separate), Ecuador (Galápagos), Chile (Easter Island) and others.
- Micro-states and tiny islands are excluded from the daily. Rule of thumb: playable if land area is above ~2,000 km² **and** the split is interesting (difficulty above a threshold). Expect **~150–170 playable countries**.

Each country gets a config file:
```yaml
# pipeline/countries/USA.yaml
iso3: USA
name: United States
variant: contiguous
include_subunits: [USA-contiguous]      # Natural Earth subunit codes
exclude_note: "Excludes Alaska & Hawaii (0.6% of population)"
projection: { type: laea, lon0: -96.0, lat0: 38.5 }
daily_eligible: true
sensitivity: none                       # none | disputed | sensitive
```

### 4.4 Disputed borders (risk to manage early)
Borders are political. Kashmir, Crimea, Western Sahara, Taiwan, Palestine/Israel, Arunachal Pradesh, Kosovo, Cyprus and others can cause app-store complaints, bad reviews or legal issues in specific markets (notably India and China).
- Default to the Natural Earth **de facto** worldview, plus a disclaimer in Credits: *"Boundaries are simplified for gameplay and do not imply any official position."*
- Mark sensitive countries `sensitivity: disputed`. **Keep them out of the Daily at launch**; they stay in Practice, or are excluded entirely.
- Later, consider region-specific worldviews (Natural Earth provides POV files) chosen by store territory.

### 4.5 Bake format: what ships in the app
For each country, the pipeline outputs a small bundle:

```
countries/JPN/
  meta.json        name, iso, totals, aspect, notes, difficulty, insight facts, cities top-10, version
  points.bin       weighted point cloud for SCORING
  hex.bin          hex columns for VISUALS
  outline.json     simplified outline as SVG path strings (normalised coords), parts listed
  hint_relief.webp
  hint_lights.webp
```

**`points.bin` (scoring)** is a little-endian binary:
```
header: magic "GCP1" | u32 count | f64 totalPop
records × count: u16 x | u16 y | f32 weight     (8 bytes)
```
With ≤ 20k points that's ≤ 160 KB raw, ~70–90 KB gzipped. Across 170 countries this is roughly **12–15 MB total**, including hex and outline data. Hint images add ~40 KB each, about 14 MB total. **Bundle the top ~60 countries** and download the rest as content packs on demand (cached), or bundle everything if the total stays under ~35 MB.

### 4.6 Point-cloud compression: adaptive quadtree
A plain 1 km grid gives Russia ~17 million cells, which is too many. We need high precision where people are and coarse cells in empty land:
1. Rasterise population into the country's LAEA grid, sized so the long side is ~2,048 cells. **Resample by SUM, not mean** (a classic pitfall), using area-weighted reprojection.
2. Build a quadtree bottom-up. **Merge** four sibling cells if their combined population is below `P_max = 0.02% × total` (and they are all on land).
3. Each leaf becomes a point at its **population-weighted centroid**, carrying its population as the weight.
4. Raise `P_max` until count ≤ 20k.

**Error bound:** a line can only misclassify the leaves it crosses. **Validation** (automated, per country) runs 2,000 random lines through both the compressed cloud and the full-resolution raster, and **requires max |Δ| < 0.15 pp**. Scoring granularity is 1 pp, so this is invisible to players. Fail → lower `P_max` for that country.

### 4.7 Derived stats (insights and difficulty)
Computed per country during baking:
- **Half-area share:** the smallest fraction of land containing 50% of people (sort cells by density and accumulate). *"Half of Egypt lives on X% of it."* (Every number in this plan's example copy is illustrative; the real values come from the pipeline.)
- **Top city share:** the largest urban centre as % of national population.
- **Difficulty score D:** for 36 angles, find the line that splits **area** 50/50 and the line that splits **population** 50/50, measure the distance between them (normalised by bounding-box diagonal), and average. Combine that with half-area share and outline complexity:
  `D = 0.6·avg_offset + 0.25·(1 − half_area_share) + 0.15·outline_complexity`
  This sorts countries into tiers for the daily ramp. Re-tune using real players' average error after launch.

### 4.8 QA checks (automated in the pipeline)
- Grid total vs. UN WPP 2024 estimate: warn above ±5%, fail above ±15%. Record the delta and display a rounded population (e.g., "~125M").
- The whole outline is inside the frame, and the aspect ratio is sane.
- The compression error test (§4.6) passes.
- Hex totals equal point totals within 0.01%.
- A visual contact sheet (PNG grid of all countries with columns) for human review before each content release.

---

## 5. Technical architecture

### 5.1 Why Expo + Skia
- **One TypeScript codebase** for iOS and Android.
- **You're on Windows:** EAS Build compiles iOS in the cloud, and EAS Submit uploads to App Store Connect. No Mac is required. (Flutter or native would need a Mac or paid CI for iOS.)
- **Skia** gives GPU-accelerated 2D drawing: paths, path boolean ops (for the chop), shaders (blade glow, paper texture), and thousands of prisms at 60 fps.
- **Reanimated** gives UI-thread animations and gestures with no JS-thread jank while dragging.
- **EAS Update** ships OTA JS/content fixes without store review (within store rules).

*Alternatives considered:* Flutter (also excellent, CustomPainter; needs a Mac for iOS builds), Unity/Godot (overkill and heavier binaries; UI work is harder), native Swift+Kotlin (2× the work).

### 5.2 Libraries
| Need | Library |
|---|---|
| Framework | Expo SDK (latest), `expo-router` |
| Rendering | `@shopify/react-native-skia` |
| Gestures/animation | `react-native-gesture-handler`, `react-native-reanimated` |
| State | `zustand` |
| Storage | `react-native-mmkv` (stats, streaks, settings) |
| Haptics/audio | `expo-haptics`, `expo-audio` |
| Files/assets | `expo-asset`, `expo-file-system` (content packs) |
| Notifications | `expo-notifications` (local only, v1) |
| IAP | RevenueCat (`react-native-purchases`) |
| Analytics/crash | Sentry (crash) + PostHog or Firebase Analytics (privacy-light, no IDFA) |
| Tests | Jest (logic), Maestro (E2E flows) |

### 5.3 Core algorithms (app side)
```ts
// Which side of line AB is each weighted point on? O(N), <1 ms for 20k points.
function splitShare(pts: Float32Array /* x,y,w interleaved */, ax, ay, bx, by): number {
  const dx = bx - ax, dy = by - ay;
  let a = 0, total = 0;
  for (let i = 0; i < pts.length; i += 3) {
    const w = pts[i + 2];
    total += w;
    if (dx * (pts[i + 1] - ay) - dy * (pts[i] - ax) > 0) a += w;
  }
  return a / total; // fraction on side A
}

// Perfect chop at the player's angle: weighted median along the line normal. O(N log N).
function perfectOffset(pts, nx, ny): number { /* project, sort, accumulate to 50% */ }
```
- **Visual split:** country `SkPath` ∩ huge half-plane polygon (`Skia.Path.MakeFromOp(country, halfPlane, PathOp.Intersect)`) gives piece A; `Difference` gives piece B. Then translate each piece along ±normal.
- **Precision:** store points as Float32 after decoding u16 → normalised. The line comes from screen coordinates mapped back through the inverse of the current pan/zoom transform.

### 5.4 Project structure
```
sliceapp/
  mobile/                   Expo app
    src/app/                expo-router routes: index, daily, round/[id], practice, atlas, stats, settings
    src/                    (non-route code)
      game/                 split math, scoring, daily schedule, state machines
      data/                 country pack loader, binary decoders, content-pack downloader
      render/               Skia components: CountryCanvas, ChopLine, Loupe, HexColumns, BladeFx
      ui/                   buttons, cards, typography, theme tokens
      store/                zustand stores + MMKV persistence
    assets/countries/...    bundled packs (generated; do not hand-edit)
  pipeline/                 Python 3.12 data pipeline
    countries/*.yaml        per-country config
    steps/                  download, clip, project, quadtree, hexbin, outlines, hints, stats, validate, pack
    out/                    generated packs + contact sheets
  content/                  schedule.json generator, insight copy
  docs/                     this plan, design notes
```

### 5.5 Pipeline tooling
Python: `rasterio`, `geopandas`, `shapely 2`, `pyproj`, `numpy`, `mapshaper` (CLI via npm, for topology-preserving outline simplification), `Pillow`/`pyvips` for hint images. It runs locally on Windows (conda or uv recommended for GDAL), or in GitHub Actions.

Raw downloads: GHS-POP 2025 at 30″ is a few hundred MB; at 3″ it's tens of GB, so use 3″ tiles only for small countries. Keep raw data out of git.

### 5.6 Content delivery
- Cloudflare R2 + a custom domain (`cdn.geochop.app`) for `schedule.json`, `manifest.json` (pack versions/hashes) and downloadable country packs.
- The app checks the manifest at launch (with an ETag), downloads changed packs in the background and verifies hashes.
- **Offline first:** the bundled schedule (90 days) and top-60 packs mean the daily always works without network.

### 5.7 Backend (v1.1, small)
For "you beat X% of players" and global average splits per country:
- Cloudflare Worker + D1 (SQLite). Anonymous install ID; `POST /result {day, round, error, hintLevel}`; `GET /day/:n/stats` returns a histogram.
- No accounts and no personal data. This keeps privacy labels simple.
- Leaderboards via **Game Center** / **Google Play Games** (optional; evaluate library maintenance status first).

### 5.8 Performance budget
- 60 fps while dragging the line, on an iPhone 11 / mid-range Android (e.g., Galaxy A15).
- Chop computation under 5 ms. Reveal animation with ≤ 3,000 prisms (use LOD: merge hexes for big countries on low-end devices).
- Country pack load under 50 ms from disk. App binary under 60 MB.

---

## 6. Monetisation & business

### 6.1 Model (recommended)
- **Free:** the Daily Chop forever, streaks and stats, Practice on a rotating set of 30 countries.
- **GEO CHOP+ (one-time ~$3.99):** all countries in Practice, the full Archive, Target/Three-Way/Then & Now modes, extra themes (Blueprint, Night, Retro Atlas), and app-icon variants.
- **No ads at launch.** That means better reviews, no iOS ATT prompt, simpler privacy forms and a premium feel. Revisit optional rewarded ads only if conversion is poor.
- Later: a subscription only if live content (weekly packs, subnational sets) justifies it.

### 6.2 Accounts & costs
| Item | Cost |
|---|---|
| Apple Developer Program | $99/year |
| Google Play Console | $25 one-time |
| Expo EAS | Free tier to start; ~$19/mo if build queues get slow |
| Domain `geochop.app` (check availability) | ~$15/yr |
| Cloudflare R2/Workers | ~free at this scale |
| RevenueCat | free under $2.5k/mo revenue |
| Sounds/fonts | free (CC0/OFL) or ~$100–300 for a custom SFX pack |

### 6.3 Store compliance checklist
- [ ] **Google Play, new personal developer accounts:** a closed test with **12+ testers for 14 consecutive days** is required before production access. **Start this early**, around milestone M3.
- [ ] Privacy policy URL (hosted on geochop.app), App Privacy labels (iOS), Data Safety form (Play).
- [ ] Age rating: 4+ / Everyone.
- [ ] In-app Credits with CC BY attributions (GHSL, WorldPop if used, GeoNames, UN WPP) and Natural Earth/NASA acknowledgements.
- [ ] Map disclaimer (§4.4).
- [ ] Name check: no "GEO CHOP" app was found in a quick search. "GeoChopper: Learn Geography" exists but is a different game, so the overlap is in the name only and the risk is low. Do a proper **USPTO/EUIPO trademark search** and reserve the name in App Store Connect and Play Console early.
- [ ] Accessibility labels; support for iPhone SE size up to Pro Max; Android gesture navigation insets.

---

## 7. Milestones (solo dev, roughly 8–10 weeks to launch)

| # | Milestone | Deliverables | Est. |
|---|---|---|---|
| **M0** | Data spike | Pipeline for **5 countries** (Japan, Egypt, Canada, Australia, Chile): projection, quadtree points, validation test, contact sheet. *Proves the data approach.* | 1 wk |
| **M1** | Playable core | Expo app; load a pack; draw/adjust line; CHOP; compute and show %. Ugly but correct. Running on your phone via an EAS dev build. | 1.5 wk |
| **M2** | Juice | Slab look, chop FX, piece separation, tilt + hex column reveal, counters, sounds, haptics. *This is where it becomes a game.* | 2 wk |
| **M3** | Daily loop | Schedule, 5-round flow, scoring, summary, share text, streaks/stats (MMKV), onboarding. **Start Play closed test + TestFlight.** | 1.5 wk |
| **M4** | Content scale-up | Pipeline for ~160 countries, curation configs, difficulty tiers, insight facts, hint layers, Practice/Atlas screens. | 1.5 wk |
| **M5** | Ship prep | GEO CHOP+ IAP, settings/credits/privacy, icon/screenshots/video, performance pass on low-end Android, crash reporting. Submit. | 1 wk |
| **Post** | Live ops | Backend percentiles, Target/Three-Way modes, Then & Now, leaderboards, subnational packs, localisation (ES, PT, FR, DE, JA). | ongoing |

---

## 8. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Data error makes a puzzle "wrong" | Bad reviews | Automated validation, contact-sheet review, CDN-hotfixable schedule & packs |
| Border disputes | Store/market issues | De facto worldview, disclaimer, sensitive countries kept out of Daily |
| Line drawing feels fiddly on small phones | Churn | Loupe, fine-drag, pinch-zoom, playtest on iPhone SE early (M1) |
| Projection confusion ("my line looked centred!") | Perceived unfairness | Equal-area projection, consistent screen-space math, clear "perfect chop" reveal |
| Too easy/hard | Retention | Data-driven difficulty D, tuned from real error analytics |
| Play 14-day testing gate | Launch delay | Recruit 12+ testers (friends, Reddit r/geography/r/AndroidClosedTesting) by M3 |
| App size bloat | Install drop-off | Bundle top 60; on-demand packs; WebP hints |
| Looking like a clone | Reputation/legal | Own name, art, copy, scoring, and unique features (hint ladder, Then & Now, 3D reveal) |

---

## 9. Open questions for you
1. **Monetisation:** is a one-time unlock OK, or do you want ads, or fully free?
2. **iPad:** phone-only at launch (simpler screenshots and layouts), or iPad too?
3. **Rounds per day:** 5 (recommended) or 4?
4. **Country names in share text:** reveal them, or keep them hidden until the next day?
5. **Do you have a Mac or iPhone for testing?** Not required, but it affects how we test iOS (TestFlight vs. local dev build). *Stack is settled: Expo + EAS; no Xcode.*
6. **Developer accounts:** personal or organisation? Organisation Play accounts skip the 12-tester rule but need a D-U-N-S number.

---

## 10. Immediate next steps

**Done (2026-11-03):** Expo app scaffolded. A playable chop round works on 5 countries using *placeholder* population from `pipeline/proto/make-proto.mjs`.

**TODO**
- [ ] **You:** test the prototype on your phone in Expo Go and report how drawing the line feels.
- [ ] **Replace the placeholder population with real GHSL data (M0):**
  - [ ] Set up the Python pipeline in `pipeline/` (rasterio, geopandas, shapely, pyproj).
  - [ ] Download GHS-POP 2025 at 30″ (~1 km). Natural Earth borders are already downloaded.
  - [ ] Per country: clip, project to LAEA, sum population into the grid, quadtree-compress to ≤ 20k points.
  - [ ] Validate: 2,000 random lines per country, max error < 0.15 pp against full resolution.
  - [ ] Export packs in the existing app format (`mobile/src/data/countries/*.json`) so the app needs no changes. Set `placeholder: false`.
  - [ ] Check national totals against UN WPP 2024.
- [ ] Visual polish (M2): tilt plus 3D hex columns, rolling counters, sounds, Bricolage font.
- [ ] Confirm the open questions in §9.
- [ ] Reserve the name in both stores, plus the domain and social handles.
