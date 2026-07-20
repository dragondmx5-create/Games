/** Shared startup error used by both the legacy 2D renderer and the true 3D renderer. */
export class WebGL2NotSupportedError extends Error {
  constructor() {
    super('UNDRAL requires WebGL2. Update the browser or enable hardware acceleration.');
    this.name = 'WebGL2NotSupportedError';
  }
}
