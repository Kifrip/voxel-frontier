import * as THREE from 'three';
import { BLOCK_DEFINITIONS, BlockId, TileIndex } from '../world/blocks';
import { ITEM_REGISTRY, ItemDef } from '../items/registry';
import { createPRNG } from '../world/noise';

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;
export const TILE_SIZE = 16;

export interface TileUV {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export function getTileUV(tileIndex: number): TileUV {
  const col = tileIndex % ATLAS_COLS;
  const row = Math.floor(tileIndex / ATLAS_COLS);
  const inset = 0.002;
  const uStep = 1 / ATLAS_COLS;
  const vStep = 1 / ATLAS_ROWS;
  const u0 = col * uStep + inset;
  const u1 = (col + 1) * uStep - inset;
  // Canvas Y=0 is top, WebGL V=1 is top
  const v1 = 1 - row * vStep - inset;
  const v0 = 1 - (row + 1) * vStep + inset;
  return { u0, v0, u1, v1 };
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function createAtlasCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE_SIZE;
  canvas.height = ATLAS_ROWS * TILE_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const rng = createPRNG(133742);

  const setPx = (
    tile: number,
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    a = 255
  ) => {
    const col = tile % ATLAS_COLS;
    const row = Math.floor(tile / ATLAS_COLS);
    ctx.fillStyle = `rgba(${clampByte(r)},${clampByte(g)},${clampByte(b)},${a / 255})`;
    ctx.fillRect(col * TILE_SIZE + x, row * TILE_SIZE + y, 1, 1);
  };

