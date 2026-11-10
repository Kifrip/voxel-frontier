import * as THREE from 'three';

export class EnvironmentManager {
  public readonly scene: THREE.Scene;
  public readonly dirLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  public readonly fog: THREE.Fog;

  public readonly celestialGroup: THREE.Group;
  private readonly sunMesh: THREE.Mesh;
  private readonly moonMesh: THREE.Mesh;
  private readonly starsPoints: THREE.Points;

  // 0.0 = Sunrise, 0.25 = Noon, 0.50 = Sunset, 0.75 = Midnight
  public timeOfDay = 0.22; // Start in bright morning/midday
  public cycleDurationSeconds = 1200; // 20 minutes full cycle
  public paused = false;

  private readonly colorDaySky = new THREE.Color('#7ec0ff');
  private readonly colorDayFog = new THREE.Color('#a8d8ff');
  private readonly colorSunsetSky = new THREE.Color('#e87a54');
  private readonly colorSunsetFog = new THREE.Color('#f59c6b');
  private readonly colorNightSky = new THREE.Color('#0b1329');
  private readonly colorNightFog = new THREE.Color('#101b38');
  private readonly colorUnderwater = new THREE.Color('#164b82');

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.fog = new THREE.Fog('#a8d8ff', 35, 95);
    this.scene.fog = this.fog;
    this.scene.background = this.colorDaySky.clone();

    this.hemiLight = new THREE.HemisphereLight('#ffffff', '#68785a', 0.75);
    this.hemiLight.position.set(0, 120, 0);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight('#fff6e0', 1.15);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 160;
    const d = 42;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0008;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Celestial bodies (Sun, Moon, Stars)
    this.celestialGroup = new THREE.Group();
    this.scene.add(this.celestialGroup);

    const sunGeom = new THREE.BoxGeometry(12, 12, 12);
    const sunMat = new THREE.MeshBasicMaterial({ color: '#fff394', fog: false });
    this.sunMesh = new THREE.Mesh(sunGeom, sunMat);
    this.celestialGroup.add(this.sunMesh);

    const moonGeom = new THREE.BoxGeometry(9, 9, 9);
    const moonMat = new THREE.MeshBasicMaterial({ color: '#d8e8ff', fog: false });
    this.moonMesh = new THREE.Mesh(moonGeom, moonMat);
    this.celestialGroup.add(this.moonMesh);

    // Starfield
    const starCount = 260;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 135;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = Math.abs(r * Math.cos(phi));
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: '#ffffff',
      size: 1.8,
      transparent: true,
      opacity: 0,
      fog: false,
    });
    this.starsPoints = new THREE.Points(starGeom, starMat);
    this.celestialGroup.add(this.starsPoints);
  }

  public isNight(): boolean {
    return this.timeOfDay > 0.54 && this.timeOfDay < 0.96;
  }

  public getPhaseLabel(): string {
    const t = this.timeOfDay;
    if (t >= 0.95 || t < 0.08) return 'Sunrise';
    if (t >= 0.08 && t < 0.44) return 'Daytime';
    if (t >= 0.44 && t < 0.56) return 'Sunset';
    return 'Night';
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    renderDistanceChunks: number,
    underwater: boolean
  ): void {
    if (!this.paused && this.cycleDurationSeconds > 0) {
      this.timeOfDay = (this.timeOfDay + dt / this.cycleDurationSeconds) % 1.0;
    }

    // Angle where 0 = sunrise (+X horizon), PI/2 = noon (+Y zenith), PI = sunset (-X), 3PI/2 = midnight (-Y)
    const angle = this.timeOfDay * Math.PI * 2;
    const sunElev = Math.sin(angle); // -1..1
    const sunHoriz = Math.cos(angle);

    this.celestialGroup.position.copy(playerPos);

    const orbitRadius = 120;
    this.sunMesh.position.set(sunHoriz * orbitRadius, sunElev * orbitRadius, -25);
    this.sunMesh.lookAt(playerPos);

    this.moonMesh.position.set(-sunHoriz * orbitRadius, -sunElev * orbitRadius, 25);
    this.moonMesh.lookAt(playerPos);

    // Position directional light along active celestial source (sun during day, moon at night)
    const lightOffset = new THREE.Vector3();
    if (sunElev >= -0.05) {
      lightOffset.set(sunHoriz * 75, Math.max(12, sunElev * 85), -20);
    } else {
      lightOffset.set(-sunHoriz * 75, Math.max(15, -sunElev * 85), 20);
    }
    this.dirLight.position.copy(playerPos).add(lightOffset);
    this.dirLight.target.position.copy(playerPos);

    // Compute smooth sky, fog, and lighting colors
    const skyColor = new THREE.Color();
    const fogColor = new THREE.Color();

    if (sunElev > 0.25) {
      // Full Day
      const t = Math.min(1, (sunElev - 0.25) / 0.5);
      skyColor.copy(this.colorSunsetSky).lerp(this.colorDaySky, t * 0.65 + 0.35);
      fogColor.copy(this.colorSunsetFog).lerp(this.colorDayFog, t * 0.65 + 0.35);
      this.dirLight.intensity = 0.75 + 0.45 * t;
      this.dirLight.color.set('#fff6e0');
      this.hemiLight.intensity = 0.65 + 0.18 * t;
      (this.starsPoints.material as THREE.PointsMaterial).opacity = 0;
    } else if (sunElev > -0.18) {
      // Sunrise / Sunset transition
      const t = (sunElev + 0.18) / 0.43; // 0 at night edge, 1 at day edge
      if (t < 0.5) {
        const k = t * 2;
        skyColor.copy(this.colorNightSky).lerp(this.colorSunsetSky, k);
        fogColor.copy(this.colorNightFog).lerp(this.colorSunsetFog, k);
      } else {
        const k = (t - 0.5) * 2;
        skyColor.copy(this.colorSunsetSky).lerp(this.colorDaySky, k * 0.35);
        fogColor.copy(this.colorSunsetFog).lerp(this.colorDayFog, k * 0.35);
      }
      this.dirLight.intensity = 0.25 + 0.5 * t;
      this.dirLight.color.set('#ffaa70');
      this.hemiLight.intensity = 0.32 + 0.33 * t;
      (this.starsPoints.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - t * 1.5);
    } else {
      // Night
      skyColor.copy(this.colorNightSky);
      fogColor.copy(this.colorNightFog);
      this.dirLight.intensity = 0.24;
      this.dirLight.color.set('#8ab4ff');
      this.hemiLight.intensity = 0.28;
      (this.starsPoints.material as THREE.PointsMaterial).opacity = 0.85;
    }

    if (underwater) {
      this.scene.background = this.colorUnderwater;
      this.fog.color.copy(this.colorUnderwater);
      this.fog.near = 2;
      this.fog.far = 22;
    } else {
      (this.scene.background as THREE.Color).copy(skyColor);
      this.fog.color.copy(fogColor);
      const maxDist = Math.max(40, renderDistanceChunks * 16);
      this.fog.near = maxDist * 0.48;
      this.fog.far = maxDist * 0.98;
    }
  }

  public setShadowQuality(quality: 'off' | 'low' | 'high'): void {
    if (quality === 'off') {
      this.dirLight.castShadow = false;
      return;
    }
    this.dirLight.castShadow = true;
    const size = quality === 'high' ? 2048 : 1024;
    if (this.dirLight.shadow.mapSize.width !== size) {
      this.dirLight.shadow.mapSize.set(size, size);
      if (this.dirLight.shadow.map) {
        this.dirLight.shadow.map.dispose();
        this.dirLight.shadow.map = null;
      }
    }
  }
}
