import * as THREE from 'three';
import {
  PLAYER_EYE_HEIGHT,
  PhysicsState,
  RaycastHit,
  raycastVoxel,
  stepPlayerPhysics,
} from './physics';
import { WorldManager } from '../world/world';
import { BLOCK_DEFINITIONS } from '../world/blocks';
import { SoundCategory } from '../world/blocks';

export type GameMode = 'survival' | 'creative';

export class PlayerController {
  public readonly camera: THREE.PerspectiveCamera;
  public state: PhysicsState = {
    x: 8.5,
    y: 45,
    z: 8.5,
    vx: 0,
    vy: 0,
    vz: 0,
    onGround: false,
    inWater: false,
    flying: false,
    fallPeakY: 45,
  };

  public yaw = 0; // Radians around Y axis
  public pitch = -0.12; // Radians around X axis
  public gameMode: GameMode = 'survival';

  public health = 20;
  public maxHealth = 20;
  public damageFlashTimer = 0;

  // Settings
  public baseFov = 75;
  public mouseSensitivity = 1.0;
  public headBobEnabled = true;

  // Input state
  public keys = new Set<string>();
  public leftMouseDown = false;
  public rightMouseDown = false;

  private lastSpacePressTime = 0;
  private bobTimer = 0;
  private footstepAccum = 0;

  // Callbacks
  public onFootstep?: (category: SoundCategory) => void;
  public onJump?: () => void;
  public onDamage?: (amount: number, reason: string) => void;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.camera.rotation.order = 'YXZ';
  }

  public setPosition(x: number, y: number, z: number, yaw = 0, pitch = -0.1): void {
    this.state.x = x;
    this.state.y = y;
    this.state.z = z;
    this.state.vx = 0;
    this.state.vy = 0;
    this.state.vz = 0;
    this.state.fallPeakY = y;
    this.yaw = yaw;
    this.pitch = pitch;
    this.syncCamera(0);
  }

  public handleMouseMove(movementX: number, movementY: number): void {
    const sens = 0.0022 * this.mouseSensitivity;
    this.yaw -= movementX * sens;
    this.pitch -= movementY * sens;
    const maxPitch = Math.PI / 2 - 0.04;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
  }

  public handleSpaceKeyDown(): void {
    const now = performance.now();
    if (this.gameMode === 'creative') {
      if (now - this.lastSpacePressTime < 320) {
        this.state.flying = !this.state.flying;
        this.state.vy = 0;
        this.lastSpacePressTime = 0;
        return;
      }
    }
    this.lastSpacePressTime = now;
  }

  public takeDamage(amount: number, reason = 'impact'): void {
    if (this.gameMode === 'creative' || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.damageFlashTimer = 0.35;
    if (this.onDamage) {
      this.onDamage(amount, reason);
    }
  }

  public heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  public update(world: WorldManager, dt: number, controlsActive: boolean): void {
    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt);
    }

    if (this.gameMode !== 'creative' && this.state.flying) {
      this.state.flying = false;
    }

    let forward = 0;
    let right = 0;
    let jumpPressed = false;
    let sprintPressed = false;
    let descendPressed = false;

    if (controlsActive) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) right += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) right -= 1;
      jumpPressed = this.keys.has('Space');
      sprintPressed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      descendPressed = this.state.flying && sprintPressed;
    }

    const inputLen = Math.hypot(forward, right);
    if (inputLen > 1) {
      forward /= inputLen;
      right /= inputLen;
    }

    const isSprinting = sprintPressed && forward > 0 && !this.state.flying;
    const baseSpeed = 4.6;
    const moveSpeed = isSprinting ? baseSpeed * 1.48 : baseSpeed;

    // Forward vector on XZ plane (camera looks along -Z when yaw=0)
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const forwardX = -sinY;
    const forwardZ = -cosY;
    const rightX = cosY;
    const rightZ = -sinY;

    const wishVelX = (forwardX * forward + rightX * right) * moveSpeed;
    const wishVelZ = (forwardZ * forward + rightZ * right) * moveSpeed;

    const wasOnGround = this.state.onGround;
    const { landedFallDistance, footstepMoved } = stepPlayerPhysics(
      world,
      this.state,
      wishVelX,
      wishVelZ,
      jumpPressed,
      descendPressed,
      dt
    );

    if (wasOnGround && !this.state.onGround && jumpPressed && !this.state.flying) {
      if (this.onJump) this.onJump();
    }

    // Fall damage in survival mode
    if (this.gameMode === 'survival' && landedFallDistance > 3.8) {
      const dmg = Math.max(1, Math.floor((landedFallDistance - 3.3) * 1.6));
      this.takeDamage(dmg, 'fall');
    }

    // Footstep sound & head bobbing
    if (this.state.onGround && footstepMoved > 0.001 && !this.state.flying) {
      this.footstepAccum += footstepMoved;
      this.bobTimer += footstepMoved * 2.8;
      if (this.footstepAccum >= 2.05) {
        this.footstepAccum = 0;
        const underBlock = world.getBlock(
          Math.floor(this.state.x),
          Math.floor(this.state.y - 0.2),
          Math.floor(this.state.z)
        );
        const cat = BLOCK_DEFINITIONS[underBlock]?.soundCategory ?? 'grass';
        if (this.onFootstep) this.onFootstep(cat);
      }
    } else {
      this.bobTimer = 0;
    }

    // Smooth sprint FOV adjustment
    const targetFov = this.baseFov + (isSprinting ? 6 : 0) + (this.state.flying ? 4 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
    }

    this.syncCamera(footstepMoved);
  }

  private syncCamera(movedAmount: number): void {
    let bobOffsetY = 0;
    let bobOffsetX = 0;
    if (this.headBobEnabled && this.state.onGround && movedAmount > 0.0005 && !this.state.flying) {
      bobOffsetY = Math.sin(this.bobTimer * 2.2) * 0.048;
      bobOffsetX = Math.cos(this.bobTimer * 1.1) * 0.025;
    }

    this.camera.position.set(
      this.state.x + bobOffsetX,
      this.state.y + PLAYER_EYE_HEIGHT + bobOffsetY,
      this.state.z
    );
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = this.damageFlashTimer > 0 ? Math.sin(this.damageFlashTimer * 35) * 0.035 : 0;
  }

  public getForwardDirection(): THREE.Vector3 {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    return dir.normalize();
  }

  public getTargetBlock(world: WorldManager, maxDist = 5.8): RaycastHit | null {
    const dir = this.getForwardDirection();
    return raycastVoxel(
      world,
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z,
      dir.x,
      dir.y,
      dir.z,
      maxDist
    );
  }
}
