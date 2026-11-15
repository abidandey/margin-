# MARGIN — Lunar Ice Explorer

**Design. Fly. Fail. Learn.**

**[Play MARGIN](https://abidandey.github.io/margin-/)** · [View source code](https://github.com/abidandey/margin-)

**NASA Space Apps Challenge 2026 · Space Mission Design Game**

**Team MARGIN:** Abidan Dey and Rajvi Nimavat

## The idea

Spacecraft engineers work with *margins*: the mass, power, propulsion capability, budget, and operational flexibility left after a design meets its basic requirements. A spacecraft can look excellent on paper yet struggle when a mission encounters the unexpected.

**MARGIN** is a browser-based educational spacecraft-design game that lets players experience those trade-offs. Design an orbiter to investigate possible water ice near the Moon's south pole, choose a launch date, respond to mission events, and examine a Failure Review Board that connects outcomes to earlier choices. Then redesign the spacecraft and rerun the **same scenario seed** to see what changed.

The goal is not to predict a real mission's success. It is to make systems engineering and scientific uncertainty understandable through experimentation.

## Play

**Live game:** https://abidandey.github.io/margin-/

No account or installation is required to play the published browser version. The app uses locally bundled NASA reference data and assets rather than requesting them during gameplay.

## How the game works

| Stage | Player experience |
| --- | --- |
| **1 · Brief** | Investigate possible water ice at the lunar south pole. Bonus goals include crater-rim terrain mapping and returning more science data. |
| **2 · Build** | Select **one or two** science instruments plus a power generator, optional battery storage, propulsion, and communications systems. Watch mass, power, and cost update against hard limits. Inspect the illustrative spacecraft in an interactive 3D view. |
| **3 · Launch** | Compare three dates using **cached NASA/JPL Horizons Earth–Moon distance and light-time**. Propulsion penalties are separately labeled as illustrative game assumptions. |
| **4 · Fly** | Run a compressed **75-second**, five-phase mission with four seeded events. Make engineering decisions with competing advice from a scientist, systems engineer, and finance lead. |
| **5 · Review** | Examine science, reliability, budget, and margins; inspect an event timeline, subsystem effects, and explanations of why the mission succeeded or failed. |
| **6 · Redesign** | Change the spacecraft and fly the **same seeded events**. Compare the outcomes to identify which decisions mattered. |

### What makes MARGIN different

- **Trade-offs, not a perfect part:** Additional science capability consumes mass, power, and budget.
- **Consequences with causes:** Orbital insertion, eclipses, communications, and observation opportunities interact with the spacecraft design.
- **Repeatable experiments:** Same-seed reruns distinguish design changes from changes in the event scenario.
- **Evidence, not instant discovery:** Neutron, thermal, ultraviolet, radar, and mapping observations provide different kinds of evidence. A single signal does not automatically prove extractable water ice.
- **Inspectable systems:** An interactive Three.js spacecraft model links selected components to subsystem information; a 2D schematic is available as a fallback.
- **Mission-control feedback:** Numerical telemetry, event responses, a history chart, visual subsystem indicators, and optional synthesized interface audio support the simulation.

## What comes from NASA — and what does not

MARGIN intentionally separates **real NASA reference information** from **illustrative gameplay values**.

| Source | Use in MARGIN | Important limitation |
| --- | --- | --- |
| [NASA Lunar Reconnaissance Orbiter — Spacecraft & Instruments](https://science.nasa.gov/mission/lro/spacecraft-and-instruments/) | Names and measurement roles of seven real LRO instruments: LOLA, LAMP, LEND, Diviner, LROC, Mini-RF, and CRaTER. | The game's component mass, electrical demand, and price figures **are not NASA instrument specifications**. |
| [NASA Moon Water and Ices](https://science.nasa.gov/moon/moon-water-and-ices/) | Scientific context for lunar water investigations and the need to distinguish different observations. | An elevated hydrogen signal alone does not prove a usable ice deposit. |
| [NASA/JPL Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html) | Cached Earth-center–Moon-center distances and one-way down-leg light-times for the selectable 2027 launch dates. | Center-to-center geometry is **not** a spacecraft trajectory solution. Distance alone does **not** determine an optimal launch window or fuel consumption. |
| [NASA Scientific Visualization Studio — Moon 3D Models for Web](https://svs.gsfc.nasa.gov/14959/) | Locally bundled Moon model based on Lunar Reconnaissance Orbiter observations. | Spacecraft orbit placement, camera framing, event visuals, and target markers are schematic. |

The lunar science references are stored in `src/data/margin-lunar-science.json`, with source URLs available alongside instrument information in the game.

### Cached Horizons data

The data-fetch script `scripts/fetchHorizons.mjs` requests observer ephemerides for the Moon relative to Earth's center (2027-01-08 through 2027-02-06). It stores the response in `src/data/horizons2027.json`, including the query, retrieval time, units, and source.

The game offers these three dates:

| Launch date | Earth–Moon center distance | One-way light-time |
| --- | ---: | ---: |
| 8 January 2027 | 406,469 km | 1.356 s |
| 22 January 2027 | 357,296 km | 1.192 s |
| 5 February 2027 | 405,354 km | 1.352 s |

These are rounded from the cached Horizons observations. **Launch-date propulsion penalties remain illustrative game-design parameters, not Horizons-derived transfer calculations.** The script is a development tool; the deployed game reads cached JSON without an API call.

### 3D assets and visual attribution

- **Moon:** NASA Goddard Space Flight Center, Scientific Visualization Studio, [*Moon 3D Models for Web*](https://svs.gsfc.nasa.gov/14959/). The project bundles an optimized Moon model; the texture has been recompressed for browser performance.
- **Spacecraft:** An **original, illustrative 3D orbiter** assembled in code. It is not an authentic model of an operational NASA spacecraft, and its hardware dimensions are not presented as flight-qualified.
- **Orbital paths, Earth positioning, spacecraft motion, and target overlays:** Simplified visualizations created for gameplay, not reconstructed ephemeris trajectories.
- **Sound effects:** Short sounds synthesized programmatically with the Web Audio API, rather than externally licensed music.

NASA names, science references, and media are acknowledged for their respective roles; this project is **not affiliated with or endorsed by NASA**. Consult the linked source pages for their content and usage notices.

## Engineering model and limitations

MARGIN is deliberately simplified to keep complex engineering decisions playable:

- The design lab enforces an **illustrative 150 kg spacecraft mass limit** and **$2.4 million budget limit**, alongside a power limit determined by the selected system.
- Component statistics, thrust reserves, eclipse duration, battery capacity, communications performance, science scores, hazards, and event thresholds are **illustrative values**, not verified flight hardware data.
- The compressed mission includes a lunar orbit-insertion decision, a shadow/power-management event, a communications decision, and a science opportunity. Eclipse calculations distinguish instantaneous power (W) from stored battery energy (Wh).
- An unsuccessful lunar orbit insertion prevents the spacecraft from completing normal lunar orbital science. Scientific evidence remains uncertain, even when multiple complementary instruments contribute.
- Simulation timing, planetary geometry, spacecraft motion, and scoring are educational abstractions, **not a high-fidelity orbital dynamics simulation**.

See `SIMULATION_ASSUMPTIONS` in `src/missionSimulation.ts` for the detailed rules.

## Run locally

**Requirements:** Node.js and npm.

```bash
git clone https://github.com/abidandey/margin-.git
cd margin-
npm install
npm run dev
```

Open the local address shown by Vite.

### Verify the project

```bash
npm test
npm run build
npm run lint
```

To regenerate the NASA/JPL Horizons cache (requires internet access at **development** time):

```bash
npm run fetch:horizons
```

The generated site can be previewed with `npm run preview`. GitHub Pages deployment is configured in `.github/workflows/deploy.yml`; pushes to `main` trigger the build and deployment workflow.

## Project structure

| Location | Responsibility |
| --- | --- |
| `src/App.tsx` | Mission brief, spacecraft design, launch-date comparison, and screen navigation |
| `src/missionSimulation.ts` | Seeded scenario, engineering decisions, mission state, scoring, and debrief |
| `src/scienceData.ts`, `src/data/` | NASA instrument references, illustrative science profiles, and cached Horizons observations |
| `src/MissionViews.tsx` | Live mission and review interfaces |
| `src/spacecraftDesign.ts` | Component catalogue and design checks; power generation (W) is separate from battery storage (Wh) and discharge limit (W) |
| `src/ReviewBoard.tsx` | Selectable event timeline and cause-and-effect review |
| `src/TelemetryHistory.tsx` | Health, science, and battery telemetry over mission time |
| `src/Lunar3DExperience.tsx`, `src/Lunar3DPanel.tsx` | Lazily loaded 3D Moon and interactive spacecraft visualization |
| `src/MissionVisuals.tsx` | Schematic mission and spacecraft visuals, including fallback presentation |
| `src/missionAudio.ts` | Programmatically synthesized interface sounds |
| `scripts/fetchHorizons.mjs` | Horizons retrieval and cache generation |
| `tests/` | Automated regression and data-integrity tests |

**Technology:** React, TypeScript, Vite, Three.js, React Three Fiber, and Drei. The project is a single-page, static-site application with no backend.

## Accessibility and offline use

The game presents numerical values alongside resource gauges, uses text labels as well as color for statuses, pauses to allow unhurried event decisions, and includes keyboard-accessible interface controls. Motion preferences are respected; optional audio can be controlled by the player. Where 3D rendering is unavailable, the project provides a schematic fallback. The published application bundles its data and 3D resources for gameplay without relying on live NASA API requests.

## Team and AI-assistance disclosure

**Team MARGIN**
- **Abidan Dey**
- **Rajvi Nimavat**

This project was developed with AI-assisted research, planning, writing, and coding. Human team members selected the concept and made the game-design and submission decisions.

- **GitHub Copilot:** Iterative assistance with React/TypeScript implementation, the simulation, UI, integration, and automated testing.
- **Claude (Anthropic):** Assistance with Failure Review Board and telemetry visualizations, 3D presentation changes, GitHub Pages deployment configuration, the power-architecture module and its regression tests, and an earlier README draft.
- **ChatGPT (OpenAI):** Concept refinement, NASA research interpretation, testing and debugging guidance, review of simulation logic, and README documentation.

These disclosures describe assistance, not authorship of NASA data. Refer to the project source and revision history for implementation details.

---

*Built for the NASA Space Apps Challenge 2026 — to show that every engineering margin matters.*
