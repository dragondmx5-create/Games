import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { ResolvedGraphicsQuality } from '../quality/QualityManager';

const CINEMATIC_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    damage: { value: 0 },
    vignette: { value: 0.42 },
    saturation: { value: 1.14 },
    contrast: { value: 1.11 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float damage;
    uniform float vignette;
    uniform float saturation;
    uniform float contrast;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, saturation);
      color = (color - 0.5) * contrast + 0.5;

      // Warm highlights and slightly cool shadows create readable depth without
      // applying a heavy LUT or crushing the hand-painted palette. Thresholds
      // widened and strength raised from the original 0.52-1.08/0.42 and
      // 0.05-0.44/0.3 — the narrower ranges rarely activated on typical
      // daylight scenes, which was part of why lighting read as flat/raw.
      float highlight = smoothstep(0.42, 1.0, luma);
      float shadow = 1.0 - smoothstep(0.08, 0.52, luma);
      color *= mix(vec3(1.0), vec3(1.06, 1.024, 0.955), highlight * 0.5);
      color *= mix(vec3(1.0), vec3(0.92, 0.968, 1.055), shadow * 0.38);

      vec2 centered = vUv * 2.0 - 1.0;
      float edge = smoothstep(0.22, 1.32, dot(centered, centered));
      color *= 1.0 - edge * vignette * 0.34;

      float grain = hash12(gl_FragCoord.xy + fract(time) * 317.0) - 0.5;
      color += grain * 0.012;
      color = mix(color, color * vec3(1.22, 0.78, 0.72) + vec3(0.08, 0.0, 0.0), clamp(damage, 0.0, 1.0) * 0.3);
      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
};

/** Quality-scaled post chain: physically motivated AO, restrained emissive
 * bloom, SMAA, subtle grading/vignette and the required output conversion. */
export class CinematicPipeline3D {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly gtaoPass: GTAOPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly smaaPass: SMAAPass;
  private readonly gradePass: ShaderPass;
  private readonly outputPass: OutputPass;
  private time = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.gtaoPass = new GTAOPass(scene, camera, 512, 512);
    this.gtaoPass.updateGtaoMaterial({
      radius: 0.24,
      distanceExponent: 1.65,
      thickness: 1.25,
      distanceFallOff: 0.85,
      scale: 0.78,
      samples: 12,
      screenSpaceRadius: false,
    });
    this.gtaoPass.updatePdMaterial({
      lumaPhi: 8,
      depthPhi: 2.2,
      normalPhi: 3.2,
      radius: 7,
      radiusExponent: 2,
      rings: 2,
      samples: 12,
    });
    this.gtaoPass.blendIntensity = 0.72;
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.34, 0.56, 1.05);
    this.smaaPass = new SMAAPass();
    this.gradePass = new ShaderPass(CINEMATIC_SHADER);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.gtaoPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.smaaPass);
    this.composer.addPass(this.gradePass);
    this.composer.addPass(this.outputPass);
  }

  setQuality(quality: ResolvedGraphicsQuality): void {
    this.gtaoPass.enabled = quality !== 'low';
    this.bloomPass.enabled = quality !== 'low';
    this.smaaPass.enabled = quality !== 'low';
    if (quality === 'high') {
      this.gtaoPass.blendIntensity = 0.78;
      this.gtaoPass.updateGtaoMaterial({ radius: 0.28, samples: 16, thickness: 1.35, distanceFallOff: 0.86 });
      this.gtaoPass.updatePdMaterial({ samples: 16, rings: 2, radius: 8, lumaPhi: 8, depthPhi: 2.2, normalPhi: 3.2 });
      this.bloomPass.strength = 0.42;
      this.bloomPass.radius = 0.58;
      this.bloomPass.threshold = 1.02;
      this.gradePass.uniforms.vignette.value = 0.44;
    } else if (quality === 'medium') {
      this.gtaoPass.blendIntensity = 0.62;
      this.gtaoPass.updateGtaoMaterial({ radius: 0.22, samples: 8, thickness: 1.15, distanceFallOff: 0.82 });
      this.gtaoPass.updatePdMaterial({ samples: 8, rings: 2, radius: 6, lumaPhi: 9, depthPhi: 2.4, normalPhi: 3.0 });
      this.bloomPass.strength = 0.28;
      this.bloomPass.radius = 0.5;
      this.bloomPass.threshold = 1.08;
      this.gradePass.uniforms.vignette.value = 0.36;
    } else {
      this.gradePass.uniforms.vignette.value = 0.26;
    }
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  render(dt: number, damageFlash: number): void {
    this.time += dt;
    this.gradePass.uniforms.time.value = this.time;
    this.gradePass.uniforms.damage.value = THREE.MathUtils.clamp(damageFlash, 0, 1);
    this.composer.render(dt);
  }

  dispose(): void {
    this.gtaoPass.dispose();
    this.bloomPass.dispose();
    this.smaaPass.dispose();
    this.gradePass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
  }
}
