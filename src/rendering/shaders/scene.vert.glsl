#version 300 es
precision highp float;

layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec4 aColorA;
layout(location = 3) in vec4 aColorB;
layout(location = 4) in float aLayer;
layout(location = 5) in float aMode;
layout(location = 6) in vec2 aLocal;

uniform vec2 uResolution;

out vec2 vUv;
out vec4 vColorA;
out vec4 vColorB;
out vec2 vLocal;
flat out int vLayer;
flat out int vMode;

void main() {
  vec2 clip = (aPosition / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vUv = aUv;
  vColorA = aColorA;
  vColorB = aColorB;
  vLocal = aLocal;
  vLayer = int(aLayer + 0.5);
  vMode = int(aMode + 0.5);
}
