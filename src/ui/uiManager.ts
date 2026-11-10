import { BLOCK_DEFINITIONS } from '../world/blocks';
import { CREATIVE_PALETTE_ITEMS, getItemDef } from '../items/registry';
import { HOTBAR_SIZE, INVENTORY_SIZE, InventoryManager, InventorySlot } from '../items/inventory';
import { CRAFTING_RECIPES, CraftingRecipe, CraftingSystem } from '../items/crafting';
import { getItemIconDataUrl } from '../rendering/textures';
import { GameSettings, ProgressionState, WorldSaveData } from '../storage/saveSystem';
import { GameMode } from '../player/controller';
import { RaycastHit } from '../player/physics';
import { SoundManager } from '../audio/sound';

export type ActiveScreen =
  | 'main_menu'
  | 'create_world'
  | 'load_world'
  | 'playing'
  | 'inventory'
  | 'crafting'
  | 'paused'
  | 'settings'
  | 'controls';

export class UIManager {
  public activeScreen: ActiveScreen = 'main_menu';
  private returnScreenAfterSubModal: ActiveScreen = 'main_menu';
  private selectedInventorySlot: number | null = null;
  private craftingFilter = 'all';
  private selectedCreateMode: GameMode = 'survival';

  private readonly inventory: InventoryManager;
  private readonly sound: SoundManager;

  // Callbacks to main Game controller
  public onQuickPlay?: () => void;
  public onCreateWorld?: (name: string, seed: string, mode: GameMode) => void;
  public onLoadWorld?: (worldId: string) => void;
  public onDeleteWorld?: (worldId: string) => Promise<void>;
  public onRequestWorldList?: () => Promise<WorldSaveData[]>;
  public onResumeGame?: () => void;
  public onSaveGame?: () => Promise<void>;
  public onToggleGameMode?: () => void;
  public onExitToMainMenu?: () => Promise<void>;
  public onApplySettings?: (settings: GameSettings) => void;
  public onCraftedRecipe?: (recipe: CraftingRecipe, count: number) => void;

  constructor(inventory: InventoryManager, sound: SoundManager) {
    this.inventory = inventory;
    this.sound = sound;
    this.bindEvents();
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
  }

