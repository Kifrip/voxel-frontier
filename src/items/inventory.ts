import { CREATIVE_PALETTE_ITEMS, getItemDef, ItemDef } from './registry';

export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36; // 0..8 hotbar, 9..35 backpack

export interface InventorySlot {
  itemId: string;
  count: number;
  durability?: number;
}

export class InventoryManager {
  public slots: Array<InventorySlot | null> = new Array(INVENTORY_SIZE).fill(null);
  public selectedHotbarIndex = 0;
  public onChange?: () => void;

  constructor() {
    this.clear();
  }

  public clear(): void {
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      this.slots[i] = null;
    }
    this.notify();
  }

  public populateCreativeDefaults(): void {
    this.clear();
    const starterHotbar = [
      'grass',
      'stone_bricks',
      'planks',
      'wood',
      'glass',
      'torch',
      'cobblestone',
      'sandstone',
      'crafting_table',
    ];
    for (let i = 0; i < HOTBAR_SIZE && i < starterHotbar.length; i++) {
      this.slots[i] = { itemId: starterHotbar[i], count: 64 };
    }
    let idx = HOTBAR_SIZE;
    for (const itemId of CREATIVE_PALETTE_ITEMS) {
      if (starterHotbar.includes(itemId)) continue;
      if (idx >= INVENTORY_SIZE) break;
      const def = getItemDef(itemId);
      if (def) {
        this.slots[idx++] = {
          itemId,
          count: def.maxStack,
          durability: def.maxDurability,
        };
      }
    }
    this.notify();
  }

  public selectHotbarSlot(index: number): void {
    const clamped = ((index % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    if (this.selectedHotbarIndex !== clamped) {
      this.selectedHotbarIndex = clamped;
      this.notify();
    }
  }

  public cycleHotbar(delta: number): void {
    this.selectHotbarSlot(this.selectedHotbarIndex + (delta > 0 ? 1 : -1));
  }

  public getSelectedSlot(): InventorySlot | null {
    return this.slots[this.selectedHotbarIndex];
  }

  public getSelectedItemDef(): ItemDef | undefined {
    const slot = this.getSelectedSlot();
    return slot ? getItemDef(slot.itemId) : undefined;
  }

  public getItemCount(itemId: string): number {
    let total = 0;
    for (const slot of this.slots) {
      if (slot && slot.itemId === itemId) {
        total += slot.count;
      }
    }
    return total;
  }

  // Returns leftover count that could not fit
  public addItem(itemId: string, count = 1, durability?: number): number {
    const def = getItemDef(itemId);
    if (!def || count <= 0) return count;

    let remaining = count;

    // 1. Try merging into existing partial stacks
    if (def.maxStack > 1) {
      for (let i = 0; i < INVENTORY_SIZE && remaining > 0; i++) {
        const slot = this.slots[i];
        if (slot && slot.itemId === itemId && slot.count < def.maxStack) {
          const space = def.maxStack - slot.count;
          const add = Math.min(space, remaining);
          slot.count += add;
          remaining -= add;
        }
      }
    }

    // 2. Fill empty slots (prefer hotbar first, then backpack)
    for (let i = 0; i < INVENTORY_SIZE && remaining > 0; i++) {
      if (this.slots[i] === null) {
        const add = Math.min(def.maxStack, remaining);
        this.slots[i] = {
          itemId,
          count: add,
          durability: durability ?? def.maxDurability,
        };
        remaining -= add;
      }
    }

    this.notify();
    return remaining;
  }

  public removeItem(itemId: string, count = 1): boolean {
    if (this.getItemCount(itemId) < count) return false;
    let remaining = count;
    // Remove from backpack first, then hotbar, or in reverse order
    for (let i = INVENTORY_SIZE - 1; i >= 0 && remaining > 0; i--) {
      const slot = this.slots[i];
      if (slot && slot.itemId === itemId) {
        const take = Math.min(slot.count, remaining);
        slot.count -= take;
        remaining -= take;
        if (slot.count <= 0) {
          this.slots[i] = null;
        }
      }
    }
    this.notify();
    return true;
  }

  public consumeSelectedOne(creativeMode = false): boolean {
    const slot = this.slots[this.selectedHotbarIndex];
    if (!slot || slot.count <= 0) return false;
    if (creativeMode) return true;
    slot.count -= 1;
    if (slot.count <= 0) {
      this.slots[this.selectedHotbarIndex] = null;
    }
    this.notify();
    return true;
  }

  // Returns true if the tool broke
  public damageSelectedTool(amount = 1, creativeMode = false): boolean {
    if (creativeMode) return false;
    const slot = this.slots[this.selectedHotbarIndex];
    if (!slot) return false;
    const def = getItemDef(slot.itemId);
    if (!def || def.category !== 'tool' || !def.maxDurability) return false;

    const curDur = slot.durability ?? def.maxDurability;
    const nextDur = curDur - amount;
    if (nextDur <= 0) {
      this.slots[this.selectedHotbarIndex] = null;
      this.notify();
      return true;
    }
    slot.durability = nextDur;
    this.notify();
    return false;
  }

  public moveOrMergeSlot(fromIdx: number, toIdx: number): void {
    if (
      fromIdx === toIdx ||
      fromIdx < 0 ||
      fromIdx >= INVENTORY_SIZE ||
      toIdx < 0 ||
      toIdx >= INVENTORY_SIZE
    ) {
      return;
    }

    const fromSlot = this.slots[fromIdx];
    const toSlot = this.slots[toIdx];
    if (!fromSlot) return;

    if (!toSlot) {
      this.slots[toIdx] = fromSlot;
      this.slots[fromIdx] = null;
      this.notify();
      return;
    }

    const def = getItemDef(fromSlot.itemId);
    if (def && toSlot.itemId === fromSlot.itemId && def.maxStack > 1 && toSlot.count < def.maxStack) {
      const space = def.maxStack - toSlot.count;
      const transfer = Math.min(space, fromSlot.count);
      toSlot.count += transfer;
      fromSlot.count -= transfer;
      if (fromSlot.count <= 0) {
        this.slots[fromIdx] = null;
      }
      this.notify();
      return;
    }

    // Swap slots
    this.slots[toIdx] = fromSlot;
    this.slots[fromIdx] = toSlot;
    this.notify();
  }

  public splitSlot(slotIdx: number, targetIdx?: number): boolean {
    if (slotIdx < 0 || slotIdx >= INVENTORY_SIZE) return false;
    const slot = this.slots[slotIdx];
    if (!slot || slot.count < 2) return false;

    const splitCount = Math.floor(slot.count / 2);
    let dest = targetIdx;
    if (dest === undefined || this.slots[dest] !== null) {
      dest = this.slots.findIndex((s, i) => s === null && i !== slotIdx);
    }
    if (dest === undefined || dest < 0 || dest >= INVENTORY_SIZE || this.slots[dest] !== null) {
      return false;
    }

    slot.count -= splitCount;
    this.slots[dest] = {
      itemId: slot.itemId,
      count: splitCount,
      durability: slot.durability,
    };
    this.notify();
    return true;
  }

  public serialize(): { slots: Array<InventorySlot | null>; selectedHotbarIndex: number } {
    return {
      slots: this.slots.map((s) => (s ? { ...s } : null)),
      selectedHotbarIndex: this.selectedHotbarIndex,
    };
  }

  public deserialize(data?: { slots?: Array<InventorySlot | null>; selectedHotbarIndex?: number }): void {
    if (!data || !Array.isArray(data.slots)) return;
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const s = data.slots[i];
      if (s && typeof s.itemId === 'string' && getItemDef(s.itemId) && s.count > 0) {
        this.slots[i] = {
          itemId: s.itemId,
          count: s.count,
          durability: s.durability,
        };
      } else {
        this.slots[i] = null;
      }
    }
    if (typeof data.selectedHotbarIndex === 'number') {
      this.selectedHotbarIndex = Math.max(0, Math.min(HOTBAR_SIZE - 1, data.selectedHotbarIndex));
    }
    this.notify();
  }

  private notify(): void {
    if (this.onChange) this.onChange();
  }
}
