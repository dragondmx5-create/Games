#version 300 es
precision highp float;
precision highp sampler2DArray;

uniform sampler2DArray uAtlas;
uniform float uTime;

in vec2 vUv;
in vec4 vColorA;
in vec4 vColorB;
in vec2 vLocal;
flat in int vLayer;
flat in int vMode;

out vec4 outColor;

const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  if (vMode == 0) {
    outColor = texture(uAtlas, vec3(vUv, float(vLayer))) * vColorA;
    return;
  }
  if (vMode == 1) {
    outColor = vColorA;
    return;
  }
  if (vMode == 2) {
    float d = dot(vLocal, vLocal);
    if (d > 1.0) discard;
    outColor = vColorA;
    return;
  }
  if (vMode == 3) {
    float t = clamp(length(vLocal), 0.0, 1.0);
    outColor = mix(vColorA, vColorB, smoothstep(0.0, 1.0, t));
    return;
  }
  if (vMode == 4) {
    // Procedural water. Alpha channels carry a stable tile seed and edge mask.
    vec2 uv = vLocal;
    float seed = vColorA.a * 31.0;
    float t = uTime;
    float waveA = sin(uv.x * 15.0 + uv.y * 4.0 + t * 1.65 + seed);
    float waveB = sin(uv.x * -7.0 + uv.y * 19.0 - t * 1.1 + seed * 1.7);
    float ripple = sin(length(uv - vec2(0.5)) * 26.0 - t * 2.3 + seed) * 0.5 + 0.5;
    float wave = waveA * 0.36 + waveB * 0.25 + ripple * 0.16;
    float band = smoothstep(0.33, 0.72, wave * 0.5 + 0.5);
    vec3 color = mix(vColorA.rgb, vColorB.rgb, 0.24 + band * 0.42);
    color += vec3(0.12, 0.22, 0.28) * pow(max(0.0, wave), 4.0);

    // caustic web: interference of two skewed waves, brightening where they cross
    float causticA = sin(uv.x * 21.0 - uv.y * 13.0 + t * 1.9 + seed * 2.3);
    float causticB = sin(uv.x * 12.0 + uv.y * 24.0 - t * 1.4 + seed);
    float caustic = pow(max(0.0, causticA * causticB), 3.0);
    color += vec3(0.10, 0.20, 0.24) * caustic * 0.8;

    // sparse sun glints: short-lived bright cells drifting over the surface
    vec2 glintCell = floor((uv + vec2(seed, seed * 0.7)) * 9.0 + vec2(t * 0.8, -t * 0.5));
    float glintSample = hash21(glintCell + floor(t * 2.0));
    float glint = smoothstep(0.965, 1.0, glintSample) * (0.55 + 0.45 * sin(t * 6.0 + glintSample * 40.0));
    color += vec3(1.0, 0.95, 0.8) * glint * 0.55;

    int mask = int(floor(vColorB.a * 15.0 + 0.5));
    float foam = 0.0;
    float wobble = 0.035 * sin((uv.x + uv.y) * 19.0 + t * 2.2 + seed);
    if ((mask & 1) != 0) foam = max(foam, 1.0 - smoothstep(0.015, 0.12 + wobble, uv.y));
    if ((mask & 2) != 0) foam = max(foam, 1.0 - smoothstep(0.015, 0.12 - wobble, 1.0 - uv.y));
    if ((mask & 4) != 0) foam = max(foam, 1.0 - smoothstep(0.015, 0.12 + wobble, uv.x));
    if ((mask & 8) != 0) foam = max(foam, 1.0 - smoothstep(0.015, 0.12 - wobble, 1.0 - uv.x));
    float foamNoise = 0.72 + 0.28 * hash21(floor((uv + seed) * 18.0) + floor(t * 4.0));
    color = mix(color, vec3(0.57, 0.78, 0.86), foam * foamNoise * 0.82);
    outColor = vec4(color, 1.0);
    return;
  }
  if (vMode == 5) {
    // Fragment-masked combat arc. vColorB = start, sweep, thickness, ability.
    float radius = length(vLocal);
    if (radius > 1.0) discard;
    float angle = mod(atan(vLocal.y, vLocal.x) + TAU, TAU) / TAU;
    float rel = mod(angle - vColorB.r + 1.0, 1.0);
    float sweep = max(vColorB.g, 0.0001);
    if (rel > sweep) discard;
    float radialBand = 1.0 - smoothstep(vColorB.b, vColorB.b * 1.8, abs(radius - 0.78));
    float head = smoothstep(0.0, 1.0, rel / sweep);
    float tail = smoothstep(0.0, 0.18, rel / sweep);
    float endFeather = 1.0 - smoothstep(0.82, 1.0, rel / sweep);
    float alpha = radialBand * tail * (0.55 + head * 0.45) * max(0.35, endFeather);
    float ability = vColorB.a;
    vec3 core = mix(vColorA.rgb, vec3(1.0), 0.35 + ability * 0.28);
    vec3 color = mix(vColorA.rgb, core, pow(radialBand, 3.0));
    color *= 1.0 + ability * 0.55 + head * 0.25;
    outColor = vec4(color, alpha * vColorA.a);
    return;
  }
  if (vMode == 6) {
    float d = length(vLocal);
    if (d > 1.0) discard;
    float sharpness = vColorB.g;
    float halo = pow(max(0.0, 1.0 - d), mix(1.2, 4.5, sharpness));
    float core = 1.0 - smoothstep(0.0, 0.22, d);
    float twinkle = 0.86 + 0.14 * sin(uTime * 9.0 + vColorB.r * 41.0);
    vec3 color = mix(vColorA.rgb, vec3(1.0), core * 0.72);
    outColor = vec4(color, (halo * 0.76 + core * 0.52) * vColorA.a * twinkle);
    return;
  }
  outColor = vec4(1.0, 0.0, 1.0, 1.0);
}
