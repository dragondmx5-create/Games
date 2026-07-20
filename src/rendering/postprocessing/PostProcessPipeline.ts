import { ShaderProgram } from '../core/ShaderProgram';
import postVertexSource from '../shaders/post.vert.glsl?raw';
import postFragmentSource from '../shaders/post.frag.glsl?raw';
import bloomFragmentSource from '../shaders/bloom.frag.glsl?raw';

export interface GpuLight {
  x: number;
  y: number;
  radius: number;
  intensity: number;
  color: [number, number, number];
}

export interface PostProcessSettings {
  time: number;
  damage: number;
  quality: 0 | 1 | 2;
  layer: number;
  lights: GpuLight[];
  /** camera world offset in pixels — anchors cloud shadows/sun shafts to the ground */
  camera: [number, number];
  /** 0 skips the bloom blur passes entirely (low quality tier) */
  bloomStrength: number;
}

const LAYER_GRADES: [number, number, number][] = [
  [1.02, 1.00, 0.94],
  [0.94, 1.02, 1.04],
  [1.03, 0.95, 0.90],
  [0.92, 1.04, 0.98],
  [1.05, 0.93, 1.03],
];

const BLOOM_THRESHOLD = 0.62;

interface RenderTarget {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
}

export class PostProcessPipeline {
  private readonly program: ShaderProgram;
  private readonly bloomProgram: ShaderProgram;
  private framebuffer: WebGLFramebuffer;
  private sceneTexture: WebGLTexture;
  private bloomA: RenderTarget;
  private bloomB: RenderTarget;
  private width = 0;
  private height = 0;
  private bloomWidth = 0;
  private bloomHeight = 0;

  constructor(private gl: WebGL2RenderingContext) {
    this.program = new ShaderProgram(gl, postVertexSource, postFragmentSource);
    this.bloomProgram = new ShaderProgram(gl, postVertexSource, bloomFragmentSource);
    const framebuffer = gl.createFramebuffer();
    const texture = gl.createTexture();
    if (!framebuffer || !texture) throw new Error('Unable to create WebGL post-processing target');
    this.framebuffer = framebuffer;
    this.sceneTexture = texture;
    this.bloomA = this.createTarget();
    this.bloomB = this.createTarget();
  }

  private createTarget(): RenderTarget {
    const gl = this.gl;
    const framebuffer = gl.createFramebuffer();
    const texture = gl.createTexture();
    if (!framebuffer || !texture) throw new Error('Unable to create WebGL bloom target');
    return { framebuffer, texture };
  }

  /** Bloom runs at half resolution with linear filtering — soft by construction. */
  private resizeTarget(target: RenderTarget, width: number, height: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`WebGL bloom framebuffer incomplete: ${status}`);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTexture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`WebGL framebuffer incomplete: ${status}`);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.bloomWidth = Math.max(1, Math.round(width / 2));
    this.bloomHeight = Math.max(1, Math.round(height / 2));
    this.resizeTarget(this.bloomA, this.bloomWidth, this.bloomHeight);
    this.resizeTarget(this.bloomB, this.bloomWidth, this.bloomHeight);
  }

  beginScene(): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.viewport(0, 0, this.width, this.height);
  }

  /**
   * Bright-extract + separable gaussian at half resolution. Two passes:
   * horizontal reads the scene (with thresholding), vertical reads the
   * horizontal result. Skipped entirely when bloom is disabled.
   */
  private renderBloom(): void {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    this.bloomProgram.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.bloomProgram.uniform('uSource'), 0);
    gl.uniform1f(this.bloomProgram.uniform('uThreshold'), BLOOM_THRESHOLD);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.framebuffer);
    gl.viewport(0, 0, this.bloomWidth, this.bloomHeight);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.uniform2f(this.bloomProgram.uniform('uTexelSize'), 1 / this.width, 1 / this.height);
    gl.uniform2f(this.bloomProgram.uniform('uDirection'), 1, 0);
    gl.uniform1f(this.bloomProgram.uniform('uExtract'), 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomB.framebuffer);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomA.texture);
    gl.uniform2f(this.bloomProgram.uniform('uTexelSize'), 1 / this.bloomWidth, 1 / this.bloomHeight);
    gl.uniform2f(this.bloomProgram.uniform('uDirection'), 0, 1);
    gl.uniform1f(this.bloomProgram.uniform('uExtract'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  composite(settings: PostProcessSettings): void {
    const gl = this.gl;
    const bloomEnabled = settings.bloomStrength > 0.001;
    if (bloomEnabled) this.renderBloom();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.BLEND);
    this.program.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.uniform1i(this.program.uniform('uScene'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomB.texture);
    gl.uniform1i(this.program.uniform('uBloom'), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(this.program.uniform('uResolution'), this.width, this.height);
    gl.uniform1f(this.program.uniform('uTime'), settings.time);
    gl.uniform1f(this.program.uniform('uDamage'), settings.damage);
    gl.uniform1f(this.program.uniform('uQuality'), settings.quality);
    gl.uniform1f(this.program.uniform('uBloomStrength'), bloomEnabled ? settings.bloomStrength : 0);
    gl.uniform2f(this.program.uniform('uCamera'), settings.camera[0], settings.camera[1]);
    const grade = LAYER_GRADES[Math.max(0, Math.min(LAYER_GRADES.length - 1, settings.layer - 1))];
    gl.uniform3f(this.program.uniform('uGrade'), grade[0], grade[1], grade[2]);

    const maxLights = settings.quality === 0 ? 4 : settings.quality === 1 ? 10 : 16;
    const lights = settings.lights.slice(0, maxLights);
    const packed = new Float32Array(16 * 4);
    const colors = new Float32Array(16 * 4);
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      packed.set([light.x, this.height - light.y, light.radius, light.intensity], i * 4);
      colors.set([light.color[0], light.color[1], light.color[2], 1], i * 4);
    }
    gl.uniform1i(this.program.uniform('uLightCount'), lights.length);
    gl.uniform4fv(this.program.uniform('uLights[0]'), packed);
    gl.uniform4fv(this.program.uniform('uLightColors[0]'), colors);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.BLEND);
  }

  dispose(): void {
    this.program.dispose();
    this.bloomProgram.dispose();
    this.gl.deleteFramebuffer(this.framebuffer);
    this.gl.deleteTexture(this.sceneTexture);
    this.gl.deleteFramebuffer(this.bloomA.framebuffer);
    this.gl.deleteTexture(this.bloomA.texture);
    this.gl.deleteFramebuffer(this.bloomB.framebuffer);
    this.gl.deleteTexture(this.bloomB.texture);
  }
}
