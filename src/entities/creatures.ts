import * as THREE from 'three';
import { WorldManager } from '../world/world';
import { SEA_LEVEL } from '../world/generator';
import { isSolidAt } from '../player/physics';

export type CreatureType = 'forest_hopper' | 'rockling' | 'night_crawler';
export type AIState = 'idle' | 'wander' | 'flee' | 'chase';

export interface CreatureEntity {
  id: number;
  type: CreatureType;
  name: string;
  hostile: boolean;
  group: THREE.Group;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  health: number;
  maxHealth: number;
  state: AIState;
  stateTimer: number;
  attackCooldown: number;
  hurtFlashTimer: number;
  animPhase: number;
}

export class CreatureManager {
  public readonly scene: THREE.Scene;
  public creatures: CreatureEntity[] = [];
  private nextId = 1;
  private spawnTimer = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public clear(): void {
    for (const c of this.creatures) {
      this.scene.remove(c.group);
    }
    this.creatures = [];
  }

  private buildCreatureModel(type: CreatureType): THREE.Group {
    const group = new THREE.Group();

    if (type === 'forest_hopper') {
      // Friendly woodland creature: warm amber-green body, big alert ears, cotton tail
      const bodyMat = new THREE.MeshLambertMaterial({ color: '#78b856' });
      const bellyMat = new THREE.MeshLambertMaterial({ color: '#d8f0b8' });
      const eyeMat = new THREE.MeshBasicMaterial({ color: '#1b2418' });

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.65), bodyMat);
      body.position.set(0, 0.3, 0);
      group.add(body);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.38), bodyMat);
      head.position.set(0, 0.55, -0.28);
      group.add(head);

      const earL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1), bellyMat);
      earL.position.set(-0.12, 0.84, -0.26);
      group.add(earL);

      const earR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1), bellyMat);
      earR.position.set(0.12, 0.84, -0.26);
      group.add(earR);

      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.05), eyeMat);
      eyeL.position.set(-0.14, 0.58, -0.47);
      group.add(eyeL);

      const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.05), eyeMat);
      eyeR.position.set(0.14, 0.58, -0.47);
      group.add(eyeR);
    } else if (type === 'rockling') {
      // Sturdy blocky stone creature with glowing cyan crystal crest
      const stoneMat = new THREE.MeshLambertMaterial({ color: '#767d87' });
      const mossMat = new THREE.MeshLambertMaterial({ color: '#538a4c' });
      const crystalMat = new THREE.MeshBasicMaterial({ color: '#5ce6e6' });

      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.65, 0.7), stoneMat);
      torso.position.set(0, 0.42, 0);
      group.add(torso);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.16, 0.62), mossMat);
      cap.position.set(0, 0.8, 0);
      group.add(cap);

      const crystal = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.22), crystalMat);
      crystal.position.set(0, 0.96, 0);
      crystal.rotation.y = Math.PI / 4;
      group.add(crystal);

      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.05), crystalMat);
      eyeL.position.set(-0.18, 0.5, -0.36);
      group.add(eyeL);

      const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.05), crystalMat);
      eyeR.position.set(0.18, 0.5, -0.36);
      group.add(eyeR);
    } else {
      // Night Crawler: dark carapace stalker with glowing crimson eyes
      const shellMat = new THREE.MeshLambertMaterial({ color: '#291d3b' });
      const spineMat = new THREE.MeshLambertMaterial({ color: '#523478' });
      const glowMat = new THREE.MeshBasicMaterial({ color: '#ff425e' });

      const carapace = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.48, 0.95), shellMat);
      carapace.position.set(0, 0.38, 0);
      group.add(carapace);

      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.72), spineMat);
      ridge.position.set(0, 0.68, 0.05);
      group.add(ridge);

      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.06), glowMat);
      eyeL.position.set(-0.2, 0.44, -0.48);
      group.add(eyeL);

      const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.06), glowMat);
      eyeR.position.set(0.2, 0.44, -0.48);
      group.add(eyeR);
    }

    return group;
  }

  public spawnCreature(type: CreatureType, x: number, y: number, z: number): CreatureEntity {
    const group = this.buildCreatureModel(type);
    group.position.set(x, y, z);
    this.scene.add(group);

    const isHostile = type === 'night_crawler';
    const maxHealth = type === 'rockling' ? 16 : isHostile ? 12 : 8;
    const name =
      type === 'forest_hopper'
        ? 'Forest Hopper'
        : type === 'rockling'
        ? 'Rockling'
        : 'Night Crawler';

    const entity: CreatureEntity = {
      id: this.nextId++,
      type,
      name,
      hostile: isHostile,
      group,
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: Math.random() * Math.PI * 2,
      health: maxHealth,
      maxHealth,
      state: 'idle',
      stateTimer: 1.5 + Math.random() * 2.5,
      attackCooldown: 0,
      hurtFlashTimer: 0,
      animPhase: Math.random() * 10,
    };

    this.creatures.push(entity);
    return entity;
  }

  public tryAttackCreatureAtRay(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    damage: number,
    maxDist = 4.2
  ): { hitCreature: CreatureEntity; killed: boolean } | null {
    let closest: CreatureEntity | null = null;
    let closestDist = maxDist;

    for (const c of this.creatures) {
      const center = new THREE.Vector3(c.x, c.y + 0.45, c.z);
      const toCenter = center.clone().sub(origin);
      const proj = toCenter.dot(dir);
      if (proj < 0 || proj > closestDist) continue;
      const perpSq = toCenter.lengthSq() - proj * proj;
      if (perpSq < 0.55 * 0.55) {
        closest = c;
        closestDist = proj;
      }
    }

    if (!closest) return null;

    closest.health -= damage;
    closest.hurtFlashTimer = 0.25;
    // Knockback away from player
    closest.vx = dir.x * 5.5;
    closest.vz = dir.z * 5.5;
    closest.vy = 4.2;

    if (closest.type === 'forest_hopper') {
      closest.state = 'flee';
      closest.stateTimer = 4.0;
    }

    if (closest.health <= 0) {
      this.scene.remove(closest.group);
      const idx = this.creatures.indexOf(closest);
      if (idx >= 0) this.creatures.splice(idx, 1);
      return { hitCreature: closest, killed: true };
    }

    return { hitCreature: closest, killed: false };
  }

  public update(
    dt: number,
    world: WorldManager,
    playerPos: THREE.Vector3,
    isNight: boolean,
    isSurvival: boolean,
    onPlayerAttacked: (damage: number, attackerName: string) => void
  ): void {
    const clampedDt = Math.min(dt, 0.08);
    this.spawnTimer += clampedDt;

    // Maintain a small population of creatures around the player (up to 7)
    if (this.spawnTimer >= 4.0 && this.creatures.length < 7) {
      this.spawnTimer = 0;
      const angle = Math.random() * Math.PI * 2;
      const dist = 12 + Math.random() * 14;
      const sx = Math.floor(playerPos.x + Math.cos(angle) * dist);
      const sz = Math.floor(playerPos.z + Math.sin(angle) * dist);
      const sy = world.getHighestSolidBlockY(sx, sz);

      if (sy > SEA_LEVEL + 1) {
        const biome = world.getBiomeAt(sx, sz);
        let type: CreatureType = 'forest_hopper';
        if (isNight && Math.random() < 0.55) {
          type = 'night_crawler';
        } else if (biome.id === 'mountains' || Math.random() < 0.35) {
          type = 'rockling';
        }
        this.spawnCreature(type, sx + 0.5, sy + 1.05, sz + 0.5);
      }
    }

    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      const dx = playerPos.x - c.x;
      const dz = playerPos.z - c.z;
      const distSq = dx * dx + dz * dz;

      // Despawn creatures too far away (> 48 blocks) or Night Crawlers during bright day
      if (distSq > 48 * 48 || (c.type === 'night_crawler' && !isNight && distSq > 18 * 18)) {
        this.scene.remove(c.group);
        this.creatures.splice(i, 1);
        continue;
      }

      if (c.attackCooldown > 0) c.attackCooldown -= clampedDt;
      if (c.hurtFlashTimer > 0) c.hurtFlashTimer -= clampedDt;
      c.stateTimer -= clampedDt;

      const dist = Math.sqrt(distSq);

      // State transitions
      if (c.hostile && isSurvival && dist < 13.5) {
        c.state = 'chase';
      } else if (c.type === 'forest_hopper' && dist < 3.6 && c.state !== 'flee') {
        c.state = 'flee';
        c.stateTimer = 2.2;
      } else if (c.stateTimer <= 0) {
        if (c.state === 'idle') {
          c.state = 'wander';
          c.yaw = Math.random() * Math.PI * 2;
          c.stateTimer = 2.0 + Math.random() * 3.0;
        } else {
          c.state = 'idle';
          c.stateTimer = 1.5 + Math.random() * 2.5;
        }
      }

      // Compute horizontal speed
      let moveSpeed = 0;
      if (c.state === 'wander') {
        moveSpeed = c.type === 'rockling' ? 1.1 : 1.9;
      } else if (c.state === 'flee') {
        c.yaw = Math.atan2(-(playerPos.x - c.x), -(playerPos.z - c.z));
        moveSpeed = 3.5;
      } else if (c.state === 'chase') {
        c.yaw = Math.atan2(playerPos.x - c.x, playerPos.z - c.z);
        moveSpeed = 2.85;
        if (dist < 1.35 && c.attackCooldown <= 0 && Math.abs(playerPos.y - c.y) < 1.8) {
          c.attackCooldown = 1.4;
          onPlayerAttacked(2, c.name);
        }
      }

      const targetVx = Math.sin(c.yaw) * moveSpeed;
      const targetVz = Math.cos(c.yaw) * moveSpeed;
      c.vx += (targetVx - c.vx) * Math.min(1, clampedDt * 8);
      c.vz += (targetVz - c.vz) * Math.min(1, clampedDt * 8);
      c.vy -= 22.0 * clampedDt;

      // Move X & Z with auto-hop over 1-block ledges
      const nextX = c.x + c.vx * clampedDt;
      const nextZ = c.z + c.vz * clampedDt;
      const blockedX = isSolidAt(world, Math.floor(nextX), Math.floor(c.y + 0.2), Math.floor(c.z));
      const blockedZ = isSolidAt(world, Math.floor(c.x), Math.floor(c.y + 0.2), Math.floor(nextZ));

      if (!blockedX) {
        c.x = nextX;
      } else if (
        !isSolidAt(world, Math.floor(nextX), Math.floor(c.y + 1.2), Math.floor(c.z)) &&
        isSolidAt(world, Math.floor(c.x), Math.floor(c.y - 0.1), Math.floor(c.z))
      ) {
        c.vy = 6.8;
      }

      if (!blockedZ) {
        c.z = nextZ;
      } else if (
        !isSolidAt(world, Math.floor(c.x), Math.floor(c.y + 1.2), Math.floor(nextZ)) &&
        isSolidAt(world, Math.floor(c.x), Math.floor(c.y - 0.1), Math.floor(c.z))
      ) {
        c.vy = 6.8;
      }

      // Move Y
      const nextY = c.y + c.vy * clampedDt;
      if (!isSolidAt(world, Math.floor(c.x), Math.floor(nextY), Math.floor(c.z))) {
        c.y = nextY;
      } else {
        if (c.vy < 0) {
          c.y = Math.floor(nextY) + 1.001;
          if (c.type === 'forest_hopper' && moveSpeed > 0.5) {
            c.vy = 3.8; // Gentle hop while moving
          } else {
            c.vy = 0;
          }
        } else {
          c.vy = 0;
        }
      }

      c.animPhase += clampedDt * (moveSpeed > 0.2 ? 8 : 2);
      const bob = moveSpeed > 0.2 ? Math.abs(Math.sin(c.animPhase)) * 0.06 : 0;
      c.group.position.set(c.x, c.y + bob, c.z);
      // Model faces -Z locally, so rotate by yaw + PI
      c.group.rotation.y = c.yaw + Math.PI;
      c.group.scale.setScalar(c.hurtFlashTimer > 0 ? 1.12 : 1.0);
    }
  }
}
