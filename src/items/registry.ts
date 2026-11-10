import { BLOCK_DEFINITIONS, BlockId, ToolType } from '../world/blocks';

export type ItemCategory = 'block' | 'material' | 'tool';

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  maxStack: number;
  blockId?: BlockId;
  toolType?: ToolType;
  toolTier?: number;
  miningSpeedMultiplier?: number;
  maxDurability?: number;
  attackDamage?: number;
  iconColorPrimary: string;
  iconColorSecondary: string;
}

export const ITEM_REGISTRY: Record<string, ItemDef> = {};

function registerItem(def: ItemDef): void {
  ITEM_REGISTRY[def.id] = def;
}

// 1. Register block items from BLOCK_DEFINITIONS
const PLACEABLE_BLOCKS: BlockId[] = [
  BlockId.GRASS,
  BlockId.DIRT,
  BlockId.STONE,
  BlockId.SAND,
  BlockId.WOOD,
  BlockId.LEAVES,
  BlockId.PLANKS,
  BlockId.COBBLESTONE,
  BlockId.COAL_ORE,
  BlockId.IRON_ORE,
  BlockId.GLASS,
  BlockId.TORCH,
  BlockId.CRAFTING_TABLE,
  BlockId.SANDSTONE,
  BlockId.CACTUS,
  BlockId.SNOW_STONE,
  BlockId.FLOWER_RED,
  BlockId.FLOWER_YELLOW,
  BlockId.CRYSTAL_ORE,
  BlockId.STONE_BRICKS,
  BlockId.PINE_WOOD,
  BlockId.PINE_LEAVES,
  BlockId.BEDROCK,
];

const BLOCK_SECONDARY_COLORS: Partial<Record<BlockId, string>> = {
  [BlockId.GRASS]: '#785135',
  [BlockId.DIRT]: '#6b472e',
  [BlockId.STONE]: '#676b70',
  [BlockId.SAND]: '#cbb773',
  [BlockId.WOOD]: '#b58d59',
  [BlockId.LEAVES]: '#316a23',
  [BlockId.PLANKS]: '#946b3b',
  [BlockId.COBBLESTONE]: '#52565b',
  [BlockId.COAL_ORE]: '#222428',
  [BlockId.IRON_ORE]: '#d8a686',
  [BlockId.GLASS]: '#ffffff',
  [BlockId.TORCH]: '#765333',
  [BlockId.CRAFTING_TABLE]: '#6d4524',
  [BlockId.SANDSTONE]: '#bfa867',
  [BlockId.CACTUS]: '#296928',
  [BlockId.SNOW_STONE]: '#82868c',
  [BlockId.FLOWER_RED]: '#478f32',
  [BlockId.FLOWER_YELLOW]: '#478f32',
  [BlockId.CRYSTAL_ORE]: '#79ffff',
  [BlockId.STONE_BRICKS]: '#5c6066',
  [BlockId.PINE_WOOD]: '#9a784c',
  [BlockId.PINE_LEAVES]: '#1e4a25',
  [BlockId.BEDROCK]: '#141517',
};

for (const blockId of PLACEABLE_BLOCKS) {
  const b = BLOCK_DEFINITIONS[blockId];
  registerItem({
    id: b.key,
    name: b.name,
    description: b.description,
    category: 'block',
    maxStack: 64,
    blockId: b.id,
    iconColorPrimary: b.particleColor,
    iconColorSecondary: BLOCK_SECONDARY_COLORS[blockId] ?? b.particleColor,
  });
}

// 2. Register crafting materials and resources
registerItem({
  id: 'stick',
  name: 'Wooden Stick',
  description: 'A sturdy wooden handle used for crafting tools and torches.',
  category: 'material',
  maxStack: 64,
  iconColorPrimary: '#9c7144',
  iconColorSecondary: '#6e4d2b',
});

registerItem({
  id: 'coal',
  name: 'Coal Lump',
  description: 'Combustible mineral fuel mined from coal veins. Used for torches and smelting.',
  category: 'material',
  maxStack: 64,
  iconColorPrimary: '#2d3034',
  iconColorSecondary: '#4b5057',
});

registerItem({
  id: 'iron_ingot',
  name: 'Iron Ingot',
  description: 'Refined metallic bar ready to be forged into high-grade tools.',
  category: 'material',
  maxStack: 64,
  iconColorPrimary: '#d8dee6',
  iconColorSecondary: '#9aa3ad',
});

