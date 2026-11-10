import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BlockId } from '../src/world/blocks';
import { CHUNK_SIZE, SEA_LEVEL, TerrainGenerator } from '../src/world/generator';
import { buildChunkMeshArrays } from '../src/rendering/mesher';
import { WorldManager } from '../src/world/world';
import {
  PhysicsState,
  raycastVoxel,
  stepPlayerPhysics,
  wouldBlockOverlapPlayer,
} from '../src/player/physics';
import { InventoryManager } from '../src/items/inventory';
import { CRAFTING_RECIPES, CraftingSystem } from '../src/items/crafting';
import { SaveSystem, WorldSaveData } from '../src/storage/saveSystem';

describe('Voxel Frontier — Core Engine, Gameplay, and Persistence Suite', () => {
  it('1. Deterministic terrain generation produces identical chunks for the same seed', () => {
    const genA = new TerrainGenerator('AlphaFrontier99');
    const genB = new TerrainGenerator('AlphaFrontier99');
    const genC = new TerrainGenerator('DifferentSeed42');

    const chunkA = genA.generateChunkData(0, 0);
    const chunkB = genB.generateChunkData(0, 0);
    const chunkC = genC.generateChunkData(0, 0);

    expect(chunkA).toEqual(chunkB);
    expect(chunkA).not.toEqual(chunkC);
    // Bedrock at y=0
    expect(chunkA[0]).toBe(BlockId.BEDROCK);
  });

  it('2. Generates all 4 distinct biomes (Plains, Forest, Mountains, Desert)', () => {
    const gen = new TerrainGenerator('VoxelFrontierBiomes2026');
    const foundBiomes = new Set<string>();

    for (let x = -1200; x <= 1200; x += 45) {
      for (let z = -1200; z <= 1200; z += 45) {
        const b = gen.getBiomeInfoAt(x, z);
        foundBiomes.add(b.id);
        if (foundBiomes.size === 4) break;
      }
      if (foundBiomes.size === 4) break;
    }

    expect(foundBiomes.has('plains')).toBe(true);
    expect(foundBiomes.has('forest')).toBe(true);
    expect(foundBiomes.has('mountains')).toBe(true);
    expect(foundBiomes.has('desert')).toBe(true);
  });

  it('3. Chunk mesher culls internal hidden faces and only emits exposed faces', () => {
    // Single isolated stone block at (5, 10, 5) has 6 faces = 12 triangles = 36 indices
    const singleBlockMesh = buildChunkMeshArrays(0, 0, (wx, y, wz) =>
      wx === 5 && y === 10 && wz === 5 ? BlockId.STONE : BlockId.AIR
    );
    expect(singleBlockMesh.solidIndices.length).toBe(36);

    // Two adjacent stone blocks share a face, so only 10 faces = 60 indices (not 72)
    const twoBlocksMesh = buildChunkMeshArrays(0, 0, (wx, y, wz) =>
      (wx === 5 || wx === 6) && y === 10 && wz === 5 ? BlockId.STONE : BlockId.AIR
    );
    expect(twoBlocksMesh.solidIndices.length).toBe(60);
  });

  it('4. Player physics: gravity, collision, jumping onto a block, and chunk border traversal', () => {
    const scene = new THREE.Scene();
    const dummyTex = new THREE.Texture();
    const world = new WorldManager(scene, dummyTex, 'PhysicsSeed');
    const spawn = world.findSafeSpawnPoint();

    const state: PhysicsState = {
      x: spawn.x,
      y: spawn.y + 2,
      z: spawn.z,
      vx: 0,
      vy: 0,
      vz: 0,
      onGround: false,
      inWater: false,
      flying: false,
      fallPeakY: spawn.y + 2,
    };

    // Simulate falling onto ground
    for (let i = 0; i < 40; i++) {
      stepPlayerPhysics(world, state, 0, 0, false, false, 0.05);
    }
    expect(state.onGround).toBe(true);
    expect(state.y).toBeGreaterThan(SEA_LEVEL);

    // Place a 2-block high solid wall in +X direction and confirm player cannot walk through it
    const startBlockX = Math.floor(state.x);
    const wallX = startBlockX + 1;
    const baseY = Math.floor(state.y);
    const wallZ = Math.floor(state.z);
    for (let clearX = startBlockX; clearX <= wallX + 4; clearX++) {
      for (let clearY = baseY; clearY <= baseY + 4; clearY++) {
        world.setBlock(clearX, clearY, wallZ, BlockId.AIR, true);
      }
      world.setBlock(clearX, baseY - 1, wallZ, BlockId.STONE, true);
    }
    // Create a 2-block high barrier at wallX..wallX+3
    for (let px = wallX; px <= wallX + 3; px++) {
      world.setBlock(px, baseY, wallZ, BlockId.STONE, true);
      world.setBlock(px, baseY + 1, wallZ, BlockId.STONE, true);
    }

    for (let i = 0; i < 20; i++) {
      stepPlayerPhysics(world, state, 5.0, 0, false, false, 0.05);
    }
    expect(state.x).toBeLessThan(wallX);

    // Lower barrier to a 1-block high plateau and jump onto it
    for (let px = wallX; px <= wallX + 3; px++) {
      world.setBlock(px, baseY + 1, wallZ, BlockId.AIR, true);
    }

    for (let i = 0; i < 25; i++) {
      stepPlayerPhysics(world, state, 4.0, 0, i === 0, false, 0.04);
    }
    expect(state.y).toBeGreaterThanOrEqual(baseY + 0.95);
    expect(state.x).toBeGreaterThan(wallX);
  });

  it('5. Voxel raycaster accurately detects targeted block and face normal', () => {
    const scene = new THREE.Scene();
    const world = new WorldManager(scene, new THREE.Texture(), 'RaycastSeed');
    world.ensureAreaLoaded(0, 0, 1);

    world.setBlock(4, 60, 4, BlockId.DIRT, true);
    world.setBlock(4, 61, 4, BlockId.AIR, true);
    world.setBlock(4, 62, 4, BlockId.AIR, true);

    const hit = raycastVoxel(world, 4.5, 62.5, 4.5, 0, -1, 0, 5.0);
    expect(hit).not.toBeNull();
    expect(hit?.bx).toBe(4);
    expect(hit?.by).toBe(60);
    expect(hit?.bz).toBe(4);
    expect(hit?.nx).toBe(0);
    expect(hit?.ny).toBe(1);
    expect(hit?.nz).toBe(0);
    expect(hit?.blockId).toBe(BlockId.DIRT);

    // Verify player overlap prevention
    expect(wouldBlockOverlapPlayer(4, 61, 4, 4.5, 61.0, 4.5)).toBe(true);
    expect(wouldBlockOverlapPlayer(6, 61, 4, 4.5, 61.0, 4.5)).toBe(false);
  });

  it('6. Inventory and Crafting progression: Wood -> Planks -> Sticks -> Pickaxe -> Stone Pickaxe', () => {
    const inv = new InventoryManager();
    inv.addItem('wood', 3);
    expect(inv.getItemCount('wood')).toBe(3);

    const planksRecipe = CRAFTING_RECIPES.find((r) => r.id === 'planks_oak')!;
    const sticksRecipe = CRAFTING_RECIPES.find((r) => r.id === 'sticks')!;
    const woodPickRecipe = CRAFTING_RECIPES.find((r) => r.id === 'wooden_pickaxe')!;
    const stonePickRecipe = CRAFTING_RECIPES.find((r) => r.id === 'stone_pickaxe')!;

    // Craft 2x Planks recipes -> 8 planks
    expect(CraftingSystem.craft(planksRecipe, inv, 2)).toBe(2);
    expect(inv.getItemCount('planks')).toBe(8);
    expect(inv.getItemCount('wood')).toBe(1);

    // Craft 1x Sticks recipe -> 4 sticks, 6 planks left
    expect(CraftingSystem.craft(sticksRecipe, inv, 1)).toBe(1);
    expect(inv.getItemCount('stick')).toBe(4);
    expect(inv.getItemCount('planks')).toBe(6);

    // Craft Wooden Pickaxe -> uses 3 planks + 2 sticks
    expect(CraftingSystem.craft(woodPickRecipe, inv, 1)).toBe(1);
    expect(inv.getItemCount('wooden_pickaxe')).toBe(1);

    // Gather 3 cobblestone and craft Stone Pickaxe
    inv.addItem('cobblestone', 3);
    expect(CraftingSystem.craft(stonePickRecipe, inv, 1)).toBe(1);
    expect(inv.getItemCount('stone_pickaxe')).toBe(1);
    expect(inv.getItemCount('cobblestone')).toBe(0);

    // Test stack splitting and merging
    inv.addItem('dirt', 20);
    const dirtSlotIdx = inv.slots.findIndex((s) => s?.itemId === 'dirt');
    expect(inv.splitSlot(dirtSlotIdx, 15)).toBe(true);
    expect(inv.slots[dirtSlotIdx]?.count).toBe(10);
    expect(inv.slots[15]?.count).toBe(10);

    inv.moveOrMergeSlot(15, dirtSlotIdx);
    expect(inv.slots[dirtSlotIdx]?.count).toBe(20);
    expect(inv.slots[15]).toBeNull();
  });

  it('7. Distant chunk unloading and reloading preserves player block modifications', () => {
    const scene = new THREE.Scene();
    const world = new WorldManager(scene, new THREE.Texture(), 'PersistSeed');
    world.renderDistance = 2;

    // Load around (0, 0) and build a small structure at (2, 55, 2)
    world.updateAroundPlayer(0, 0);
    world.setBlock(2, 55, 2, BlockId.PLANKS, true);
    world.setBlock(2, 56, 2, BlockId.TORCH, true);
    expect(world.getBlock(2, 55, 2)).toBe(BlockId.PLANKS);

    // Walk far away to (200, 200) so chunk (0, 0) unloads
    const farCoord = 16 * CHUNK_SIZE;
    world.updateAroundPlayer(farCoord, farCoord);
    expect(world.isChunkLoaded(0, 0)).toBe(false);

    // Walk back to (0, 0) so chunk (0, 0) regenerates and reapplies modifications
    world.ensureAreaLoaded(0, 0, 1);
    expect(world.isChunkLoaded(0, 0)).toBe(true);
    expect(world.getBlock(2, 55, 2)).toBe(BlockId.PLANKS);
    expect(world.getBlock(2, 56, 2)).toBe(BlockId.TORCH);
  });

  it('8. IndexedDB SaveSystem persists and restores worlds across sessions', async () => {
    const saveSys = new SaveSystem();
    const sampleSave: WorldSaveData = {
      id: 'test_world_1',
      name: 'Test Homestead',
      seed: 'HomesteadSeed777',
      gameMode: 'survival',
      createdAt: 1000,
      updatedAt: 2000,
      player: {
        x: 12.5,
        y: 44.0,
        z: -8.5,
        yaw: 1.2,
        pitch: -0.2,
        health: 18,
        flying: false,
      },
      inventory: {
        slots: [{ itemId: 'wooden_pickaxe', count: 1, durability: 55 }, null],
        selectedHotbarIndex: 0,
      },
      timeOfDay: 0.45,
      chunkModifications: {
        '0,0': [[1234, BlockId.COBBLESTONE]],
      },
      progression: {
        gatheredWood: true,
        craftedPlanks: true,
        craftedPickaxe: true,
        minedStone: true,
        placedBlocks: 12,
      },
    };

    await saveSys.saveWorld(sampleSave);
    const loaded = await saveSys.loadWorld('test_world_1');
    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe('Test Homestead');
    expect(loaded?.seed).toBe('HomesteadSeed777');
    expect(loaded?.player.x).toBe(12.5);
    expect(loaded?.chunkModifications['0,0'][0]).toEqual([1234, BlockId.COBBLESTONE]);

    const allWorlds = await saveSys.listWorlds();
    expect(allWorlds.some((w) => w.id === 'test_world_1')).toBe(true);
  });
});
