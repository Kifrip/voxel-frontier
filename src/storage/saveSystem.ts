import { SerializedChunkMods } from '../world/world';
import { InventorySlot } from '../items/inventory';
import { GameMode } from '../player/controller';

export interface ProgressionState {
  gatheredWood: boolean;
  craftedPlanks: boolean;
  craftedPickaxe: boolean;
  minedStone: boolean;
  placedBlocks: number;
}

export interface WorldSaveData {
  id: string;
  name: string;
  seed: string;
  gameMode: GameMode;
  createdAt: number;
  updatedAt: number;
  player: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    health: number;
    flying: boolean;
  };
  inventory: {
    slots: Array<InventorySlot | null>;
    selectedHotbarIndex: number;
  };
  timeOfDay: number;
  chunkModifications: SerializedChunkMods;
  progression: ProgressionState;
}

export interface GameSettings {
  mouseSensitivity: number;
  fov: number;
  renderDistance: number;
  masterVolume: number;
  sfxVolume: number;
  muted: boolean;
  graphicsQuality: 'low' | 'medium' | 'high';
  shadowQuality: 'off' | 'low' | 'high';
}

export const DEFAULT_SETTINGS: GameSettings = {
  mouseSensitivity: 1.0,
  fov: 75,
  renderDistance: 4,
  masterVolume: 0.8,
  sfxVolume: 0.85,
  muted: false,
  graphicsQuality: 'high',
  shadowQuality: 'low',
};

const DB_NAME = 'VoxelFrontierDB';
const DB_VERSION = 1;
const STORE_WORLDS = 'worlds';
const LS_FALLBACK_KEY = 'voxel_frontier_worlds_v1';
const LS_SETTINGS_KEY = 'voxel_frontier_settings_v1';

export class SaveSystem {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private openDB(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    if (typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_WORLDS)) {
            db.createObjectStore(STORE_WORLDS, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  public async saveWorld(worldData: WorldSaveData): Promise<void> {
    worldData.updatedAt = Date.now();

    // Always mirror to localStorage as well so page reloads or beforeunload are 100% atomic
    try {
      const map = this.readLocalMirror();
      map[worldData.id] = worldData;
      localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(map));
    } catch {
      // Ignore quota errors if localStorage is full
    }

    const db = await this.openDB();
    if (!db) return;

    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_WORLDS, 'readwrite');
        const store = tx.objectStore(STORE_WORLDS);
        store.put(worldData);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    }).catch(() => {});
  }

  public async loadWorld(id: string): Promise<WorldSaveData | null> {
    const db = await this.openDB();
    if (db) {
      const fromIdb = await new Promise<WorldSaveData | null>((resolve) => {
        try {
          const tx = db.transaction(STORE_WORLDS, 'readonly');
          const store = tx.objectStore(STORE_WORLDS);
          const req = store.get(id);
          req.onsuccess = () => resolve((req.result as WorldSaveData) ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
      if (fromIdb) return fromIdb;
    }

    const map = this.readLocalMirror();
    return map[id] ?? null;
  }

  public async listWorlds(): Promise<WorldSaveData[]> {
    const combined = new Map<string, WorldSaveData>();

    const mirror = this.readLocalMirror();
    for (const [id, w] of Object.entries(mirror)) {
      combined.set(id, w);
    }

    const db = await this.openDB();
    if (db) {
      const idbList = await new Promise<WorldSaveData[]>((resolve) => {
        try {
          const tx = db.transaction(STORE_WORLDS, 'readonly');
          const store = tx.objectStore(STORE_WORLDS);
          const req = store.getAll();
          req.onsuccess = () => resolve((req.result as WorldSaveData[]) ?? []);
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
      for (const w of idbList) {
        const existing = combined.get(w.id);
        if (!existing || w.updatedAt >= existing.updatedAt) {
          combined.set(w.id, w);
        }
      }
    }

    return Array.from(combined.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public async deleteWorld(id: string): Promise<void> {
    try {
      const map = this.readLocalMirror();
      delete map[id];
      localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(map));
    } catch {
      // Ignore
    }

    const db = await this.openDB();
    if (!db) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_WORLDS, 'readwrite');
        const store = tx.objectStore(STORE_WORLDS);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private readLocalMirror(): Record<string, WorldSaveData> {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(LS_FALLBACK_KEY);
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, WorldSaveData>;
    } catch {
      return {};
    }
  }

  public loadSettings(): GameSettings {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
    try {
      const raw = localStorage.getItem(LS_SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  public saveSettings(settings: GameSettings): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore
    }
  }
}
