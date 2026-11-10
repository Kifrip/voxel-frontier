import { BLOCK_DEFINITIONS, BlockId } from '../world/blocks';
import { WorldManager, worldToChunkCoords } from '../world/world';

export const PLAYER_HALF_WIDTH = 0.3;
export const PLAYER_HEIGHT = 1.75;
export const PLAYER_EYE_HEIGHT = 1.58;
export const GRAVITY = 24.0;
export const JUMP_VELOCITY = 8.5;

export interface RaycastHit {
  bx: number;
  by: number;
  bz: number;
  nx: number;
  ny: number;
  nz: number;
  blockId: BlockId;
  distance: number;
}

export function isSolidAt(world: WorldManager, bx: number, by: number, bz: number): boolean {
  const id = world.getBlock(bx, by, bz);
  return BLOCK_DEFINITIONS[id]?.solid ?? false;
}

export function checkAABBCollision(
  world: WorldManager,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number
): boolean {
  const startX = Math.floor(minX);
  const endX = Math.floor(maxX - 1e-5);
  const startY = Math.floor(minY);
  const endY = Math.floor(maxY - 1e-5);
  const startZ = Math.floor(minZ);
  const endZ = Math.floor(maxZ - 1e-5);

  for (let y = startY; y <= endY; y++) {
    for (let z = startZ; z <= endZ; z++) {
      for (let x = startX; x <= endX; x++) {
        if (isSolidAt(world, x, y, z)) {
          return true;
        }
      }
    }
  }
  return false;
}

export function wouldBlockOverlapPlayer(
  bx: number,
  by: number,
  bz: number,
  px: number,
  py: number,
  pz: number
): boolean {
  const pMinX = px - PLAYER_HALF_WIDTH + 0.02;
  const pMaxX = px + PLAYER_HALF_WIDTH - 0.02;
  const pMinY = py + 0.02;
  const pMaxY = py + PLAYER_HEIGHT - 0.02;
  const pMinZ = pz - PLAYER_HALF_WIDTH + 0.02;
  const pMaxZ = pz + PLAYER_HALF_WIDTH - 0.02;

  return (
    bx + 1 > pMinX &&
    bx < pMaxX &&
    by + 1 > pMinY &&
    by < pMaxY &&
    bz + 1 > pMinZ &&
    bz < pMaxZ
  );
}

export function isPlayerInWater(world: WorldManager, px: number, py: number, pz: number): boolean {
  const feetBlock = world.getBlock(Math.floor(px), Math.floor(py + 0.2), Math.floor(pz));
  const waistBlock = world.getBlock(Math.floor(px), Math.floor(py + 0.9), Math.floor(pz));
  return feetBlock === BlockId.WATER || waistBlock === BlockId.WATER;
}

export function isCameraUnderwater(world: WorldManager, px: number, py: number, pz: number): boolean {
  const eyeY = py + PLAYER_EYE_HEIGHT;
  return world.getBlock(Math.floor(px), Math.floor(eyeY), Math.floor(pz)) === BlockId.WATER;
}

export interface PhysicsState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
  inWater: boolean;
  flying: boolean;
  fallPeakY: number;
}

