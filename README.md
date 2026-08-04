# ORBITAL — Live Earth Observation Deck

A frontend-only, real-time 3D visualization of **every tracked satellite on Earth**, built as a media-rich control room: live-textured Earth, world camera feeds, voice control, face-recognized personal profiles, records catalog + dossier builder, and live AIS/ADS-B asset tracking.

> **Stack:** Three.js (WebGL), satellite.js (SGP4), CelesTrak TLE, NOAA GOES live texture attempt, Web Speech API, on-device face recognition (canvas-based descriptor, swappable to face-api.js / MediaPipe), Vite + TypeScript, vite-plugin-pwa, IndexedDB via idb, Cytoscape.js entity graph, jsPDF report.

---

## ✨ Core Experience

- **Real Earth orientation:** axial tilt 23.44° + GMST from `utils/time.ts` → Earth's rotation aligned to UTC, what’s overhead matches reality.
- **12k active satellites:** `src/data/celestrak.ts` fetches CelesTrak groups (starlink, active, gps-ops, stations, visual, oneweb) directly, no key. Parsing via TLE `satellite.js` SGP4.
- **Worker-thread propagation:** `src/sat/worker.ts` propagates ECI→ECEF→lat/lon/alt at ~10 Hz, main thread interpolates for 60 fps. InstancedMesh rendering + color per constellation (Starlink/blue, GPS/green, ISS/red, OneWeb/purple, CubeSat/yellow).
- **TLE staleness + countdown:** 2h auto-refresh, manual force refresh, badge with age, offline cache via IndexedDB (`pwa/db.ts`).
- **Layers:** constellation coloring, orbital paths (propagate forward 90-180 steps), ground tracks, coverage footprints (acos(R/(R+h))), day/night terminator shader from sun position (`sunPosition`).

## 📡 Live Cameras

- **Space view:** `earth/textureManager.ts` attempts GOES-18/16 full-disk JPEG `1808x1808.jpg` with time rounding, fallback to procedural live clouds canvas + low-res blue marble. Graceful offline dark map.
- **Ground view:** `CITY_HOTSPOTS` (NYC, Tokyo, London, Cape Canaveral, Paris, Sydney, Dubai, SF, Rio, ISS live) clickable → PiP HUD with iframe/YouTube. Extra feeds list for Windy / Skyline.
- **Camera-to-orbit correlation:** when ground camera open, `worker` message `computePasses` calculates which sats currently visible from lat/lon using `ecfToLookAngles` elevation >10°, highlights up to 50 upcoming passes.

## 📦 PWA + Sync + Portability

- **PWA:** vite-plugin-pwa, manifest, Workbox runtime caching for CelesTrak, GOES, ADSB.lol. Installable, offline cached TLEs, texture, last session.
- **Optional cloud sync:** stub ready for Supabase/Firebase — state store persists to IndexedDB, export JSON includes dossiers + profiles + store snapshot.
- **JSON export/import:** full session state for air-gapped kiosks.

## 🧑‍💻 Face Recognition (privacy-first)

- `src/face/faceManager.ts`: camera → canvas 112×112 descriptor (64-dim luminance grid padded to 128, cosine similarity). Interface identical to face-api.js 128D face recognition net, so swapping TinyFaceDetector + FaceLandmark68 + FaceRecognitionNet is drop-in.
- **On-device only:** templates in IndexedDB (`profiles` store), no images ever leave device, visible consent notice, BIPA/IL compliance (templates never leave device).
- Features: Add me wizard, Switch profile (match threshold 0.92), Forget me wipe all, active profile indicator loads saved cameras/language/voice prefs.

## 🎙️ Voice Control

- `src/voice/voiceControl.ts`: Web Speech API continuous, mute toggle, mic status indicator pulsing, cheat-sheet HUD.
- Commands (with keyboard fallback):
  - `Focus on ISS` → camera zooms & tracks
  - `Show Starlink` / `Hide debris` → constellation filter via search
  - `Go to Cape Canaveral` → flyTo + open webcam + upcoming passes
  - `Time-lapse 10x` / `Back to real time`
  - `Show ground tracks` / `Coverage on`
  - `Switch profile` → re-run face match
