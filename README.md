# Power Poker (US ISOs)

Map-based screening tool for battery energy storage (BESS) develop-to-sell opportunities across the major US ISOs: **ERCOT, SPP, MISO, PJM, CAISO, NYISO, ISO-NE**. It overlays public substations, transmission lines, and interconnection queues, scores substations for opportunity, and helps you shortlist sites with sizing and cost sketches.

## Quick start

```bash
npm install
npm run data    # download + build static GeoJSON snapshot
npm run dev     # http://localhost:3000
```

Deploy to Vercel after committing `public/data/*` (or run `npm run data` in CI before build).

For parcel outlines, copy [`.env.example`](.env.example) to `.env.local` and set `LANDRECORDS_API_KEY`.

## Data sources

| Layer | Source |
| --- | --- |
| Substations / lines | HIFLD Open (CONUS) |
| ERCOT | ERCOTQueue `projects.json` |
| SPP | OpsPortal GenerateSummaryCSV |
| MISO | `misoenergy.org/api/giqueue/getprojects` |
| PJM | Planning API `ExportToXls` |
| CAISO | PublicQueueReport.xlsx |
| NYISO | NYISO-Interconnection-Queue.xlsx |
| ISO-NE | IRTT public queue HTML |
| Counties | Census 20m GeoJSON (CONUS) |
| Fiber service areas | FCC Broadband Data Collection via Esri Living Atlas (live overlay) |

Non-ISO West / Southeast utility queues are out of scope.

## Scripts

| Command | Description |
| --- | --- |
| `npm run data` | Rebuild HIFLD + all ISO queue snapshot |
| `npm run dev` | Local development |
| `npm run build` | Production build |
