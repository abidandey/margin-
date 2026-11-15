# MARGIN — Lunar Ice Explorer

**Design a lunar orbiter, fly it, and find out what your margins were worth.**

A browser game for the NASA Space Apps Challenge 2026, challenge *Space Mission Design Game*. You choose real Lunar Reconnaissance Orbiter science instruments, a power system, propulsion and communications, then pick a launch window and fly a compressed mission to investigate possible water ice at the Moon's south pole. Every choice spends mass, power or budget, and the mission review shows which decisions cost you and why.

> Replace this line with your team name, team members and the link to the live game.

## Play it

- **Online:** open the live link above.
- **On your computer:**

  ```bash
  npm install
  npm run dev
  ```

  Then open the address the terminal prints.

## What the player does

| Stage | In the game |
|---|---|
| Briefing | The mission goal: investigate potential water ice at the lunar south pole |
| Spacecraft design | Pick one or two science instruments, power, propulsion and communications within mass, power and budget limits. An interactive 3D model highlights each part. |
| Launch window | Choose a launch date using cached Earth–Moon geometry from NASA/JPL Horizons |
| Live mission | A 75-second mission with four seeded events. Each pauses the clock and asks for a decision, with competing advice from three roles. A telemetry history chart records health, science and battery. |
| Failure Review Board | A clickable mission timeline. Each event shows the spacecraft system it hit, what it cost and why. Fly the same seed again after a redesign to compare before and after. |

## How NASA data is used

| Source | How the game uses it |
|---|---|
| [NASA Lunar Reconnaissance Orbiter: spacecraft and instruments](https://science.nasa.gov/mission/lro/spacecraft-and-instruments/) and the LRO fact sheets linked in the game | Identity and measurement purpose of the seven selectable instruments (LOLA, LAMP, LEND, Diviner, LROC, Mini-RF, CRaTER), and the rule that separate kinds of evidence must be combined before claiming a water-ice candidate |
| [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) | Earth–Moon distance and light-time for the three launch windows. Fetched by `scripts/fetchHorizons.mjs` and cached in `src/data/horizons2027.json` |
| [NASA Scientific Visualization Studio, SVS 14959](https://svs.gsfc.nasa.gov/14959/) | The 3D Moon model, based on LRO data. Its texture was re-compressed to JPEG to shorten loading. |

Per-instrument source links are in `src/data/margin-lunar-science.json` and are shown in the game.

**What is not NASA data:** component mass, power, cost, event severity, scoring thresholds and the spacecraft model are illustrative game values and an original illustrative design. The game labels them as such on every screen. Orbit positions in the 3D view are schematic.

## Code map

| File | What it holds |
|---|---|
| `src/App.tsx` | Briefing, spacecraft builder, launch window and screen flow |
| `src/missionSimulation.ts` | Game rules: seeded events, decisions, telemetry, scoring and debrief |
| `src/MissionViews.tsx` | Live mission and mission review screens |
| `src/ReviewBoard.tsx` | Failure Review Board: clickable timeline and affected-system view |
| `src/TelemetryHistory.tsx` | Telemetry history chart |
| `src/Lunar3DExperience.tsx` | Interactive 3D Moon and spacecraft (three.js via React Three Fiber) |
| `src/MissionVisuals.tsx` | 2D orbit view and spacecraft diagram, also used when WebGL is unavailable |
| `src/scienceData.ts`, `src/data/` | Science dataset and cached Horizons data |
| `tests/` | Simulation and data tests. Run with `npm test`. |

Built with TypeScript, React, Vite, three.js, React Three Fiber and drei.

## Use of AI tools

AI coding assistants were used to write parts of this project's code, which the team then reviewed and tested.

- Claude (Anthropic) generated the Failure Review Board (`src/ReviewBoard.tsx`), the telemetry history chart (`src/TelemetryHistory.tsx`), the studio reflections and camera ease-in in `src/Lunar3DExperience.tsx`, the GitHub Pages deployment setup and the first draft of this README.

> Team: add every other AI tool you used and what it produced (code, text, data files, images), then delete this note. The Space Apps submission form asks for the same information.

No AI-generated images, video or audio are used. The spacecraft is drawn from code and the Moon model is NASA's.

## Publishing

Every push to the `main` branch builds the game and publishes it to GitHub Pages through `.github/workflows/deploy.yml`. One-time setup on GitHub: **Settings → Pages → Source: GitHub Actions**.

## Notice

This is a student project. It is not affiliated with or endorsed by NASA. NASA data and the NASA Moon model are used under NASA's media usage guidelines; no NASA logos or insignia are used.
