import * as THREE from 'three';
import { RaycastHit } from '../player/physics';
import { ItemDef } from '../items/registry';

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

export class InteractionEffects {
  private readonly scene: THREE.Scene;
  private readonly highlightBox: THREE.LineSegments;
  private readonly crackMesh: THREE.Mesh;
  private readonly crackTextures: THREE.CanvasTexture[] = [];
  private readonly particles: Particle[] = [];
  private readonly particleGeometry = new THREE.BoxGeometry(0.14, 0.14, 0.14);

  // First-person held item visual attached to camera
  public readonly handGroup: THREE.Group;
  private readonly handMesh: THREE.Mesh;
  private swingProgress = 0;
  private isSwinging = false;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;

    // 1. Target block wireframe highlight
    const boxGeom = new THREE.BoxGeometry(1.006, 1.006, 1.006);
    const edges = new THREE.EdgesGeometry(boxGeom);
    const lineMat = new THREE.LineBasicMaterial({
      color: '#11161d',
      transparent: true,
      opacity: 0.65,
    });
    this.highlightBox = new THREE.LineSegments(edges, lineMat);
    this.highlightBox.visible = false;
    this.scene.add(this.highlightBox);

    // 2. Mining destruction cracks overlay
    this.crackTextures = this.generateCrackStages(8);
    const crackGeom = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    const crackMat = new THREE.MeshBasicMaterial({
      map: this.crackTextures[0],
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.crackMesh = new THREE.Mesh(crackGeom, crackMat);
    this.crackMesh.visible = false;
    this.scene.add(this.crackMesh);

    // 3. First-person held item / arm in bottom-right of view
    this.handGroup = new THREE.Group();
    const handGeom = new THREE.BoxGeometry(0.22, 0.22, 0.55);
    const handMat = new THREE.MeshLambertMaterial({ color: '#d4a373' });
    this.handMesh = new THREE.Mesh(handGeom, handMat);
    this.handMesh.position.set(0.42, -0.34, -0.58);
    this.handMesh.rotation.set(0.15, -0.25, 0);
    this.handGroup.add(this.handMesh);
    camera.add(this.handGroup);
  }

  private generateCrackStages(stages: number): THREE.CanvasTexture[] {
    const out: THREE.CanvasTexture[] = [];
    for (let s = 0; s < stages; s++) {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 16, 16);
      ctx.strokeStyle = 'rgba(18, 20, 24, 0.85)';
      ctx.lineWidth = 1.3;

      const branches = (s + 1) * 2;
      for (let b = 0; b < branches; b++) {
        const angle = (b / branches) * Math.PI * 2 + s * 0.3;
        const len = 2 + ((s + 1) / stages) * 6.5;
        ctx.beginPath();
        ctx.moveTo(8, 8);
        ctx.lineTo(8 + Math.cos(angle) * len, 8 + Math.sin(angle) * len);
        ctx.stroke();
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      out.push(tex);
    }
    return out;
  }

  public updateTargetHighlight(hit: RaycastHit | null, miningProgress: number): void {
    if (!hit) {
      this.highlightBox.visible = false;
      this.crackMesh.visible = false;
      return;
    }

    this.highlightBox.visible = true;
    this.highlightBox.position.set(hit.bx + 0.5, hit.by + 0.5, hit.bz + 0.5);

    if (miningProgress > 0.02) {
      this.crackMesh.visible = true;
      this.crackMesh.position.set(hit.bx + 0.5, hit.by + 0.5, hit.bz + 0.5);
      const stage = Math.min(
        this.crackTextures.length - 1,
        Math.floor(miningProgress * this.crackTextures.length)
      );
      const mat = this.crackMesh.material as THREE.MeshBasicMaterial;
      if (mat.map !== this.crackTextures[stage]) {
        mat.map = this.crackTextures[stage];
        mat.needsUpdate = true;
      }
    } else {
      this.crackMesh.visible = false;
    }
  }

  public updateHeldItemAppearance(itemDef?: ItemDef): void {
    const mat = this.handMesh.material as THREE.MeshLambertMaterial;
    if (!itemDef) {
      mat.color.set('#d8a47f'); // Bare hand
      this.handMesh.scale.set(0.85, 0.85, 1.0);
    } else if (itemDef.category === 'tool') {
      mat.color.set(itemDef.iconColorPrimary);
      this.handMesh.scale.set(0.45, 0.95, 1.15);
    } else {
      mat.color.set(itemDef.iconColorPrimary);
      this.handMesh.scale.set(1.15, 1.15, 0.65);
    }
  }

  public triggerHandSwing(): void {
    this.isSwinging = true;
    this.swingProgress = 0;
  }

  public spawnBlockParticles(bx: number, by: number, bz: number, hexColor: string, count = 16): void {
    const mat = new THREE.MeshLambertMaterial({ color: hexColor });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.particleGeometry, mat);
      mesh.position.set(
        bx + 0.2 + Math.random() * 0.6,
        by + 0.2 + Math.random() * 0.6,
        bz + 0.2 + Math.random() * 0.6
      );
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vx: (Math.random() - 0.5) * 3.8,
        vy: 1.5 + Math.random() * 3.2,
        vz: (Math.random() - 0.5) * 3.8,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.35,
      });
    }
  }

  public update(dt: number): void {
    // Update hand swing animation
    if (this.isSwinging) {
      this.swingProgress += dt * 5.8;
      if (this.swingProgress >= 1) {
        this.swingProgress = 0;
        this.isSwinging = false;
        this.handMesh.position.set(0.42, -0.34, -0.58);
        this.handMesh.rotation.set(0.15, -0.25, 0);
      } else {
        const s = Math.sin(this.swingProgress * Math.PI);
        this.handMesh.position.set(0.42 - s * 0.14, -0.34 - s * 0.08, -0.58 - s * 0.15);
        this.handMesh.rotation.set(0.15 - s * 0.75, -0.25 + s * 0.35, 0);
      }
    }

    // Update block particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= 14.0 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const scale = Math.max(0.01, 1 - p.life / p.maxLife);
      p.mesh.scale.setScalar(scale);
    }
  }
}
