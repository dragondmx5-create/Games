export type ToastTone = 'neutral' | 'success' | 'error' | 'info';
export type ConnectionState = 'pending' | 'online' | 'offline' | 'reconnecting';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface ToastDetail {
  title: string;
  message?: string;
  tone?: ToastTone;
  durationMs?: number;
}

export interface RuntimeResources {
  coins: number;
  crystals: number;
  shrooms: number;
  wood: number;
  iron: number;
  meat: number;
  hide: number;
  feathers: number;
  crates: number;
}

export interface RuntimeDetail {
  mode?: 'menu' | 'game';
  location?: string;
  risk?: string;
  inventoryRevision?: number;
  hpPercent?: number;
  hpCurrent?: number;
  hpMax?: number;
  xpPercent?: number;
  xpCurrent?: number;
  xpTarget?: number;
  level?: number;
  abilityName?: string;
  abilityCooldownPercent?: number;
  abilityCooldownSeconds?: number;
  resources?: RuntimeResources;
}

export function notify(detail: ToastDetail): void {
  window.dispatchEvent(new CustomEvent<ToastDetail>('undral:toast', { detail }));
}

export function setConnection(state: ConnectionState, label?: string): void {
  window.dispatchEvent(new CustomEvent('undral:connection', { detail: { state, label } }));
}

export function setSaveState(state: SaveState, label?: string): void {
  window.dispatchEvent(new CustomEvent('undral:save-state', { detail: { state, label } }));
}

export function updateRuntime(detail: RuntimeDetail): void {
  window.dispatchEvent(new CustomEvent<RuntimeDetail>('undral:runtime', { detail }));
}
