import * as THREE from 'three';
import { BLOCK_DEFINITIONS, BlockId } from './world/blocks';
import { WorldManager, worldToChunkCoords } from './world/world';
import { createAtlasTexture } from './rendering/textures';
import { PlayerController, GameMode } from './player/controller';
import {
  isCameraUnderwater,
  RaycastHit,
  wouldBlockOverlapPlayer,
} from './player/physics';
import { InventoryManager } from './items/inventory';
import { CRAFTING_RECIPES, CraftingSystem } from './items/crafting';
import { getItemDef } from './items/registry';
import { EnvironmentManager } from './rendering/environment';
import { InteractionEffects } from './rendering/effects';
import { CreatureManager } from './entities/creatures';
import { SoundManager } from './audio/sound';
import {
  GameSettings,
  ProgressionState,
  SaveSystem,
  WorldSaveData,
} from './storage/saveSystem';
import { UIManager } from './ui/uiManager';

export class VoxelFrontierGame {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly world: WorldManager;
  public readonly player: PlayerController;
  public readonly inventory: InventoryManager;
  public readonly environment: EnvironmentManager;
  public readonly effects: InteractionEffects;
  public readonly creatures: CreatureManager;
  public readonly sound: SoundManager;
  public readonly saveSystem: SaveSystem;
  public readonly ui: UIManager;

  public currentWorldId = 'world_default';
  public currentWorldName = 'Emerald Frontier';
  public currentSeed = 'VoxelFrontier2026';
  public worldCreatedAt = Date.now();
  public isPlaying = false;
  public debugVisible = false;

  public progression: ProgressionState = {
    gatheredWood: false,
    craftedPlanks: false,
    craftedPickaxe: false,
    minedStone: false,
    placedBlocks: 0,
  };

  // Mining state
  private miningTargetKey = '';
  public miningProgress = 0;
  private mineSoundTimer = 0;
  private placeCooldown = 0;

