#version 300 es
precision highp float;

#define MAX_LIGHTS 16

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uTime;
uniform float uDamage;
uniform float uQuality;
uniform float uBloomStrength;
uniform vec3 uGrade;
uniform vec2 uCamera;
uniform int uLightCount;
uniform vec4 uLights[MAX_LIGHTS];
uniform vec4 uLightColors[MAX_LIGHTS];

in vec2 vUv;
out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Smooth value noise for the drifting cloud-shadow field. Sampled in world
// space (fragment + camera) so clouds are anchored to the ground, not the
// screen, and visibly drift as the player walks.
float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float cloudField(vec2 worldPx, float t) {
  vec2 drift = vec2(t * 9.0, t * 3.4);
  float n = valueNoise((worldPx + drift) * 0.0045) * 0.65;
  n += valueNoise((worldPx + drift * 1.7) * 0.011) * 0.35;
  return smoothstep(0.52, 0.86, n);
}

void main() {
  vec2 uv = vUv;
  float damage = clamp(uDamage, 0.0, 1.0);
  vec2 fromCenter = uv - 0.5;
  float radial = dot(fromCenter, fromCenter);

  if (damage > 0.001) {
    float wobble = sin((uv.y + uTime * 0.8) * 34.0) * 0.0018 * damage;
    uv.x += wobble;
  }

  // Tiny damage-only chromatic separation adds impact without blurring pixel art.
  vec2 chroma = fromCenter * damage * 0.0025;
  vec3 color;
  if (damage > 0.01 && uQuality > 0.5) {
    color = vec3(
      texture(uScene, uv + chroma).r,
      texture(uScene, uv).g,
      texture(uScene, uv - chroma).b
    );
  } else {
    color = texture(uScene, uv).rgb;
  }

  // Half-res gaussian bloom, computed in the dedicated blur passes. The
  // bloom texture is linearly filtered so it upsamples softly over the
  // nearest-neighbor pixel art without smearing it.
  if (uBloomStrength > 0.001) {
    color += texture(uBloom, uv).rgb * uBloomStrength;
  }

  vec2 fragPx = uv * uResolution;
  // True world-space pixel (top-left origin): the framebuffer's Y axis is
  // flipped relative to game coordinates, so undo it before adding the camera.
  vec2 worldPx = vec2(fragPx.x + uCamera.x, (uResolution.y - fragPx.y) + uCamera.y);
  vec3 lightScatter = vec3(0.0);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec2 d = fragPx - uLights[i].xy;
    float radiusPx = max(1.0, uLights[i].z);
    float normalizedDistance = length(d) / radiusPx;
    float falloff = clamp(1.0 - normalizedDistance, 0.0, 1.0);
    falloff = falloff * falloff * (3.0 - 2.0 * falloff);
    float flicker = 0.955 + 0.045 * sin(uTime * 7.0 + float(i) * 2.17);
    color += uLightColors[i].rgb * falloff * uLights[i].w * flicker;

    if (uQuality > 0.5) {
      float halo = exp(-normalizedDistance * (uQuality > 1.5 ? 3.1 : 4.2));
      float shimmer = 0.92 + 0.08 * sin(uTime * 2.4 + normalizedDistance * 11.0 + float(i));
      lightScatter += uLightColors[i].rgb * halo * uLights[i].w * shimmer * (uQuality > 1.5 ? 0.075 : 0.035);
    }
  }
  color += lightScatter;

  // Drifting cloud shadows over the whole ground plane. Deliberately gentle
  // (never below ~90% brightness) — atmosphere, not a darkness mechanic.
  if (uQuality > 0.5) {
    float cloud = cloudField(worldPx, uTime);
    color *= 1.0 - cloud * 0.06;
    // sunlight warms the gaps between clouds slightly
    color += vec3(0.030, 0.024, 0.010) * (1.0 - cloud);
  }

  // Soft diagonal sun shafts sweeping slowly across the scene (high quality
  // only). Purely cosmetic — additive and far below readability thresholds.
  if (uQuality > 1.5) {
    vec2 rayDir = normalize(vec2(0.72, 0.42));
    float band = dot(worldPx, rayDir) * 0.011 + uTime * 0.21;
    float rays = pow(0.5 + 0.5 * sin(band), 5.0) * pow(0.5 + 0.5 * sin(band * 0.37 + 1.7), 2.0);
    float mask = 1.0 - smoothstep(0.05, 0.42, radial);
    color += vec3(1.0, 0.93, 0.72) * rays * mask * 0.045;
  }

  color *= uGrade;
  color = max(color, vec3(0.0));
  // Gentle highlight rolloff only — the old 0.62 filmic mix flattened and
  // desaturated the whole scene into a hazy wash (the "faded painting" look).
  vec3 filmic = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
  color = mix(color, clamp(filmic, 0.0, 1.0), 0.26);

  // Vibrance: boost muted colors more than already-saturated ones so the
  // grade pops without pushing skin/UI tones into neon.
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float sat = max(max(color.r, color.g), color.b) - min(min(color.r, color.g), color.b);
  color = mix(vec3(luma), color, 1.0 + (1.0 - sat) * 0.34);

  float vignette = smoothstep(0.28, 0.72, radial);
  color *= 1.0 - vignette * (0.11 + damage * 0.18);
  color += vec3(0.35, 0.015, 0.01) * damage * (0.22 + vignette * 0.5);

  float grain = (hash21(fragPx + uTime * 61.0) - 0.5) * (uQuality > 1.5 ? 0.010 : 0.005);
  color += grain;

  outColor = vec4(color, 1.0);
}
