import type { Drawable } from '../../assets';
import { parseCssColor, multiplyAlpha, type Rgba } from './color';
import { IDENTITY_2D, multiply2D, transformPoint, type Mat2D } from './math';
import { ShaderProgram } from './ShaderProgram';
import { TextureArrayAtlas, type TextureRegion } from './TextureArrayAtlas';
import { PostProcessPipeline, type PostProcessSettings } from '../postprocessing/PostProcessPipeline';
import sceneVertexSource from '../shaders/scene.vert.glsl?raw';
import sceneFragmentSource from '../shaders/scene.frag.glsl?raw';
import { WebGL2NotSupportedError } from './WebGLSupportError';
export { WebGL2NotSupportedError } from './WebGLSupportError';

const FLOATS_PER_VERTEX = 16;

interface ContextState {
  transform: Mat2D;
  fillStyle: string | WebGLRadialGradient;
  strokeStyle: string;
  globalAlpha: number;
  lineWidth: number;
  shadowColor: string;
  shadowBlur: number;
  font: string;
  textAlign: CanvasTextAlign;
}

interface EllipsePath {
  kind: 'ellipse';
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotation: number;
}

interface ArcPath {
  kind: 'arc';
  x: number;
  y: number;
  radius: number;
  start: number;
  end: number;
  counterclockwise: boolean;
}

type ActivePath = EllipsePath | ArcPath | null;

interface TextGlyph {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  ascent: number;
}

export class WebGLRadialGradient {
  readonly stops: { offset: number; color: string }[] = [];

  constructor(
    readonly x0: number,
    readonly y0: number,
    readonly r0: number,
    readonly x1: number,
    readonly y1: number,
    readonly r1: number,
  ) {}

  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset: Math.max(0, Math.min(1, offset)), color });
    this.stops.sort((a, b) => a.offset - b.offset);
  }
}

