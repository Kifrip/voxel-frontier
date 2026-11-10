# Voxel Frontier — A Browser-Based 3D Voxel Sandbox Game

**Voxel Frontier** is a complete, single-player 3D voxel wilderness sandbox game built for modern desktop web browsers with **TypeScript**, **Three.js (WebGL)**, **Vite**, **Web Audio API**, and **IndexedDB** persistence.

Explore an endless deterministic procedural world across four distinct biomes, harvest resources, craft tools and building materials, construct illuminated shelters, encounter original frontier creatures, and save your worlds locally in the browser.

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Development Server
```bash
npm run dev
```
Open the displayed local URL (typically `http://localhost:5173`) in a modern desktop browser.

### 3. Build for Production
```bash
npm run build
```
Generates a static, self-contained production bundle in `./dist` using relative asset paths (`base: './'`) ready for GitHub Pages or any static file host.

### 4. Preview the Production Build
```bash
npm run preview
```

### 5. Run Automated Tests
```bash
# Run unit & integration test suite (terrain, meshing, physics, inventory, crafting, persistence)
npm test

# Run headless Chromium end-to-end browser gameplay verification
npm run test:e2e
```

---

## Deploying to GitHub Pages

1. Push this repository to GitHub on the `main` (or `master`) branch.
2. In your GitHub repository, navigate to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. The included workflow at `.github/workflows/deploy.yml` automatically installs dependencies, runs unit tests, builds `./dist` with relative asset paths (`./`), and deploys to GitHub Pages.

---

## Game Controls

| Input | Action |
|---|---|
| `W` `A` `S` `D` / Arrow Keys | Move horizontally |
| `Mouse` | Look around (Pointer Lock API) |
| `Space` | Jump / Swim upward in water / Ascend while flying |
| `Double-Tap Space` or `F` | Toggle flight in Creative Mode |
| `Left Shift` | Sprint on ground / Descend while flying |
| `Left Mouse Button (Hold)` | Mine targeted block / Attack creature |
| `Right Mouse Button` | Place selected block / Interact with Crafting Bench |
| `E` | Open / close Inventory & Backpack |
| `C` | Open / close Crafting Workshop |
| `1` – `9` or `Mouse Wheel` | Select Hotbar slot |
| `F3` | Toggle technical debug overlay |
| `Esc` | Pause game / Release mouse cursor |

---

## Implemented Features

- **Procedural Deterministic World Engine**:
  - 16 × 96 × 16 chunk architecture with dynamic distance-prioritized chunk streaming, frustum culling, and distant chunk unloading.
  - Multi-layered 2D/3D Simplex, FBM, and Ridged Multifractal noise driven deterministically by any numeric or textual world seed.
  - **Four Biomes** with smooth elevation and climate transitions:
    1. **Emerald Plains**: Rolling meadows, oak trees, crimson & golden wildflowers, tall grass, and building plateaus.
    2. **Timberland Forest**: Dense mixed oak and spruce forests, surface boulders, and rich vegetation.
    3. **Cragspire Mountains**: High rocky ridges, snowcap stone peaks, spruce trees on lower slopes, and rich coal, iron, and aether crystal deposits.
    4. **Sunbaked Desert**: Golden sand dunes, underlying sandstone strata, and desert cacti.
  - **Underground Caves & Ores**: 3D cave tunnels and caverns with Coal Ore, Iron Ore, and luminous Aether Crystal veins.
- **Optimized Voxel Rendering & Lighting**:
  - Exposed-face chunk meshing (hidden internal faces and chunk-border faces are culled) with separate opaque/cutout and translucent water passes.
  - Vertex ambient occlusion (AO), directional face shading, subtle per-block tonal variation, and local warm vertex illumination from placed Torches and Crystal Ore.
  - Continuous 20-minute **Day/Night Cycle** with smooth sunrise, daytime, sunset, and night transitions, dynamic sun/moon/stars, directional shadows, and atmospheric fog.
- **First-Person Physics & Block Interaction**:
  - Frame-independent AABB voxel collision detection, gravity, jumping, sprinting with FOV feedback, swimming in lakes/rivers, and Creative flight.
  - Exact 3D DDA voxel raycasting with wireframe block outline, progressive crack overlay during mining, particle bursts, and first-person hand/tool swing animation.
- **Inventory, Crafting, and Tool Progression**:
  - 9-slot Hotbar + 27-slot Backpack supporting left-click move/merge/swap, right-click stack splitting, and HTML5 drag-and-drop.
  - 20 crafting and smelting recipes covering planks, sticks, crafting benches, torches, wooden/stone/iron pickaxes & axes, shovels, blades, glass, sandstone, and stone bricks.
  - Contextual 5-step Frontier Guide on the HUD to onboard new players.
- **Survival & Creative Modes**:
  - **Survival Mode**: Resource gathering, tool tier & speed multipliers, tool durability, 10-heart health bar, fall damage, and hostile night encounters.
  - **Creative Mode**: Instant block breaking, unlimited building blocks, full Creative block/tool catalog in `E`, no fall damage, and free flight.
- **Original Frontier Creatures**:
  - **Forest Hopper**: Friendly woodland hopper that bounds away when approached.
  - **Rockling**: Peaceful crystal-crested stone creature in rocky highlands.
  - **Night Crawler**: Hostile nocturnal creature that stalks the player at night.
- **Synthesized Web Audio & Persistent Storage**:
  - Procedural Web Audio API sound effects for material-specific footsteps, mining hits, block breaking/placing, item pickups, crafting chimes, UI clicks, and ambient breeze.
  - Efficient delta-based world persistence in **IndexedDB** (with `localStorage` mirror), storing world metadata, player state, inventory, time of day, and per-chunk block modifications across multiple save slots.

---

## Known Limitations

- Single-player local browser experience only (no networked multiplayer backend).
- Water blocks use static lake/river level geometry with swimming physics rather than cellular automata fluid flow simulation.
- Lighting from torches and crystal ore is baked into chunk vertex colors within a local radius rather than full multi-bounce global illumination.