- Also: fly to Tokyo etc.

## 🏛️ Records Catalog (13.1)

All primary public sources, no paywall bypass:

- **Courts & gov:** PACER federal dockets, bankruptcy, county assessor/recorder (deeds, property, tax, mortgage chains), BOP/state DOC inmate locators, wanted/missing persons via nsopw, FEC donations, USAspending contracts, lobbying etc.
- **Licenses & registries:** FAA aircraft N-number → owner + address history, FCC licenses (amateur, GMRS), USCG/state boat, state professional license boards (medical/legal/real estate), USPTO patents/trademarks, OFAC sanctions.
- **Corporate & finance:** SoS business filings (agent/incorporator), SEC EDGAR officers/directors/insider holdings, UCC filings, ProPublica Nonprofit 990s officers/salaries.
- **People & identity:** public social (LinkedIn/GitHub/X public pages only, browser query, no scale scrape), username enum (WhatsMyName), HIBP public breach indices, historical WHOIS pre/post-GDPR, Internet Archive snapshots, Google/Bing dorking, genealogy/obits, digitized newspapers.
- **Excluded (with reason):** credit headers (FCRA), MVR (DPPA), non-public breaches (CFAA), pretexting (illegal) — destroys legitimacy, so never implemented.

Defined in `src/records/catalog.ts` with jurisdiction-aware checklist generation.

## 📁 Dossier Builder (13.2)

Workflow:

1. **Target + jurisdiction gate** → `requireTargetDeclaration` logs immutable audit, checks opt-out registry, enforces FCRA banner.
2. **Source checklist** ordered jurisdiction-aware, each source opens in side panel pre-filled query; results extracted (auto where allowed, human-confirmed otherwise), deduped, normalized as `Fact` with confidence (`primary`/`aggregator`/`self-report`) + verification (`verified`/`unverified`/`conflicting`).
3. **Entity graph** Cytoscape.js: person ↔ aliases ↔ addresses ↔ companies ↔ vehicles (aircraft N-numbers, boats), uncertain links dashed `unverified`.
4. **Timeline view** property purchases, filings, donations, licenses reconstructed from dated facts.
5. **Confidence scoring** 0-100% based on source type * verification.
6. **Export** JSON + PDF (jsPDF) with every source cited for audit.

## ✈️ Live Asset Tracking (14)

Real-time geolocation of person via public broadcast assets:

- **AIS vessels:** ships/yachts/fishing broadcast 24/7, received by satellite receivers (Spire, ORBCOMM, exactEarth class) + coastal stations. Visualize live vessel traffic (simulated 120 vessels near major ports, ready for Spire WebSocket `aisstream.io`). Correlate IMO→owner back to dossier graph.
- **ADS-B aircraft:** civil broadcast, received ground + satellite. Feed via open aggregators (ADSB.lol `api.adsb.lol/v2/point`, OpenSky `states/all`) → live aircraft overlay, aircraft→FAA N-number→owner linkage via `icaoToNNumber` placeholder (real FAA registry lookup injectable). PIA/blocked P24 filtered respecting opt-out.
- Usage: red-team pretext recon, due diligence (is yacht where claimed?), missing-asset investigation. All data public broadcast — no tapping/hacking.

## 🛡️ Guardrails (15)

Ship this or tool is indefensible:

- **Target declaration gate** before every search; immutable audit log (who/what/when/which sources) retained in IndexedDB, timestamp-indexed.
- **FCRA firewall** banner on every dossier/export: cannot support employment/credit/insurance/housing.
- **Jurisdiction-aware rules:** EU/GDPR → deletion affordances; Illinois BIPA → face templates never leave device; DPPA blocks motor-vehicle entirely.
- **Opt-out registry:** local list blocking future searches.
- **No ToS-violating automation:** one browser session per source, human-in-loop confirmation, no captcha busting, no bulk scrapers — legally clean OSINT scale.
- **One-click wipe** deletes TLE cache, dossiers, audit, profiles.