// 3. Register tools
registerItem({
  id: 'wooden_pickaxe',
  name: 'Wooden Pickaxe',
  description: 'Basic mining tool capable of harvesting stone, cobblestone, and coal.',
  category: 'tool',
  maxStack: 1,
  toolType: 'pickaxe',
  toolTier: 1,
  miningSpeedMultiplier: 2.5,
  maxDurability: 60,
  attackDamage: 3,
  iconColorPrimary: '#b58852',
  iconColorSecondary: '#765333',
});

registerItem({
  id: 'stone_pickaxe',
  name: 'Stone Pickaxe',
  description: 'Reinforced stone pickaxe that mines rock rapidly and extracts iron ore.',
  category: 'tool',
  maxStack: 1,
  toolType: 'pickaxe',
  toolTier: 2,
  miningSpeedMultiplier: 4.5,
  maxDurability: 132,
  attackDamage: 4,
  iconColorPrimary: '#8a8f96',
  iconColorSecondary: '#765333',
});

registerItem({
  id: 'iron_pickaxe',
  name: 'Iron Pickaxe',
  description: 'Masterwork iron pickaxe with superior durability and mining speed.',
  category: 'tool',
  maxStack: 1,
  toolType: 'pickaxe',
  toolTier: 3,
  miningSpeedMultiplier: 7.5,
  maxDurability: 250,
  attackDamage: 5,
  iconColorPrimary: '#dce3eb',
  iconColorSecondary: '#765333',
});

registerItem({
  id: 'wooden_axe',
  name: 'Wooden Axe',
  description: 'Simple timber axe for chopping trees and wooden blocks.',
  category: 'tool',
  maxStack: 1,
  toolType: 'axe',
  toolTier: 1,
  miningSpeedMultiplier: 2.5,
  maxDurability: 60,
  attackDamage: 4,
  iconColorPrimary: '#b58852',
  iconColorSecondary: '#765333',
});

registerItem({
  id: 'stone_axe',
  name: 'Stone Axe',
  description: 'Heavy stone axe that fells trees and wooden structures with ease.',
  category: 'tool',
  maxStack: 1,
  toolType: 'axe',
  toolTier: 2,
  miningSpeedMultiplier: 4.5,
  maxDurability: 132,
  attackDamage: 5,
  iconColorPrimary: '#8a8f96',
  iconColorSecondary: '#765333',
});

registerItem({
  id: 'iron_axe',
  name: 'Iron Axe',
  description: 'Sharp forged iron axe for rapid forestry and woodwork.',
  category: 'tool',
  maxStack: 1,
  toolType: 'axe',
  toolTier: 3,
  miningSpeedMultiplier: 7.0,
  maxDurability: 250,
  attackDamage: 6,
  iconColorPrimary: '#dce3eb',
  iconColorSecondary: '#765333',
});

registerItem({
  id: 'wooden_shovel',
  name: 'Wooden Shovel',
  description: 'Light spade for excavating dirt, grass, and sand.',
  category: 'tool',
  maxStack: 1,
  toolType: 'shovel',
  toolTier: 1,
  miningSpeedMultiplier: 2.8,
  maxDurability: 60,
  attackDamage: 2,
  iconColorPrimary: '#b58852',
  iconColorSecondary: '#765333',
});

registerItem({
  id: 'stone_shovel',
  name: 'Stone Shovel',
  description: 'Sturdy stone spade for fast earthmoving.',
  category: 'tool',
  maxStack: 1,
  toolType: 'shovel',
  toolTier: 2,
  miningSpeedMultiplier: 4.8,
  maxDurability: 132,
  attackDamage: 3,
  iconColorPrimary: '#8a8f96',
  iconColorSecondary: '#765333',
});

registerItem({
  id: 'stone_sword',
  name: 'Frontier Blade',
  description: 'Balanced stone blade for fending off hostile creatures in the wilderness.',
  category: 'tool',
  maxStack: 1,
  toolType: 'sword',
  toolTier: 2,
  miningSpeedMultiplier: 1.5,
  maxDurability: 160,
  attackDamage: 7,
  iconColorPrimary: '#9da3ab',
  iconColorSecondary: '#6b472e',
});

export function getItemDef(id: string): ItemDef | undefined {
  return ITEM_REGISTRY[id];
}

export const CREATIVE_PALETTE_ITEMS: string[] = [
  'grass',
  'dirt',
  'stone',
  'cobblestone',
  'stone_bricks',
  'sand',
  'sandstone',
  'wood',
  'pine_wood',
  'planks',
  'leaves',
  'pine_leaves',
  'glass',
  'torch',
  'crafting_table',
  'coal_ore',
  'iron_ore',
  'crystal_ore',
  'snow_stone',
  'cactus',
  'flower_red',
  'flower_yellow',
  'iron_pickaxe',
  'iron_axe',
  'stone_shovel',
  'stone_sword',
];
