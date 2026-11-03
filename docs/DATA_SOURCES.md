# GEO CHOP: data sources & credits

Everything in the game packs comes from open data. CC BY sources **must be credited in the app** (Settings → Credits) and in the store listing's description or support page.

| Layer | Dataset | Licence | Credit line |
|---|---|---|---|
| Population (countries, world) | GHS-POP R2023A, epoch 2025, 30″ (~1 km) | CC BY 4.0 | Schiavina M., Freire S., Carioli A., MacManus K. (2023): GHS-POP R2023A, European Commission JRC. doi:10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE |
| Population (small islands) | GHS-POP R2023A, epoch 2025, 3″ (~100 m) tiles | CC BY 4.0 | as above |
| GDP (Economy mode) | Kummu et al. 2025, *Downscaled gridded global dataset for GDP per capita PPP 1990–2024*, v4, total GDP 2024, 30″ | CC BY 4.0 | Kummu M. et al. (2025), Scientific Data 12:178, doi:10.1038/s41597-025-04487-x; data doi:10.5281/zenodo.18429133 |
| Billionaires | Wikidata: living people with net worth ≥ US$1B and a residence with coordinates. City-level counts only, no names. | CC0 | "Billionaire locations: Wikidata (approximate)" |
| Borders | Natural Earth Admin-0, 1:50m and 1:10m | Public domain | "Made with Natural Earth" |
| City names (hints) | Natural Earth populated places | Public domain | as above |

## How the packs are made
`pipeline/real/build_packs.py` does the following:
1. Clips each grid to the playable polygons.
2. Projects it with a country-centred equal-area projection (Equal Earth for the World).
3. Compresses the grid cells to 5–10k weighted points with a greedy quadtree.
4. **Validates** each pack: 300 random cuts compared against the full-resolution grid. The worst-case error must be ≤ 0.3 percentage points. Results are in `pipeline/reports/validation.json`.

Raw downloads (≈2.5 GB) live in `pipeline/raw/` and are not in Git. Re-download them from the DOIs above.

## Known limitations
- GHSL is a *model* of where people live, built from satellite-detected buildings plus census data. National totals can differ from UN figures by a few percent.
- Wikidata covers only about 420 billionaires with a known home city, about 270 of them in the USA. That's why Billionaires is US-only for now.
- Borders follow Natural Earth's de facto view. See docs/PLAN.md §4.4 for how disputed areas are handled.
