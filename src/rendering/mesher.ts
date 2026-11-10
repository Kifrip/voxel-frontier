import { BLOCK_DEFINITIONS, BlockId } from '../world/blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE } from '../world/generator';
import { getTileUV } from './textures';

export interface ChunkMeshArrays {
  solidPositions: Float32Array;
  solidNormals: Float32Array;
  solidUVs: Float32Array;
  solidColors: Float32Array;
  solidIndices: Uint32Array;

  waterPositions: Float32Array;
  waterNormals: Float32Array;
  waterUVs: Float32Array;
  waterColors: Float32Array;
  waterIndices: Uint32Array;
}

interface FaceSpec {
  dir: [number, number, number];
  faceKey: 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';
  shade: number;
  corners: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number]
  ];
}

const CUBE_FACES: FaceSpec[] = [
  {
    // Top (+Y)
    dir: [0, 1, 0],
    faceKey: 'top',
    shade: 1.0,
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    // Bottom (-Y)
    dir: [0, -1, 0],
    faceKey: 'bottom',
    shade: 0.55,
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    // South (+Z)
    dir: [0, 0, 1],
    faceKey: 'south',
    shade: 0.86,
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    // North (-Z)
    dir: [0, 0, -1],
    faceKey: 'north',
    shade: 0.8,
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
  {
    // East (+X)
    dir: [1, 0, 0],
    faceKey: 'east',
    shade: 0.74,
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
  },
  {
    // West (-X)
    dir: [-1, 0, 0],
    faceKey: 'west',
    shade: 0.74,
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
];

export function buildChunkMeshArrays(
  cx: number,
  cz: number,
  getWorldBlock: (wx: number, y: number, wz: number) => BlockId
): ChunkMeshArrays {
  const solidPos: number[] = [];
  const solidNorm: number[] = [];
  const solidUV: number[] = [];
  const solidCol: number[] = [];
  const solidIdx: number[] = [];

  const waterPos: number[] = [];
  const waterNorm: number[] = [];
  const waterUV: number[] = [];
  const waterCol: number[] = [];
  const waterIdx: number[] = [];

  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;

  // Gather light sources in or near this chunk (with 6-block margin) for warm local block illumination
  const lightSources: Array<{ x: number; y: number; z: number; level: number }> = [];
  for (let y = 1; y < CHUNK_HEIGHT; y++) {
    for (let lz = -4; lz < CHUNK_SIZE + 4; lz++) {
      for (let lx = -4; lx < CHUNK_SIZE + 4; lx++) {
        const wx = startX + lx;
        const wz = startZ + lz;
        const b = getWorldBlock(wx, y, wz);
        if (b !== BlockId.AIR) {
          const def = BLOCK_DEFINITIONS[b];
          if (def && def.lightLevel > 0) {
            lightSources.push({ x: wx + 0.5, y: y + 0.5, z: wz + 0.5, level: def.lightLevel });
          }
        }
      }
    }
  }

  const computeLightBoost = (vx: number, vy: number, vz: number): number => {
    if (lightSources.length === 0) return 0;
    let maxBoost = 0;
    for (let i = 0; i < lightSources.length; i++) {
      const ls = lightSources[i];
      const dx = vx - ls.x;
      const dy = vy - ls.y;
      const dz = vz - ls.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const radius = ls.level * 0.65;
      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        const boost = (1 - dist / radius) * 0.45;
        if (boost > maxBoost) maxBoost = boost;
      }
    }
    return maxBoost;
  };

  const computeVertexAO = (wx: number, wy: number, wz: number, dir: [number, number, number], corner: [number, number, number]): number => {
    // Subtle corner ambient occlusion check
    const checkX = wx + (dir[0] !== 0 ? dir[0] : corner[0] === 1 ? 1 : -1);
    const checkY = wy + (dir[1] !== 0 ? dir[1] : corner[1] === 1 ? 1 : -1);
    const checkZ = wz + (dir[2] !== 0 ? dir[2] : corner[2] === 1 ? 1 : -1);

    let occluders = 0;
    if (dir[1] !== 0) {
      // Top/bottom face: check 3 surrounding neighbors on the plane
      const s1 = BLOCK_DEFINITIONS[getWorldBlock(checkX, checkY, wz)]?.opaque ? 1 : 0;
      const s2 = BLOCK_DEFINITIONS[getWorldBlock(wx, checkY, checkZ)]?.opaque ? 1 : 0;
      const c = (s1 && s2) ? 1 : (BLOCK_DEFINITIONS[getWorldBlock(checkX, checkY, checkZ)]?.opaque ? 1 : 0);
      occluders = s1 + s2 + c;
    } else if (dir[0] !== 0) {
      const s1 = BLOCK_DEFINITIONS[getWorldBlock(checkX, checkY, wz)]?.opaque ? 1 : 0;
      const s2 = BLOCK_DEFINITIONS[getWorldBlock(checkX, wy, checkZ)]?.opaque ? 1 : 0;
      const c = (s1 && s2) ? 1 : (BLOCK_DEFINITIONS[getWorldBlock(checkX, checkY, checkZ)]?.opaque ? 1 : 0);
      occluders = s1 + s2 + c;
    } else {
      const s1 = BLOCK_DEFINITIONS[getWorldBlock(checkX, wy, checkZ)]?.opaque ? 1 : 0;
      const s2 = BLOCK_DEFINITIONS[getWorldBlock(wx, checkY, checkZ)]?.opaque ? 1 : 0;
      const c = (s1 && s2) ? 1 : (BLOCK_DEFINITIONS[getWorldBlock(checkX, checkY, checkZ)]?.opaque ? 1 : 0);
      occluders = s1 + s2 + c;
    }
    // Map 0..3 occluders to 1.0 .. 0.64 multiplier
    return 1.0 - occluders * 0.11;
  };

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = startX + lx;
        const wz = startZ + lz;
        const blockId = getWorldBlock(wx, y, wz);
        if (blockId === BlockId.AIR) continue;

        const def = BLOCK_DEFINITIONS[blockId];
        if (!def) continue;

        // Subtle deterministic block variation (+/- 3%) to avoid flat monotony
        const hashVar = (((wx * 73856093) ^ (y * 19349663) ^ (wz * 83492791)) & 15) / 15;
        const blockTint = 0.97 + hashVar * 0.06;

        if (def.renderShape === 'cross') {
          // Render two intersecting diagonal quads
          const uv = getTileUV(def.faces.north);
          const baseIdx = solidPos.length / 3;
          const lightBoost = computeLightBoost(wx + 0.5, y + 0.5, wz + 0.5);
          const cVal = Math.min(1.15, 0.92 * blockTint + lightBoost);

          const diagQuads = [
            [
              [0.15, 0, 0.15],
              [0.85, 0, 0.85],
              [0.85, 0.9, 0.85],
              [0.15, 0.9, 0.15],
            ],
            [
              [0.85, 0, 0.15],
              [0.15, 0, 0.85],
              [0.15, 0.9, 0.85],
              [0.85, 0.9, 0.15],
            ],
          ];

          for (const q of diagQuads) {
            // Front and back of each diagonal so it's visible from both sides
            for (const flip of [false, true]) {
              const vBase = solidPos.length / 3;
              const order = flip ? [1, 0, 3, 2] : [0, 1, 2, 3];
              const uvs: [number, number][] = [
                [uv.u0, uv.v0],
                [uv.u1, uv.v0],
                [uv.u1, uv.v1],
                [uv.u0, uv.v1],
              ];
              for (let vi = 0; vi < 4; vi++) {
                const pt = q[order[vi]];
                solidPos.push(lx + pt[0], y + pt[1], lz + pt[2]);
                solidNorm.push(0, 1, 0);
                solidUV.push(uvs[vi][0], uvs[vi][1]);
                solidCol.push(cVal, cVal, cVal);
              }
              solidIdx.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
            }
          }
          void baseIdx;
          continue;
        }

        if (def.renderShape === 'torch') {
          // Render slim 3D torch pillar in center of block
          const uv = getTileUV(def.faces.north);
          const minX = 0.4, maxX = 0.6;
          const minZ = 0.4, maxZ = 0.6;
          const minY = 0.0, maxY = 0.68;

          for (const face of CUBE_FACES) {
            const vBase = solidPos.length / 3;
            for (let vi = 0; vi < 4; vi++) {
              const c = face.corners[vi];
              const px = lx + (c[0] ? maxX : minX);
              const py = y + (c[1] ? maxY : minY);
              const pz = lz + (c[2] ? maxZ : minZ);
              solidPos.push(px, py, pz);
              solidNorm.push(face.dir[0], face.dir[1], face.dir[2]);
              solidCol.push(1.15, 1.08, 0.95);
            }
            solidUV.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);
            solidIdx.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
          }
          continue;
        }

        if (def.renderShape === 'liquid') {
          // Water mesh pass
          const topIsWater = getWorldBlock(wx, y + 1, wz) === BlockId.WATER;
          const topY = topIsWater ? 1.0 : 0.86;

          for (const face of CUBE_FACES) {
            const nx = wx + face.dir[0];
            const ny = y + face.dir[1];
            const nz = wz + face.dir[2];
            const neighbor = getWorldBlock(nx, ny, nz);
            if (neighbor === BlockId.WATER) continue;
            const neighborDef = BLOCK_DEFINITIONS[neighbor];
            if (neighborDef && neighborDef.opaque) continue;

            const uv = getTileUV(def.faces[face.faceKey]);
            const vBase = waterPos.length / 3;
            for (let vi = 0; vi < 4; vi++) {
              const c = face.corners[vi];
              const py = y + (c[1] === 1 ? topY : 0);
              waterPos.push(lx + c[0], py, lz + c[2]);
              waterNorm.push(face.dir[0], face.dir[1], face.dir[2]);
              const shade = face.shade * blockTint;
              waterCol.push(shade, shade, shade);
            }
            waterUV.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);
            waterIdx.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
          }
          continue;
        }

        // Standard solid cube block
        for (const face of CUBE_FACES) {
          const nx = wx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = wz + face.dir[2];

          if (ny < 0) continue; // Don't render bottom of world

          const neighbor = getWorldBlock(nx, ny, nz);
          if (neighbor !== BlockId.AIR) {
            const neighborDef = BLOCK_DEFINITIONS[neighbor];
            if (neighborDef) {
              if (neighborDef.opaque) continue;
              // Cull glass against adjacent glass
              if (blockId === neighbor && !def.opaque) continue;
            }
          }

          const tileIdx = def.faces[face.faceKey];
          const uv = getTileUV(tileIdx);
          const vBase = solidPos.length / 3;

          for (let vi = 0; vi < 4; vi++) {
            const c = face.corners[vi];
            const vx = lx + c[0];
            const vy = y + c[1];
            const vz = lz + c[2];
            solidPos.push(vx, vy, vz);
            solidNorm.push(face.dir[0], face.dir[1], face.dir[2]);

            const ao = computeVertexAO(wx, y, wz, face.dir, c);
            const boost = computeLightBoost(wx + c[0], vy, wz + c[2]);
            const baseShade = face.shade * ao * blockTint;
            const r = Math.min(1.2, baseShade + boost * 1.1);
            const g = Math.min(1.15, baseShade + boost * 0.95);
            const b = Math.min(1.1, baseShade + boost * 0.7);
            solidCol.push(r, g, b);
          }

          solidUV.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);
          solidIdx.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
        }
      }
    }
  }

  return {
    solidPositions: new Float32Array(solidPos),
    solidNormals: new Float32Array(solidNorm),
    solidUVs: new Float32Array(solidUV),
    solidColors: new Float32Array(solidCol),
    solidIndices: new Uint32Array(solidIdx),

    waterPositions: new Float32Array(waterPos),
    waterNormals: new Float32Array(waterNorm),
    waterUVs: new Float32Array(waterUV),
    waterColors: new Float32Array(waterCol),
    waterIndices: new Uint32Array(waterIdx),
  };
}