  const fillNoisyTile = (
    tile: number,
    baseHex: string,
    variance: number,
    pattern?: (x: number, y: number, r: number, g: number, b: number) => [number, number, number]
  ) => {
    const [br, bg, bb] = hexToRgb(baseHex);
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const delta = (rng() - 0.5) * 2 * variance;
        let r = br + delta;
        let g = bg + delta;
        let b = bb + delta;
        if (pattern) {
          [r, g, b] = pattern(x, y, r, g, b);
        }
        setPx(tile, x, y, r, g, b, 255);
      }
    }
  };

  // 0: GRASS_TOP
  fillNoisyTile(TileIndex.GRASS_TOP, '#5ca842', 12, (x, y, r, g, b) => {
    if ((x + y * 3) % 7 === 0) return [r - 8, g + 10, b - 6];
    return [r, g, b];
  });

  // 2: DIRT
  fillNoisyTile(TileIndex.DIRT, '#855a3b', 14, (x, y, r, g, b) => {
    if ((x * 5 + y * 7) % 13 === 0) return [r - 14, g - 12, b - 10];
    return [r, g, b];
  });

  // 1: GRASS_SIDE
  fillNoisyTile(TileIndex.GRASS_SIDE, '#855a3b', 13, (x, y, r, g, b) => {
    const fringeDepth = 3 + ((x * 7 + 3) % 3);
    if (y < fringeDepth) {
      const [gr, gg, gb] = hexToRgb('#5ca842');
      const d = (rng() - 0.5) * 16;
      return [gr + d, gg + d, gb + d];
    }
    if (y === fringeDepth) {
      return [r * 0.78, g * 0.78, b * 0.78];
    }
    return [r, g, b];
  });

  // 3: STONE
  fillNoisyTile(TileIndex.STONE, '#80858c', 11, (x, y, r, g, b) => {
    const strata = Math.sin(y * 0.9 + x * 0.25) * 6;
    return [r + strata, g + strata, b + strata];
  });

  // 4: SAND
  fillNoisyTile(TileIndex.SAND, '#e4d18c', 10, (x, y, r, g, b) => {
    const wave = Math.sin((x + y * 2) * 0.6) * 6;
    return [r + wave, g + wave, b + wave - 2];
  });

  // 5: WOOD_SIDE (Oak bark)
  fillNoisyTile(TileIndex.WOOD_SIDE, '#735032', 10, (x, _y, r, g, b) => {
    const stripe = (x % 4 === 0 ? -12 : x % 4 === 2 ? 7 : 0);
    return [r + stripe, g + stripe, b + stripe];
  });

  // 6: WOOD_TOP (Growth rings)
  fillNoisyTile(TileIndex.WOOD_TOP, '#ba935e', 7, (x, y, r, g, b) => {
    if (x === 0 || x === 15 || y === 0 || y === 15) {
      return hexToRgb('#6b492c');
    }
    const dx = x - 7.5;
    const dy = y - 7.5;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (Math.floor(dist) % 2 === 1) {
      return [r - 14, g - 14, b - 12];
    }
    return [r, g, b];
  });

  // 7: LEAVES
  fillNoisyTile(TileIndex.LEAVES, '#428731', 16, (x, y, r, g, b) => {
    if ((x + y) % 3 === 0) return [r - 12, g - 10, b - 10];
    return [r, g, b];
  });

  // 8: PLANKS
  fillNoisyTile(TileIndex.PLANKS, '#b88a54', 8, (x, y, r, g, b) => {
    if (y % 4 === 0) return [r - 22, g - 20, b - 16];
    const jointX = ((Math.floor(y / 4) * 7) + 5) % 16;
    if (x === jointX) return [r - 18, g - 16, b - 14];
    return [r, g, b];
  });

  // 9: COBBLESTONE
  fillNoisyTile(TileIndex.COBBLESTONE, '#70757c', 14, (x, y, r, g, b) => {
    const cell = ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0);
    if (x % 4 === 0 || y % 4 === (cell ? 0 : 2)) {
      return [r - 24, g - 24, b - 24];
    }
    return [r, g, b];
  });

  // 10: COAL_ORE
  fillNoisyTile(TileIndex.COAL_ORE, '#80858c', 10, (x, y, r, g, b) => {
    const spots = [
      [3, 4], [4, 4], [4, 5], [10, 3], [11, 3], [11, 4],
      [6, 10], [7, 10], [7, 11], [12, 11], [13, 12], [3, 12],
    ];
    for (const [sx, sy] of spots) {
      if (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 0) {
        return [32, 35, 40];
      }
    }
    return [r, g, b];
  });

  // 11: IRON_ORE
  fillNoisyTile(TileIndex.IRON_ORE, '#80858c', 10, (x, y, r, g, b) => {
    const spots = [
      [4, 3], [5, 4], [11, 4], [10, 5],
      [5, 10], [6, 11], [11, 11], [12, 10], [8, 7],
    ];
    for (const [sx, sy] of spots) {
      if (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 0) {
        return [214, 158, 122];
      }
    }
    return [r, g, b];
  });

  // 12: GLASS
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const isBorder = x === 0 || x === 15 || y === 0 || y === 15;
      const isStreak = (x + y === 5) || (x + y === 6) || (x + y === 19);
      if (isBorder) {
        setPx(TileIndex.GLASS, x, y, 210, 240, 250, 255);
      } else if (isStreak) {
        setPx(TileIndex.GLASS, x, y, 240, 252, 255, 255);
      } else {
        setPx(TileIndex.GLASS, x, y, 180, 225, 245, 0);
      }
    }
  }

  // 13: TORCH
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      if (x >= 6 && x <= 9 && y >= 5) {
        if (y <= 7) {
          // Flame tip
          setPx(TileIndex.TORCH, x, y, 255, 225, 90, 255);
        } else if (y === 8) {
          setPx(TileIndex.TORCH, x, y, 245, 130, 40, 255);
        } else {
          setPx(TileIndex.TORCH, x, y, 125, 86, 50, 255);
        }
      }
    }
  }

  // 14: WATER
  fillNoisyTile(TileIndex.WATER, '#2f82d4', 10, (x, y, r, g, b) => {
    const wave = ((x + y * 2) % 8 === 0) ? 18 : 0;
    return [r + wave, g + wave, b + wave];
  });

  // 15: BEDROCK
  fillNoisyTile(TileIndex.BEDROCK, '#2b2d33', 18, (x, y, r, g, b) => {
    if ((x * 3 + y * 5) % 4 === 0) return [r - 18, g - 18, b - 18];
    return [r, g, b];
  });

  // 16: CRAFTING_TOP
  fillNoisyTile(TileIndex.CRAFTING_TOP, '#ab7846', 8, (x, y, r, g, b) => {
    if (x <= 1 || x >= 14 || y <= 1 || y >= 14) return hexToRgb('#5e3d20');
    if (x === 5 || x === 10 || y === 5 || y === 10) return hexToRgb('#472d16');
    return [r, g, b];
  });

  // 17: CRAFTING_SIDE
  fillNoisyTile(TileIndex.CRAFTING_SIDE, '#b0824f', 8, (x, y, r, g, b) => {
    if (y < 3) return hexToRgb('#6b4523');
    if (x === 0 || x === 15) return hexToRgb('#5e3d20');
    if (x >= 5 && x <= 10 && y >= 5 && y <= 12) return hexToRgb('#4a5059');
    return [r, g, b];
  });

  // 18: SANDSTONE_SIDE
  fillNoisyTile(TileIndex.SANDSTONE_SIDE, '#dbc684', 8, (_x, y, r, g, b) => {
    if (y === 3 || y === 8 || y === 13) return [r - 18, g - 18, b - 14];
    return [r, g, b];
  });

  // 19: SANDSTONE_TOP
  fillNoisyTile(TileIndex.SANDSTONE_TOP, '#e3d090', 7);

  // 20: CACTUS_SIDE
  fillNoisyTile(TileIndex.CACTUS_SIDE, '#3a8c38', 10, (x, y, r, g, b) => {
    if (x % 4 === 0) return [r - 18, g - 16, b - 16];
    if (x % 4 === 2 && y % 5 === 1) return [230, 235, 195];
    return [r, g, b];
  });

  // 21: CACTUS_TOP
  fillNoisyTile(TileIndex.CACTUS_TOP, '#4ca149', 9);

  // 22: SNOW_TOP
  fillNoisyTile(TileIndex.SNOW_TOP, '#f0f7ff', 6);

  // 23: SNOW_SIDE
  fillNoisyTile(TileIndex.SNOW_SIDE, '#80858c', 10, (x, y, r, g, b) => {
    const depth = 4 + ((x * 5) % 3);
    if (y < depth) return [240, 247, 255];
    return [r, g, b];
  });

  // 24: TALL_GRASS (transparent background sprite)
  for (let y = 3; y < TILE_SIZE; y++) {
    for (let x = 2; x < TILE_SIZE - 2; x++) {
      const blade = ((x * 3 + Math.floor(y / 3)) % 4 === 0) || (x === 7 && y > 5) || (x === 10 && y > 4);
      if (blade) {
        setPx(TileIndex.TALL_GRASS, x, y, 76, 162, 58, 255);
      }
    }
  }

  // 25: FLOWER_RED
  for (let y = 6; y < TILE_SIZE; y++) {
    setPx(TileIndex.FLOWER_RED, 7, y, 58, 140, 46, 255);
    setPx(TileIndex.FLOWER_RED, 8, y, 58, 140, 46, 255);
  }
  for (let y = 3; y <= 7; y++) {
    for (let x = 5; x <= 10; x++) {
      if (x === 7 && y === 5) {
        setPx(TileIndex.FLOWER_RED, x, y, 250, 215, 60, 255);
      } else {
        setPx(TileIndex.FLOWER_RED, x, y, 226, 56, 56, 255);
      }
    }
  }

  // 26: FLOWER_YELLOW
  for (let y = 6; y < TILE_SIZE; y++) {
    setPx(TileIndex.FLOWER_YELLOW, 7, y, 58, 140, 46, 255);
    setPx(TileIndex.FLOWER_YELLOW, 8, y, 58, 140, 46, 255);
  }
  for (let y = 3; y <= 7; y++) {
    for (let x = 5; x <= 10; x++) {
      if (x === 7 && y === 5) {
        setPx(TileIndex.FLOWER_YELLOW, x, y, 235, 140, 30, 255);
      } else {
        setPx(TileIndex.FLOWER_YELLOW, x, y, 248, 216, 48, 255);
      }
    }
  }

  // 27: CRYSTAL_ORE
  fillNoisyTile(TileIndex.CRYSTAL_ORE, '#6c727d', 10, (x, y, r, g, b) => {
    const crystals = [
      [4, 4], [5, 3], [11, 5], [12, 4],
      [6, 11], [7, 10], [11, 12], [8, 7],
    ];
    for (const [cx, cy] of crystals) {
      if (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1 && (x + y) % 2 === 0) {
        return [88, 242, 242];
      }
    }
    return [r, g, b];
  });

  // 28: STONE_BRICKS
  fillNoisyTile(TileIndex.STONE_BRICKS, '#7c818a', 8, (x, y, r, g, b) => {
    if (y % 8 === 0) return [r - 26, g - 26, b - 26];
    const offset = Math.floor(y / 8) * 8;
    if ((x + offset) % 16 === 0) return [r - 24, g - 24, b - 24];
    return [r, g, b];
  });

  // 29: PINE_WOOD_SIDE
  fillNoisyTile(TileIndex.PINE_WOOD_SIDE, '#4a3320', 9, (x, _y, r, g, b) => {
    const s = x % 4 === 0 ? -10 : 4;
    return [r + s, g + s, b + s];
  });

  // 30: PINE_LEAVES
  fillNoisyTile(TileIndex.PINE_LEAVES, '#2a5e35', 13, (x, y, r, g, b) => {
    if ((x + y * 2) % 5 === 0) return [r + 12, g + 16, b + 12];
    return [r, g, b];
  });

  return canvas;
}

