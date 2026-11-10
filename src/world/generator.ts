import { BlockId } from './blocks';
import { SeededNoise, coordHash } from './noise';

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 96;
export const SEA_LEVEL = 30;

export type BiomeId = 'plains' | 'forest' | 'mountains' | 'desert';

export interface BiomeInfo {
  id: BiomeId;
  name: string;
  temperature: number;
  moisture: number;
  ruggedness: number;
}

export class TerrainGenerator {
  public readonly seedStr: string;
  public readonly numericSeed: number;
  private elevationNoise: SeededNoise;
  private tempNoise: SeededNoise;
  private moistureNoise: SeededNoise;
  private ruggedNoise: SeededNoise;
  private detailNoise: SeededNoise;
  private caveNoiseA: SeededNoise;
  private caveNoiseB: SeededNoise;
  private oreNoise: SeededNoise;

  constructor(seedInput: string | number = 'VoxelFrontier') {
    this.seedStr = String(seedInput).trim() || 'VoxelFrontier';
    this.elevationNoise = new SeededNoise(this.seedStr + '_elev');
    this.numericSeed = this.elevationNoise.numericSeed;
    this.tempNoise = new SeededNoise(this.seedStr + '_temp');
    this.moistureNoise = new SeededNoise(this.seedStr + '_moist');
    this.ruggedNoise = new SeededNoise(this.seedStr + '_rugged');
    this.detailNoise = new SeededNoise(this.seedStr + '_detail');
    this.caveNoiseA = new SeededNoise(this.seedStr + '_caveA');
    this.caveNoiseB = new SeededNoise(this.seedStr + '_caveB');
    this.oreNoise = new SeededNoise(this.seedStr + '_ore');
  }

  public getBiomeInfoAt(wx: number, wz: number): BiomeInfo {
    // Domain warp slightly for organic biome borders
    const warpX = this.detailNoise.noise2D(wx * 0.004, wz * 0.004) * 18;
    const warpZ = this.detailNoise.noise2D(wx * 0.004 + 97.1, wz * 0.004 + 43.8) * 18;
    const sx = wx + warpX;
    const sz = wz + warpZ;

    const temperature = this.tempNoise.fbm2D(sx, sz, 3, 0.5, 2.0, 0.0038);
    const moisture = this.moistureNoise.fbm2D(sx + 500, sz - 500, 3, 0.5, 2.0, 0.0042);
    const ruggedness = this.ruggedNoise.fbm2D(sx - 300, sz + 700, 3, 0.5, 2.0, 0.0045);

    if (ruggedness > 0.22) {
      return {
        id: 'mountains',
        name: 'Cragspire Mountains',
        temperature,
        moisture,
        ruggedness,
      };
    }
    if (temperature > 0.18 && moisture < -0.04) {
      return {
        id: 'desert',
        name: 'Sunbaked Desert',
        temperature,
        moisture,
        ruggedness,
      };
    }
    if (moisture > 0.08) {
      return {
        id: 'forest',
        name: 'Timberland Forest',
        temperature,
        moisture,
        ruggedness,
      };
    }
    return {
      id: 'plains',
      name: 'Emerald Plains',
      temperature,
      moisture,
      ruggedness,
    };
  }

  public getSurfaceHeight(wx: number, wz: number): { height: number; biome: BiomeInfo } {
    const biome = this.getBiomeInfoAt(wx, wz);

    // Continental base elevation (creates gentle valleys/lakes and uplands)
    const continental = this.elevationNoise.fbm2D(wx, wz, 4, 0.5, 2.0, 0.005);
    const hills = this.detailNoise.fbm2D(wx, wz, 3, 0.5, 2.1, 0.016);
    const ridge = this.elevationNoise.ridged2D(wx, wz, 4, 0.52, 2.1, 0.0075);

    // Smooth mountain blend factor based on ruggedness
    const mountainFactor = Math.max(0, Math.min(1, (biome.ruggedness - 0.05) / 0.38));
    const smoothMtn = mountainFactor * mountainFactor * (3 - 2 * mountainFactor);

    // Base plains/forest/desert height around 33..45, dipping below SEA_LEVEL (30) in valleys for lakes/rivers
    const baseHeight = 35 + continental * 10 + hills * 4.5;
    // Mountain height reaches up to 74
    const mountainHeight = 44 + ridge * 30 + hills * 6;

    const blended = baseHeight * (1 - smoothMtn) + mountainHeight * smoothMtn;
    const height = Math.max(6, Math.min(CHUNK_HEIGHT - 12, Math.floor(blended)));
    return { height, biome };
  }

  public generateChunkData(cx: number, cz: number): Uint8Array {
    const data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    const worldStartX = cx * CHUNK_SIZE;
    const worldStartZ = cz * CHUNK_SIZE;

    const setBlock = (lx: number, y: number, lz: number, id: BlockId) => {
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) {
        return;
      }
      data[y * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx] = id;
    };

