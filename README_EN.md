# BreezeScape · 竹间息

**[简体中文](README.md) · English**

> Wind through bamboo. Sounds arise and pass; thoughts, too.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/demo-online-brightgreen)](https://shadowxx789.github.io/zenscape/)
[![Deploy](https://github.com/shadowxx789/zenscape/actions/workflows/deploy.yml/badge.svg)](https://github.com/shadowxx789/zenscape/actions/workflows/deploy.yml)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Web Audio](https://img.shields.io/badge/Web%20Audio%20API-native-FF6F00)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

## Verse

```text
Where does the wind come from? Where does the water go?
No need to seek the source of sound; each sound ferries itself across.
A bell falls into the empty mountain's silence;
the qin recedes, leaving ten thousand valleys hollow.
If the mind itself is the Pure Land, why ask the road home?
```

---

## What is BreezeScape?

BreezeScape is a generative meditation soundscape PWA. It is neither a playlist nor a white-noise collection. Bamboo leaves, wind, a mountain stream, a distant temple bell, and the occasional guqin note all come from real recordings. But code decides when each sound appears, where it sits, and how loud it becomes. No two sessions unfold in quite the same way.

There is nothing you need to do. Choose a mode, a duration, and a density. Close your eyes.

The sound will take its own path.

**→ [Try it online](https://shadowxx789.github.io/zenscape/)** (phone speakers are enough; headphones are optional)

---

## Choose only three things

| Choice | Options |
|---|---|
| What you need | Meditate · Sleep · Focus |
| How long to stay | 5 · 10 · 20 · 30 minutes, or a custom duration from 1–180 minutes |
| How much sound | Sparse · Balanced · Full |

There are no sliders. The balance was shaped through repeated listening sessions. Fine-grained controls would make it easier to damage that balance, while most small adjustments are barely audible through phone speakers. Density is therefore chosen before a session and left unchanged while it plays.

- **Sparse · Long silences**: The wind rests more often and more deeply, with a few pockets of profound quiet. Guqin appears rarely, usually as single notes.
- **Balanced · Wind and quiet in equal measure**: A short guqin phrase arrives now and then. This is the reference setting refined through repeated auditions.
- **Full · Sound remains present**: The wind softens without stopping, the water barely recedes, and guqin phrases appear more often, usually in groups of two or three notes.

> Sleep and Focus currently derive from the Meditate soundscape. Sleep has sparser guqin and bells; Focus has slightly brighter water. These are inferred adjustments and have not yet been audition-approved.

---

## Sound design

### Code decides only when, where, and how loud

At the start of each session, the engine uses a random seed to write a complete score (`app/src/audio/v2/plan.ts`). It is a pure function, so the same seed reproduces the same score.

- **A breathing bed**: Bamboo and wind move slowly between presence and quiet. When the wind rests, the water recedes too—but never into a vacuum.
- **Deep quiet**: A few 5–8 second pockets of near silence, kept clear of bell and guqin tails.
- **Bell**: Roughly once every three minutes: distant, low, and seemingly from beyond the mountain. The final sound is always a bell, allowed to decay completely.
- **Guqin**: A small pool of notes, mostly played individually. Phrases have memory: a motif may return, invert, shorten, or shift, without repeating the same note consecutively or turning into a melody.
- **No sudden return of wind**: Wind rises at a limited rate. Each gust is normalized to a consistent loudness, and the first gust after a long rest is gentler.

The score must pass a set of gates: bells and guqin must remain audible, deep quiet must be present, and the bed must not jump abruptly. If it fails, the engine derives another seed and tries again, up to 16 times.

### Streamed pre-rendering by default

The current v2 engine uses `OfflineAudioContext` to pre-render the soundscape in chunks. The real-time thread then plays the rendered buffers, reducing the cost of live mixing in the background. The system media card provides play / pause controls. Append `?render=live` to the URL to use real-time rendering instead.

This is an engineering improvement, not proof that background playback is finished. A full 20-minute locked-screen session still needs to pass on a real phone.

### Bounded material residency

`MaterialPool` manages decoding, deduplicates concurrent loads, and releases audio material. Decoded PCM lives outside the JavaScript heap, so `performance.memory` alone cannot describe its cost.

- The current five material groups remain resident during a session. Leaving the session view releases approximately **90MB of PCM**.
- The new Yicheng materials will be prefetched by stage and released after their crossfades. That staged policy will arrive with the TypeScript port; it is not live yet.

### Real recordings

Bamboo, wind, a mountain stream, the bell of Zōjō-ji in Tokyo, and a guqin recording all come from CC0 / CC BY material on Freesound. They are edited, filtered, enveloped, and reverberated for the soundscape. See [CREDITS.md](CREDITS.md) for sources and licences. The same credits are available under “Sound Sources” on the home page.

### Space

A true-stereo convolution reverb holds the bamboo grove. Bells and guqin take a separate distant path: an air-like low-pass filter, longer pre-delay, and an extended tail. They should arrive through mist, not sit next to the listener's ear.

### Phone speakers first

The primary listening context is a phone speaker at night. Sound-level acceptance uses a phone-speaker simulation—300 Hz high-pass plus 9 kHz low-pass—not headphones. The C++6 reference render and its acceptance tools live in [`tools/verify/`](tools/verify/README.md).

---

## Interface

Ink, mist, and negative space. The scenery recedes; the sound comes forward.

- **Home**: Bamboo on the left, ink spreading slowly from the right, with the faintest movement in the leaves. Phones use a dedicated crop.
- **Session**: One fine ring and one number. The ring breathes roughly every ten seconds; once playback starts, the backdrop recedes.
- **Living backdrops**: three.js / WebGL adds subtle motion to the home bamboo and the night scene. It loads on demand, caps rendering at 30 fps, and pauses while the page is hidden.
- **Static fallback**: If WebGL is unavailable, a shader fails, or reduced motion is requested, the original static scene remains in place.
- **Idle retreat**: After nine seconds without touch, the words disappear, leaving only the ring and timer. Touch once to bring them back.
- **Ending**: During the final twenty seconds, the image darkens with the last bell. Leaving fades sound and image together.
- **Event light**: A bell sends a faint gold ripple beyond the ring; guqin lights a small arc. Two slow orbs drift at the sides.

---

## Features

- **Real recordings + a generative score**: Seeded arrangement; no repeated session.
- **Three modes × three densities × custom duration**: From 1 to 180 minutes.
- **Four session phases**: Entering → Settling → Deepening → Returning, with four progress marks.
- **Streamed pre-rendering and media controls**: Chunked rendering by default, with system play / pause.
- **Offline support**: After the first load, the PWA precaches the app and its audio. A build-time assertion fails if any audio asset is omitted.
- **Living backdrops**: Progressive WebGL enhancement with static fallbacks and reduced-motion support.
- **Memory cleanup**: Decoded material is released when the session view closes.
- **Local preferences**: Mode, duration, and density stay in the browser.
- **No accounts, backend, or tracking**.

---

## Design principles

**Three axioms for a contemplative soundscape**:

1. Sound must serve the act of not noticing sound. The more it demands attention, the more it has failed.
2. Silence is material, not a bug.
3. Sound is a metaphor for impermanence: arising → abiding → dissolving.

> Endel helps you complete the task. **BreezeScape helps you forget it.**

No streaks. No “minutes this week.” No achievements.

---

## Progress

| Stage | Work | Status |
|---|---|---|
| M0–M7 | MVP: synthesis engine, five sound layers, scheduler, phase rules, preferences, particles, deployment | ✅ 2026-05 |
| Sprint 1 | Pink noise, inharmonic bells, Karplus guqin, convolution reverb | ✅ Completed, later superseded by v2 |
| v2 engine | Real recordings + seeded scores, refined through phone-speaker-simulated auditions | ✅ 2026-10 |
| Three densities | Five sliders replaced by Sparse / Balanced / Full | ✅ 2026-10 |
| Interface rebuild | Ink, mist, negative space, breathing ring, idle retreat, slow fades | ✅ 2026-10 |
| Playback path | Streamed pre-rendering by default + system media card | ✅ 2026-10 |
| Living backdrops | Home bamboo and session night scene, with WebGL enhancement and static fallback | ✅ 2026-11 |
| Offline fix | Precache MP3 files and `soundscape.json`; assert complete audio coverage at build time | ✅ 2026-11 |
| Sound acceptance tools | C++6 reference render and gates for level, deep quiet, and clicks | ✅ 2026-11 |
| Material residency foundation | `MaterialPool`; approximately 90MB of PCM released on leaving a session | ✅ 2026-11 |
| Automatic deployment | Push to `main` triggers build, tests, lint, publication, and live hash verification | ✅ 2026-11 |
| Expanded tests | 12 new session-state and envelope tests remain on a local branch, not yet merged into `main` | 🌿 In progress |
| Yicheng · A Journey | 17 new recordings selected and downloaded; the three-stage / six-stage Python prototype has reached its seventh audition batch | 🎧 Prototype auditions |
| Yicheng TypeScript port | Stage engine, new material layers, one consistent final-bell measurement, and replacement of the three-mode UI | 📋 Not started |
| Real-device validation | A full 20-minute locked-screen session: dropouts, background survival, volume, and memory | 📋 Pending |
| Sprint 2 · 3 · 5 | Responsive inputs, contemplative extensions, personalization | ✖ Closed |

**The live app still uses the v2 design: three modes and four phases. Yicheng has not replaced the live engine.**

The proposed Yicheng structure is **Entering the Mountain → Mist → Listening to the Stream → Abiding → Hearing the Bell → Returning** for sessions of ten minutes or longer. Shorter sessions use only **Listening to the Stream → Abiding → Hearing the Bell**. The seventh batch compares whether guqin should carry a stage-aware motif and a later recollection; no winner has been chosen yet. See [docs/JOURNEY_SPEC.md](docs/JOURNEY_SPEC.md) for the concept and settled constraints.

Append `?engine=v1` to the URL to revisit the original MVP synthesis engine for comparison.

---

## Documentation

| Document | Contents |
|---|---|
| 🌐 [README.md](README.md) | 中文版 README |
| 🎧 [CREDITS.md](CREDITS.md) | Recording sources and licences |
| 🧭 [docs/JOURNEY_SPEC.md](docs/JOURNEY_SPEC.md) | Yicheng concept and constraints for three-stage / six-stage soundscapes |
| ✅ [tools/verify/README.md](tools/verify/README.md) | C++6 reference rendering and sound-level acceptance |
| 🗺️ [docs/ROADMAP.md](docs/ROADMAP.md) | The six-Sprint plan from May 2026, with a current-state preface |
| 🔧 [docs/SPRINT_1_SPEC.md](docs/SPRINT_1_SPEC.md) | Sprint 1 synthesis upgrade specification (historical) |
| 🤖 [docs/CODEX_PROMPTS.md](docs/CODEX_PROMPTS.md) | Sprint 1 Codex prompts (historical) |
| 📏 [docs/AUDIO_BASELINE.md](docs/AUDIO_BASELINE.md) · [docs/PHASE1_EXPERIMENT.md](docs/PHASE1_EXPERIMENT.md) | v1 synthesis level measurements (historical) |
| 📜 [APP_SPEC.md](APP_SPEC.md) · [SOUND_SPEC.md](SOUND_SPEC.md) · [TASKS.md](TASKS.md) | MVP specification and M0–M7 tasks (historical) |

---

## Technology

```text
React 19 + TypeScript 6 + Vite 8
Web Audio API (AudioBufferSourceNode · ConvolverNode · OfflineAudioContext)
three.js / WebGL (lazy-loaded living backdrops)
Canvas 2D (orbs and ripples)
Media Session API (system media card)
vitest (score gates and material-pool tests)
PWA (vite-plugin-pwa + Workbox)
localStorage
No backend or accounts
```

---

## Project structure

```text
zenscape/
  README.md · README_EN.md       ← Chinese and English project guides
  CREDITS.md                     ← Recording sources and licences
  APP_SPEC.md · SOUND_SPEC.md · TASKS.md
                                 ← MVP archive
  docs/                          ← Yicheng concept, roadmap, historical specs
  tools/verify/                  ← C++6 reference and sound acceptance tools
  .github/workflows/deploy.yml   ← Build, test, lint, deploy, live verification
  app/
    public/audio/v2/             ← Recordings + soundscape.json with credits
    scripts/check-precache.mjs   ← Build-time audio precache assertion
    src/
      audio/
        engine.ts                ← v2 by default; ?engine=v1 for synthesis
        nowPlaying.ts            ← System media card
        v2/
          plan.ts                ← Session score and acceptance gates
          plan.test.ts           ← Densities × durations × seeds
          preset.ts              ← Mode presets + three densities
          composer.ts            ← Guqin composition with memory
          space.ts               ← Large and distant spaces
          SampleEngine.ts        ← Playback, offline and streamed rendering
          material.ts            ← Decode, residency, and release
          material.test.ts       ← Material-pool tests
          rng.ts                 ← Reproducible randomness
          bgTest.ts              ← Background playback diagnostics
        AudioEngine.ts …         ← v1 synthesis engine, kept for comparison
      components/
        SessionView.tsx          ← Session view and unmount cleanup
        ParticleCanvas.tsx       ← Orbs and ripples
        livingBackdrop/          ← WebGL backdrops and shaders
        ModeSelector · DurationSelector · DensitySelector
        SoundCredits.tsx         ← Home-page recording credits
      storage/preferenceStore.ts ← Local preferences
      App.tsx · App.css · index.css
```

---

## Working principles

- **Leave space.** Silence between sounds is part of the design, not a defect.
- **Do not loop.** Every session is arranged again; no soundscape repeats exactly.
- **No abrupt changes.** Level, filtering, and spatial changes must ramp. Wind, too, returns at a limited rate.
- **Do not interrupt.** Bells are not notifications, guqin does not become a melody, and everything serves the act of not noticing sound.
- **No productivity machinery.** No streaks, weekly minutes, or achievements.
- **Local first.** No accounts, backend, or uploads. Preferences remain in the browser.
- **The browser is the practice room.** No installation is required. AudioContext starts only after a user gesture.

---

## Run and verify

```bash
cd app
npm ci
npm run dev        # Local development under the /zenscape/ base path
npm run build      # Type-check, build, and assert complete audio precaching
npm test           # Score gates and material-pool tests
npm run lint       # ESLint
```

At the time of this update, the build, **47 tests**, and lint all pass on `main`.

Sound-level regression acceptance requires Python 3, NumPy, SciPy, and ffmpeg:

```bash
cd tools/verify
python3 run_reference.py
```

The reference report should return `ALL PASS`, with no drift in its key measurements. See [tools/verify/README.md](tools/verify/README.md).

### Diagnostic URL parameters

- `?engine=v1`: Legacy synthesis engine.
- `?render=live`: Real-time rendering; streamed pre-rendering is the default.
- `?bgtest=1`: Background / locked-screen playback isolation tests.
- `?diag=1`: Diagnostics panel.
- `?motion=0|1|2|3`: Temporarily override backdrop motion strength; defaults are 2 on Home and 1 in Session.

---

## Deployment

Pushing `main` triggers the [Deploy workflow](.github/workflows/deploy.yml):

1. Run a clean build, tests, and lint in `app/`.
2. Replace only build artifacts on `gh-pages`; skip the deployment commit if the output is unchanged.
3. Wait for GitHub Pages, then verify that the asset hashes referenced by the live `index.html` match the local `dist` output.

Live site: [shadowxx789.github.io/zenscape](https://shadowxx789.github.io/zenscape/). On phones that have opened an older version, the PWA may need to be closed and reopened once or twice before updating.

---

## Contributing

The project is led by [@shadowxx789](https://github.com/shadowxx789), with AI-assisted development.

- **Listen** → Open the [live demo](https://shadowxx789.github.io/zenscape/).
- **Suggest** → Open an issue.

Listening and aesthetic defaults are chosen by the creator. Automated gates protect accepted versions; they do not replace human judgement.

---

## Licence

Code: [MIT License](LICENSE). Recordings retain their individual licences (CC0 / CC BY 4.0); see [CREDITS.md](CREDITS.md).

---

*Sounds arise and pass; thoughts, too.*

*Sit and listen as wind crosses bamboo. The bamboo never asks where it came from.*
