// Persistent progress (coins, best score, shop purchases, chosen ship) and settings kept in localStorage.
// Storage can be unavailable (private mode, blocked site data), so every access
// is guarded and the game still works with an in-memory save.

export type Boost = 'shield' | 'rapid' | 'triple' | 'life';
export type Upgrade = 'duration' | 'luck';
export type Channel = 'master' | 'sfx' | 'music';

/** Player ships, in unlock order. Ships unlock from the best score, so only the choice is saved. */
export const SHIP_IDS = ['viper', 'hornet', 'warden', 'phantom', 'nova', 'razor', 'titan', 'eclipse'] as const;
export type ShipId = (typeof SHIP_IDS)[number];

/** Volume levels run from 0 (silent) to this many steps (full). */
export const VOLUME_STEPS = 10;

export interface SaveData {
  coins: number;
  best: number;
  /** Inventory: held power-ups (bought or picked up) carry over between games; lives are spent at the next start. */
  boosts: Record<Boost, number>;
  /** Permanent upgrade levels. */
  upgrades: Record<Upgrade, number>;
  /** Settings: volume level (0..VOLUME_STEPS) for everything, sound effects and music. */
  volumes: Record<Channel, number>;
  /** The ship flown in the next game. */
  ship: ShipId;
}

const KEY = 'rock-blaster-save';

export function fresh(): SaveData {
  return {
    coins: 0,
    best: 0,
    boosts: { shield: 0, rapid: 0, triple: 0, life: 0 },
    upgrades: { duration: 0, luck: 0 },
    volumes: { master: VOLUME_STEPS, sfx: VOLUME_STEPS, music: VOLUME_STEPS },
    ship: 'viper',
  };
}

export function load(): SaveData {
  const data = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      data.coins = Number(s.coins) || 0;
      data.best = Number(s.best) || 0;
      for (const k of Object.keys(data.boosts) as Boost[]) data.boosts[k] = Number(s.boosts?.[k]) || 0;
      for (const k of Object.keys(data.upgrades) as Upgrade[]) data.upgrades[k] = Number(s.upgrades?.[k]) || 0;
      for (const k of Object.keys(data.volumes) as Channel[]) {
        const v = Math.round(Number(s.volumes?.[k]));
        if (Number.isFinite(v)) data.volumes[k] = Math.max(0, Math.min(VOLUME_STEPS, v));
      }
      if (SHIP_IDS.includes(s.ship)) data.ship = s.ship;
    }
  } catch {
    // Ignore unreadable storage; start fresh.
  }
  return data;
}

export function store(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked; progress lasts for this session only.
  }
}