export function createAtlasTexture(): {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
} {
  const canvas = createAtlasCanvas();
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return { texture, canvas };
}

// Cache of generated item icon data URLs for UI
const iconCache = new Map<string, string>();

export function getItemIconDataUrl(itemId: string): string {
  const cached = iconCache.get(itemId);
  if (cached) return cached;

  const def = ITEM_REGISTRY[itemId];
  if (!def) return '';

  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  if (def.category === 'block' && def.blockId !== undefined) {
    drawBlockIcon(ctx, def);
  } else if (def.category === 'tool') {
    drawToolIcon(ctx, def);
  } else {
    drawMaterialIcon(ctx, def);
  }

  const url = canvas.toDataURL();
  iconCache.set(itemId, url);
  return url;
}

function drawBlockIcon(ctx: CanvasRenderingContext2D, def: ItemDef): void {
  const blockDef = BLOCK_DEFINITIONS[def.blockId!];
  if (blockDef.renderShape === 'torch') {
    // Draw torch icon
    ctx.fillStyle = '#765333';
    ctx.fillRect(20, 18, 8, 24);
    ctx.fillStyle = '#ff9824';
    ctx.fillRect(18, 10, 12, 10);
    ctx.fillStyle = '#fff066';
    ctx.fillRect(20, 12, 8, 6);
    return;
  }
  if (blockDef.renderShape === 'cross') {
    // Draw flower / flora icon
    ctx.fillStyle = '#479434';
    ctx.fillRect(22, 22, 4, 20);
    ctx.fillStyle = def.iconColorPrimary;
    ctx.fillRect(14, 10, 20, 14);
    ctx.fillStyle = '#fff275';
    ctx.fillRect(21, 14, 6, 6);
    return;
  }

  // Isometric cube icon
  const topColor = def.iconColorPrimary;
  const sideColor = def.iconColorSecondary;

  // Top diamond
  ctx.fillStyle = topColor;
  ctx.beginPath();
  ctx.moveTo(24, 6);
  ctx.lineTo(42, 15);
  ctx.lineTo(24, 24);
  ctx.lineTo(6, 15);
  ctx.closePath();
  ctx.fill();

  // Left face
  ctx.fillStyle = sideColor;
  ctx.beginPath();
  ctx.moveTo(6, 15);
  ctx.lineTo(24, 24);
  ctx.lineTo(24, 42);
  ctx.lineTo(6, 33);
  ctx.closePath();
  ctx.fill();

  // Right face (shaded)
  const [r, g, b] = hexToRgb(sideColor);
  ctx.fillStyle = `rgb(${clampByte(r * 0.78)},${clampByte(g * 0.78)},${clampByte(b * 0.78)})`;
  ctx.beginPath();
  ctx.moveTo(24, 24);
  ctx.lineTo(42, 15);
  ctx.lineTo(42, 33);
  ctx.lineTo(24, 42);
  ctx.closePath();
  ctx.fill();

  // Subtle outline
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(24, 6);
  ctx.lineTo(42, 15);
  ctx.lineTo(42, 33);
  ctx.lineTo(24, 42);
  ctx.lineTo(6, 33);
  ctx.lineTo(6, 15);
  ctx.closePath();
  ctx.stroke();
}

