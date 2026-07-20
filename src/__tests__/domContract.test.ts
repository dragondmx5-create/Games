/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import html from '../../index.html?raw';
import authPanelSource from '../authPanel.ts?raw';
import gameSource from '../game.ts?raw';
import mainSource from '../main.ts?raw';

function idsReferencedByClient(source: string): string[] {
  return Array.from(source.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g), (match) => match[1]);
}

describe('DOM contract', () => {
  it('defines every statically referenced element id', () => {
    const ids = [...new Set([mainSource, gameSource, authPanelSource].flatMap(idsReferencedByClient))].sort();
    const missing = ids.filter((id) => !new RegExp(`\\bid=["']${id}["']`).test(html));

    expect(missing, `Missing DOM elements: ${missing.join(', ')}`).toEqual([]);
  });

  it('keeps critical launch and economy controls available', () => {
    for (const id of [
      'start-btn',
      'new-game-btn',
      'graphics-btn',
      'fullscreen-btn',
      'mute-btn',
      'sp-tab-market',
      'sp-tab-p2p',
    ]) {
      expect(html).toMatch(new RegExp(`\\bid=["']${id}["']`));
    }
  });

  it('advertises the canonical 121-region world and red Fracture warning', () => {
    expect(html).toContain('121 deterministic regions');
    expect(html).toContain('<strong>121</strong><span>Shared regions</span>');
    expect(html).toContain('Fracture · red danger');
    expect(html).not.toContain('225 deterministic regions');
  });
});
