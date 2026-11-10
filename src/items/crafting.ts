import { InventoryManager } from './inventory';
import { getItemDef } from './registry';

export interface RecipeIngredient {
  itemId: string;
  count: number;
}

export interface CraftingRecipe {
  id: string;
  name: string;
  category: 'basics' | 'tools' | 'building' | 'smelting';
  outputItemId: string;
  outputCount: number;
  ingredients: RecipeIngredient[];
  description: string;
}

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: 'planks_oak',
    name: 'Wood Planks (from Oak)',
    category: 'basics',
    outputItemId: 'planks',
    outputCount: 4,
    ingredients: [{ itemId: 'wood', count: 1 }],
    description: 'Saw an Oak Log into four versatile wooden planks.',
  },
  {
    id: 'planks_spruce',
    name: 'Wood Planks (from Spruce)',
    category: 'basics',
    outputItemId: 'planks',
    outputCount: 4,
    ingredients: [{ itemId: 'pine_wood', count: 1 }],
    description: 'Saw a Spruce Log into four wooden planks.',
  },
  {
    id: 'sticks',
    name: 'Wooden Sticks',
    category: 'basics',
    outputItemId: 'stick',
    outputCount: 4,
    ingredients: [{ itemId: 'planks', count: 2 }],
    description: 'Carve planks into sturdy tool handles and torch shafts.',
  },
  {
    id: 'crafting_table',
    name: 'Crafting Bench',
    category: 'basics',
    outputItemId: 'crafting_table',
    outputCount: 1,
    ingredients: [{ itemId: 'planks', count: 4 }],
    description: 'Assemble an artisan workbench for your homestead.',
  },
  {
    id: 'torches_coal',
    name: 'Torches',
    category: 'basics',
    outputItemId: 'torch',
    outputCount: 4,
    ingredients: [
      { itemId: 'coal', count: 1 },
      { itemId: 'stick', count: 1 },
    ],
    description: 'Bright torches that light up caves and night structures.',
  },
  {
    id: 'torches_wood',
    name: 'Campfire Torches',
    category: 'basics',
    outputItemId: 'torch',
    outputCount: 2,
    ingredients: [
      { itemId: 'wood', count: 1 },
      { itemId: 'stick', count: 2 },
    ],
    description: 'Early-game pitch torches crafted directly from timber.',
  },
  {
    id: 'wooden_pickaxe',
    name: 'Wooden Pickaxe',
    category: 'tools',
    outputItemId: 'wooden_pickaxe',
    outputCount: 1,
    ingredients: [
      { itemId: 'planks', count: 3 },
      { itemId: 'stick', count: 2 },
    ],
    description: 'Essential starter pickaxe required to mine stone and coal.',
  },
  {
    id: 'wooden_axe',
    name: 'Wooden Axe',
    category: 'tools',
    outputItemId: 'wooden_axe',
    outputCount: 1,
    ingredients: [
      { itemId: 'planks', count: 3 },
      { itemId: 'stick', count: 2 },
    ],
    description: 'Chops logs and wooden blocks much faster than bare hands.',
  },
  {
    id: 'wooden_shovel',
    name: 'Wooden Shovel',
    category: 'tools',
    outputItemId: 'wooden_shovel',
    outputCount: 1,
    ingredients: [
      { itemId: 'planks', count: 1 },
      { itemId: 'stick', count: 2 },
    ],
    description: 'Excavates dirt, grass, and sand quickly.',
  },
  {
    id: 'stone_pickaxe',
    name: 'Stone Pickaxe',
    category: 'tools',
    outputItemId: 'stone_pickaxe',
    outputCount: 1,
    ingredients: [
      { itemId: 'cobblestone', count: 3 },
      { itemId: 'stick', count: 2 },
    ],
    description: 'Durable rock pickaxe needed to harvest Iron and Crystal ores.',
  },
  {
    id: 'stone_axe',
    name: 'Stone Axe',
    category: 'tools',
    outputItemId: 'stone_axe',
    outputCount: 1,
    ingredients: [
      { itemId: 'cobblestone', count: 3 },
      { itemId: 'stick', count: 2 },
    ],
    description: 'Heavy stone axe for fast timber harvesting.',
  },
  {
    id: 'stone_shovel',
    name: 'Stone Shovel',
    category: 'tools',
    outputItemId: 'stone_shovel',
    outputCount: 1,
    ingredients: [
      { itemId: 'cobblestone', count: 1 },
      { itemId: 'stick', count: 2 },
    ],
    description: 'Reinforced stone spade for rapid landscaping.',
  },
  {
    id: 'stone_sword',
    name: 'Frontier Blade',
    category: 'tools',
    outputItemId: 'stone_sword',
    outputCount: 1,
    ingredients: [
      { itemId: 'cobblestone', count: 2 },
      { itemId: 'stick', count: 1 },
    ],
    description: 'Sturdy weapon for defending against Night Crawlers.',
  },
  {
    id: 'smelt_iron',
    name: 'Smelt Iron Ingot',
    category: 'smelting',
    outputItemId: 'iron_ingot',
    outputCount: 1,
    ingredients: [
      { itemId: 'iron_ore', count: 1 },
      { itemId: 'coal', count: 1 },
    ],
    description: 'Refine raw Iron Ore with Coal into a pure Iron Ingot.',
  },
  {
    id: 'iron_pickaxe',
    name: 'Iron Pickaxe',
    category: 'tools',
    outputItemId: 'iron_pickaxe',
    outputCount: 1,
    ingredients: [
      { itemId: 'iron_ingot', count: 3 },
      { itemId: 'stick', count: 2 },
    ],
    description: 'Top-tier frontier pickaxe with high speed and durability.',
  },
  {
    id: 'iron_axe',
    name: 'Iron Axe',
    category: 'tools',
    outputItemId: 'iron_axe',
    outputCount: 1,
    ingredients: [
      { itemId: 'iron_ingot', count: 3 },
      { itemId: 'stick', count: 2 },
    ],
    description: 'Masterwork iron axe for rapid forestry.',
  },
  {
    id: 'smelt_glass',
    name: 'Glass Block',
    category: 'building',
    outputItemId: 'glass',
    outputCount: 2,
    ingredients: [
      { itemId: 'sand', count: 2 },
      { itemId: 'coal', count: 1 },
    ],
    description: 'Fuse fine sand with coal heat into clear architectural glass.',
  },
  {
    id: 'stone_bricks',
    name: 'Stone Bricks',
    category: 'building',
    outputItemId: 'stone_bricks',
    outputCount: 4,
    ingredients: [{ itemId: 'cobblestone', count: 4 }],
    description: 'Dress rough cobblestone into carved masonry bricks.',
  },
  {
    id: 'sandstone',
    name: 'Sandstone',
    category: 'building',
    outputItemId: 'sandstone',
    outputCount: 2,
    ingredients: [{ itemId: 'sand', count: 4 }],
    description: 'Compact desert sand into smooth sandstone blocks.',
  },
  {
    id: 'smelt_stone',
    name: 'Smooth Stone',
    category: 'building',
    outputItemId: 'stone',
    outputCount: 2,
    ingredients: [
      { itemId: 'cobblestone', count: 2 },
      { itemId: 'coal', count: 1 },
    ],
    description: 'Kiln-fire cobblestone back into smooth natural rock.',
  },
];

export class CraftingSystem {
  public static canCraft(recipe: CraftingRecipe, inventory: InventoryManager): boolean {
    for (const req of recipe.ingredients) {
      if (inventory.getItemCount(req.itemId) < req.count) {
        return false;
      }
    }
    return true;
  }

  public static maxCraftableCount(recipe: CraftingRecipe, inventory: InventoryManager): number {
    let maxTimes = Infinity;
    for (const req of recipe.ingredients) {
      const have = inventory.getItemCount(req.itemId);
      const times = Math.floor(have / req.count);
      if (times < maxTimes) maxTimes = times;
    }
    return Number.isFinite(maxTimes) ? maxTimes : 0;
  }

  public static craft(recipe: CraftingRecipe, inventory: InventoryManager, times = 1): number {
    let craftedTimes = 0;
    const outDef = getItemDef(recipe.outputItemId);
    if (!outDef) return 0;

    for (let t = 0; t < times; t++) {
      if (!this.canCraft(recipe, inventory)) break;
      for (const req of recipe.ingredients) {
        inventory.removeItem(req.itemId, req.count);
      }
      inventory.addItem(recipe.outputItemId, recipe.outputCount, outDef.maxDurability);
      craftedTimes++;
    }
    return craftedTimes;
  }
}
