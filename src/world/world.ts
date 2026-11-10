import * as THREE from 'three';
import { BLOCK_DEFINITIONS, BlockId } from './blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL, TerrainGenerator, BiomeInfo } from './generator';
import { buildChunkMeshArrays } from '../rendering/mesher';

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function worldToChunkCoords(wx: number, wz: number): {
  cx: number;
  cz: number;
  lx: number;
  lz: number;
} {
  const bx = Math.floor(wx);
  const bz = Math.floor(wz);
  const cx = Math.floor(bx / CHUNK_SIZE);
  const cz = Math.floor(bz / CHUNK_SIZE);
  const lx = ((bx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const lz = ((bz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return { cx, cz, lx, lz };
}

export function localIndex(lx: number, y: number, lz: number): number {
  return y * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx;
}

export type SerializedChunkMods = Record<string, Array<[number, number]>>;

export class WorldManager {
  public readonly scene: THREE.Scene;
  public generator: TerrainGenerator;
  public renderDistance = 4; // Configurable in settings (2..8)
  public shadowsEnabled = true;

  private chunks = new Map<string, Uint8Array>();
  private meshes = new Map<
    string,
    { solid: THREE.Mesh | null; water: THREE.Mesh | null }
  >();
  // Persistent player block edits organized by chunk key -> Map<localIndex, BlockId>
  private modifications = new Map<string, Map<number, BlockId>>();

  private dirtyChunks = new Set<string>();
  private generationQueue: Array<{ cx: number; cz: number; distSq: number }> = [];
  private queuedSet = new Set<string>();

  public readonly solidMaterial: THREE.MeshLambertMaterial;
  public readonly waterMaterial: THREE.MeshLambertMaterial;

  constructor(scene: THREE.Scene, atlasTexture: THREE.Texture, seed: string | number = 'VoxelFrontier') {
    this.scene = scene;
    this.generator = new TerrainGenerator(seed);

    this.solidMaterial = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      vertexColors: true,
      alphaTest: 0.4,
      side: THREE.FrontSide,
    });

    this.waterMaterial = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  public resetWithSeed(
    seed: string | number,
    savedMods?: SerializedChunkMods
  ): void {
    this.clearAllChunks();
    this.modifications.clear();
    this.generator = new TerrainGenerator(seed);

    if (savedMods) {
      for (const [key, entries] of Object.entries(savedMods)) {
        const map = new Map<number, BlockId>();
        for (const [idx, blockId] of entries) {
          map.set(idx, blockId as BlockId);
        }
        if (map.size > 0) {
          this.modifications.set(key, map);
        }
      }
    }
  }

  public clearAllChunks(): void {
    for (const key of this.meshes.keys()) {
      this.disposeChunkMesh(key);
    }
    this.meshes.clear();
    this.chunks.clear();
    this.dirtyChunks.clear();
    this.generationQueue = [];
    this.queuedSet.clear();
  }

  public serializeModifications(): SerializedChunkMods {
    const out: SerializedChunkMods = {};
    for (const [key, map] of this.modifications.entries()) {
      if (map.size > 0) {
        out[key] = Array.from(map.entries());
      }
    }
    return out;
  }

  public getModifiedBlockCount(): number {
    let total = 0;
    for (const map of this.modifications.values()) {
      total += map.size;
    }
    return total;
  }

  public getLoadedChunkCount(): number {
    return this.chunks.size;
  }

  public isChunkLoaded(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  public getBlock(wx: number, y: number, wz: number): BlockId {
    const by = Math.floor(y);
    if (by < 0 || by >= CHUNK_HEIGHT) return BlockId.AIR;
    const { cx, cz, lx, lz } = worldToChunkCoords(wx, wz);
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    const idx = localIndex(lx, by, lz);
    if (chunk) {
      return chunk[idx] as BlockId;
    }
    // Check if modified even when unloaded
    const mods = this.modifications.get(key);
    if (mods && mods.has(idx)) {
      return mods.get(idx)!;
    }
    return BlockId.AIR;
  }

  public setBlock(wx: number, y: number, wz: number, blockId: BlockId, isPlayerEdit = true): boolean {
    const by = Math.floor(y);
    if (by < 0 || by >= CHUNK_HEIGHT) return false;
    const { cx, cz, lx, lz } = worldToChunkCoords(wx, wz);
    const key = chunkKey(cx, cz);

    // Ensure chunk data exists if setting block
    if (!this.chunks.has(key)) {
      this.generateChunkSync(cx, cz);
    }

    const chunk = this.chunks.get(key)!;
    const idx = localIndex(lx, by, lz);
    const prevBlock = chunk[idx] as BlockId;
    if (prevBlock === blockId) return false;

    chunk[idx] = blockId;

    if (isPlayerEdit) {
      let mods = this.modifications.get(key);
      if (!mods) {
        mods = new Map<number, BlockId>();
        this.modifications.set(key, mods);
      }
      mods.set(idx, blockId);
    }

    // Rebuild affected chunk and any affected neighbor chunks immediately
    const affected: Array<[number, number]> = [[cx, cz]];
    const isLightChange =
      (BLOCK_DEFINITIONS[prevBlock]?.lightLevel ?? 0) > 0 ||
      (BLOCK_DEFINITIONS[blockId]?.lightLevel ?? 0) > 0;
    const margin = isLightChange ? 5 : 1;

    if (lx < margin) affected.push([cx - 1, cz]);
    if (lx >= CHUNK_SIZE - margin) affected.push([cx + 1, cz]);
    if (lz < margin) affected.push([cx, cz - 1]);
    if (lz >= CHUNK_SIZE - margin) affected.push([cx, cz + 1]);

    for (const [acx, acz] of affected) {
      const aKey = chunkKey(acx, acz);
      if (this.chunks.has(aKey)) {
        if (isPlayerEdit) {
          this.rebuildChunkMesh(acx, acz);
          this.dirtyChunks.delete(aKey);
        } else {
          this.dirtyChunks.add(aKey);
        }
      }
    }

    return true;
  }

  public generateChunkSync(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (this.chunks.has(key)) return;

    const data = this.generator.generateChunkData(cx, cz);
    const mods = this.modifications.get(key);
    if (mods) {
      for (const [idx, blockId] of mods.entries()) {
        data[idx] = blockId;
      }
    }
    this.chunks.set(key, data);
    this.dirtyChunks.add(key);

    // Also mark already-loaded immediate neighbors dirty so chunk border faces cull accurately
    const neighbors: Array<[number, number]> = [
      [cx - 1, cz],
      [cx + 1, cz],
      [cx, cz - 1],
      [cx, cz + 1],
    ];
    for (const [nx, nz] of neighbors) {
      const nKey = chunkKey(nx, nz);
      if (this.chunks.has(nKey)) {
        this.dirtyChunks.add(nKey);
      }
    }
  }

  public ensureAreaLoaded(worldX: number, worldZ: number, radius = 2): void {
    const { cx: centerCx, cz: centerCz } = worldToChunkCoords(worldX, worldZ);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        this.generateChunkSync(centerCx + dx, centerCz + dz);
      }
    }
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const cx = centerCx + dx;
        const cz = centerCz + dz;
        const key = chunkKey(cx, cz);
        if (this.dirtyChunks.has(key)) {
          this.rebuildChunkMesh(cx, cz);
          this.dirtyChunks.delete(key);
        }
      }
    }
  }

  public findSafeSpawnPoint(): { x: number; y: number; z: number } {
    // Search outward in a spiral from (8, 8) for dry land above sea level
    let bestX = 8;
    let bestZ = 8;
    for (let r = 0; r <= 64; r += 4) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const tx = Math.floor(8 + Math.cos(angle) * r);
        const tz = Math.floor(8 + Math.sin(angle) * r);
        const { height } = this.generator.getSurfaceHeight(tx, tz);
        if (height > SEA_LEVEL + 2 && height < 56) {
          bestX = tx;
          bestZ = tz;
          this.ensureAreaLoaded(bestX, bestZ, 2);
          const standY = this.getHighestSolidBlockY(bestX, bestZ);
          return { x: bestX + 0.5, y: standY + 1.05, z: bestZ + 0.5 };
        }
      }
    }
    this.ensureAreaLoaded(bestX, bestZ, 2);
    const standY = this.getHighestSolidBlockY(bestX, bestZ);
    return { x: bestX + 0.5, y: Math.max(SEA_LEVEL + 2, standY + 1.05), z: bestZ + 0.5 };
  }

  public getHighestSolidBlockY(wx: number, wz: number): number {
    const bx = Math.floor(wx);
    const bz = Math.floor(wz);
    const { cx, cz } = worldToChunkCoords(bx, bz);
    if (!this.isChunkLoaded(cx, cz)) {
      this.generateChunkSync(cx, cz);
    }
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const b = this.getBlock(bx, y, bz);
      if (BLOCK_DEFINITIONS[b]?.solid) {
        return y;
      }
    }
    return SEA_LEVEL;
  }

  public getBiomeAt(wx: number, wz: number): BiomeInfo {
    return this.generator.getBiomeInfoAt(wx, wz);
  }

  public updateAroundPlayer(playerX: number, playerZ: number): void {
    const { cx: pCx, cz: pCz } = worldToChunkCoords(playerX, playerZ);
    const rd = this.renderDistance;

    // 1. Queue missing chunks within renderDistance
    for (let dz = -rd; dz <= rd; dz++) {
      for (let dx = -rd; dx <= rd; dx++) {
        const distSq = dx * dx + dz * dz;
        if (distSq > (rd + 0.5) * (rd + 0.5)) continue;
        const cx = pCx + dx;
        const cz = pCz + dz;
        const key = chunkKey(cx, cz);
        if (!this.chunks.has(key) && !this.queuedSet.has(key)) {
          this.queuedSet.add(key);
          this.generationQueue.push({ cx, cz, distSq });
        }
      }
    }

    // Sort generation queue by closest to player
    if (this.generationQueue.length > 1) {
      this.generationQueue.sort((a, b) => {
        const da = (a.cx - pCx) * (a.cx - pCx) + (a.cz - pCz) * (a.cz - pCz);
        const db = (b.cx - pCx) * (b.cx - pCx) + (b.cz - pCz) * (b.cz - pCz);
        return da - db;
      });
    }

    // 2. Process up to 2 chunk generations per frame for smooth frame times
    let generatedCount = 0;
    while (this.generationQueue.length > 0 && generatedCount < 2) {
      const next = this.generationQueue.shift()!;
      const key = chunkKey(next.cx, next.cz);
      this.queuedSet.delete(key);
      if (!this.chunks.has(key)) {
        this.generateChunkSync(next.cx, next.cz);
        generatedCount++;
      }
    }

    // 3. Process up to 2 dirty chunk mesh rebuilds per frame, prioritizing closest
    if (this.dirtyChunks.size > 0) {
      const dirtyList = Array.from(this.dirtyChunks).map((key) => {
        const [cxStr, czStr] = key.split(',');
        const cx = Number(cxStr);
        const cz = Number(czStr);
        const distSq = (cx - pCx) * (cx - pCx) + (cz - pCz) * (cz - pCz);
        return { key, cx, cz, distSq };
      });
      dirtyList.sort((a, b) => a.distSq - b.distSq);

      const maxRebuilds = 2;
      for (let i = 0; i < Math.min(maxRebuilds, dirtyList.length); i++) {
        const item = dirtyList[i];
        this.dirtyChunks.delete(item.key);
        if (this.chunks.has(item.key)) {
          this.rebuildChunkMesh(item.cx, item.cz);
        }
      }
    }

    // 4. Unload distant chunks beyond renderDistance + 2
    const unloadDistSq = (rd + 2.2) * (rd + 2.2);
    for (const key of Array.from(this.chunks.keys())) {
      const [cxStr, czStr] = key.split(',');
      const cx = Number(cxStr);
      const cz = Number(czStr);
      const distSq = (cx - pCx) * (cx - pCx) + (cz - pCz) * (cz - pCz);
      if (distSq > unloadDistSq) {
        this.disposeChunkMesh(key);
        this.chunks.delete(key);
        this.dirtyChunks.delete(key);
      }
    }
  }

  private rebuildChunkMesh(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    this.disposeChunkMesh(key);

    const arrays = buildChunkMeshArrays(cx, cz, (wx, y, wz) => this.getBlock(wx, y, wz));
    let solidMesh: THREE.Mesh | null = null;
    let waterMesh: THREE.Mesh | null = null;

    if (arrays.solidIndices.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(arrays.solidPositions, 3));
      geom.setAttribute('normal', new THREE.BufferAttribute(arrays.solidNormals, 3));
      geom.setAttribute('uv', new THREE.BufferAttribute(arrays.solidUVs, 2));
      geom.setAttribute('color', new THREE.BufferAttribute(arrays.solidColors, 3));
      geom.setIndex(new THREE.BufferAttribute(arrays.solidIndices, 1));
      geom.computeBoundingSphere();

      solidMesh = new THREE.Mesh(geom, this.solidMaterial);
      solidMesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      solidMesh.castShadow = this.shadowsEnabled;
      solidMesh.receiveShadow = this.shadowsEnabled;
      solidMesh.frustumCulled = true;
      this.scene.add(solidMesh);
    }

    if (arrays.waterIndices.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(arrays.waterPositions, 3));
      geom.setAttribute('normal', new THREE.BufferAttribute(arrays.waterNormals, 3));
      geom.setAttribute('uv', new THREE.BufferAttribute(arrays.waterUVs, 2));
      geom.setAttribute('color', new THREE.BufferAttribute(arrays.waterColors, 3));
      geom.setIndex(new THREE.BufferAttribute(arrays.waterIndices, 1));
      geom.computeBoundingSphere();

      waterMesh = new THREE.Mesh(geom, this.waterMaterial);
      waterMesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      waterMesh.receiveShadow = this.shadowsEnabled;
      waterMesh.frustumCulled = true;
      waterMesh.renderOrder = 1;
      this.scene.add(waterMesh);
    }

    this.meshes.set(key, { solid: solidMesh, water: waterMesh });
  }

  private disposeChunkMesh(key: string): void {
    const entry = this.meshes.get(key);
    if (!entry) return;
    if (entry.solid) {
      this.scene.remove(entry.solid);
      entry.solid.geometry.dispose();
    }
    if (entry.water) {
      this.scene.remove(entry.water);
      entry.water.geometry.dispose();
    }
    this.meshes.delete(key);
  }

  public setShadowsEnabled(enabled: boolean): void {
    this.shadowsEnabled = enabled;
    for (const entry of this.meshes.values()) {
      if (entry.solid) {
        entry.solid.castShadow = enabled;
        entry.solid.receiveShadow = enabled;
      }
      if (entry.water) {
        entry.water.receiveShadow = enabled;
      }
    }
  }
}