  // Performance & autosave tracking
  private lastFrameTime = performance.now();
  public fps = 60;
  private fpsFrames = 0;
  private fpsAccum = 0;
  private autosaveTimer = 0;
  private menuOrbitAngle = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      260
    );
    this.scene.add(this.camera);

    const { texture: atlasTexture } = createAtlasTexture();
    this.world = new WorldManager(this.scene, atlasTexture, this.currentSeed);
    this.player = new PlayerController(this.camera);
    this.inventory = new InventoryManager();
    this.environment = new EnvironmentManager(this.scene);
    this.effects = new InteractionEffects(this.scene, this.camera);
    this.creatures = new CreatureManager(this.scene);
    this.sound = new SoundManager();
    this.saveSystem = new SaveSystem();
    this.ui = new UIManager(this.inventory, this.sound);

    // Apply saved user settings
    const savedSettings = this.saveSystem.loadSettings();
    this.applySettings(savedSettings);
    this.ui.syncSettingsInputs(savedSettings);

    this.setupCallbacks();
    this.setupInputHandlers();

    // Generate scenic background world for the Main Menu
    this.world.ensureAreaLoaded(8, 8, 2);

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  private setupCallbacks(): void {
    this.inventory.onChange = () => {
      this.ui.renderHotbar();
      this.effects.updateHeldItemAppearance(this.inventory.getSelectedItemDef());
    };

    this.player.onFootstep = (cat) => this.sound.playFootstep(cat);
    this.player.onJump = () => this.sound.playJump();
    this.player.onDamage = () => {
      this.sound.playHurt();
      this.ui.updateHealthBar(this.player.health, this.player.maxHealth, this.player.gameMode);
      if (this.player.health <= 0) {
        this.handlePlayerRespawn();
      }
    };

    this.ui.onQuickPlay = async () => {
      const worlds = await this.saveSystem.listWorlds();
      if (worlds.length > 0) {
        await this.loadSavedWorld(worlds[0].id);
      } else {
        await this.createNewWorld('Emerald Frontier', 'VoxelFrontier2026', 'survival');
      }
    };

    this.ui.onCreateWorld = async (name, seed, mode) => {
      await this.createNewWorld(name, seed, mode);
    };

    this.ui.onLoadWorld = async (worldId) => {
      await this.loadSavedWorld(worldId);
    };

    this.ui.onDeleteWorld = async (worldId) => {
      await this.saveSystem.deleteWorld(worldId);
      this.ui.showToast('Deleted world save.');
    };

    this.ui.onRequestWorldList = () => this.saveSystem.listWorlds();

    this.ui.onResumeGame = () => {
      this.resumeGameplay();
    };

    this.ui.onSaveGame = async () => {
      await this.saveCurrentWorld();
      this.ui.showToast('World saved successfully!');
    };

    this.ui.onToggleGameMode = () => {
      const nextMode: GameMode = this.player.gameMode === 'survival' ? 'creative' : 'survival';
      this.setGameMode(nextMode);
      this.ui.showToast(`Switched to ${nextMode.toUpperCase()} Mode`);
    };

    this.ui.onExitToMainMenu = async () => {
      await this.saveCurrentWorld();
      this.isPlaying = false;
      this.releasePointerLock();
      this.ui.showScreen('main_menu');
    };

    this.ui.onApplySettings = (settings) => {
      this.applySettings(settings);
      this.saveSystem.saveSettings(settings);
      this.ui.showToast('Settings applied');
    };

    this.ui.onCraftedRecipe = (recipe, count) => {
      const totalOut = recipe.outputCount * count;
      const def = getItemDef(recipe.outputItemId);
      this.ui.showToast(`Crafted ${totalOut}× ${def?.name ?? recipe.name}`);

      if (recipe.outputItemId === 'planks') {
        this.progression.craftedPlanks = true;
      }
      if (recipe.outputItemId.includes('pickaxe')) {
        this.progression.craftedPickaxe = true;
      }
      this.ui.updateTutorialHint(this.progression, this.player.gameMode);
      void this.saveCurrentWorld();
    };
  }

  public setGameMode(mode: GameMode): void {
    this.player.gameMode = mode;
    if (mode === 'creative') {
      this.player.health = this.player.maxHealth;
      const hasAnyItems = this.inventory.slots.some((s) => s !== null);
      if (!hasAnyItems) {
        this.inventory.populateCreativeDefaults();
      }
    } else {
      this.player.state.flying = false;
    }
    this.ui.updateHealthBar(this.player.health, this.player.maxHealth, mode);
    this.ui.updateTutorialHint(this.progression, mode);
    this.ui.renderHotbar();
  }

  public async createNewWorld(
    name: string,
    seed: string,
    mode: GameMode
  ): Promise<void> {
    this.currentWorldId = `world_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.currentWorldName = name.trim() || 'Frontier World';
    this.currentSeed = seed.trim() || 'VoxelFrontier2026';
    this.worldCreatedAt = Date.now();

    this.progression = {
      gatheredWood: false,
      craftedPlanks: false,
      craftedPickaxe: false,
      minedStone: false,
      placedBlocks: 0,
    };

    this.creatures.clear();
    this.world.resetWithSeed(this.currentSeed);
    const spawn = this.world.findSafeSpawnPoint();
    this.player.setPosition(spawn.x, spawn.y, spawn.z, 0, -0.1);
    this.player.health = this.player.maxHealth;
    this.player.state.flying = false;
    this.environment.timeOfDay = 0.22;

    this.inventory.clear();
    if (mode === 'creative') {
      this.inventory.populateCreativeDefaults();
    }
    this.setGameMode(mode);

    // Spawn a couple friendly creatures nearby
    this.creatures.spawnCreature('forest_hopper', spawn.x + 5, spawn.y + 2, spawn.z - 4);
    this.creatures.spawnCreature('rockling', spawn.x - 6, spawn.y + 2, spawn.z + 5);

    this.isPlaying = true;
    this.sound.startAmbientLoop();
    this.resumeGameplay();
    await this.saveCurrentWorld();
    this.ui.showToast(`Welcome to ${this.currentWorldName}!`);
  }

  public async loadSavedWorld(worldId: string): Promise<boolean> {
    const data = await this.saveSystem.loadWorld(worldId);
    if (!data) {
      this.ui.showToast('Could not load saved world.');
      return false;
    }

    this.currentWorldId = data.id;
    this.currentWorldName = data.name;
    this.currentSeed = data.seed;
    this.worldCreatedAt = data.createdAt;
    this.progression = data.progression ?? {
      gatheredWood: false,
      craftedPlanks: false,
      craftedPickaxe: false,
      minedStone: false,
      placedBlocks: 0,
    };

    this.creatures.clear();
    this.world.resetWithSeed(data.seed, data.chunkModifications);
    this.world.ensureAreaLoaded(data.player.x, data.player.z, 2);

    this.player.setPosition(
      data.player.x,
      data.player.y,
      data.player.z,
      data.player.yaw,
      data.player.pitch
    );
    this.player.health = data.player.health ?? 20;
    this.player.state.flying = Boolean(data.player.flying);
    this.environment.timeOfDay = data.timeOfDay ?? 0.22;

    this.inventory.deserialize(data.inventory);
    this.setGameMode(data.gameMode);

    this.isPlaying = true;
    this.sound.startAmbientLoop();
    this.resumeGameplay();
    this.ui.showToast(`Loaded "${this.currentWorldName}"`);
    return true;
  }

  public async saveCurrentWorld(): Promise<WorldSaveData> {
    const saveData: WorldSaveData = {
      id: this.currentWorldId,
      name: this.currentWorldName,
      seed: this.currentSeed,
      gameMode: this.player.gameMode,
      createdAt: this.worldCreatedAt,
      updatedAt: Date.now(),
      player: {
        x: this.player.state.x,
        y: this.player.state.y,
        z: this.player.state.z,
        yaw: this.player.yaw,
        pitch: this.player.pitch,
        health: this.player.health,
        flying: this.player.state.flying,
      },
      inventory: this.inventory.serialize(),
      timeOfDay: this.environment.timeOfDay,
      chunkModifications: this.world.serializeModifications(),
      progression: { ...this.progression },
    };

    await this.saveSystem.saveWorld(saveData);
    return saveData;
  }

  private handlePlayerRespawn(): void {
    const spawn = this.world.findSafeSpawnPoint();
    this.player.setPosition(spawn.x, spawn.y, spawn.z, 0, -0.1);
    this.player.health = this.player.maxHealth;
    this.ui.updateHealthBar(this.player.health, this.player.maxHealth, this.player.gameMode);
    this.ui.showToast('You respawned at the Frontier Camp.');
  }

  public resumeGameplay(): void {
    this.ui.showScreen('playing', this.player.gameMode);
    this.ui.renderHotbar();
    this.ui.updateHealthBar(this.player.health, this.player.maxHealth, this.player.gameMode);
    this.ui.updateTutorialHint(this.progression, this.player.gameMode);
    this.requestPointerLock();
  }

  private requestPointerLock(): void {
    try {
      const canvas = this.renderer.domElement;
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        const res = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      }
    } catch {
      // Ignore in headless browser environments
    }
  }

  private releasePointerLock(): void {
    try {
      if (document.pointerLockElement && document.exitPointerLock) {
        document.exitPointerLock();
      }
    } catch {
      // Ignore
    }
  }

  public applySettings(settings: GameSettings): void {
    this.player.mouseSensitivity = settings.mouseSensitivity;
    this.player.baseFov = settings.fov;
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();

    this.world.renderDistance = settings.renderDistance;
    this.sound.masterVolume = settings.masterVolume;
    this.sound.sfxVolume = settings.sfxVolume;
    this.sound.muted = settings.muted;

    const pixelRatio =
      settings.graphicsQuality === 'low'
        ? 1
        : settings.graphicsQuality === 'medium'
        ? Math.min(1.5, window.devicePixelRatio)
        : Math.min(2, window.devicePixelRatio);
    this.renderer.setPixelRatio(pixelRatio);

    const shadowsOn = settings.shadowQuality !== 'off';
    this.renderer.shadowMap.enabled = shadowsOn;
    this.world.setShadowsEnabled(shadowsOn);
    this.environment.setShadowQuality(settings.shadowQuality);
  }

  private setupInputHandlers(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Prevent browser context menu during gameplay
    window.addEventListener('contextmenu', (e) => {
      if (this.ui.activeScreen === 'playing') {
        e.preventDefault();
      }
    });

    // Save automatically before browser reload/close
    window.addEventListener('beforeunload', () => {
      if (this.isPlaying) {
        void this.saveCurrentWorld();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      if (
        !document.pointerLockElement &&
        this.isPlaying &&
        this.ui.activeScreen === 'playing'
      ) {
        // Only auto-open pause if user pressed Esc while pointer locked
        this.player.keys.clear();
        this.player.leftMouseDown = false;
        this.player.rightMouseDown = false;
      }
    });

    window.addEventListener('keydown', (e) => {
      // Do not intercept typing inside form inputs
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLSelectElement
      ) {
        if (e.code === 'Escape') {
          (document.activeElement as HTMLElement).blur();
        }
        return;
      }

      if (e.code === 'F3') {
        e.preventDefault();
        this.debugVisible = !this.debugVisible;
        document.getElementById('debug-overlay')?.classList.toggle('hidden', !this.debugVisible);
        return;
      }

      if (!this.isPlaying) return;

      if (e.code === 'KeyE') {
        e.preventDefault();
        if (this.ui.activeScreen === 'playing') {
          this.player.keys.clear();
          this.player.leftMouseDown = false;
          this.releasePointerLock();
          this.ui.showScreen('inventory', this.player.gameMode);
        } else if (this.ui.activeScreen === 'inventory' || this.ui.activeScreen === 'crafting') {
          this.resumeGameplay();
        }
        return;
      }

      if (e.code === 'KeyC') {
        e.preventDefault();
        if (this.ui.activeScreen === 'playing') {
          this.player.keys.clear();
          this.player.leftMouseDown = false;
          this.releasePointerLock();
          this.ui.showScreen('crafting', this.player.gameMode);
        } else if (this.ui.activeScreen === 'crafting' || this.ui.activeScreen === 'inventory') {
          this.resumeGameplay();
        }
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.ui.activeScreen === 'playing') {
          this.player.keys.clear();
          this.player.leftMouseDown = false;
          this.releasePointerLock();
          this.ui.showScreen('paused', this.player.gameMode);
        } else if (
          this.ui.activeScreen === 'paused' ||
          this.ui.activeScreen === 'inventory' ||
          this.ui.activeScreen === 'crafting'
        ) {
          this.resumeGameplay();
        }
        return;
      }

      if (this.ui.activeScreen !== 'playing') return;

      // Hotbar selection 1-9
      if (e.code.startsWith('Digit')) {
        const num = Number(e.code.replace('Digit', ''));
        if (num >= 1 && num <= 9) {
          this.inventory.selectHotbarSlot(num - 1);
          return;
        }
      }

      // Creative mode flight shortcut (F or double-tap Space)
      if (e.code === 'KeyF' && !e.repeat && this.player.gameMode === 'creative') {
        this.player.state.flying = !this.player.state.flying;
        this.player.state.vy = 0;
        return;
      }

      if (e.code === 'Space' && !e.repeat) {
        this.player.handleSpaceKeyDown();
      }

      this.player.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.player.keys.delete(e.code);
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPlaying || this.ui.activeScreen !== 'playing') return;
      if (document.pointerLockElement === this.renderer.domElement) {
        this.player.handleMouseMove(e.movementX, e.movementY);
      }
    });

    this.renderer.domElement.addEventListener('mousedown', (e) => {
      if (!this.isPlaying || this.ui.activeScreen !== 'playing') return;
      this.requestPointerLock();

      if (e.button === 0) {
        this.player.leftMouseDown = true;
        this.effects.triggerHandSwing();
        this.tryAttackOrStartMining();
      } else if (e.button === 2) {
        this.player.rightMouseDown = true;
        this.tryInteractOrPlaceBlock();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.player.leftMouseDown = false;
        this.miningProgress = 0;
        this.miningTargetKey = '';
      } else if (e.button === 2) {
        this.player.rightMouseDown = false;
      }
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.isPlaying || this.ui.activeScreen !== 'playing') return;
        this.inventory.cycleHotbar(e.deltaY);
      },
      { passive: true }
    );
  }

  private tryAttackOrStartMining(): void {
    // Check if aiming at a creature within melee range first
    const selItem = this.inventory.getSelectedItemDef();
    const attackDamage = selItem?.attackDamage ?? 2;
    const attackRes = this.creatures.tryAttackCreatureAtRay(
      this.camera.position,
      this.player.getForwardDirection(),
      attackDamage
    );
    if (attackRes) {
      this.sound.playMineHit('wood');
      this.inventory.damageSelectedTool(1, this.player.gameMode === 'creative');
      if (attackRes.killed) {
        this.ui.showToast(`Defeated ${attackRes.hitCreature.name}`);
      }
      return;
    }

    // In Creative mode, instant break on left-click
    if (this.player.gameMode === 'creative') {
      const hit = this.player.getTargetBlock(this.world);
      if (hit) {
        this.breakTargetedBlock(hit);
      }
    }
  }

  public canHarvestBlock(blockId: BlockId): { canHarvest: boolean; speedMultiplier: number } {
    const def = BLOCK_DEFINITIONS[blockId];
    if (!def || def.hardness < 0) {
      return { canHarvest: this.player.gameMode === 'creative', speedMultiplier: 0 };
    }
    if (this.player.gameMode === 'creative') {
      return { canHarvest: true, speedMultiplier: 999 };
    }

    const held = this.inventory.getSelectedItemDef();
    const matchesTool =
      def.preferredTool !== 'none' && held?.toolType === def.preferredTool;
    const heldTier = matchesTool ? (held?.toolTier ?? 0) : 0;
    const canHarvest = heldTier >= def.minToolTier;
    const speedMultiplier = matchesTool
      ? (held?.miningSpeedMultiplier ?? 1)
      : canHarvest
      ? 1.0
      : 0.35;

    return { canHarvest, speedMultiplier };
  }

  public breakTargetedBlock(hit: RaycastHit): boolean {
    const def = BLOCK_DEFINITIONS[hit.blockId];
    if (!def) return false;
    if (def.hardness < 0 && this.player.gameMode !== 'creative') return false;

    const { canHarvest } = this.canHarvestBlock(hit.blockId);
    const changed = this.world.setBlock(hit.bx, hit.by, hit.bz, BlockId.AIR, true);
    if (!changed) return false;

    this.sound.playBlockBreak(def.soundCategory);
    this.effects.spawnBlockParticles(hit.bx, hit.by, hit.bz, def.particleColor, 16);
    this.effects.triggerHandSwing();

    if (this.player.gameMode === 'survival') {
      if (canHarvest && def.dropItemKey && def.dropCount > 0) {
        const leftover = this.inventory.addItem(def.dropItemKey, def.dropCount);
        if (leftover < def.dropCount) {
          this.sound.playItemPickup();
        }
        if (def.dropItemKey === 'wood' || def.dropItemKey === 'pine_wood') {
          this.progression.gatheredWood = true;
        }
        if (def.dropItemKey === 'cobblestone') {
          this.progression.minedStone = true;
        }
        this.ui.updateTutorialHint(this.progression, this.player.gameMode);
      }

      const brokeTool = this.inventory.damageSelectedTool(1, false);
      if (brokeTool) {
        this.ui.showToast('Your tool wore out and broke!');
      }
    }

    this.miningProgress = 0;
    this.miningTargetKey = '';
    return true;
  }

  public tryInteractOrPlaceBlock(): boolean {
    const hit = this.player.getTargetBlock(this.world);
    if (!hit) return false;

    // Clicking on a placed Crafting Bench opens the Crafting Workshop!
    if (hit.blockId === BlockId.CRAFTING_TABLE && !this.player.keys.has('ShiftLeft')) {
      this.player.keys.clear();
      this.player.rightMouseDown = false;
      this.releasePointerLock();
      this.ui.showScreen('crafting', this.player.gameMode);
      return true;
    }

    const selSlot = this.inventory.getSelectedSlot();
    const selDef = this.inventory.getSelectedItemDef();
    if (!selSlot || !selDef || selDef.category !== 'block' || selDef.blockId === undefined) {
      return false;
    }

    const targetDef = BLOCK_DEFINITIONS[hit.blockId];
    // If targeted block is replaceable (e.g., tall grass), replace it directly; otherwise offset by hit normal
    const placeX = targetDef?.replaceable ? hit.bx : hit.bx + hit.nx;
    const placeY = targetDef?.replaceable ? hit.by : hit.by + hit.ny;
    const placeZ = targetDef?.replaceable ? hit.bz : hit.bz + hit.nz;

    if (placeY < 1 || placeY >= 95) return false;

    const existing = this.world.getBlock(placeX, placeY, placeZ);
    const existingDef = BLOCK_DEFINITIONS[existing];
    if (existing !== BlockId.AIR && !existingDef?.replaceable) {
      return false;
    }

    const blockToPlace = BLOCK_DEFINITIONS[selDef.blockId];
    if (
      blockToPlace.solid &&
      wouldBlockOverlapPlayer(
        placeX,
        placeY,
        placeZ,
        this.player.state.x,
        this.player.state.y,
        this.player.state.z
      )
    ) {
      return false;
    }

    const placed = this.world.setBlock(placeX, placeY, placeZ, selDef.blockId, true);
    if (!placed) return false;

    this.inventory.consumeSelectedOne(this.player.gameMode === 'creative');
    this.sound.playBlockPlace(blockToPlace.soundCategory);
    this.effects.spawnBlockParticles(placeX, placeY, placeZ, blockToPlace.particleColor, 6);
    this.effects.triggerHandSwing();

    this.progression.placedBlocks++;
    this.ui.updateTutorialHint(this.progression, this.player.gameMode);
    this.placeCooldown = 0.22;
    return true;
  }

  private updateMiningAndPlacement(dt: number): void {
    if (this.placeCooldown > 0) {
      this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    }

    const hit = this.player.getTargetBlock(this.world);
    if (!hit) {
      this.miningProgress = 0;
      this.miningTargetKey = '';
      this.effects.updateTargetHighlight(null, 0);
      this.ui.updateTargetIndicator(null, 0, true);
      return;
    }

    const { canHarvest, speedMultiplier } = this.canHarvestBlock(hit.blockId);

    if (this.player.leftMouseDown && this.ui.activeScreen === 'playing') {
      const key = `${hit.bx},${hit.by},${hit.bz}`;
      if (this.miningTargetKey !== key) {
        this.miningTargetKey = key;
        this.miningProgress = 0;
      }

      const def = BLOCK_DEFINITIONS[hit.blockId];
      if (def && def.hardness >= 0) {
        const effectiveTime = Math.max(0.06, def.hardness / Math.max(0.1, speedMultiplier));
        this.miningProgress += dt / effectiveTime;
        this.mineSoundTimer += dt;

        if (this.mineSoundTimer >= 0.22) {
          this.mineSoundTimer = 0;
          this.sound.playMineHit(def.soundCategory);
          this.effects.triggerHandSwing();
          this.effects.spawnBlockParticles(hit.bx, hit.by, hit.bz, def.particleColor, 2);
        }

        if (this.miningProgress >= 1.0) {
          this.breakTargetedBlock(hit);
        }
      }
    } else {
      this.miningProgress = 0;
      this.miningTargetKey = '';
    }

    if (
      this.player.rightMouseDown &&
      this.placeCooldown <= 0 &&
      this.ui.activeScreen === 'playing'
    ) {
      this.tryInteractOrPlaceBlock();
    }

    this.effects.updateTargetHighlight(hit, this.miningProgress);
    this.ui.updateTargetIndicator(hit, this.miningProgress, canHarvest);
  }

  private animate(now: number): void {
    requestAnimationFrame(this.animate);

    const rawDt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    const dt = Math.min(rawDt, 0.1);

    // FPS tracking
    this.fpsFrames++;
    this.fpsAccum += rawDt;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsFrames = 0;
      this.fpsAccum = 0;
    }

    if (this.isPlaying) {
      const controlsActive = this.ui.activeScreen === 'playing';
      this.player.update(this.world, dt, controlsActive);
      this.world.updateAroundPlayer(this.player.state.x, this.player.state.z);
      this.updateMiningAndPlacement(dt);

      const underwater = isCameraUnderwater(
        this.world,
        this.player.state.x,
        this.player.state.y,
        this.player.state.z
      );
      document.getElementById('underwater-overlay')?.classList.toggle('hidden', !underwater);
      document
        .getElementById('damage-overlay')
        ?.classList.toggle('hidden', this.player.damageFlashTimer <= 0);

      this.environment.update(
        dt,
        this.camera.position,
        this.world.renderDistance,
        underwater
      );

      this.creatures.update(
        dt,
        this.world,
        new THREE.Vector3(this.player.state.x, this.player.state.y, this.player.state.z),
        this.environment.isNight(),
        this.player.gameMode === 'survival',
        (dmg, attackerName) => {
          this.player.takeDamage(dmg, attackerName);
          this.ui.showToast(`Attacked by ${attackerName}!`);
        }
      );

      this.effects.update(dt);

      const biome = this.world.getBiomeAt(this.player.state.x, this.player.state.z);
      this.ui.updateHUDStatus(
        this.currentWorldName,
        this.player.gameMode,
        this.player.state.flying,
        biome.name,
        this.environment.getPhaseLabel(),
        this.player.state.x,
        this.player.state.y,
        this.player.state.z
      );

      if (this.debugVisible) {
        this.updateDebugPanel(biome.name);
      }

      // Periodic autosave every 20 seconds
      this.autosaveTimer += dt;
      if (this.autosaveTimer >= 20) {
        this.autosaveTimer = 0;
        void this.saveCurrentWorld();
      }
    } else {
      // Main menu scenic camera orbit
      this.menuOrbitAngle += dt * 0.12;
      const radius = 22;
      const cx = 8 + Math.cos(this.menuOrbitAngle) * radius;
      const cz = 8 + Math.sin(this.menuOrbitAngle) * radius;
      this.camera.position.set(cx, 54, cz);
      this.camera.lookAt(8, 38, 8);
      this.environment.update(dt, this.camera.position, this.world.renderDistance, false);
    }

    this.renderer.render(this.scene, this.camera);
  }

  private updateDebugPanel(biomeName: string): void {
    const el = document.getElementById('debug-overlay');
    if (!el) return;
    const { cx, cz } = worldToChunkCoords(this.player.state.x, this.player.state.z);
    el.textContent = [
      `VOXEL FRONTIER v1.0 — F3 Debug`,
      `FPS: ${this.fps} | Render Dist: ${this.world.renderDistance} chunks`,
      `Seed: "${this.currentSeed}" (${this.world.generator.numericSeed})`,
      `XYZ: ${this.player.state.x.toFixed(2)}, ${this.player.state.y.toFixed(2)}, ${this.player.state.z.toFixed(2)}`,
      `Vel: ${this.player.state.vx.toFixed(2)}, ${this.player.state.vy.toFixed(2)}, ${this.player.state.vz.toFixed(2)}`,
      `Chunk: (${cx}, ${cz}) | Loaded: ${this.world.getLoadedChunkCount()} | Modified Blocks: ${this.world.getModifiedBlockCount()}`,
      `Biome: ${biomeName} | Grounded: ${this.player.state.onGround} | Flying: ${this.player.state.flying}`,
      `Time: ${(this.environment.timeOfDay * 24).toFixed(1)}h (${this.environment.getPhaseLabel()}) | Creatures: ${this.creatures.creatures.length}`,
    ].join('\n');
  }

  // Helper method for crafting by recipe ID
  public craftById(recipeId: string, times = 1): number {
    const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return 0;
    const crafted = CraftingSystem.craft(recipe, this.inventory, times);
    if (crafted > 0) {
      this.ui.onCraftedRecipe?.(recipe, crafted);
    }
    return crafted;
  }
}

declare global {
  interface Window {
    __VOXEL_FRONTIER__?: VoxelFrontierGame;
    BlockId?: typeof BlockId;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('canvas-container');
  if (container) {
    const game = new VoxelFrontierGame(container);
    window.__VOXEL_FRONTIER__ = game;
    window.BlockId = BlockId;
  }
});