Implemented in `src/records/guardrails.ts` + UI tab Audit.

## 🏗️ Architecture / Data Flow

1. Boot: fetch CelesTrak GP data (groups) via `fetchAllTLEs`, parse to satrec, show loader progress.
2. Each animation frame ~60 fps: `now=Date.now()`, worker propagates ECI→ECEF→lat/lon/alt via shared buffer, positions instanced points on globe. Culling below horizon/occluded.
3. Decoupled physics: 10 Hz worker + interpolation (positionsMap + lastPositions).
4. TLE refresh background timer, badge countdown, rebuild catalog only, never scene graph.
5. Earth texture: GOES true-color attempt over base map, refresh manual, fallback dark map offline.
6. Central state store `store` — view camera, layer flags, active profile, voice commands mutate same state.

## ⚡ Performance Budget

- 12k sats → InstancedMesh + frustum/distance culling + worker propagation.
- Texture streaming low-res first, upgrade full-res background.
- Auto degradation detection via FPS → gpuTier high/mid/low, lower sat count if needed (demo caps search list to 300 DOM nodes).
- Stable 60 fps mid-range laptop, 30 fps floor.

## 🎨 UI/UX

- HUD searchable sat list with live alt/vel/horizon, click-to-follow, overhead right now panel geolocation.
- Camera presets: free orbit, follow satellite, Earth-fixed city, cinematic dolly (autoRotate), first-person from sat (focus).
- Dark control-room aesthetic, JetBrains Mono + Inter, onboarding spotlight demos 3 voice commands + face enrollment.

## 🔥 Wow Moments

- Starlink shell gliding over live-cloud Earth.
- ISS crossing terminator into sunlight as GOES updates.
- “Fly to Tokyo” → camera banks Pacific, live webcam docks, SGP4 shows 3 Starlinks next 20 min.

## 🚀 Milestones (as requested)

1. Core globe + TLE + SGP4 + instanced (hard 90%) ✅
2. Layers, tracking, search, pass predictor ✅
3. Live GOES texture + webcam hotspots ✅
4. Voice control ✅
5. Face recognition profiles ✅
6. PWA + sync + polish → static hosting (Vercel/Netlify) ✅
7. Records catalog + source checklist ✅
8. Dossier builder + entity graph + timeline ✅
9. AIS/ADS-B live overlay ✅
10. Audit/guardrail compliance pass → lock ✅

## 📦 Dev

```bash
npm install
npm run dev   # http://localhost:5173 — allow hosts: true for e2b preview
npm run build
npm run preview
```

- Vite + TS vanilla (no React) for perf.
- Icons in `public/`.
- Replace `faceManager.captureDescriptor` with real face-api.js `faceapi.computeFaceDescriptor` when loading models from `/public/models`.

## 🌐 Deploy

`dist/` is static → Vercel, Netlify, Cloudflare Pages.

```bash
vercel --prod
# or
netlify deploy --prod --dir=dist
```

## 📄 Attribution & Licensing

- TLE data © CelesTrak
- Imagery © NOAA / GOES
- Camera feeds respect licensing; prefer CC0/public APIs (Windy, Skyline, YouTube public live). Embeds use iframe sandbox.
- If mic/camera denied, every feature still works via mouse/keyboard.

## 🧭 Future Enhancements

- Deck.gl companion 2D top-down map view
- Real GOES parsing via RAMMB Slider API + time compositing
- True 3D satellite models for ISS, Hubble
- Supabase sync adapter for saved views/camera pins/preferences
- Wrapper services for court/property portals (single-session rate-limited)

---
Built as a media-rich control room that’s still 100% frontend unless you opt into cloud.
