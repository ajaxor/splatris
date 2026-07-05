# Agent Instructions

These instructions apply to every coding agent working in this repository, including OpenAI Codex and Claude Code.

## Project context

Splatris is a mobile-friendly browser game built with plain HTML, CSS, and JavaScript and deployed with GitHub Pages.

Published game: https://ajaxor.github.io/splatris/

## Release identification

Every change pushed to this repository must update the visible release identifier on the title screen.

The identifier uses this format:

`Version X.Y.Z · commit abcde`

`version.json` is the source of truth for the semantic version. Do not manually edit version strings or cache-busting query parameters in `index.html`.

Prepare release metadata with the dependency-free release tool:

```bash
npm run release -- patch
npm run release -- minor
npm run release -- major
```

You may also set an explicit version or source commit:

```bash
npm run release -- 1.2.3 --commit abcde
```

After preparing a release, verify metadata consistency with:

```bash
npm run release:check
```

Rules:

1. Run the release tool for every pushed update.
   - Patch: bug fix, documentation, agent-instruction, or small adjustment.
   - Minor: new user-visible feature.
   - Major: incompatible redesign.
2. The commit value should identify the functional source commit being released. By default the tool uses the current `HEAD`; pass `--commit` when another commit should be shown.
3. The release tool updates `version.json`, the visible build identifier, and all local CSS and JavaScript cache-busting query strings together.
4. Keep the visible identifier near the main title so users can confirm which GitHub Pages build is loaded.
5. Because changing the displayed hash creates a new metadata commit, the hash may refer to the immediately preceding functional commit rather than the metadata-only version-label commit.
6. Never push an update with inconsistent release metadata. Run `npm run release:check` before finishing.

## Working principles

- Read the relevant existing code before making changes. Preserve current behavior unless the task explicitly calls for changing it.
- Prefer the smallest coherent change that fully solves the task.
- Keep the project lightweight. Do not add a framework, build system, dependency, or abstraction unless it provides a clear and immediate benefit.
- Maintain compatibility with static GitHub Pages hosting. Do not require a backend or server-side runtime unless the task explicitly requests one.
- Keep mobile and touch interaction in mind alongside keyboard and desktop behavior.
- Avoid unrelated rewrites while completing a focused task.

## Modular architecture

Maintain clear ownership and boundaries between concerns:

- **Game rules and state:** Keep gameplay rules, board state, scoring, progression, and state transitions independent of DOM manipulation and rendering details.
- **Rendering:** Rendering code should consume game state and display it. It should not become the source of truth for gameplay state.
- **Input:** Keyboard, touch, pointer, and multiplayer input should translate user actions into explicit game commands rather than directly mutating unrelated state.
- **UI:** Menus, overlays, status displays, and other interface elements should be separated from core game rules.
- **Networking:** WebRTC setup, message transport, serialization, validation, and peer lifecycle should remain isolated from gameplay logic. Pass explicit commands or state snapshots across that boundary.
- **Audio and effects:** Keep optional presentation systems decoupled from game rules so they can be changed or disabled safely.
- **Persistence and configuration:** Centralize tunable values and storage access rather than scattering constants or direct `localStorage` calls throughout the code.

When adding or changing code:

- Prefer small modules and focused functions with one clear responsibility.
- Avoid large multipurpose files, deeply nested conditionals, duplicated logic, hidden global state, and circular dependencies.
- Use explicit parameters and return values instead of relying on implicit shared mutation.
- Keep public interfaces between modules narrow and intentional.
- Reuse existing abstractions when they fit; do not create parallel systems for the same responsibility.
- Extract code when a section has a distinct responsibility, is reused, is difficult to test in place, or is making its current file hard to understand.
- Do not split code merely to reduce line count; every module should represent a meaningful boundary.

## Validation

Before finishing a task:

- Exercise the changed behavior in a browser when possible.
- Check for JavaScript console errors.
- Verify that the game still loads from a static file or simple static server.
- Check both mobile/touch and desktop/keyboard behavior when the change affects interaction.
- Confirm that multiplayer changes do not break single-player or local behavior, and vice versa.
- Run `npm run release:check` after preparing the release.
- Report what was tested and clearly identify anything that was not tested.

## Required completion response

Every final task response must include:

1. A concise summary of what changed.
2. The validation performed and its result.
3. A clickable link to the published game: https://ajaxor.github.io/splatris/
4. A **Tech debt** note based on the current state of the code:
   - If you see a concrete cleanup or architectural improvement, suggest the single most useful next improvement.
   - Explain briefly why it would help.
   - Do not expand the current task to perform that cleanup unless it is necessary for the requested change.
   - If there is no meaningful tech debt relevant to the code inspected, say: `Tech debt: No specific cleanup recommendation from this task.`

The game link and tech-debt note are required even for small tasks.