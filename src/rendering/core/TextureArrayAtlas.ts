export interface TextureRegion {
  layer: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  width: number;
  height: number;
}

interface ShelfLayer {
  x: number;
  y: number;
  rowHeight: number;
}

export class TextureArrayAtlas {
  readonly texture: WebGLTexture;
  readonly white: TextureRegion;
  private readonly cache = new WeakMap<TexImageSource, TextureRegion>();
  private readonly shelves: ShelfLayer[];

  constructor(
    private gl: WebGL2RenderingContext,
    readonly size = 1024,
    readonly maxLayers = 8,
    private padding = 1,
  ) {
    const texture = gl.createTexture();
    if (!texture) throw new Error('Unable to create WebGL texture atlas');
    this.texture = texture;
    this.shelves = Array.from({ length: maxLayers }, () => ({ x: padding, y: padding, rowHeight: 0 }));

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, size, size, maxLayers);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const whitePixel = new Uint8Array([255, 255, 255, 255]);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, whitePixel);
    this.white = { layer: 0, u0: 0, v0: 0, u1: 1 / size, v1: 1 / size, width: 1, height: 1 };
  }

  get(source: TexImageSource): TextureRegion {
    const cached = this.cache.get(source);
    if (cached) return cached;
    const width = sourceWidth(source);
    const height = sourceHeight(source);
    if (width <= 0 || height <= 0) throw new Error('Cannot upload an empty image to the WebGL atlas');
    if (width + this.padding * 2 > this.size || height + this.padding * 2 > this.size) {
      throw new Error(`Drawable ${width}x${height} is larger than the ${this.size}px WebGL atlas layer`);
    }

    const slot = this.allocate(width, height);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      slot.x,
      slot.y,
      slot.layer,
      width,
      height,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source,
    );
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    const region: TextureRegion = {
      layer: slot.layer,
      u0: slot.x / this.size,
      v0: slot.y / this.size,
      u1: (slot.x + width) / this.size,
      v1: (slot.y + height) / this.size,
      width,
      height,
    };
    this.cache.set(source, region);
    return region;
  }

  bind(unit = 0): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D_ARRAY, this.texture);
  }

  dispose(): void {
    this.gl.deleteTexture(this.texture);
  }

  private allocate(width: number, height: number): { layer: number; x: number; y: number } {
    for (let layer = 0; layer < this.shelves.length; layer++) {
      const shelf = this.shelves[layer];
      if (shelf.x + width + this.padding > this.size) {
        shelf.x = this.padding;
        shelf.y += shelf.rowHeight + this.padding;
        shelf.rowHeight = 0;
      }
      if (shelf.y + height + this.padding > this.size) continue;
      const x = shelf.x;
      const y = shelf.y;
      shelf.x += width + this.padding;
      shelf.rowHeight = Math.max(shelf.rowHeight, height);
      return { layer, x, y };
    }
    throw new Error(`WebGL texture atlas exhausted (${this.maxLayers} × ${this.size}²)`);
  }
}

function sourceWidth(source: TexImageSource): number {
  if ('videoWidth' in source && source.videoWidth) return source.videoWidth;
  if ('naturalWidth' in source && source.naturalWidth) return source.naturalWidth;
  return (source as { width: number }).width;
}

function sourceHeight(source: TexImageSource): number {
  if ('videoHeight' in source && source.videoHeight) return source.videoHeight;
  if ('naturalHeight' in source && source.naturalHeight) return source.naturalHeight;
  return (source as { height: number }).height;
}
