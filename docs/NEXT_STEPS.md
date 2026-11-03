# GEO CHOP: Next steps (Phase 2)

Written 2026-11-03. **iOS first**; Android follows from the same codebase. This file complements [PLAN.md](PLAN.md).

## 0. Order of work

| # | Item | Status |
|---|---|---|
| 1 | **Main menu** + navigation between modes | building now |
| 2 | **More content (placeholder data):** ~25 countries, an Islands pack, a World chop, and the Daily Chop (5 a day) | building now |
| 3 | **Local player data:** results, streaks, best per country (on device) | building now |
| 4 | **Accurate datasets:** GHSL population pipeline replacing the placeholders | next |
| 5 | **Friends leaderboard backend** (Supabase "Friend Leagues"), §3 | ⏸ backburner (2026-11-03): single-player first |
| 6 | **Freehand cutting** mode | building now |
| 7 | **Economy mode:** split by GDP | later |
| 8 | **Billionaires mode** | later |
| 9 | Game Center (achievements, global board) | optional, v1.1 |

---

## 1. Where the datasets live

| Kind | Size | Where | In git? |
|---|---|---|---|
| **Raw downloads** (GHSL rasters, GDP grids, Natural Earth, Wikidata dumps) | GBs | `pipeline/raw/` locally, plus a backup in a **private Cloudflare R2 bucket** (`geochop-raw`) | ❌ (gitignored) |
| **Source manifest** (URL, version, licence, SHA-256 for each raw file) | KB | `pipeline/sources.yaml` | ✅ |
| **Pipeline code** | KB | `pipeline/` | ✅ |
| **Baked game packs** (per-country points, hexes, outlines) | ~100 KB each | **Public R2 CDN**, versioned: `cdn.geochop.app/packs/v{N}/{ISO}.bin` plus `manifest.json` | ❌ (build output) |
| **Bundled offline set** (today's daily pool plus a starter set) | ~5–15 MB | Inside the app (`mobile/assets/packs/`) | ✅ (small) |
| **Daily schedule** | KB | CDN `schedule.json` (hot-fixable), plus a bundled fallback | ✅ generator |

Principles:
- **Reproducible:** anyone can rebuild every pack from `sources.yaml` plus the pipeline.
- **Never edit packs by hand.**
- **Map/population data is never stored in the player database.** The backend only holds player data.
- R2 has **no egress fees**, which matters for downloads. Supabase Storage would charge for bandwidth.

## 2. Player data

### On the device (works offline, no account)
`expo-sqlite` key-value storage, which works in Expo Go. Swap to MMKV with the dev build if needed.
- `settings`: sound, haptics, reduce motion.
- `daily:{puzzleNo}`: the 5 round results (line, % split, error, score, hints).
- `stats`: current/best streak, games played, score histogram.
- `best:{ISO}`: best error per country, for the Atlas stamps.

### In the cloud (only once the player joins a Friend League)
Supabase Postgres, with Row-Level Security so players only see people who share a league with them.

```
profiles       (id uuid pk = auth.uid, display_name, avatar_emoji, created_at)
daily_results  (user_id, puzzle_no, round, iso, line jsonb, error, score, hints, created_at)
               unique (user_id, puzzle_no, round)
leagues        (id, name, invite_code unique, owner_id, created_at)
league_members (league_id, user_id, joined_at)  pk (league_id, user_id)
blocks         (blocker_id, blocked_id)
reports        (reporter_id, reported_id, reason, created_at)
```
Views: `league_daily(league_id, puzzle_no)`, `league_weekly`, `league_all_time`.

**Anti-cheat:** the app submits the **line**, not the score. A Supabase Edge Function recomputes the score from its own copy of the country pack, then writes the row.

---

## 3. Friends-only leaderboard on iOS: options

| | **A. Game Center friends** | **B. Our own "Friend Leagues" (Supabase)** ⭐ |
|---|---|---|
| How friends connect | Must already be Game Center friends, and each must grant the friends-list prompt | Share an **invite link** in iMessage/WhatsApp. Tap it to join. |
| Backend | None (Apple hosts it) | Supabase (free tier → ~$25/mo at scale) |
| Works in Expo Go now | ❌ needs a custom native module and a dev build | ✅ |
| Android later | ❌ (separate Play Games system) | ✅ same code |
| UI | Apple's sheets, or raw entries | Fully ours, in GEO CHOP style |
| Daily, weekly, all-time boards | Recurring leaderboards ✅ | ✅ any we like |
| Effort | Medium (Swift module + config plugin + portal setup) | Medium (schema + RLS + 2–3 edge functions) |

**Recommendation: B for launch, add A later** for achievements and a global board. Many players don't use Game Center friends, while an invite link in a group chat is how daily games spread. Game Center details for later: `GKLocalPlayer.loadFriends()` with `NSGKFriendListUsageDescription` in Info.plist, and `GKLeaderboard.loadEntries(for:timeScope:)` for friend entries. Expo has no official module, so we'd write a small local Expo module; [community example](https://dev.to/marioprieta/how-to-add-apple-game-center-leaderboards-to-an-expo-app-hpj). Enable the capability on the App ID in the Apple Developer portal.

### What iOS / App Store review needs for option B
- **Sign-in:** start with **Supabase anonymous auth**, so there's no sign-up screen. Offer **Sign in with Apple** later to keep the same account on a new phone. Use native `expo-apple-authentication` plus `signInWithIdToken`. Sign in with Apple must be offered if we ever add Google or other social logins (Guideline 4.8).
- **Account deletion in the app** (Guideline 5.1.1(v)): a "Delete my account & data" button that calls an edge function.
- **User-generated content** (Guideline 1.2): display names and league names need a profanity filter, **report** and **block** options, and a contact address.
- **Privacy:** App Privacy labels (User ID, Gameplay Content, linked to the user, not used for tracking). Privacy policy URL. **No ATT prompt**, because we don't track.
- **Universal links** for invites (`https://geochop.app/join/ABC123`), with an `apple-app-site-association` file on geochop.app and `associatedDomains` in app.json. The `geochop://join/ABC123` scheme works for dev testing.
- **Push notifications (optional):** "Sam beat your score" or "today's puzzle is live", via APNs and expo-notifications. Needs the Apple Developer account ($99/yr).
- **Required anyway:** Apple Developer Program membership for TestFlight and the App Store.

### League UX
1. Home → **Friends** → "Create a league" (name) → share sheet with the invite link.
2. A friend taps the link → app opens → picks a display name and emoji → joins.
3. After finishing the daily, scores upload. The league board shows today, this week and all time, plus **who hasn't played yet** (a nudge).
4. Up to 50 members per league; a player can be in several leagues.

---

## 4. Content roadmap

| Mode | What | Data | Notes |
|---|---|---|---|
| **Daily Chop** | 5 countries a day, the same for everyone, by local date | country packs | Puzzle #1 = 2026-11-03. One chop per round, then a share text. |
| **Countries** | Practice any country | country packs | Atlas stamps from best scores |
| **World** | One line that splits *humanity* in half | world pack (Equal Earth projection) | A great "boss" puzzle |
| **Islands** | Small island nations | Natural Earth 10m borders + GHSL 100 m grid | Tiny areas need the fine grid |
| **Freehand** | Draw a curve instead of a straight line | same packs | The stroke must start and end off the land. Side A = the region left of the stroke (polygon test). Later: a "Lasso" variant, i.e. circle exactly 10%. |
| **Economy** | Split a country's **GDP** in half | **Kummu et al. 2025** gridded GDP (PPP), 30″ (≈1 km), epoch 2020, **CC BY 4.0** | Gold columns. A "people vs money" comparison card. |
| **Billionaires** | Split a country's **billionaires** in half | **Wikidata** (CC0): people with net worth ≥ $1B and a residence city | **City level only** (never home addresses). Forbes data is copyrighted, so we don't use it. Coverage is incomplete, so label it "approximate". |

---

## 5. App structure after this step
```
src/app/index.tsx        Main menu
src/app/play.tsx         Plays a mode: daily | country | world | islands
src/app/browse.tsx       Pick a country or island
src/game/daily.ts        Puzzle number + deterministic daily selection
src/store/progress.ts    Local player data (expo-sqlite kv-store)
src/data/registry.ts     Generated: lazy loaders for every pack
```

## 6. Decisions needed from you
1. **Friends leaderboard:** approve **B (Supabase Friend Leagues)** for launch, with Game Center later?
2. ~~Apple Developer account~~: applied, awaiting approval (2026-11-03).
3. **Domain: not needed yet.** Use free hosting (GitHub Pages or Cloudflare Pages) for the privacy policy, support page and invite links. Universal links work on any HTTPS host where we control `/.well-known/apple-app-site-association`. A custom domain is optional polish before launch. Switching domains later requires an app update, and old invite links stop working.
