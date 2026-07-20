// Procedural pixel art. Every static sprite here can be overridden by dropping
// a PNG into public/assets/ and listing it in manifest.json (see src/assets.ts).
// Implementation is split across sprites/* by theme; this file re-exports them.
export * from './sprites/core';
export * from './sprites/actors';
export * from './sprites/props';
export * from './sprites/nature';
export * from './sprites/structures';
export * from './sprites/resources';
export * from './sprites/tiles';