    const getBlock = (lx: number, y: number, lz: number): BlockId => {
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) {
        return BlockId.AIR;
      }
      return data[y * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx] as BlockId;
    };

    // Keep track of surface heights and biomes for decoration pass
    const surfaceHeights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const biomes: BiomeInfo[] = new Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = worldStartX + lx;
        const wz = worldStartZ + lz;
        const { height: surfY, biome } = this.getSurfaceHeight(wx, wz);

        const colIdx = lz * CHUNK_SIZE + lx;
        surfaceHeights[colIdx] = surfY;
        biomes[colIdx] = biome;

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          if (y === 0) {
            setBlock(lx, y, lz, BlockId.BEDROCK);
            continue;
          }

          if (y > surfY) {
            if (y <= SEA_LEVEL) {
              setBlock(lx, y, lz, BlockId.WATER);
            }
            continue;
          }

          // Cave check: only carve below surface - 4 and above y = 4, and not directly under lakes
          if (y >= 4 && y <= surfY - 4 && surfY > SEA_LEVEL + 2) {
            const cA = this.caveNoiseA.noise3D(wx * 0.045, y * 0.065, wz * 0.045);
            const cB = this.caveNoiseB.noise3D(wx * 0.045 + 31.3, y * 0.065 + 19.7, wz * 0.045 + 71.1);
            // Tunnel intersection cave + larger cavern pockets
            if (cA * cA + cB * cB < 0.022 || (cA > 0.68 && y < 28)) {
              setBlock(lx, y, lz, BlockId.AIR);
              continue;
            }
          }

          // Surface & Subsurface block assignment
          if (y === surfY) {
            if (surfY <= SEA_LEVEL + 1) {
              // Beach or lakebed
              setBlock(lx, y, lz, biome.id === 'mountains' && surfY < SEA_LEVEL ? BlockId.COBBLESTONE : BlockId.SAND);
            } else if (biome.id === 'desert') {
              setBlock(lx, y, lz, BlockId.SAND);
            } else if (biome.id === 'mountains') {
              if (surfY >= 58) {
                setBlock(lx, y, lz, BlockId.SNOW_STONE);
              } else if (surfY >= 46) {
                setBlock(lx, y, lz, BlockId.STONE);
              } else {
                setBlock(lx, y, lz, BlockId.GRASS);
              }
            } else {
              setBlock(lx, y, lz, BlockId.GRASS);
            }
          } else if (y >= surfY - 3) {
            if (biome.id === 'desert') {
              setBlock(lx, y, lz, y === surfY - 3 ? BlockId.SANDSTONE : BlockId.SAND);
            } else if (surfY <= SEA_LEVEL + 1) {
              setBlock(lx, y, lz, BlockId.SAND);
            } else if (biome.id === 'mountains' && surfY >= 46) {
              setBlock(lx, y, lz, BlockId.STONE);
            } else {
              setBlock(lx, y, lz, BlockId.DIRT);
            }
          } else {
            // Deep stone + mineral veins
            let blockToPlace = BlockId.STONE;
            if (biome.id === 'desert' && y >= surfY - 6) {
              blockToPlace = BlockId.SANDSTONE;
            } else {
              const oreVal = this.oreNoise.noise3D(wx * 0.14, y * 0.14, wz * 0.14);
              const h = coordHash(wx, y, wz, this.numericSeed);
              if (oreVal > 0.62 && y >= 5 && y <= 66) {
                if (y <= 22 && h < 0.22) {
                  blockToPlace = BlockId.CRYSTAL_ORE;
                } else if (y <= 46 && h < 0.55) {
                  blockToPlace = BlockId.IRON_ORE;
                } else {
                  blockToPlace = BlockId.COAL_ORE;
                }
              } else if (biome.id === 'mountains' && oreVal > 0.54 && y >= 25) {
                blockToPlace = h < 0.35 ? BlockId.IRON_ORE : BlockId.COAL_ORE;
              }
            }
            setBlock(lx, y, lz, blockToPlace);
          }
        }
      }
    }

    // Second pass: Surface decorations (trees, cacti, boulders, flowers, tall grass)
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = worldStartX + lx;
        const wz = worldStartZ + lz;
        const colIdx = lz * CHUNK_SIZE + lx;
        const surfY = surfaceHeights[colIdx];
        const biome = biomes[colIdx];

        if (surfY <= SEA_LEVEL + 1 || surfY >= CHUNK_HEIGHT - 10) continue;
        const groundBlock = getBlock(lx, surfY, lz);
        const r = coordHash(wx, surfY, wz, this.numericSeed + 101);

        // Keep trees away from chunk edges (lx in 2..13, lz in 2..13) so canopies don't clip
        const canPlaceTree = lx >= 2 && lx <= CHUNK_SIZE - 3 && lz >= 2 && lz <= CHUNK_SIZE - 3;

        if (biome.id === 'desert' && groundBlock === BlockId.SAND) {
          if (r < 0.014 && lx >= 1 && lx <= CHUNK_SIZE - 2 && lz >= 1 && lz <= CHUNK_SIZE - 2) {
            const cactusHeight = 2 + Math.floor(coordHash(wx, surfY + 1, wz, this.numericSeed) * 3);
            for (let cy = 1; cy <= cactusHeight; cy++) {
              setBlock(lx, surfY + cy, lz, BlockId.CACTUS);
            }
          }
          continue;
        }

        if (biome.id === 'mountains') {
          if (groundBlock === BlockId.GRASS && canPlaceTree && r < 0.015) {
            this.placeSpruceTree(setBlock, getBlock, lx, surfY + 1, lz, wx, wz);
          } else if (groundBlock === BlockId.STONE && r < 0.018) {
            // Surface rock outcrop
            setBlock(lx, surfY + 1, lz, BlockId.COBBLESTONE);
          }
          continue;
        }

        if (groundBlock === BlockId.GRASS) {
          const treeChance = biome.id === 'forest' ? 0.048 : 0.007;
          if (canPlaceTree && r < treeChance) {
            const treeTypeRand = coordHash(wx, surfY + 7, wz, this.numericSeed);
            if (biome.id === 'forest' && treeTypeRand < 0.42) {
              this.placeSpruceTree(setBlock, getBlock, lx, surfY + 1, lz, wx, wz);
            } else {
              this.placeOakTree(setBlock, getBlock, lx, surfY + 1, lz, wx, wz);
            }
          } else if (r >= treeChance && r < treeChance + 0.085) {
            setBlock(lx, surfY + 1, lz, BlockId.TALL_GRASS);
          } else if (r >= treeChance + 0.085 && r < treeChance + 0.105) {
            setBlock(lx, surfY + 1, lz, BlockId.FLOWER_RED);
          } else if (r >= treeChance + 0.105 && r < treeChance + 0.125) {
            setBlock(lx, surfY + 1, lz, BlockId.FLOWER_YELLOW);
          } else if (biome.id === 'forest' && r > 0.994) {
            // Mossy forest boulder
            setBlock(lx, surfY + 1, lz, BlockId.COBBLESTONE);
          }
        }
      }
    }

    return data;
  }

  private placeOakTree(
    setBlock: (lx: number, y: number, lz: number, id: BlockId) => void,
    getBlock: (lx: number, y: number, lz: number) => BlockId,
    lx: number,
    baseY: number,
    lz: number,
    wx: number,
    wz: number
  ): void {
    const trunkHeight = 4 + Math.floor(coordHash(wx, baseY, wz, this.numericSeed + 55) * 2);

    // Canopy
    for (let dy = trunkHeight - 2; dy <= trunkHeight + 1; dy++) {
      const radius = dy >= trunkHeight ? 1 : 2;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (radius === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) {
            if (coordHash(wx + dx, baseY + dy, wz + dz, this.numericSeed) < 0.45) continue;
          }
          const cur = getBlock(lx + dx, baseY + dy, lz + dz);
          if (cur === BlockId.AIR || cur === BlockId.TALL_GRASS) {
            setBlock(lx + dx, baseY + dy, lz + dz, BlockId.LEAVES);
          }
        }
      }
    }

    // Trunk
    for (let dy = 0; dy < trunkHeight; dy++) {
      setBlock(lx, baseY + dy, lz, BlockId.WOOD);
    }
    setBlock(lx, baseY - 1, lz, BlockId.DIRT);
  }

  private placeSpruceTree(
    setBlock: (lx: number, y: number, lz: number, id: BlockId) => void,
    getBlock: (lx: number, y: number, lz: number) => BlockId,
    lx: number,
    baseY: number,
    lz: number,
    wx: number,
    wz: number
  ): void {
    const trunkHeight = 5 + Math.floor(coordHash(wx, baseY, wz, this.numericSeed + 77) * 2);

    for (let dy = 2; dy <= trunkHeight + 1; dy++) {
      const radius = dy === trunkHeight + 1 ? 0 : dy >= trunkHeight - 1 ? 1 : 2;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (radius === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          const cur = getBlock(lx + dx, baseY + dy, lz + dz);
          if (cur === BlockId.AIR || cur === BlockId.TALL_GRASS) {
            setBlock(lx + dx, baseY + dy, lz + dz, BlockId.PINE_LEAVES);
          }
        }
      }
    }

    for (let dy = 0; dy < trunkHeight; dy++) {
      setBlock(lx, baseY + dy, lz, BlockId.PINE_WOOD);
    }
    setBlock(lx, baseY - 1, lz, BlockId.DIRT);
  }
}