export function stepPlayerPhysics(
  world: WorldManager,
  state: PhysicsState,
  wishVelX: number,
  wishVelZ: number,
  jumpPressed: boolean,
  descendPressed: boolean,
  dt: number
): { landedFallDistance: number; footstepMoved: number } {
  const clampedDt = Math.min(dt, 0.1);
  const steps = Math.max(1, Math.ceil(clampedDt / 0.02));
  const subDt = clampedDt / steps;

  let landedFallDistance = 0;
  let footstepMoved = 0;

  // Ensure chunk under player is loaded so player never falls into void at chunk boundary
  const { cx, cz } = worldToChunkCoords(state.x, state.z);
  if (!world.isChunkLoaded(cx, cz)) {
    world.generateChunkSync(cx, cz);
  }

  for (let s = 0; s < steps; s++) {
    state.inWater = isPlayerInWater(world, state.x, state.y, state.z);

    if (state.flying) {
      state.vx = wishVelX * 1.65;
      state.vz = wishVelZ * 1.65;
      state.vy = 0;
      if (jumpPressed) state.vy += 9.0;
      if (descendPressed) state.vy -= 9.0;
      state.fallPeakY = state.y;
    } else if (state.inWater) {
      state.vx = wishVelX * 0.68;
      state.vz = wishVelZ * 0.68;
      state.vy -= GRAVITY * 0.25 * subDt;
      state.vy = Math.max(state.vy, -3.2);
      if (jumpPressed) {
        state.vy = 4.4;
      }
      state.fallPeakY = state.y;
    } else {
      state.vx = wishVelX;
      state.vz = wishVelZ;
      if (jumpPressed && state.onGround) {
        state.vy = JUMP_VELOCITY;
        state.onGround = false;
        state.fallPeakY = state.y;
      }
      state.vy -= GRAVITY * subDt;
      state.vy = Math.max(state.vy, -38.0);
    }

    // Track highest point while airborne
    if (!state.onGround && !state.flying && !state.inWater) {
      if (state.y > state.fallPeakY) {
        state.fallPeakY = state.y;
      }
    } else {
      state.fallPeakY = state.y;
    }

    const hw = PLAYER_HALF_WIDTH;
    const h = PLAYER_HEIGHT;

    // 1. Move Y first so jumping immediately gains vertical clearance
    const nextY = state.y + state.vy * subDt;
    if (
      !checkAABBCollision(
        world,
        state.x - hw,
        nextY,
        state.z - hw,
        state.x + hw,
        nextY + h,
        state.z + hw
      )
    ) {
      state.y = nextY;
      state.onGround = false;
    } else {
      if (state.vy < 0) {
        // Landed on solid ground
        if (!state.onGround && !state.flying && !state.inWater) {
          const fallDist = state.fallPeakY - state.y;
          if (fallDist > landedFallDistance) {
            landedFallDistance = fallDist;
          }
        }
        state.y = Math.floor(state.y) + 1e-4;
        while (
          checkAABBCollision(
            world,
            state.x - hw,
            state.y,
            state.z - hw,
            state.x + hw,
            state.y + h,
            state.z + hw
          )
        ) {
          state.y += 0.05;
        }
        state.onGround = true;
        state.fallPeakY = state.y;
        if (state.flying) {
          state.flying = false;
        }
      }
      state.vy = 0;
    }

    // 2. Move X
    const nextX = state.x + state.vx * subDt;
    if (
      !checkAABBCollision(
        world,
        nextX - hw,
        state.y,
        state.z - hw,
        nextX + hw,
        state.y + h,
        state.z + hw
      )
    ) {
      footstepMoved += Math.abs(nextX - state.x);
      state.x = nextX;
    } else {
      state.vx = 0;
    }

    // 3. Move Z
    const nextZ = state.z + state.vz * subDt;
    if (
      !checkAABBCollision(
        world,
        state.x - hw,
        state.y,
        nextZ - hw,
        state.x + hw,
        state.y + h,
        nextZ + hw
      )
    ) {
      footstepMoved += Math.abs(nextZ - state.z);
      state.z = nextZ;
    } else {
      state.vz = 0;
    }

    // Prevent falling below bedrock
    if (state.y < 1.0) {
      state.y = 1.05;
      state.vy = 0;
      state.onGround = true;
    }
  }

  return { landedFallDistance, footstepMoved };
}

// Fast 3D Voxel DDA Raycast (Amanatides & Woo algorithm)
export function raycastVoxel(
  world: WorldManager,
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDistance = 6.0
): RaycastHit | null {
  const len = Math.hypot(dirX, dirY, dirZ);
  if (len < 1e-8) return null;
  const dx = dirX / len;
  const dy = dirY / len;
  const dz = dirZ / len;

  let x = Math.floor(originX);
  let y = Math.floor(originY);
  let z = Math.floor(originZ);

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

  let tMaxX =
    stepX > 0
      ? (x + 1 - originX) * tDeltaX
      : stepX < 0
      ? (originX - x) * tDeltaX
      : Infinity;
  let tMaxY =
    stepY > 0
      ? (y + 1 - originY) * tDeltaY
      : stepY < 0
      ? (originY - y) * tDeltaY
      : Infinity;
  let tMaxZ =
    stepZ > 0
      ? (z + 1 - originZ) * tDeltaZ
      : stepZ < 0
      ? (originZ - z) * tDeltaZ
      : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let dist = 0;

  while (dist <= maxDistance) {
    const blockId = world.getBlock(x, y, z);
    if (blockId !== BlockId.AIR) {
      const def = BLOCK_DEFINITIONS[blockId];
      if (def && def.targetable) {
        return {
          bx: x,
          by: y,
          bz: z,
          nx,
          ny,
          nz,
          blockId,
          distance: dist,
        };
      }
    }

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        x += stepX;
        dist = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else {
        z += stepZ;
        dist = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        y += stepY;
        dist = tMaxY;
        tMaxY += tDeltaY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        z += stepZ;
        dist = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    }
  }

  return null;
}
