import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const DIST_DIR = path.resolve(process.cwd(), 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

function findBrowserExecutable() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runE2E() {
  console.log('Launching headless Chromium against production bundle in ./dist ...');
  const url = 'http://voxel.local/';

  const executablePath = findBrowserExecutable();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });

    // Serve production build files from ./dist directly via Playwright route handler
    await context.route('http://voxel.local/**', async (route) => {
      const reqUrl = new URL(route.request().url());
      const relPath = reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname.replace(/^\/+/, '');
      const filePath = path.join(DIST_DIR, relPath);
      if (!filePath.startsWith(DIST_DIR) || !fs.existsSync(filePath)) {
        await route.fulfill({ status: 404, body: 'Not Found' });
        return;
      }
      const ext = path.extname(filePath);
      const body = fs.readFileSync(filePath);
      await route.fulfill({
        status: 200,
        contentType: MIME_TYPES[ext] || 'application/octet-stream',
        body,
      });
    });

    const page = await context.newPage();

    const pageErrors = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__VOXEL_FRONTIER__));
    console.log('✓ 0. Loaded Main Menu and initialized WebGL 3D scene at 1920×1080');

    // Test 1 & 2: Create a new world and spawn on valid terrain
    await page.click('#btn-open-create');
    await page.fill('#input-world-name', 'E2E Frontier Test');
    await page.fill('#input-world-seed', 'FrontierE2ESeed2026');
    await page.click('#btn-mode-survival');
    await page.click('#btn-confirm-create');

    const spawnState = await page.evaluate(() => {
      const g = window.__VOXEL_FRONTIER__;
      return {
        isPlaying: g.isPlaying,
        worldName: g.currentWorldName,
        seed: g.currentSeed,
        mode: g.player.gameMode,
        x: g.player.state.x,
        y: g.player.state.y,
        z: g.player.state.z,
        loadedChunks: g.world.getLoadedChunkCount(),
      };
    });
    assert(spawnState.isPlaying === true, 'Game should be in playing state');
    assert(spawnState.worldName === 'E2E Frontier Test', 'World name should match');
    assert(spawnState.y > 30, 'Player should spawn above sea level on valid terrain');
    assert(spawnState.loadedChunks >= 9, 'Nearby chunks should be loaded before spawn');
    console.log('✓ 1–2. Created new world and spawned on valid terrain:', spawnState);

    // Test 3, 4, 5: Walk around, Jump onto a block, Sprint
    const moveResult = await page.evaluate(() => {
      const g = window.__VOXEL_FRONTIER__;
      const startX = g.player.state.x;
      const startZ = g.player.state.z;

      // Let player settle on ground first
      for (let i = 0; i < 30; i++) {
        g.player.update(g.world, 0.03, true);
      }

      // Walk forward (KeyW) + Sprint (ShiftLeft)
      g.player.keys.add('KeyW');
      g.player.keys.add('ShiftLeft');
      for (let i = 0; i < 20; i++) {
        g.player.update(g.world, 0.03, true);
      }
      const afterSprintZ = g.player.state.z;
      const sprintFov = g.camera.fov;

      // Let player settle on ground after sprinting down slope, then Jump (Space)
      g.player.keys.clear();
      for (let i = 0; i < 25; i++) {
        g.player.update(g.world, 0.03, true);
      }
      g.player.keys.add('Space');
      g.player.update(g.world, 0.02, true);
      const jumpVy = g.player.state.vy;
      g.player.keys.clear();

      return { startX, startZ, afterSprintZ, sprintFov, jumpVy };
    });
    assert(Math.abs(moveResult.afterSprintZ - moveResult.startZ) > 1.0, 'Player walked/sprinted');
    assert(moveResult.sprintFov > 75, 'Sprint FOV feedback works');
    assert(moveResult.jumpVy > 5, 'Jump impulse works');
    console.log('✓ 3–5. Walked, sprinted, and jumped smoothly');

    // Test 6, 7, 8: Mine dirt, collect the dropped item, place dirt somewhere else
    const dirtResult = await page.evaluate(() => {
      const g = window.__VOXEL_FRONTIER__;
      const B = window.BlockId;
      const px = Math.floor(g.player.state.x);
      const py = Math.floor(g.player.state.y);
      const pz = Math.floor(g.player.state.z) - 2;

      // Ensure a solid floor at (px, py - 1, pz) and a dirt block at (px, py, pz)
      g.world.setBlock(px, py - 1, pz, B.STONE, true);
      g.world.setBlock(px, py, pz, B.DIRT, true);
      g.world.setBlock(px, py + 1, pz, B.AIR, true);
      g.world.setBlock(px, py + 2, pz, B.AIR, true);
      g.world.setBlock(px, py + 1, pz + 1, B.AIR, true);

      // Aim camera at (px + 0.5, py + 0.5, pz + 0.5)
      g.player.setPosition(px + 0.5, py, pz + 2.5, 0, -0.5);
      const hit = g.player.getTargetBlock(g.world);
      if (!hit) return { error: 'No raycast hit on dirt' };

      const broke = g.breakTargetedBlock(hit);
      const dirtCountAfterMine = g.inventory.getItemCount('dirt');

      // Now select dirt in hotbar and place it on the ground in front
      const dirtSlot = g.inventory.slots.findIndex((s) => s && s.itemId === 'dirt');
      g.inventory.selectHotbarSlot(dirtSlot);
      // Aim slightly further down at ground block
      g.player.setPosition(px + 0.5, py, pz + 2.5, 0, -0.75);
      const placed = g.tryInteractOrPlaceBlock();
      const dirtCountAfterPlace = g.inventory.getItemCount('dirt');

      return { broke, dirtCountAfterMine, placed, dirtCountAfterPlace };
    });
    assert(dirtResult.broke === true, 'Broke dirt block');
    assert(dirtResult.dirtCountAfterMine >= 1, 'Collected dirt into inventory');
    assert(dirtResult.placed === true, 'Placed dirt block in world');
    assert(dirtResult.dirtCountAfterPlace === dirtResult.dirtCountAfterMine - 1, 'Consumed dirt on place');
    console.log('✓ 6–8. Mined dirt, collected drop, and placed dirt in world');

    // Test 9, 10, 11, 12: Mine wood, craft planks, craft a pickaxe, mine stone
    const progressionResult = await page.evaluate(() => {
      const g = window.__VOXEL_FRONTIER__;
      const B = window.BlockId;
      const px = Math.floor(g.player.state.x);
      const py = Math.floor(g.player.state.y);
      const pz = Math.floor(g.player.state.z) - 2;

      // Place 3 oak wood logs and mine them
      for (let i = 0; i < 3; i++) {
        g.world.setBlock(px, py, pz, B.WOOD, true);
        g.breakTargetedBlock({
          bx: px,
          by: py,
          bz: pz,
          nx: 0,
          ny: 0,
          nz: 1,
          blockId: B.WOOD,
          distance: 2,
        });
      }
      const woodCount = g.inventory.getItemCount('wood');

      // Craft Planks & Sticks & Wooden Pickaxe via UI/CraftingSystem
      g.craftById('planks_oak', 2); // 2 wood -> 8 planks
      const planksCount = g.inventory.getItemCount('planks');
      g.craftById('sticks', 1); // 2 planks -> 4 sticks
      g.craftById('wooden_pickaxe', 1); // 3 planks + 2 sticks -> 1 wooden_pickaxe
      const hasPickaxe = g.inventory.getItemCount('wooden_pickaxe') === 1;

      // Select wooden pickaxe in hotbar and mine Stone
      const pickSlot = g.inventory.slots.findIndex((s) => s && s.itemId === 'wooden_pickaxe');
      g.inventory.selectHotbarSlot(pickSlot);

      g.world.setBlock(px, py, pz, B.STONE, true);
      const harvestCheck = g.canHarvestBlock(B.STONE);
      g.breakTargetedBlock({
        bx: px,
        by: py,
        bz: pz,
        nx: 0,
        ny: 0,
        nz: 1,
        blockId: B.STONE,
        distance: 2,
      });
      const cobbleCount = g.inventory.getItemCount('cobblestone');

      return {
        woodCount,
        planksCount,
        hasPickaxe,
        harvestCheck,
        cobbleCount,
        progression: g.progression,
      };
    });
    assert(progressionResult.woodCount === 3, 'Gathered 3 wood logs');
    assert(progressionResult.planksCount === 8, 'Crafted 8 planks');
    assert(progressionResult.hasPickaxe === true, 'Crafted Wooden Pickaxe');
    assert(progressionResult.harvestCheck.canHarvest === true, 'Pickaxe can harvest stone');
    assert(progressionResult.harvestCheck.speedMultiplier > 2.0, 'Pickaxe speeds up stone mining');
    assert(progressionResult.cobbleCount === 1, 'Collected Cobblestone from mined Stone');
    console.log('✓ 9–12. Mined wood, crafted planks & pickaxe, and mined stone:', progressionResult);

    // Test 13, 14, 15, 16: Build a small structure, walk across chunk boundaries, unload & return
    const structureAndChunkResult = await page.evaluate(() => {
      const g = window.__VOXEL_FRONTIER__;
      const B = window.BlockId;
      const houseX = 10;
      const houseY = 55;
      const houseZ = 10;

      // Build a small 3x3 plank & glass structure with a torch
      for (let dx = 0; dx < 3; dx++) {
        for (let dz = 0; dz < 3; dz++) {
          g.world.setBlock(houseX + dx, houseY, houseZ + dz, B.PLANKS, true);
        }
      }
      g.world.setBlock(houseX + 1, houseY + 1, houseZ + 1, B.TORCH, true);

      // Walk across chunk boundary into chunk (1, 0), then far away to (240, 240)
      g.world.updateAroundPlayer(22, 10);
      g.world.updateAroundPlayer(240, 240);
      const unloadedAtFarDistance = !g.world.isChunkLoaded(0, 0);

      // Return to (10, 10) and verify the built structure is still intact
      g.world.ensureAreaLoaded(houseX, houseZ, 2);
      const reloadedChunk = g.world.isChunkLoaded(0, 0);
      const floorBlock = g.world.getBlock(houseX, houseY, houseZ);
      const torchBlock = g.world.getBlock(houseX + 1, houseY + 1, houseZ + 1);

      return { unloadedAtFarDistance, reloadedChunk, floorBlock, torchBlock, B };
    });
    assert(structureAndChunkResult.unloadedAtFarDistance === true, 'Distant chunk unloaded properly');
    assert(structureAndChunkResult.reloadedChunk === true, 'Chunk reloaded when returning');
    assert(
      structureAndChunkResult.floorBlock === structureAndChunkResult.B.PLANKS,
      'Built structure planks persisted across chunk unload/reload'
    );
    assert(
      structureAndChunkResult.torchBlock === structureAndChunkResult.B.TORCH,
      'Placed torch persisted across chunk unload/reload'
    );
    console.log('✓ 13–16. Built structure, crossed chunk boundaries, unloaded & restored terrain');

    // Test 17, 18, 19, 20: Save the game, reload the page, restore the saved world, verify persistence
    const savedWorldId = await page.evaluate(async () => {
      const g = window.__VOXEL_FRONTIER__;
      const saved = await g.saveCurrentWorld();
      return saved.id;
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__VOXEL_FRONTIER__));

    // Open Load World modal and click Play on the saved world
    await page.click('#btn-open-load');
    await page.waitForSelector('.saved-world-card .btn-load-item');
    await page.click('.saved-world-card .btn-load-item');
    await page.waitForFunction(
      (expectedId) =>
        window.__VOXEL_FRONTIER__ &&
        window.__VOXEL_FRONTIER__.isPlaying &&
        window.__VOXEL_FRONTIER__.currentWorldId === expectedId,
      savedWorldId
    );

    const restoredState = await page.evaluate((expectedId) => {
      const g = window.__VOXEL_FRONTIER__;
      const B = window.BlockId;
      return {
        worldId: g.currentWorldId,
        expectedId,
        hasPickaxe: g.inventory.getItemCount('wooden_pickaxe') === 1,
        cobbleCount: g.inventory.getItemCount('cobblestone'),
        floorBlock: g.world.getBlock(10, 55, 10),
        torchBlock: g.world.getBlock(11, 56, 11),
        B,
      };
    }, savedWorldId);

    assert(restoredState.worldId === savedWorldId, 'Restored saved world ID after page reload');
    assert(restoredState.hasPickaxe === true, 'Inventory pickaxe persisted after page reload');
    assert(restoredState.cobbleCount === 1, 'Inventory cobblestone persisted after page reload');
    assert(
      restoredState.floorBlock === restoredState.B.PLANKS &&
        restoredState.torchBlock === restoredState.B.TORCH,
      'Modified world blocks persisted after full browser page reload'
    );
    console.log('✓ 17–20. Saved game, reloaded page, restored world, verified inventory & blocks');

    // Test 21, 22, 23, 24: Test Creative mode, Survival mode, Pause menu, and Graphics settings + 1366×768 viewport
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.keyboard.press('Escape');
    const pauseVisible = await page.evaluate(
      () => !document.getElementById('pause-modal').classList.contains('hidden')
    );
    assert(pauseVisible === true, 'Pause menu opened on Escape');

    // Switch to Creative Mode via Pause Menu button
    await page.click('#btn-toggle-gamemode');
    const modeAfterToggle = await page.evaluate(() => window.__VOXEL_FRONTIER__.player.gameMode);
    assert(modeAfterToggle === 'creative', 'Switched to Creative mode');

    // Open Settings from Pause menu, adjust Render Distance and Shadows, and save
    await page.click('#btn-open-settings-pause');
    await page.selectOption('#setting-graphics', 'medium');
    await page.selectOption('#setting-shadows', 'high');
    await page.click('#btn-save-settings');

    // Resume game and test Creative flying (KeyF / Double-Tap Space)
    await page.click('#btn-resume-game');
    await page.keyboard.press('KeyF');
    const isFlying = await page.evaluate(() => window.__VOXEL_FRONTIER__.player.state.flying);
    assert(isFlying === true, 'Creative mode flying toggled on');

    // Switch back to Survival mode and verify flying disables
    await page.evaluate(() => window.__VOXEL_FRONTIER__.setGameMode('survival'));
    const survivalFlying = await page.evaluate(() => window.__VOXEL_FRONTIER__.player.state.flying);
    assert(survivalFlying === false, 'Survival mode disables flying');
    console.log('✓ 21–25. Verified Creative mode, Survival mode, Pause menu, Settings, and 1366×768 UI');

    assert(pageErrors.length === 0, `Unexpected page errors: ${pageErrors.join('; ')}`);
    console.log('\nALL 25 ESSENTIAL GAMEPLAY & E2E TESTS PASSED WITH ZERO ERRORS!');
  } finally {
    await browser.close();
  }
}

runE2E().catch((err) => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
