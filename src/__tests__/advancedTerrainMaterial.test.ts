import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AdvancedTerrainMaterial } from '../art3d/advancedTerrainMaterial';

describe('advanced terrain material quality', () => {
  it('preserves a quality choice made before the first shader compilation', () => {
    const renderer = {
      capabilities: { getMaxAnisotropy: () => 8 },
    } as unknown as THREE.WebGLRenderer;
    const terrain = new AdvancedTerrainMaterial(renderer);
    terrain.setQuality('high');
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '',
      fragmentShader: '',
    };

    terrain.material.onBeforeCompile(shader as never, renderer);

    expect(shader.uniforms.undralTerrainScale?.value).toBe(0.82);
    terrain.dispose();
  });
});
