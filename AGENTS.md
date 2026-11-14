# Games to Procrastinate To

<!-- platform:bootstrap:start — preserve this loader; common policy is remote, not copied here. -->
## Load current platform rules at session start

1. Resolve `procrastinate-games/game-template` branch `main` to a commit SHA using GitHub tools/API or `gh api repos/procrastinate-games/game-template/commits/main --jq .sha`.
2. Fetch and read `PLATFORM.md` at that exact SHA before planning or editing. Source: `https://github.com/procrastinate-games/game-template/blob/main/PLATFORM.md` (raw/API access is fine). Read the central `VERSIONING.md` for game releases, `GAME-CREATOR.md` for game workflow, and `LOCALIZATION.md` for new games or localization/text work, all at the same SHA.
3. Reuse those fetched documents for this session; do not repeatedly fetch them or copy their full text into this repo. Record the policy SHA in the session handoff when one is written. Refresh at the start of the next session.
4. Central documents define shared platform policy; local sections and `docs/platform-project-notes.md` define this game's architecture and explicit owner-approved exceptions. Keep existing saves, origins, stack and exceptions. Local copies of old platform guides are historical references, not the current common policy. Explicit user instructions take precedence.
5. If remote access fails, say so and use a previously verified cached revision if available, identifying its SHA. Without a verified copy, continue independent inspection but do not guess new platform requirements or claim current-policy compliance; resolve access before policy-dependent publishing.

Keep this loader and the project-specific sections when regenerating agent instructions. `CLAUDE.md` and `GEMINI.md` should point here. A Markdown loader instructs compliant agents; GitHub does not automatically sync template descendants or enforce that every tool fetches policy.
<!-- platform:bootstrap:end -->

## Voxel Frontier — Project overview

- **Title & Slug**: `Voxel Frontier` (`voxel-frontier`)
- **Stack**: TypeScript, Three.js (WebGL), Vite (`base: './'`, output `dist/`), Web Audio API, IndexedDB + `localStorage` (`pg:voxel-frontier:` prefix).
- **Architecture**:
  - `src/world/` — Block definitions (`blocks.ts`), deterministic Simplex/FBM noise (`noise.ts`), 4-biome terrain/cave/ore generator (`generator.ts`), chunk streaming & modification deltas (`world.ts`).
  - `src/rendering/` — Procedural texture atlas & isometric icons (`textures.ts`), exposed-face chunk mesher with AO & torch lighting (`mesher.ts`), day/night cycle & sky (`environment.ts`), target highlight, mining cracks & particles (`effects.ts`).
  - `src/player/` — AABB voxel collision & DDA raycaster (`physics.ts`), first-person Pointer Lock controller (`controller.ts`).
  - `src/items/` — Item registry (`registry.ts`), 36-slot inventory/hotbar (`inventory.ts`), 20-recipe crafting & smelting (`crafting.ts`).
  - `src/entities/` — Voxel creatures (`creatures.ts`: Forest Hopper, Rockling, Night Crawler).
  - `src/audio/` — Procedural Web Audio API SFX & wind (`sound.ts`).
  - `src/storage/` — IndexedDB + `pg:voxel-frontier:` `localStorage` save system (`saveSystem.ts`).
  - `src/ui/` — Main menu, world creator/loader, HUD, inventory/crafting workshop, pause & settings (`uiManager.ts`).
- **Device Support Exception**: Owner-approved desktop-only (`supportedDevices: ["desktop"]` in `public/game.json`) using Pointer Lock keyboard and mouse controls.
- **Commands**: `npm run dev`, `npm test`, `npm run build`, `npm run test:e2e`, `npx --yes github:procrastinate-games/game-publisher#v1` (game.json check).

## Release versioning

For the next player-facing update, follow the current central `VERSIONING.md`: inspect existing version/release history, update the semantic version and a 1–3 bullet CHANGELOG entry, and tie the successful release to its deployed commit. This Markdown-only adoption does not change or claim a new game version.