export class WebGL2DContext {
  readonly gl: WebGL2RenderingContext;
  imageSmoothingEnabled = false;
  private readonly program: ShaderProgram;
  private readonly atlas: TextureArrayAtlas;
  private readonly post: PostProcessPipeline;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  private readonly vertices: number[] = [];
  private state: ContextState = defaultState();
  private readonly stack: ContextState[] = [];
  private path: ActivePath = null;
  private width = 1;
  private height = 1;
  private readonly textCache = new Map<string, TextGlyph>();
  private lost = false;
  private sceneTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new WebGL2NotSupportedError();
    this.gl = gl;
    this.program = new ShaderProgram(gl, sceneVertexSource, sceneFragmentSource);
    this.atlas = new TextureArrayAtlas(gl);
    this.post = new PostProcessPipeline(gl);
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error('Unable to create WebGL scene buffers');
    this.vao = vao;
    this.vbo = vbo;
    this.configureVertexLayout();

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lost = true;
      window.dispatchEvent(new CustomEvent('undral:webgl-context-lost'));
    });
    canvas.addEventListener('webglcontextrestored', () => {
      // WebGL resource restoration requires rebuilding the renderer. A page
      // reload is deterministic and avoids partially-restored atlas state.
      location.reload();
    });
  }

  get fillStyle(): string | WebGLRadialGradient {
    return this.state.fillStyle;
  }
  set fillStyle(value: string | WebGLRadialGradient) {
    this.state.fillStyle = value;
  }

  get strokeStyle(): string {
    return this.state.strokeStyle;
  }
  set strokeStyle(value: string) {
    this.state.strokeStyle = value;
  }

  get globalAlpha(): number {
    return this.state.globalAlpha;
  }
  set globalAlpha(value: number) {
    this.state.globalAlpha = Math.max(0, Math.min(1, value));
  }

  get lineWidth(): number {
    return this.state.lineWidth;
  }
  set lineWidth(value: number) {
    this.state.lineWidth = Math.max(0.1, value);
  }

  get shadowColor(): string {
    return this.state.shadowColor;
  }
  set shadowColor(value: string) {
    this.state.shadowColor = value;
  }

  get shadowBlur(): number {
    return this.state.shadowBlur;
  }
  set shadowBlur(value: number) {
    this.state.shadowBlur = Math.max(0, value);
  }

  get font(): string {
    return this.state.font;
  }
  set font(value: string) {
    this.state.font = value;
  }

  get textAlign(): CanvasTextAlign {
    return this.state.textAlign;
  }
  set textAlign(value: CanvasTextAlign) {
    this.state.textAlign = value;
  }

  /**
   * `width`/`height` are physical framebuffer pixels. `baseScale` maps the
   * game's logical world pixels onto them (supersampling): every draw call
   * keeps using logical coordinates, and save/restore stacks include the
   * base transform automatically.
   */
  beginFrame(width: number, height: number, baseScale = 1): void {
    if (this.lost) return;
    this.width = width;
    this.height = height;
    this.sceneTime = performance.now() / 1000;
    this.vertices.length = 0;
    this.state = defaultState();
    if (baseScale !== 1) this.state.transform = [baseScale, 0, 0, baseScale, 0, 0];
    this.stack.length = 0;
    this.path = null;
    this.post.resize(width, height);
    this.post.beginScene();
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  endFrame(settings: PostProcessSettings): void {
    if (this.lost) return;
    this.flushScene();
    this.post.composite(settings);
  }

  save(): void {
    this.stack.push(cloneState(this.state));
  }

  restore(): void {
    const state = this.stack.pop();
    if (state) this.state = state;
  }

  translate(x: number, y: number): void {
    this.state.transform = multiply2D(this.state.transform, [1, 0, 0, 1, x, y]);
  }

  scale(x: number, y: number): void {
    this.state.transform = multiply2D(this.state.transform, [x, 0, 0, y, 0, 0]);
  }

  rotate(radians: number): void {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    this.state.transform = multiply2D(this.state.transform, [c, s, -s, c, 0, 0]);
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    if (this.state.fillStyle instanceof WebGLRadialGradient) {
      this.drawGradientRect(x, y, width, height, this.state.fillStyle);
      return;
    }
    const color = multiplyAlpha(parseCssColor(this.state.fillStyle), this.state.globalAlpha);
    this.pushQuad(x, y, width, height, this.atlas.white, color, color, 1, defaultLocals());
  }

  drawImage(image: Drawable, dx: number, dy: number): void;
  drawImage(image: Drawable, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(image: Drawable, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(image: Drawable, ...args: number[]): void {
    const region = this.atlas.get(image);
    let sx = 0;
    let sy = 0;
    let sw = region.width;
    let sh = region.height;
    let dx: number;
    let dy: number;
    let dw: number;
    let dh: number;
    if (args.length === 2) {
      [dx, dy] = args;
      dw = sw;
      dh = sh;
    } else if (args.length === 4) {
      [dx, dy, dw, dh] = args;
    } else if (args.length === 8) {
      [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    } else {
      throw new Error(`Unsupported drawImage overload with ${args.length} numeric arguments`);
    }

    const du = region.u1 - region.u0;
    const dv = region.v1 - region.v0;
    const u0 = region.u0 + (sx / region.width) * du;
    const u1 = region.u0 + ((sx + sw) / region.width) * du;
    const vTop = region.v1 - (sy / region.height) * dv;
    const vBottom = region.v1 - ((sy + sh) / region.height) * dv;
    const crop: TextureRegion = { ...region, u0, u1, v0: vBottom, v1: vTop };
    const color: Rgba = [1, 1, 1, this.state.globalAlpha];
    this.pushQuad(dx, dy, dw, dh, crop, color, color, 0, defaultLocals());
  }


  /**
   * Draws a full image with an independent RGB multiplier at each corner
   * (order: top-left, top-right, bottom-right, bottom-left). The GPU
   * interpolates the tint across the quad, so adjacent tiles sharing corner
   * values blend seamlessly — the core of the organic, non-gridded ground.
   */
  drawImageTintedCorners(
    image: Drawable,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    tints: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]],
  ): void {
    const region = this.atlas.get(image);
    const alpha = this.state.globalAlpha;
    const m = this.state.transform;
    const points = [
      transformPoint(m, dx, dy),
      transformPoint(m, dx + dw, dy),
      transformPoint(m, dx + dw, dy + dh),
      transformPoint(m, dx, dy + dh),
    ] as [[number, number], [number, number], [number, number], [number, number]];
    const uvs: [[number, number], [number, number], [number, number], [number, number]] = [
      [region.u0, region.v1],
      [region.u1, region.v1],
      [region.u1, region.v0],
      [region.u0, region.v0],
    ];
    const colors = tints.map((tint) => [tint[0], tint[1], tint[2], alpha] as Rgba);
    const local: [number, number] = [0, 0];
    this.pushVertex(points[0], uvs[0], colors[0], colors[0], region.layer, 0, local);
    this.pushVertex(points[1], uvs[1], colors[1], colors[1], region.layer, 0, local);
    this.pushVertex(points[2], uvs[2], colors[2], colors[2], region.layer, 0, local);
    this.pushVertex(points[0], uvs[0], colors[0], colors[0], region.layer, 0, local);
    this.pushVertex(points[2], uvs[2], colors[2], colors[2], region.layer, 0, local);
    this.pushVertex(points[3], uvs[3], colors[3], colors[3], region.layer, 0, local);
  }

  /**
   * Draws a full sprite whose top edge is sheared sideways by `swayPx` while
   * the bottom edge stays planted — vegetation bending in the wind. The shear
   * is interpolated per-vertex by the GPU, so it costs the same as drawImage.
   */
  drawImageSwaying(image: Drawable, dx: number, dy: number, swayPx: number, dw?: number, dh?: number): void {
    const region = this.atlas.get(image);
    const w = dw ?? region.width;
    const h = dh ?? region.height;
    const color: Rgba = [1, 1, 1, this.state.globalAlpha];
    const m = this.state.transform;
    const points = [
      transformPoint(m, dx + swayPx, dy),
      transformPoint(m, dx + w + swayPx, dy),
      transformPoint(m, dx + w, dy + h),
      transformPoint(m, dx, dy + h),
    ] as [[number, number], [number, number], [number, number], [number, number]];
    const uvs: [[number, number], [number, number], [number, number], [number, number]] = [
      [region.u0, region.v1],
      [region.u1, region.v1],
      [region.u1, region.v0],
      [region.u0, region.v0],
    ];
    const locals = defaultLocals();
    this.pushVertex(points[0], uvs[0], color, color, region.layer, 0, locals[0]);
    this.pushVertex(points[1], uvs[1], color, color, region.layer, 0, locals[1]);
    this.pushVertex(points[2], uvs[2], color, color, region.layer, 0, locals[2]);
    this.pushVertex(points[0], uvs[0], color, color, region.layer, 0, locals[0]);
    this.pushVertex(points[2], uvs[2], color, color, region.layer, 0, locals[2]);
    this.pushVertex(points[3], uvs[3], color, color, region.layer, 0, locals[3]);
  }

  /** Procedural water surface rendered directly in GLSL. */
  drawWaterTile(
    x: number,
    y: number,
    width: number,
    height: number,
    seed: number,
    edgeMask: number,
    deepColor = '#14202c',
    surfaceColor = '#2a5872',
  ): void {
    const deep = parseCssColor(deepColor);
    const surface = parseCssColor(surfaceColor);
    deep[3] = Math.max(0, Math.min(1, seed));
    surface[3] = Math.max(0, Math.min(1, edgeMask / 15));
    const locals: [[number, number], [number, number], [number, number], [number, number]] = [
      [0, 0], [1, 0], [1, 1], [0, 1],
    ];
    this.pushQuad(x, y, width, height, this.atlas.white, deep, surface, 4, locals);
  }

  /** Angle-masked sword/ability arc. The trail is generated per fragment. */
  drawCombatSlash(
    centerX: number,
    centerY: number,
    radius: number,
    startAngle: number,
    sweep: number,
    thicknessPx: number,
    color: string,
    intensity: number,
    ability = false,
  ): void {
    if (radius <= 0 || sweep <= 0 || intensity <= 0) return;
    const tint = multiplyAlpha(parseCssColor(color), Math.max(0, Math.min(1, intensity)));
    const tau = Math.PI * 2;
    const normalizedStart = ((startAngle % tau) + tau) % tau / tau;
    const data: Rgba = [
      normalizedStart,
      Math.max(0.0001, Math.min(1, sweep / tau)),
      Math.max(0.01, Math.min(0.65, thicknessPx / radius)),
      ability ? 1 : 0,
    ];
    const locals: [[number, number], [number, number], [number, number], [number, number]] = [
      [-1, -1], [1, -1], [1, 1], [-1, 1],
    ];
    this.pushQuad(
      centerX - radius, centerY - radius, radius * 2, radius * 2,
      this.atlas.white, tint, data, 5, locals,
    );
  }

  /** Soft emissive particle used by combat sparks and environmental motes. */
  drawGlowParticle(
    centerX: number,
    centerY: number,
    size: number,
    color: string,
    alpha: number,
    seed: number,
    sharpness = 0.65,
  ): void {
    if (size <= 0 || alpha <= 0) return;
    const tint = multiplyAlpha(parseCssColor(color), Math.max(0, Math.min(1, alpha)));
    const data: Rgba = [
      Math.max(0, Math.min(1, seed)),
      Math.max(0.15, Math.min(0.95, sharpness)),
      0,
      1,
    ];
    const locals: [[number, number], [number, number], [number, number], [number, number]] = [
      [-1, -1], [1, -1], [1, 1], [-1, 1],
    ];
    this.pushQuad(centerX - size, centerY - size, size * 2, size * 2, this.atlas.white, tint, data, 6, locals);
  }

  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): WebGLRadialGradient {
    return new WebGLRadialGradient(x0, y0, r0, x1, y1, r1);
  }

  beginPath(): void {
    this.path = null;
  }

  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, _startAngle = 0, _endAngle = Math.PI * 2): void {
    this.path = { kind: 'ellipse', x, y, rx, ry, rotation };
  }

  arc(x: number, y: number, radius: number, start: number, end: number, counterclockwise = false): void {
    this.path = { kind: 'arc', x, y, radius, start, end, counterclockwise };
  }

  fill(): void {
    if (!this.path || this.path.kind !== 'ellipse') return;
    const { x, y, rx, ry, rotation } = this.path;
    const color = multiplyAlpha(parseCssColor(asSolidStyle(this.state.fillStyle)), this.state.globalAlpha);
    this.save();
    this.translate(x, y);
    this.rotate(rotation);
    this.pushQuad(-rx, -ry, rx * 2, ry * 2, this.atlas.white, color, color, 2, ellipseLocals());
    this.restore();
  }

  stroke(): void {
    if (!this.path || this.path.kind !== 'arc') return;
    const color = multiplyAlpha(parseCssColor(this.state.strokeStyle), this.state.globalAlpha);
    if (this.state.shadowBlur > 0) {
      const shadow = multiplyAlpha(parseCssColor(this.state.shadowColor), this.state.globalAlpha * 0.32);
      this.pushArc(this.path, this.state.lineWidth + this.state.shadowBlur * 1.25, shadow);
    }
    this.pushArc(this.path, this.state.lineWidth, color);
  }

  fillText(text: string, x: number, y: number): void {
    if (!text) return;
    const glyph = this.getTextGlyph(text, this.state.font);
    let dx = x;
    if (this.state.textAlign === 'center') dx -= glyph.width / 2;
    else if (this.state.textAlign === 'right' || this.state.textAlign === 'end') dx -= glyph.width;
    const region = this.atlas.get(glyph.canvas);
    const color = multiplyAlpha(parseCssColor(asSolidStyle(this.state.fillStyle)), this.state.globalAlpha);
    this.pushQuad(dx, y - glyph.ascent, glyph.width, glyph.height, region, color, color, 0, defaultLocals());
  }

  dispose(): void {
    this.program.dispose();
    this.atlas.dispose();
    this.post.dispose();
    this.gl.deleteBuffer(this.vbo);
    this.gl.deleteVertexArray(this.vao);
  }

  private configureVertexLayout(): void {
    const gl = this.gl;
    const stride = FLOATS_PER_VERTEX * 4;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const attributes: [number, number, number][] = [
      [0, 2, 0],
      [1, 2, 2],
      [2, 4, 4],
      [3, 4, 8],
      [4, 1, 12],
      [5, 1, 13],
      [6, 2, 14],
    ];
    for (const [location, size, offsetFloats] of attributes) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offsetFloats * 4);
    }
    gl.bindVertexArray(null);
  }

  private flushScene(): void {
    const gl = this.gl;
    this.program.use();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.DYNAMIC_DRAW);
    this.atlas.bind(0);
    gl.uniform1i(this.program.uniform('uAtlas'), 0);
    gl.uniform2f(this.program.uniform('uResolution'), this.width, this.height);
    gl.uniform1f(this.program.uniform('uTime'), this.sceneTime);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertices.length / FLOATS_PER_VERTEX);
    gl.bindVertexArray(null);
  }

  private pushQuad(
    x: number,
    y: number,
    width: number,
    height: number,
    region: TextureRegion,
    colorA: Rgba,
    colorB: Rgba,
    mode: number,
    locals: [[number, number], [number, number], [number, number], [number, number]],
  ): void {
    const m = this.state.transform;
    const points = [
      transformPoint(m, x, y),
      transformPoint(m, x + width, y),
      transformPoint(m, x + width, y + height),
      transformPoint(m, x, y + height),
    ] as [[number, number], [number, number], [number, number], [number, number]];
    const uvs: [[number, number], [number, number], [number, number], [number, number]] = [
      [region.u0, region.v1],
      [region.u1, region.v1],
      [region.u1, region.v0],
      [region.u0, region.v0],
    ];
    this.pushVertex(points[0], uvs[0], colorA, colorB, region.layer, mode, locals[0]);
    this.pushVertex(points[1], uvs[1], colorA, colorB, region.layer, mode, locals[1]);
    this.pushVertex(points[2], uvs[2], colorA, colorB, region.layer, mode, locals[2]);
    this.pushVertex(points[0], uvs[0], colorA, colorB, region.layer, mode, locals[0]);
    this.pushVertex(points[2], uvs[2], colorA, colorB, region.layer, mode, locals[2]);
    this.pushVertex(points[3], uvs[3], colorA, colorB, region.layer, mode, locals[3]);
  }

  private pushVertex(
    position: [number, number],
    uv: [number, number],
    colorA: Rgba,
    colorB: Rgba,
    layer: number,
    mode: number,
    local: [number, number],
  ): void {
    this.vertices.push(
      position[0], position[1],
      uv[0], uv[1],
      colorA[0], colorA[1], colorA[2], colorA[3],
      colorB[0], colorB[1], colorB[2], colorB[3],
      layer, mode,
      local[0], local[1],
    );
  }

  private drawGradientRect(x: number, y: number, width: number, height: number, gradient: WebGLRadialGradient): void {
    const first = gradient.stops[0]?.color ?? 'transparent';
    const last = gradient.stops.at(-1)?.color ?? first;
    const colorA = multiplyAlpha(parseCssColor(first), this.state.globalAlpha);
    const colorB = multiplyAlpha(parseCssColor(last), this.state.globalAlpha);
    const radius = Math.max(0.001, gradient.r1);
    const corners: [[number, number], [number, number], [number, number], [number, number]] = [
      [(x - gradient.x1) / radius, (y - gradient.y1) / radius],
      [(x + width - gradient.x1) / radius, (y - gradient.y1) / radius],
      [(x + width - gradient.x1) / radius, (y + height - gradient.y1) / radius],
      [(x - gradient.x1) / radius, (y + height - gradient.y1) / radius],
    ];
    this.pushQuad(x, y, width, height, this.atlas.white, colorA, colorB, 3, corners);
  }

  private pushArc(path: ArcPath, width: number, color: Rgba): void {
    let start = path.start;
    let end = path.end;
    if (!path.counterclockwise && end < start) end += Math.PI * 2;
    if (path.counterclockwise && start < end) start += Math.PI * 2;
    const span = end - start;
    const segments = Math.max(6, Math.ceil(Math.abs(span) * path.radius / 5));
    let prev = transformPoint(this.state.transform, path.x + Math.cos(start) * path.radius, path.y + Math.sin(start) * path.radius);
    for (let i = 1; i <= segments; i++) {
      const angle = start + (span * i) / segments;
      const next = transformPoint(this.state.transform, path.x + Math.cos(angle) * path.radius, path.y + Math.sin(angle) * path.radius);
      this.pushLineSegment(prev, next, width, color);
      prev = next;
    }
  }

  private pushLineSegment(a: [number, number], b: [number, number], width: number, color: Rgba): void {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * width * 0.5;
    const ny = (dx / len) * width * 0.5;
    const p0: [number, number] = [a[0] + nx, a[1] + ny];
    const p1: [number, number] = [b[0] + nx, b[1] + ny];
    const p2: [number, number] = [b[0] - nx, b[1] - ny];
    const p3: [number, number] = [a[0] - nx, a[1] - ny];
    const uv: [number, number] = [0, 0];
    const local: [number, number] = [0, 0];
    this.pushVertex(p0, uv, color, color, 0, 1, local);
    this.pushVertex(p1, uv, color, color, 0, 1, local);
    this.pushVertex(p2, uv, color, color, 0, 1, local);
    this.pushVertex(p0, uv, color, color, 0, 1, local);
    this.pushVertex(p2, uv, color, color, 0, 1, local);
    this.pushVertex(p3, uv, color, color, 0, 1, local);
  }

  private getTextGlyph(text: string, font: string): TextGlyph {
    const key = `${font}\u0000${text}`;
    const cached = this.textCache.get(key);
    if (cached) return cached;
    const measureCanvas = document.createElement('canvas');
    const measure = measureCanvas.getContext('2d')!;
    measure.font = font;
    const metrics = measure.measureText(text);
    const ascent = Math.ceil(metrics.actualBoundingBoxAscent || parseFontSize(font) * 0.8);
    const descent = Math.ceil(metrics.actualBoundingBoxDescent || parseFontSize(font) * 0.25);
    const width = Math.max(1, Math.ceil(metrics.width) + 4);
    const height = Math.max(1, ascent + descent + 4);
    measureCanvas.width = width;
    measureCanvas.height = height;
    const ctx = measureCanvas.getContext('2d')!;
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 2, ascent + 2);
    const glyph = { canvas: measureCanvas, width, height, ascent: ascent + 2 };
    this.textCache.set(key, glyph);
    return glyph;
  }
}

function defaultState(): ContextState {
  return {
    transform: [...IDENTITY_2D],
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    lineWidth: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    font: '10px sans-serif',
    textAlign: 'start',
  };
}

function cloneState(state: ContextState): ContextState {
  return { ...state, transform: [...state.transform] as Mat2D };
}

function defaultLocals(): [[number, number], [number, number], [number, number], [number, number]] {
  return [[0, 0], [0, 0], [0, 0], [0, 0]];
}

function ellipseLocals(): [[number, number], [number, number], [number, number], [number, number]] {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]];
}

function asSolidStyle(style: string | WebGLRadialGradient): string {
  return typeof style === 'string' ? style : style.stops[0]?.color ?? 'transparent';
}

function parseFontSize(font: string): number {
  return Number(font.match(/([\d.]+)px/)?.[1] ?? 10);
}
