# Forever Class Chooser

A static quiz that recommends a **class, spec and race** for *World of Warcraft: Forever*
(Classic+), with links out to Wowhead guides. Hosted on GitHub Pages.

WoW Forever is still in beta, so every game fact lives in `data/` as YAML, with sources
and confidence levels. Update the data and rebuild, and the site regenerates.

## Quick start

```sh
npm install
npm run dev     # build data + serve site/ locally
npm test        # build + persona sanity checks
```

## Layout

| Path | What it is |
|---|---|
| `data/meta.yaml` | Data version, last-reviewed date, game phase. Bump `data_version` when facts change. |
| `data/sources.yaml` | Every source cited, with reliability (`official` / `datamine` / `community`) and access date. |
| `data/vocab.yaml` | Allowed ids: roles, themes, traits (with explanation phrases), content types, racial tags, looks. |
| `data/classes/*.yaml` | Class fantasy, Forever changes, and specs with traits (0–3) and viability (1–5). |
| `data/races/*.yaml` | Races, faction variants (e.g. Skyborne), class availability, new combos, racials. |
| `data/questions.yaml` | Quiz questions. Each answer's `effects` feed the scoring (the format is documented at the top of the file). |
| `scripts/build.mjs` | Validates all ids and cross-references, then writes `site/data.json`. |
| `scripts/personas.mjs` | Checks that sample personas get sensible top picks. |
| `site/` | Vanilla HTML/CSS/JS. `scoring.js` holds the pure ranking logic. |

## Updating data

1. Edit the YAML. Every fact that might change takes `confidence: confirmed | likely | speculative`
   and `sources: [id]` pointing at `data/sources.yaml`.
2. Run `npm test`. The build fails on unknown ids, out-of-range traits, unresolved sources, or
   a class that no race on a faction can play.
3. Bump `data_version` and `last_reviewed` in `data/meta.yaml`.

Viability ratings start from Classic Era balance. They stay marked `speculative` until Forever
content can actually be tested (the beta is currently capped at level 20).

## How scoring works

- **Specs:** role match (+w), theme match (+w), traits `w × (value − 1.5)`, viability
  `w × (rating − 3) / 1.5`. The top 3 specs are shown, one per class.
- **Races:** for the recommended spec, each racial whose tags overlap the spec's `racial_tags`
  adds points (actives count slightly more). Answers add further boosts for PvP, leveling, looks
  and novelty. The faction answer only filters races, because every class exists on both factions.
- Answers are stored in the URL hash, so result links can be shared.

## Deploying

Push to `main`. `.github/workflows/pages.yml` runs `npm test` and publishes `site/`.
In the repo settings, set **Pages → Source** to **GitHub Actions**.

Fan-made; not affiliated with Blizzard Entertainment.