function drawToolIcon(ctx: CanvasRenderingContext2D, def: ItemDef): void {
  // Handle diagonal
  ctx.strokeStyle = def.iconColorSecondary;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(10, 38);
  ctx.lineTo(34, 14);
  ctx.stroke();

  ctx.fillStyle = def.iconColorPrimary;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;

  if (def.toolType === 'pickaxe') {
    ctx.beginPath();
    ctx.moveTo(22, 8);
    ctx.lineTo(38, 10);
    ctx.lineTo(40, 26);
    ctx.lineTo(34, 24);
    ctx.lineTo(32, 16);
    ctx.lineTo(24, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (def.toolType === 'axe') {
    ctx.beginPath();
    ctx.moveTo(24, 8);
    ctx.lineTo(38, 12);
    ctx.lineTo(34, 26);
    ctx.lineTo(22, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (def.toolType === 'shovel') {
    ctx.beginPath();
    ctx.arc(34, 14, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Sword blade
    ctx.beginPath();
    ctx.moveTo(16, 28);
    ctx.lineTo(38, 6);
    ctx.lineTo(42, 10);
    ctx.lineTo(20, 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawMaterialIcon(ctx: CanvasRenderingContext2D, def: ItemDef): void {
  if (def.id === 'stick') {
    ctx.strokeStyle = def.iconColorPrimary;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(12, 36);
    ctx.lineTo(36, 12);
    ctx.stroke();
    return;
  }
  // Ingot or lump
  ctx.fillStyle = def.iconColorPrimary;
  ctx.beginPath();
  ctx.roundRect(10, 14, 28, 20, 5);
  ctx.fill();
  ctx.strokeStyle = def.iconColorSecondary;
  ctx.lineWidth = 2;
  ctx.stroke();
}
