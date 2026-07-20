#version 300 es
precision highp float;

// Shared bright-extract + separable gaussian pass, run twice at half
// resolution: horizontal (uDirection = (1,0), uExtract = 1) reads the scene
// and thresholds it, vertical (uDirection = (0,1), uExtract = 0) reads the
// horizontal result. Weights are a normalized 9-tap gaussian.
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform vec2 uDirection;
uniform float uExtract;
uniform float uThreshold;

in vec2 vUv;
out vec4 outColor;

const float WEIGHTS[5] = float[5](0.227027, 0.194594, 0.121621, 0.054054, 0.016216);

vec3 fetch(vec2 uv) {
  vec3 color = texture(uSource, uv).rgb;
  if (uExtract > 0.5) {
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float knee = smoothstep(uThreshold, uThreshold + 0.35, luma);
    return color * knee;
  }
  return color;
}

void main() {
  vec2 step = uDirection * uTexelSize;
  vec3 sum = fetch(vUv) * WEIGHTS[0];
  for (int i = 1; i < 5; i++) {
    vec2 offset = step * float(i);
    sum += fetch(vUv + offset) * WEIGHTS[i];
    sum += fetch(vUv - offset) * WEIGHTS[i];
  }
  outColor = vec4(sum, 1.0);
}