  private bindEvents(): void {
    // Main Menu buttons
    this.el('btn-quick-play').addEventListener('click', () => {
      this.sound.playUIClick();
      this.onQuickPlay?.();
    });
    this.el('btn-open-create').addEventListener('click', () => {
      this.sound.playUIClick();
      this.showScreen('create_world');
    });
    this.el('btn-open-load').addEventListener('click', () => {
      this.sound.playUIClick();
      void this.openLoadWorldModal();
    });
    this.el('btn-open-settings-main').addEventListener('click', () => {
      this.sound.playUIClick();
      this.returnScreenAfterSubModal = 'main_menu';
      this.showScreen('settings');
    });
    this.el('btn-open-controls-main').addEventListener('click', () => {
      this.sound.playUIClick();
      this.returnScreenAfterSubModal = 'main_menu';
      this.showScreen('controls');
    });

    // Create World Modal
    this.el('btn-close-create').addEventListener('click', () => this.showScreen('main_menu'));
    this.el('btn-cancel-create').addEventListener('click', () => this.showScreen('main_menu'));
    this.el('btn-random-seed').addEventListener('click', () => {
      this.sound.playUIClick();
      const adjectives = ['Emerald', 'Golden', 'Crystal', 'Misty', 'Whispering', 'Sunlit', 'Ancient'];
      const nouns = ['Peaks', 'Valley', 'Frontier', 'Horizon', 'Wilds', 'Timber', 'Canyon'];
      const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
      const noun = nouns[Math.floor(Math.random() * nouns.length)];
      const num = Math.floor(1000 + Math.random() * 9000);
      this.el<HTMLInputElement>('input-world-seed').value = `${adj}${noun}${num}`;
    });

    const modeSurvivalBtn = this.el('btn-mode-survival');
    const modeCreativeBtn = this.el('btn-mode-creative');
    modeSurvivalBtn.addEventListener('click', () => {
      this.selectedCreateMode = 'survival';
      modeSurvivalBtn.classList.add('active');
      modeCreativeBtn.classList.remove('active');
    });
    modeCreativeBtn.addEventListener('click', () => {
      this.selectedCreateMode = 'creative';
      modeCreativeBtn.classList.add('active');
      modeSurvivalBtn.classList.remove('active');
    });

    this.el('btn-confirm-create').addEventListener('click', () => {
      this.sound.playUIClick();
      const name = this.el<HTMLInputElement>('input-world-name').value.trim() || 'Frontier World';
      const seed = this.el<HTMLInputElement>('input-world-seed').value.trim() || 'VoxelFrontier2026';
      this.onCreateWorld?.(name, seed, this.selectedCreateMode);
    });

    // Load World Modal
    this.el('btn-close-load').addEventListener('click', () => this.showScreen('main_menu'));
    this.el('btn-back-load').addEventListener('click', () => this.showScreen('main_menu'));
    this.el('btn-new-from-load').addEventListener('click', () => this.showScreen('create_world'));

    // Inventory & Crafting Modal
    this.el('tab-btn-inventory').addEventListener('click', () => {
      this.sound.playUIClick();
      this.showScreen('inventory');
    });
    this.el('tab-btn-crafting').addEventListener('click', () => {
      this.sound.playUIClick();
      this.showScreen('crafting');
    });
    this.el('btn-close-inventory').addEventListener('click', () => {
      this.sound.playUIClick();
      this.onResumeGame?.();
    });

    // Crafting filter chips
    document.querySelectorAll('.filter-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.craftingFilter = (btn as HTMLElement).dataset.filter || 'all';
        this.renderCraftingRecipes();
      });
    });

    // Pause Modal
    this.el('btn-resume-game').addEventListener('click', () => {
      this.sound.playUIClick();
      this.onResumeGame?.();
    });
    this.el('btn-save-game').addEventListener('click', async () => {
      this.sound.playUIClick();
      await this.onSaveGame?.();
    });
    this.el('btn-toggle-gamemode').addEventListener('click', () => {
      this.sound.playUIClick();
      this.onToggleGameMode?.();
    });
    this.el('btn-open-settings-pause').addEventListener('click', () => {
      this.sound.playUIClick();
      this.returnScreenAfterSubModal = 'paused';
      this.showScreen('settings');
    });
    this.el('btn-open-controls-pause').addEventListener('click', () => {
      this.sound.playUIClick();
      this.returnScreenAfterSubModal = 'paused';
      this.showScreen('controls');
    });
    this.el('btn-exit-main-menu').addEventListener('click', async () => {
      this.sound.playUIClick();
      await this.onExitToMainMenu?.();
    });

    // Settings Modal live labels & save
    const sensInput = this.el<HTMLInputElement>('setting-sensitivity');
    const fovInput = this.el<HTMLInputElement>('setting-fov');
    const rdInput = this.el<HTMLInputElement>('setting-render-dist');
    const mVolInput = this.el<HTMLInputElement>('setting-master-vol');
    const sVolInput = this.el<HTMLInputElement>('setting-sfx-vol');

    sensInput.addEventListener('input', () => {
      this.el('val-sensitivity').textContent = Number(sensInput.value).toFixed(1);
    });
    fovInput.addEventListener('input', () => {
      this.el('val-fov').textContent = `${fovInput.value}°`;
    });
    rdInput.addEventListener('input', () => {
      this.el('val-render-dist').textContent = `${rdInput.value} Chunks`;
    });
    mVolInput.addEventListener('input', () => {
      this.el('val-master-vol').textContent = `${mVolInput.value}%`;
    });
    sVolInput.addEventListener('input', () => {
      this.el('val-sfx-vol').textContent = `${sVolInput.value}%`;
    });

    const closeAndSaveSettings = () => {
      this.sound.playUIClick();
      const s: GameSettings = {
        mouseSensitivity: Number(sensInput.value),
        fov: Number(fovInput.value),
        renderDistance: Number(rdInput.value),
        masterVolume: Number(mVolInput.value) / 100,
        sfxVolume: Number(sVolInput.value) / 100,
        muted: this.el<HTMLInputElement>('setting-mute').checked,
        graphicsQuality: this.el<HTMLSelectElement>('setting-graphics').value as GameSettings['graphicsQuality'],
        shadowQuality: this.el<HTMLSelectElement>('setting-shadows').value as GameSettings['shadowQuality'],
      };
      this.onApplySettings?.(s);
      this.showScreen(this.returnScreenAfterSubModal);
    };

    this.el('btn-close-settings').addEventListener('click', closeAndSaveSettings);
    this.el('btn-save-settings').addEventListener('click', closeAndSaveSettings);

    // Controls Modal
    const closeControls = () => {
      this.sound.playUIClick();
      this.showScreen(this.returnScreenAfterSubModal);
    };
    this.el('btn-close-controls').addEventListener('click', closeControls);
    this.el('btn-done-controls').addEventListener('click', closeControls);
  }

  public syncSettingsInputs(settings: GameSettings): void {
    this.el<HTMLInputElement>('setting-sensitivity').value = String(settings.mouseSensitivity);
    this.el('val-sensitivity').textContent = settings.mouseSensitivity.toFixed(1);

    this.el<HTMLInputElement>('setting-fov').value = String(settings.fov);
    this.el('val-fov').textContent = `${settings.fov}°`;

    this.el<HTMLInputElement>('setting-render-dist').value = String(settings.renderDistance);
    this.el('val-render-dist').textContent = `${settings.renderDistance} Chunks`;

    const mv = Math.round(settings.masterVolume * 100);
    this.el<HTMLInputElement>('setting-master-vol').value = String(mv);
    this.el('val-master-vol').textContent = `${mv}%`;

    const sv = Math.round(settings.sfxVolume * 100);
    this.el<HTMLInputElement>('setting-sfx-vol').value = String(sv);
    this.el('val-sfx-vol').textContent = `${sv}%`;

    this.el<HTMLInputElement>('setting-mute').checked = settings.muted;
    this.el<HTMLSelectElement>('setting-graphics').value = settings.graphicsQuality;
    this.el<HTMLSelectElement>('setting-shadows').value = settings.shadowQuality;
  }

  public showScreen(screen: ActiveScreen, currentMode: GameMode = 'survival'): void {
    this.activeScreen = screen;
    this.selectedInventorySlot = null;

    const modals = [
      'main-menu',
      'create-world-modal',
      'load-world-modal',
      'inventory-modal',
      'pause-modal',
      'settings-modal',
      'controls-modal',
    ];
    for (const id of modals) {
      this.el(id).classList.add('hidden');
    }

    const hud = this.el('hud');
    if (screen === 'main_menu' || screen === 'create_world' || screen === 'load_world') {
      hud.classList.add('hidden');
    } else if (
      (screen === 'settings' || screen === 'controls') &&
      this.returnScreenAfterSubModal === 'main_menu'
    ) {
      hud.classList.add('hidden');
    } else {
      hud.classList.remove('hidden');
    }

    if (screen === 'main_menu') {
      this.el('main-menu').classList.remove('hidden');
    } else if (screen === 'create_world') {
      this.el('create-world-modal').classList.remove('hidden');
    } else if (screen === 'load_world') {
      this.el('load-world-modal').classList.remove('hidden');
    } else if (screen === 'inventory' || screen === 'crafting') {
      this.el('inventory-modal').classList.remove('hidden');
      const isInv = screen === 'inventory';
      this.el('tab-btn-inventory').classList.toggle('active', isInv);
      this.el('tab-btn-crafting').classList.toggle('active', !isInv);
      this.el('view-inventory').classList.toggle('hidden', !isInv);
      this.el('view-crafting').classList.toggle('hidden', isInv);

      const creativeSec = this.el('creative-catalog-section');
      creativeSec.classList.toggle('hidden', currentMode !== 'creative');
      if (isInv) {
        this.renderInventoryModal(currentMode);
      } else {
        this.renderCraftingRecipes();
      }
    } else if (screen === 'paused') {
      this.el('pause-modal').classList.remove('hidden');
    } else if (screen === 'settings') {
      this.el('settings-modal').classList.remove('hidden');
    } else if (screen === 'controls') {
      this.el('controls-modal').classList.remove('hidden');
    }
  }

  public async openLoadWorldModal(): Promise<void> {
    this.showScreen('load_world');
    const container = this.el('saved-worlds-list');
    container.innerHTML = '<div style="color:var(--text-muted);padding:16px;">Loading saved worlds...</div>';

    const worlds = (await this.onRequestWorldList?.()) ?? [];
    container.innerHTML = '';

    if (worlds.length === 0) {
      container.innerHTML =
        '<div style="color:var(--text-muted);padding:20px;text-align:center;">No saved worlds yet. Create a new world to start exploring!</div>';
      return;
    }

    for (const w of worlds) {
      const card = document.createElement('div');
      card.className = 'saved-world-card';

      const dateStr = new Date(w.updatedAt).toLocaleString();
      const modCount = Object.values(w.chunkModifications || {}).reduce(
        (acc, arr) => acc + arr.length,
        0
      );

      card.innerHTML = `
        <div class="sw-info">
          <div class="sw-title-row">
            <span>${this.escapeHtml(w.name)}</span>
            <span class="mode-badge ${w.gameMode}">${w.gameMode.toUpperCase()}</span>
          </div>
          <div class="sw-meta">Seed: ${this.escapeHtml(w.seed)} • Edited Blocks: ${modCount} • Saved: ${dateStr}</div>
        </div>
        <div class="sw-actions">
          <button class="btn btn-primary btn-sm btn-load-item">Play</button>
          <button class="btn btn-danger btn-sm btn-delete-item">Delete</button>
        </div>
      `;

      card.querySelector('.btn-load-item')!.addEventListener('click', () => {
        this.sound.playUIClick();
        this.onLoadWorld?.(w.id);
      });

      card.querySelector('.btn-delete-item')!.addEventListener('click', async () => {
        this.sound.playUIClick();
        await this.onDeleteWorld?.(w.id);
        await this.openLoadWorldModal();
      });

      container.appendChild(card);
    }
  }

  public renderHotbar(): void {
    const hotbarEl = this.el('hotbar');
    hotbarEl.innerHTML = '';

    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = this.inventory.slots[i];
      const cell = this.createSlotElement(slot, i, i === this.inventory.selectedHotbarIndex, true);
      cell.addEventListener('click', () => {
        this.inventory.selectHotbarSlot(i);
      });
      hotbarEl.appendChild(cell);
    }

    const selDef = this.inventory.getSelectedItemDef();
    const selSlot = this.inventory.getSelectedSlot();
    const banner = this.el('selected-item-banner');
    if (selDef && selSlot) {
      if (selDef.category === 'tool' && selDef.maxDurability) {
        const dur = selSlot.durability ?? selDef.maxDurability;
        banner.textContent = `${selDef.name} (${dur}/${selDef.maxDurability})`;
      } else {
        banner.textContent = selDef.name;
      }
    } else {
      banner.textContent = 'Empty Hand';
    }
  }

  public renderInventoryModal(mode: GameMode = 'survival'): void {
    const backpackGrid = this.el('backpack-grid');
    const modalHotbarGrid = this.el('modal-hotbar-grid');
    backpackGrid.innerHTML = '';
    modalHotbarGrid.innerHTML = '';

    // Backpack slots 9..35
    for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) {
      const cell = this.createInteractiveInventoryCell(i);
      backpackGrid.appendChild(cell);
    }

    // Hotbar slots 0..8
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const cell = this.createInteractiveInventoryCell(i, true);
      modalHotbarGrid.appendChild(cell);
    }

    if (mode === 'creative') {
      const creativeGrid = this.el('creative-catalog-grid');
      creativeGrid.innerHTML = '';
      for (const itemId of CREATIVE_PALETTE_ITEMS) {
        const def = getItemDef(itemId);
        if (!def) continue;
        const dummySlot: InventorySlot = {
          itemId,
          count: def.maxStack,
          durability: def.maxDurability,
        };
        const cell = this.createSlotElement(dummySlot, -1, false, false);
        cell.title = `${def.name} — Click to add to Hotbar`;
        cell.addEventListener('click', () => {
          this.sound.playItemPickup();
          this.inventory.slots[this.inventory.selectedHotbarIndex] = { ...dummySlot };
          this.inventory.onChange?.();
          this.renderInventoryModal(mode);
          this.showToast(`Equipped ${def.name} in slot ${this.inventory.selectedHotbarIndex + 1}`);
        });
        creativeGrid.appendChild(cell);
      }
    }
  }

  private createInteractiveInventoryCell(slotIdx: number, showKeyNum = false): HTMLElement {
    const slot = this.inventory.slots[slotIdx];
    const isSelectedSource = this.selectedInventorySlot === slotIdx;
    const cell = this.createSlotElement(slot, slotIdx, isSelectedSource, showKeyNum);
    cell.dataset.slotIndex = String(slotIdx);

    // Hover details
    cell.addEventListener('mouseenter', () => {
      this.updateItemDetailBar(slot);
    });

    // Left-click: pick up, move, merge, or swap
    cell.addEventListener('click', (e) => {
      e.preventDefault();
      this.sound.playUIClick();
      if (this.selectedInventorySlot === null) {
        if (slot) {
          this.selectedInventorySlot = slotIdx;
          this.renderInventoryModal(this.getCurrentModeFromBadge());
        }
      } else {
        const fromIdx = this.selectedInventorySlot;
        this.selectedInventorySlot = null;
        if (fromIdx !== slotIdx) {
          this.inventory.moveOrMergeSlot(fromIdx, slotIdx);
        }
        this.renderInventoryModal(this.getCurrentModeFromBadge());
      }
    });

    // Right-click: split stack in half
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (slot && slot.count >= 2) {
        this.sound.playUIClick();
        this.inventory.splitSlot(slotIdx);
        this.renderInventoryModal(this.getCurrentModeFromBadge());
      }
    });

    // HTML5 Drag & Drop support
    if (slot) {
      cell.draggable = true;
      cell.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/plain', String(slotIdx));
      });
    }
    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      const fromStr = e.dataTransfer?.getData('text/plain');
      if (fromStr !== undefined && fromStr !== '') {
        const fromIdx = Number(fromStr);
        if (!Number.isNaN(fromIdx) && fromIdx !== slotIdx) {
          this.sound.playUIClick();
          this.selectedInventorySlot = null;
          this.inventory.moveOrMergeSlot(fromIdx, slotIdx);
          this.renderInventoryModal(this.getCurrentModeFromBadge());
        }
      }
    });

    return cell;
  }

  private getCurrentModeFromBadge(): GameMode {
    return this.el('hud-mode-badge').classList.contains('creative') ? 'creative' : 'survival';
  }

  private updateItemDetailBar(slot: InventorySlot | null): void {
    const bar = this.el('item-detail-bar');
    if (!slot) {
      bar.innerHTML = '<span>Empty Slot — Click or drag an item here.</span>';
      return;
    }
    const def = getItemDef(slot.itemId);
    if (!def) return;

    let stats = `Stack: ${slot.count}/${def.maxStack}`;
    if (def.category === 'tool' && def.maxDurability) {
      const dur = slot.durability ?? def.maxDurability;
      stats = `Speed: ${def.miningSpeedMultiplier}× • Durability: ${dur}/${def.maxDurability}`;
    }

    bar.innerHTML = `
      <div><strong>${def.name}</strong> — <span style="color:var(--text-muted)">${def.description}</span></div>
      <div style="font-family:var(--font-mono);font-size:0.78rem;color:var(--accent-amber)">${stats}</div>
    `;
  }

  private createSlotElement(
    slot: InventorySlot | null,
    slotIndex: number,
    isActive: boolean,
    showKeyNum: boolean
  ): HTMLElement {
    const cell = document.createElement('div');
    cell.className = `slot-cell${isActive ? ' active' : ''}`;

    if (showKeyNum && slotIndex >= 0 && slotIndex < 9) {
      const keySpan = document.createElement('span');
      keySpan.className = 'slot-key-num';
      keySpan.textContent = String(slotIndex + 1);
      cell.appendChild(keySpan);
    }

    if (slot) {
      const def = getItemDef(slot.itemId);
      const img = document.createElement('img');
      img.className = 'slot-icon';
      img.src = getItemIconDataUrl(slot.itemId);
      img.alt = def?.name ?? slot.itemId;
      cell.appendChild(img);

      if (slot.count > 1) {
        const countEl = document.createElement('span');
        countEl.className = 'slot-count';
        countEl.textContent = String(slot.count);
        cell.appendChild(countEl);
      }

      if (def?.maxDurability && slot.durability !== undefined) {
        const durWrap = document.createElement('div');
        durWrap.className = 'slot-durability';
        const durFill = document.createElement('div');
        durFill.className = 'slot-durability-fill';
        const pct = Math.max(0, Math.min(100, (slot.durability / def.maxDurability) * 100));
        durFill.style.width = `${pct}%`;
        durFill.style.background = pct > 50 ? '#68d359' : pct > 25 ? '#f5b041' : '#e05252';
        durWrap.appendChild(durFill);
        cell.appendChild(durWrap);
      }
    }

    return cell;
  }

  public renderCraftingRecipes(): void {
    const container = this.el('recipes-list');
    container.innerHTML = '';

    const filtered = CRAFTING_RECIPES.filter((r) => {
      if (this.craftingFilter === 'all') return true;
      if (this.craftingFilter === 'craftable') {
        return CraftingSystem.canCraft(r, this.inventory);
      }
      if (this.craftingFilter === 'building') {
        return r.category === 'building' || r.category === 'smelting';
      }
      return r.category === this.craftingFilter;
    });

    for (const recipe of filtered) {
      const canCraft = CraftingSystem.canCraft(recipe, this.inventory);
      const maxTimes = CraftingSystem.maxCraftableCount(recipe, this.inventory);
      const card = document.createElement('div');
      card.className = `recipe-card${canCraft ? ' craftable' : ''}`;
      card.dataset.recipeId = recipe.id;

      const ingsHtml = recipe.ingredients
        .map((ing) => {
          const have = this.inventory.getItemCount(ing.itemId);
          const ingDef = getItemDef(ing.itemId);
          const ok = have >= ing.count;
          return `<span class="ing-pill ${ok ? 'ok' : 'missing'}">${ingDef?.name ?? ing.itemId}: ${have}/${ing.count}</span>`;
        })
        .join('');

      card.innerHTML = `
        <div>
          <div class="recipe-top">
            <img class="recipe-icon" src="${getItemIconDataUrl(recipe.outputItemId)}" alt="${recipe.name}" />
            <div>
              <div class="recipe-title">${recipe.name} ${recipe.outputCount > 1 ? `×${recipe.outputCount}` : ''}</div>
              <div class="recipe-desc">${recipe.description}</div>
            </div>
          </div>
          <div class="recipe-ings" style="margin-top:8px;">${ingsHtml}</div>
        </div>
        <div class="recipe-actions">
          <button class="btn btn-primary btn-sm btn-craft-one" ${!canCraft ? 'disabled' : ''}>
            Craft ×1
          </button>
          ${
            maxTimes > 1
              ? `<button class="btn btn-secondary btn-sm btn-craft-max">Craft Max (×${Math.min(16, maxTimes)})</button>`
              : ''
          }
        </div>
      `;

      card.querySelector('.btn-craft-one')?.addEventListener('click', () => {
        const crafted = CraftingSystem.craft(recipe, this.inventory, 1);
        if (crafted > 0) {
          this.sound.playCraftSuccess();
          this.onCraftedRecipe?.(recipe, crafted);
          this.renderCraftingRecipes();
          this.renderHotbar();
        }
      });

      card.querySelector('.btn-craft-max')?.addEventListener('click', () => {
        const times = Math.min(16, maxTimes);
        const crafted = CraftingSystem.craft(recipe, this.inventory, times);
        if (crafted > 0) {
          this.sound.playCraftSuccess();
          this.onCraftedRecipe?.(recipe, crafted);
          this.renderCraftingRecipes();
          this.renderHotbar();
        }
      });

      container.appendChild(card);
    }
  }

  public updateHealthBar(health: number, maxHealth: number, mode: GameMode): void {
    const bar = this.el('health-bar');
    if (mode === 'creative') {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    bar.innerHTML = '';

    const hearts = Math.ceil(maxHealth / 2);
    for (let i = 0; i < hearts; i++) {
      const heartVal = health - i * 2;
      const span = document.createElement('span');
      if (heartVal >= 2) {
        span.className = 'heart-icon full';
        span.textContent = '♥';
      } else if (heartVal === 1) {
        span.className = 'heart-icon half';
        span.textContent = '♥';
      } else {
        span.className = 'heart-icon empty';
        span.textContent = '♡';
      }
      bar.appendChild(span);
    }
  }

  public updateHUDStatus(
    worldName: string,
    mode: GameMode,
    flying: boolean,
    biomeName: string,
    timeLabel: string,
    x: number,
    y: number,
    z: number
  ): void {
    this.el('hud-world-name').textContent = worldName;
    const badge = this.el('hud-mode-badge');
    badge.textContent = mode.toUpperCase();
    badge.className = `mode-badge ${mode}`;

    const flyBadge = this.el('hud-fly-badge');
    flyBadge.classList.toggle('hidden', !flying);

    this.el('hud-biome').textContent = biomeName;
    this.el('hud-time').textContent = timeLabel;
    this.el('hud-coords').textContent = `X: ${Math.floor(x)} Y: ${Math.floor(y)} Z: ${Math.floor(z)}`;
    this.el('pause-world-summary').textContent = `${worldName} (${mode.toUpperCase()})`;
  }

  public updateTargetIndicator(
    hit: RaycastHit | null,
    miningProgress: number,
    canHarvest: boolean
  ): void {
    const wrap = this.el('target-indicator');
    if (!hit) {
      wrap.classList.add('hidden');
      return;
    }

    const def = BLOCK_DEFINITIONS[hit.blockId];
    if (!def) {
      wrap.classList.add('hidden');
      return;
    }

    wrap.classList.remove('hidden');
    this.el('target-block-name').textContent = def.name;

    const hintEl = this.el('target-tool-hint');
    if (def.hardness < 0) {
      hintEl.textContent = 'Unbreakable in Survival';
    } else if (!canHarvest && def.minToolTier > 0) {
      const tierName = def.minToolTier === 1 ? 'Wooden' : def.minToolTier === 2 ? 'Stone' : 'Iron';
      hintEl.textContent = `Requires ${tierName} ${def.preferredTool}`;
    } else if (def.preferredTool !== 'none') {
      hintEl.textContent = `Tool: ${def.preferredTool}`;
    } else {
      hintEl.textContent = '';
    }

    const barWrap = this.el('mining-bar-wrap');
    const barFill = this.el('mining-bar-fill');
    if (miningProgress > 0.01) {
      barWrap.classList.remove('hidden');
      barFill.style.width = `${Math.min(100, Math.round(miningProgress * 100))}%`;
    } else {
      barWrap.classList.add('hidden');
    }
  }

  public updateTutorialHint(prog: ProgressionState, mode: GameMode): void {
    const stepEl = this.el('tutorial-step-count');
    const textEl = this.el('tutorial-text');

    if (mode === 'creative') {
      stepEl.textContent = 'CREATIVE';
      textEl.innerHTML =
        'Unlimited blocks! Press <b>E</b> for the Block Palette, or <b>Double-Tap Space</b> to toggle flying.';
      return;
    }

    if (!prog.gatheredWood) {
      stepEl.textContent = '1 / 5';
      textEl.innerHTML =
        'Approach a tree and hold <b>Left-Click</b> on its trunk to harvest <b>Oak or Spruce Logs</b>.';
    } else if (!prog.craftedPlanks) {
      stepEl.textContent = '2 / 5';
      textEl.innerHTML =
        'Press <b>C</b> to open the Crafting Workshop and turn your Logs into <b>Wood Planks</b>.';
    } else if (!prog.craftedPickaxe) {
      stepEl.textContent = '3 / 5';
      textEl.innerHTML =
        'Craft <b>Wooden Sticks</b> and a <b>Wooden Pickaxe</b> in the <b>C</b> Crafting Workshop.';
    } else if (!prog.minedStone) {
      stepEl.textContent = '4 / 5';
      textEl.innerHTML =
        'Select your <b>Pickaxe</b> in the Hotbar (1–9) and mine <b>Stone</b> to collect Cobblestone.';
    } else if (prog.placedBlocks < 5) {
      stepEl.textContent = '5 / 5';
      textEl.innerHTML =
        `Build a shelter! Select blocks in your Hotbar and <b>Right-Click</b> to place (${prog.placedBlocks}/5 placed).`;
    } else {
      stepEl.textContent = 'COMPLETE';
      textEl.innerHTML =
        'Frontier mastered! Upgrade to <b>Stone &amp; Iron Tools</b>, craft <b>Torches</b>, and explore biomes.';
    }
  }

  public showToast(message: string): void {
    const container = this.el('toast-container');
    const item = document.createElement('div');
    item.className = 'toast-item';
    item.textContent = message;
    container.appendChild(item);

    window.setTimeout(() => {
      item.remove();
    }, 2800);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
