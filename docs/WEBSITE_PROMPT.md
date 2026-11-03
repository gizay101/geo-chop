I need you to add a small section to my existing website (KY Software, [DOMAIN — e.g. kysoftware.com]) for my new iPhone game, **GEO CHOP**. These pages are what Apple's App Store requires before the app can be published. Please match the existing site's style and tech, and keep the pages fast, mobile-friendly, public (no login), served over HTTPS, and free of cookie banners or trackers.

## Pages to create

| URL | Purpose | Used in App Store Connect as |
|---|---|---|
| `/geochop` | Landing page | Marketing URL (optional) |
| `/geochop/privacy` | Privacy policy | **Privacy Policy URL (required)** |
| `/geochop/support` | How to play, FAQ, contact | **Support URL (required)** |
| `/geochop/credits` | Data attributions (required by the data licences) | linked from the app's Credits screen |

Give each page a clear title, a "last updated" date on the privacy page, and simple navigation between the four pages and back to the main KY Software site.

## About the app (use these facts; don't invent features or prices)

- **Name:** GEO CHOP. **Tagline:** "Measure twice, chop once."
- **What it is:** a geography puzzle. You draw one freehand cut through a country with your finger to split its population as close to 50/50 as possible. The map splits in two, tilts into 3D, and population columns rise to show where people actually live.
- **Rules:** one stroke per cut, starting and ending off the land, with limited "ink". Score is out of 100: you lose 4 points for every 1% you're off.
- **Modes:**
  - **Daily Chop:** 5 countries a day, the same for everyone, with a shareable result.
  - **Countries:** 192 countries grouped by continent, in packs of 4 from easy to hard.
  - **Islands:** small island nations.
  - **The World:** split humanity in half.
  - **Economy:** split a country's GDP instead of its people.
  - **Billionaires:** split the USA's billionaires.
- **Platform:** iPhone first; Android later. Free to download. **Do not mention prices or in-app purchases.**
- **Age rating:** suitable for everyone (4+).

## Privacy facts (the privacy policy must match these exactly)

- No account, no sign-in, no personal information requested.
- No ads, no analytics, no tracking, no third-party SDKs that collect data. No data is sold or shared.
- All game progress (scores, streaks, best results) is stored **only on the player's device**. Nothing is sent to any server. Deleting the app deletes this data.
- The optional "Share result" button opens the iPhone share sheet with a short text, such as `GEO CHOP #12 🔪 412.3/500`. It's sent only where the player chooses.
- The app uses sound and vibration only; it doesn't access location, contacts, photos, camera or microphone.
- Not directed at children specifically, but collects no data from anyone, children included.
- Include a contact address for privacy questions: **[SUPPORT EMAIL]**. Use this placeholder; I'll fill it in.
- Add a "Changes to this policy" section, because future versions may add optional online features (for example private friend leaderboards). Say the policy will be updated before any such feature launches.
- In App Store Connect this corresponds to **"Data Not Collected"**, so the policy must not contradict that.
- If the KY Software website itself uses analytics or cookies, add one short paragraph making clear that this applies to the website and not the app.

## Support page content

- **Contact:** [SUPPORT EMAIL], with a request to include the iPhone model and iOS version for bug reports.
- **How to play:** 4–5 short steps.
- **Scoring:** 100 − 4 points per percentage point off, never below 0. Grades run from "Surgical" (within 0.5%) to "Butchered".
- **FAQ**, at least:
  - Why doesn't my cut count? It must start and end off the land, cross it in one stroke, and stay within the ink limit.
  - When does the Daily change? At local midnight.
  - Is my progress saved / can I move it to a new phone? It's saved on this device only; transferring isn't supported yet.
  - How accurate is the population data? It's modelled from satellite and census data, very close but not exact; national totals can differ from official figures by a few percent.
  - Why are some countries' borders the way they are? Borders are simplified for gameplay and don't imply any political position.
  - Which countries are included? The UN member states.

## Credits page content (required: keep the wording and licence names)

- **Population:** GHS-POP R2023A, epoch 2025 — Schiavina M., Freire S., Carioli A., MacManus K. (2023), European Commission, Joint Research Centre. doi:10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE. Licensed under CC BY 4.0.
- **Economy (GDP):** Kummu M. et al. (2025), *Downscaled gridded global dataset for GDP per capita PPP over 1990–2024*, Scientific Data 12:178, doi:10.1038/s41597-025-04487-x; data doi:10.5281/zenodo.18429133. Licensed under CC BY 4.0.
- **Billionaire locations:** Wikidata (CC0), city-level and approximate.
- **Maps and city names:** Made with Natural Earth (public domain).
- **Sounds:** original, made for GEO CHOP.
- **Note:** "Data has been re-projected and aggregated for gameplay. Boundaries are simplified and do not imply any official position."
- Link each licence: https://creativecommons.org/licenses/by/4.0/ and https://creativecommons.org/publicdomain/zero/1.0/

## Landing page content

- Hero: name, tagline, and a one-sentence pitch ("Shapes lie. Most people live in a tiny part of their country. Can you cut it in half?").
- 3–4 feature blurbs from the modes above.
- A placeholder for an "Download on the App Store" badge, with the link left as `#` and marked TODO. Use Apple's official badge artwork and guidelines when the link exists.
- Placeholders for 3 phone screenshots (I'll supply them).
- Footer links to Privacy, Support and Credits, plus "© [YEAR] KY Software".
- Brand colours for accents, if they fit the site:
  - near-black background `#0C0F15`
  - orange `#FF7A3D`
  - teal `#2EC4B6`
  - sand `#E9DCC4`
  - gold `#FFCB52`

## Please also

1. Keep every placeholder in square brackets ([DOMAIN], [SUPPORT EMAIL], [YEAR]) and list them at the end so I can fill them in.
2. Tell me the four final URLs to paste into App Store Connect.
3. Don't add terms of service; Apple's standard licence agreement (EULA) applies. Mention it in one line on the support page with a link to https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
4. Don't create any `/.well-known/apple-app-site-association` file yet. That will be needed later if invite links are added, and I'll ask for it then.
