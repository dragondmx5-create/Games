#!/usr/bin/env python3
"""Generate tileable PBR texture sets used by the procedural 3D art kit.

Outputs neutral/tintable BaseColor, tangent-space Normal, packed ORM
(R=ambient occlusion, G=roughness, B=metalness), and authoring Height maps.
The textures are deterministic and tile seamlessly because the core noise is
sampled from a periodic gradient lattice. A periodic domain-warp field breaks
the regularity normally visible in unwarped fBm while keeping the first and
last lattice cells continuous.

Requires Python 3, Pillow and NumPy. Runtime builds only need the generated PNGs.
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

KINDS = ("wood", "plaster", "stone", "roof", "metal", "cloth", "leather", "ground", "grass", "dirt", "mud", "moss", "pebble", "leaflitter", "foliage", "hair", "fur", "crystal", "skin")


def clamp01(a: np.ndarray) -> np.ndarray:
    return np.clip(a, 0.0, 1.0)


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = clamp01((x - edge0) / np.maximum(1e-6, edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def fade_quintic(t: np.ndarray) -> np.ndarray:
    """Perlin's 6t^5 - 15t^4 + 10t^3 interpolation curve."""
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


def periodic_gradient_lattice(period: int, seed: int) -> np.ndarray:
    """Return a deterministic NxN table of unit gradient vectors.

    The lattice itself is indexed modulo ``period`` during sampling. Repeating
    the lattice rather than post-processing a non-periodic image makes the
    generated field tileable by construction.
    """
    if period < 1:
        raise ValueError("period must be positive")
    rng = np.random.default_rng(seed)
    angles = rng.random((period, period), dtype=np.float32) * np.float32(math.tau)
    return np.stack((np.cos(angles), np.sin(angles)), axis=-1).astype(np.float32)


def sample_periodic_gradient_noise(
    u: np.ndarray,
    v: np.ndarray,
    period: int,
    seed: int,
) -> np.ndarray:
    """Vectorized 2D periodic gradient noise for arbitrary normalized coords."""
    gradients = periodic_gradient_lattice(period, seed)
    px = np.mod(u, 1.0) * period
    py = np.mod(v, 1.0) * period
    x0 = np.floor(px).astype(np.int32) % period
    y0 = np.floor(py).astype(np.int32) % period
    x1 = (x0 + 1) % period
    y1 = (y0 + 1) % period
    fx = px - np.floor(px)
    fy = py - np.floor(py)

    g00 = gradients[y0, x0]
    g10 = gradients[y0, x1]
    g01 = gradients[y1, x0]
    g11 = gradients[y1, x1]
    n00 = g00[..., 0] * fx + g00[..., 1] * fy
    n10 = g10[..., 0] * (fx - 1.0) + g10[..., 1] * fy
    n01 = g01[..., 0] * fx + g01[..., 1] * (fy - 1.0)
    n11 = g11[..., 0] * (fx - 1.0) + g11[..., 1] * (fy - 1.0)
    sx = fade_quintic(fx)
    sy = fade_quintic(fy)
    nx0 = n00 + (n10 - n00) * sx
    nx1 = n01 + (n11 - n01) * sx
    # sqrt(2) roughly expands the useful 2D gradient-noise range to [-1, 1].
    return (nx0 + (nx1 - nx0) * sy) * np.float32(math.sqrt(2.0))


def periodic_fbm_raw(
    u: np.ndarray,
    v: np.ndarray,
    seed: int,
    octaves: int,
    persistence: float,
    base_freq: int,
) -> np.ndarray:
    result = np.zeros_like(u, dtype=np.float32)
    amplitude = 1.0
    norm = 0.0
    for octave in range(octaves):
        frequency = max(1, base_freq * (2 ** octave))
        layer = sample_periodic_gradient_noise(u, v, frequency, seed + octave * 0x9E37)
        result += layer * amplitude
        norm += amplitude
        amplitude *= persistence
    return result / max(norm, 1e-6)


def periodic_noise(
    size: int,
    seed: int,
    octaves: int = 5,
    persistence: float = 0.52,
    base_freq: int = 1,
    warp_strength: float = 0.22,
) -> np.ndarray:
    """Periodic domain-warped gradient fBm normalized to [0, 1].

    Both warp channels are periodic gradient fields. Since their displacement
    is identical at opposite tile boundaries and the primary field is itself
    periodic, the warped result remains seamless without Fourier synthesis.
    """
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    u = x / np.float32(size)
    v = y / np.float32(size)
    warp_frequency = max(1, base_freq // 2)
    # A single smooth low-frequency gradient field per axis is enough to break
    # the fBm lattice regularity and is substantially cheaper than recursively
    # warping every octave with another full fBm stack.
    warp_x = sample_periodic_gradient_noise(u, v, warp_frequency, seed + 0xA511)
    warp_y = sample_periodic_gradient_noise(u, v, warp_frequency, seed + 0xC2B2)
    # Lower-frequency materials can tolerate broader distortion. Fine detail
    # receives a smaller normalized displacement so it does not become mushy.
    normalized_warp = warp_strength / max(1.0, math.sqrt(float(base_freq)))
    warped_u = u + warp_x * normalized_warp
    warped_v = v + warp_y * normalized_warp
    result = periodic_fbm_raw(warped_u, warped_v, seed, octaves, persistence, base_freq)
    lo, hi = np.percentile(result, [1.0, 99.0])
    return clamp01((result - lo) / max(hi - lo, 1e-6))


def periodic_worley(
    size: int,
    seed: int,
    cells: int,
    jitter: float = 0.86,
) -> tuple[np.ndarray, np.ndarray]:
    """Return tileable Worley F1 and normalized F2-F1 cell-boundary distance.

    Feature points live in a periodic cell lattice. Sampling the wrapped 3x3
    neighborhood is sufficient because each feature remains inside its source
    cell; opposite texture edges therefore see the exact same neighbor set.
    """
    if cells < 2:
        raise ValueError("Worley noise needs at least two cells per axis")
    rng = np.random.default_rng(seed)
    feature = 0.5 + (rng.random((cells, cells, 2), dtype=np.float32) - 0.5) * np.float32(jitter)
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    px = x / np.float32(size) * cells
    py = y / np.float32(size) * cells
    base_x = np.floor(px).astype(np.int32)
    base_y = np.floor(py).astype(np.int32)
    local_x = px - np.floor(px)
    local_y = py - np.floor(py)
    f1_sq = np.full((size, size), np.inf, dtype=np.float32)
    f2_sq = np.full((size, size), np.inf, dtype=np.float32)

    for offset_y in (-1, 0, 1):
        for offset_x in (-1, 0, 1):
            sample_x = (base_x + offset_x) % cells
            sample_y = (base_y + offset_y) % cells
            point = feature[sample_y, sample_x]
            dx = offset_x + point[..., 0] - local_x
            dy = offset_y + point[..., 1] - local_y
            distance_sq = dx * dx + dy * dy
            previous_f1 = f1_sq
            f1_sq = np.minimum(f1_sq, distance_sq)
            f2_sq = np.minimum(f2_sq, np.maximum(previous_f1, distance_sq))

    f1 = np.sqrt(f1_sq)
    f2_minus_f1 = np.sqrt(f2_sq) - f1
    return clamp01(f1 / 1.05), clamp01(f2_minus_f1 / 0.52)


def periodic_cell_values(u: np.ndarray, v: np.ndarray, cols: int, rows: int, seed: int, stagger: bool = False) -> np.ndarray:
    rng = np.random.default_rng(seed)
    table = rng.random((rows, cols), dtype=np.float32)
    iy = np.floor(v * rows).astype(np.int32) % rows
    x = u * cols + (iy % 2) * (0.5 if stagger else 0.0)
    ix = np.floor(x).astype(np.int32) % cols
    return table[iy, ix]


def periodic_spots(size: int, seed: int, count: int, min_radius: float, max_radius: float) -> np.ndarray:
    """Tileable irregular multi-lobe spots for knots, chips and pebbles."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    x /= size
    y /= size
    spots = np.zeros((size, size), dtype=np.float32)
    for _ in range(count):
        cx, cy = rng.random(2)
        radius = float(rng.uniform(min_radius, max_radius))
        dx = np.minimum(np.abs(x - cx), 1.0 - np.abs(x - cx))
        dy = np.minimum(np.abs(y - cy), 1.0 - np.abs(y - cy))
        angle = np.arctan2(dy, dx)
        lobe_phase = float(rng.uniform(0.0, math.tau))
        lobe_count = int(rng.integers(2, 6))
        radial_warp = 1.0 + np.sin(angle * lobe_count + lobe_phase) * float(rng.uniform(0.08, 0.22))
        anisotropy = float(rng.uniform(0.78, 1.24))
        d = np.sqrt((dx * anisotropy) ** 2 + (dy / anisotropy) ** 2) / radial_warp
        spots = np.maximum(spots, 1.0 - smoothstep(radius * 0.32, radius, d))
    return spots


def blur_periodic(a: np.ndarray, radius: int) -> np.ndarray:
    result = np.zeros_like(a)
    weight = 0.0
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            w = math.exp(-(dx * dx + dy * dy) / max(1.0, radius * radius * 0.75))
            result += np.roll(np.roll(a, dy, axis=0), dx, axis=1) * w
            weight += w
    return result / weight


def make_surface(kind: str, size: int, seed: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    u = x / size
    v = y / size
    broad = periodic_noise(size, seed + 11, 5, 0.54, 1)
    medium = periodic_noise(size, seed + 31, 5, 0.5, 2)
    fine = periodic_noise(size, seed + 71, 4, 0.46, 5)
    micro = periodic_noise(size, seed + 101, 3, 0.42, 11)

    height = broad * 0.15 + medium * 0.22 + fine * 0.28 + micro * 0.12
    albedo = np.full((size, size, 3), 0.88, dtype=np.float32)
    rough = np.full((size, size), 0.82, dtype=np.float32)
    metallic = np.zeros((size, size), dtype=np.float32)
    ao_extra = np.ones((size, size), dtype=np.float32)
    tint = np.array([1.0, 1.0, 1.0], dtype=np.float32)

    if kind == "wood":
        warp = (broad - 0.5) * 0.13 + (medium - 0.5) * 0.035
        grain = 0.5 + 0.5 * np.sin(math.tau * (u * 23.0 + warp))
        fine_grain = 0.5 + 0.5 * np.sin(math.tau * (u * 91.0 + warp * 2.7))
        knots = periodic_spots(size, seed + 401, 8, 0.018, 0.055)
        rings = 0.5 + 0.5 * np.sin((np.sqrt((np.minimum(np.abs(u - 0.28), 1 - np.abs(u - 0.28))) ** 2 + (np.minimum(np.abs(v - 0.63), 1 - np.abs(v - 0.63))) ** 2) * 145.0) + broad * 3.0)
        plank_edge = np.minimum((v * 4.0) % 1.0, 1.0 - ((v * 4.0) % 1.0))
        seams = 1.0 - smoothstep(0.012, 0.035, plank_edge)
        height = 0.34 + grain * 0.22 + fine_grain * 0.07 + rings * knots * 0.18 - seams * 0.34 + (medium - 0.5) * 0.08
        value = 0.78 + (grain - 0.5) * 0.19 + (fine_grain - 0.5) * 0.055 + knots * (rings - 0.65) * 0.22 - seams * 0.28
        tint = np.array([1.06, 0.98, 0.89], dtype=np.float32)
        albedo[:] = value[..., None] * tint
        rough = 0.72 + (1.0 - grain) * 0.12 + seams * 0.12 + micro * 0.05
        ao_extra = 1.0 - seams * 0.48 - knots * (1.0 - rings) * 0.12
    elif kind == "stone":
        rows, cols = 6, 5
        row_id = np.floor(v * rows).astype(np.int32)
        fu = (u * cols + (row_id % 2) * 0.5) % 1.0
        fv = (v * rows) % 1.0
        edge_dist = np.minimum.reduce([fu, 1.0 - fu, fv, 1.0 - fv])
        masonry_mortar = 1.0 - smoothstep(0.025, 0.075, edge_dist)
        _, stone_edges = periodic_worley(size, seed + 503, 7, 0.72)
        cellular_mortar = 1.0 - smoothstep(0.035, 0.17, stone_edges)
        mortar = np.maximum(masonry_mortar * 0.72, cellular_mortar * (0.62 + broad * 0.18))
        block = periodic_cell_values(u, v, cols, rows, seed + 501, True)
        chips = periodic_spots(size, seed + 502, 28, 0.004, 0.016) * mortar
        height = 0.48 + (block - 0.5) * 0.13 + (broad - 0.5) * 0.16 + (fine - 0.5) * 0.07 - mortar * 0.45 - chips * 0.18
        value = 0.78 + (block - 0.5) * 0.14 + (broad - 0.5) * 0.13 + (fine - 0.5) * 0.05 - mortar * 0.31
        tint = np.array([0.98, 1.00, 1.035], dtype=np.float32)
        albedo[:] = value[..., None] * tint
        rough = 0.84 + mortar * 0.08 + fine * 0.06
        ao_extra = 1.0 - mortar * 0.55 - chips * 0.14
    elif kind == "roof":
        rows, cols = 9, 7
        row_id = np.floor(v * rows).astype(np.int32)
        fu = (u * cols + (row_id % 2) * 0.5) % 1.0
        fv = (v * rows) % 1.0
        side_edge = np.minimum(fu, 1.0 - fu)
        seam_side = 1.0 - smoothstep(0.018, 0.055, side_edge)
        seam_top = 1.0 - smoothstep(0.015, 0.06, fv)
        scallop_boundary = 0.80 + 0.11 * np.cos((fu - 0.5) * math.pi * 1.8)
        seam_bottom = smoothstep(scallop_boundary - 0.045, scallop_boundary + 0.02, fv)
        regular_seams = np.maximum.reduce([seam_side, seam_top, seam_bottom])
        _, roof_edges = periodic_worley(size, seed + 602, 10, 0.62)
        cellular_seams = 1.0 - smoothstep(0.028, 0.14, roof_edges)
        seams = np.maximum(regular_seams * 0.8, cellular_seams * 0.58)
        tile = periodic_cell_values(u, v, cols, rows, seed + 601, True)
        height = 0.52 + (tile - 0.5) * 0.08 + (broad - 0.5) * 0.08 + (fine - 0.5) * 0.05 - seams * 0.42 + fv * 0.08
        value = 0.80 + (tile - 0.5) * 0.15 + (broad - 0.5) * 0.08 - seams * 0.26
        tint = np.array([0.92, 0.98, 1.08], dtype=np.float32)
        albedo[:] = value[..., None] * tint
        rough = 0.72 + fine * 0.10 + seams * 0.14
        ao_extra = 1.0 - seams * 0.58
    elif kind == "plaster":
        crack_field = np.abs(np.sin(math.tau * (u * 2.0 + broad * 0.42)) + np.cos(math.tau * (v * 3.0 - medium * 0.35)))
        cracks = 1.0 - smoothstep(0.025, 0.085, crack_field)
        stains = periodic_spots(size, seed + 702, 14, 0.035, 0.11) * broad
        height = 0.55 + (broad - 0.5) * 0.15 + (fine - 0.5) * 0.045 - cracks * 0.22 - stains * 0.04
        value = 0.91 + (broad - 0.5) * 0.10 + (medium - 0.5) * 0.05 - cracks * 0.18 - stains * 0.09
        tint = np.array([1.04, 1.02, 0.94], dtype=np.float32)
        albedo[:] = value[..., None] * tint
        rough = 0.88 + fine * 0.07 + cracks * 0.04
        ao_extra = 1.0 - cracks * 0.34 - stains * 0.08
    elif kind == "cloth":
        weave_warp_u = (broad - 0.5) * 1.7 + (medium - 0.5) * 0.55
        weave_warp_v = (broad - 0.5) * -1.35 + (fine - 0.5) * 0.42
        warp = 0.5 + 0.5 * np.sin(math.tau * (u * 96.0 + weave_warp_u))
        weft = 0.5 + 0.5 * np.sin(math.tau * (v * 88.0 + weave_warp_v) + math.pi * 0.5)
        over_under = 0.5 + 0.5 * np.sin(math.tau * (u * 48.0 + v * 44.0 + medium * 0.4))
        weave = (warp + weft) * 0.42 + over_under * 0.16
        folds = periodic_noise(size, seed + 801, 4, 0.5, 1)
        loose_fibers = periodic_noise(size, seed + 802, 3, 0.44, 13, 0.08)
        height = 0.46 + (weave - 0.5) * 0.19 + (folds - 0.5) * 0.11 + (loose_fibers - 0.5) * 0.035
        value = 0.86 + (weave - 0.5) * 0.10 + (folds - 0.5) * 0.10 + (loose_fibers - 0.5) * 0.025
        albedo[:] = value[..., None] * np.array([1.01, 1.0, 0.985], dtype=np.float32)
        rough = 0.84 + (1.0 - weave) * 0.08 + (loose_fibers - 0.5) * 0.08 + (folds - 0.5) * 0.035
        ao_extra = 0.98 - (1.0 - weave) * 0.08 - (1.0 - loose_fibers) * 0.025
    elif kind == "leather":
        leather_f1, leather_edges = periodic_worley(size, seed + 901, 23, 0.9)
        cellular_pores = 1.0 - smoothstep(0.025, 0.14, leather_edges)
        pore_centers = smoothstep(0.42, 0.82, leather_f1)
        pores = clamp01(cellular_pores * 0.72 + pore_centers * micro * 0.28)
        scratches = 1.0 - smoothstep(0.018, 0.055, np.abs(np.sin(math.tau * (u * 3.0 + v * 1.0 + medium * 0.16))))
        scratches *= (fine > 0.73)
        height = 0.51 + (broad - 0.5) * 0.11 + (fine - 0.5) * 0.055 - pores * 0.16 - scratches * 0.12
        value = 0.82 + (broad - 0.5) * 0.11 + (medium - 0.5) * 0.06 - pores * 0.08 + scratches * 0.08
        albedo[:] = value[..., None] * np.array([1.04, 0.97, 0.90], dtype=np.float32)
        rough = 0.62 + broad * 0.12 + pores * 0.08 - scratches * 0.08
        ao_extra = 1.0 - pores * 0.26 - scratches * 0.12
    elif kind == "metal":
        brush_phase = v * 165.0 + (broad - 0.5) * 2.4 + (medium - 0.5) * 0.85
        brushed = 0.5 + 0.5 * np.sin(math.tau * brush_phase)
        directional_streaks = periodic_noise(size, seed + 1003, 3, 0.42, 14, 0.05)
        scratches = periodic_spots(size, seed + 1001, 70, 0.0015, 0.005)
        tarnish = periodic_noise(size, seed + 1002, 5, 0.54, 1)
        brushed = clamp01(brushed * 0.7 + directional_streaks * 0.3)
        height = 0.50 + (brushed - 0.5) * 0.025 - scratches * 0.08 + (fine - 0.5) * 0.025
        value = 0.78 + (brushed - 0.5) * 0.08 + (tarnish - 0.5) * 0.10 - scratches * 0.09
        # Neutral cool steel reflectance; material tint can still shift it to
        # iron, silver or painted metal without starting from generic gray.
        albedo[:] = value[..., None] * np.array([0.91, 0.94, 1.0], dtype=np.float32)
        rough = 0.27 + tarnish * 0.28 + scratches * 0.17
        metallic[:] = 0.86
        ao_extra = 1.0 - scratches * 0.08
    elif kind == "ground":
        pebbles = periodic_spots(size, seed + 1101, 55, 0.004, 0.018)
        roots = 1.0 - smoothstep(0.025, 0.065, np.abs(np.sin(math.tau * (u * 2.0 + v * 1.0 + broad * 0.35))))
        roots *= (medium > 0.72)
        height = 0.41 + broad * 0.20 + medium * 0.12 + fine * 0.06 + pebbles * 0.25 + roots * 0.11
        value = 0.75 + (broad - 0.5) * 0.18 + (medium - 0.5) * 0.09 + pebbles * 0.12 - roots * 0.06
        albedo[..., 0] = value * 0.95
        albedo[..., 1] = value * (1.00 + (broad - 0.5) * 0.08)
        albedo[..., 2] = value * 0.92
        rough = 0.88 + fine * 0.07 - pebbles * 0.08
        ao_extra = 1.0 - roots * 0.18 - pebbles * 0.08
    elif kind == "grass":
        # Stylized meadow turf rather than a photographic carpet. Dense,
        # high-contrast blade noise aliases badly at the gameplay camera and
        # fights the real instanced grass geometry, so the texture carries the
        # broad turf colour and only a restrained suggestion of blade ridges.
        turf = clamp01(broad * 0.58 + medium * 0.29 + fine * 0.13)
        clumps = smoothstep(0.37, 0.72, turf)
        blade_a = 1.0 - smoothstep(0.025, 0.09, np.abs(np.sin(math.tau * (u * 17.0 + v * 3.0 + broad * 0.46))))
        blade_b = 1.0 - smoothstep(0.025, 0.085, np.abs(np.sin(math.tau * (u * 5.0 - v * 15.0 + medium * 0.38))))
        blade_mask = smoothstep(0.60, 0.82, fine)
        blade_ridges = clamp01((blade_a * 0.58 + blade_b * 0.42) * blade_mask)
        dry_patch = smoothstep(0.64, 0.86, periodic_noise(size, seed + 1107, 4, 0.5, 2, 0.14))
        roots = 1.0 - smoothstep(0.025, 0.075, np.abs(np.sin(math.tau * (u * 2.0 + v + broad * 0.34))))
        roots *= smoothstep(0.74, 0.9, micro)
        height = 0.39 + (turf - 0.5) * 0.24 + clumps * 0.10 + blade_ridges * 0.045 + roots * 0.035
        albedo[..., 0] = 0.40 + turf * 0.16 + dry_patch * 0.055 + blade_ridges * 0.012
        albedo[..., 1] = 0.51 + turf * 0.20 + dry_patch * 0.025 + clumps * 0.025
        albedo[..., 2] = 0.31 + medium * 0.13 + dry_patch * 0.012
        rough = 0.87 + (1.0 - clumps) * 0.06 + micro * 0.025 - blade_ridges * 0.025
        ao_extra = 1.0 - roots * 0.12 - clumps * 0.035
    elif kind == "dirt":
        grains = periodic_spots(size, seed + 1111, 120, 0.0018, 0.008)
        pebbles = periodic_spots(size, seed + 1112, 38, 0.004, 0.018)
        _, dirt_edges = periodic_worley(size, seed + 1113, 7, 0.91)
        cracks = (1.0 - smoothstep(0.022, 0.13, dirt_edges)) * smoothstep(0.58, 0.79, medium)
        height = 0.34 + broad * 0.18 + medium * 0.10 + grains * 0.08 + pebbles * 0.23 - cracks * 0.10
        value = 0.70 + (broad - 0.5) * 0.20 + (medium - 0.5) * 0.10 + pebbles * 0.12 - cracks * 0.08
        albedo[..., 0] = value * 1.04
        albedo[..., 1] = value * 0.90
        albedo[..., 2] = value * 0.72
        rough = 0.91 + fine * 0.06 - pebbles * 0.09
        ao_extra = 1.0 - cracks * 0.24 - pebbles * 0.10
    elif kind == "mud":
        puddles = smoothstep(0.62, 0.86, broad * 0.64 + medium * 0.36)
        _, mud_edges = periodic_worley(size, seed + 1121, 6, 0.94)
        drying_cracks = (1.0 - smoothstep(0.025, 0.14, mud_edges)) * (1.0 - puddles)
        rut_phase = u * 2.0 + v + (medium - 0.5) * 0.7
        ruts = 1.0 - smoothstep(0.018, 0.07, np.abs(np.sin(math.tau * rut_phase)))
        ruts *= smoothstep(0.55, 0.8, fine)
        height = 0.40 + broad * 0.12 + fine * 0.05 - puddles * 0.20 - ruts * 0.12 - drying_cracks * 0.07
        value = 0.56 + (broad - 0.5) * 0.13 + (medium - 0.5) * 0.06 - puddles * 0.10 - drying_cracks * 0.035
        albedo[..., 0] = value * 1.00
        albedo[..., 1] = value * 0.82
        albedo[..., 2] = value * 0.64
        rough = 0.78 - puddles * 0.52 + fine * 0.04
        ao_extra = 1.0 - ruts * 0.22 - drying_cracks * 0.2
    elif kind == "moss":
        cushions = smoothstep(0.38, 0.74, broad * 0.56 + medium * 0.44)
        pores = periodic_spots(size, seed + 1131, 150, 0.0015, 0.006)
        height = 0.38 + cushions * 0.32 + (fine - 0.5) * 0.08 + pores * 0.045
        albedo[..., 0] = 0.44 + broad * 0.10
        albedo[..., 1] = 0.66 + broad * 0.20 + cushions * 0.08
        albedo[..., 2] = 0.35 + medium * 0.12
        rough = 0.91 + (1.0 - cushions) * 0.05
        ao_extra = 1.0 - (1.0 - cushions) * 0.08
    elif kind == "pebble":
        cells = periodic_cell_values(u, v, 13, 13, seed + 1141, True)
        fu = (u * 13.0 + (np.floor(v * 13.0).astype(np.int32) % 2) * 0.5) % 1.0
        fv = (v * 13.0) % 1.0
        dxp = (fu - 0.5) / (0.40 + cells * 0.08)
        dyp = (fv - 0.5) / (0.32 + cells * 0.07)
        stones = 1.0 - smoothstep(0.62, 1.0, np.sqrt(dxp * dxp + dyp * dyp))
        gaps = 1.0 - stones
        height = 0.31 + stones * (0.25 + cells * 0.18) + (fine - 0.5) * 0.05
        value = 0.67 + (cells - 0.5) * 0.22 + (broad - 0.5) * 0.08 - gaps * 0.15
        albedo[:] = value[..., None] * np.array([1.02, 1.00, 0.96], dtype=np.float32)
        rough = 0.78 + gaps * 0.16 + fine * 0.05
        ao_extra = 1.0 - gaps * 0.48
    elif kind == "leaflitter":
        leaves_a = periodic_spots(size, seed + 1151, 95, 0.005, 0.018)
        leaves_b = periodic_spots(size, seed + 1152, 72, 0.004, 0.014)
        twigs = 1.0 - smoothstep(0.012, 0.038, np.abs(np.sin(math.tau * (u * 3.0 + v * 2.0 + medium * 0.45))))
        twigs *= (fine > 0.8)
        height = 0.34 + broad * 0.08 + leaves_a * 0.18 + leaves_b * 0.12 + twigs * 0.10
        albedo[..., 0] = 0.58 + leaves_a * 0.24 + leaves_b * 0.10
        albedo[..., 1] = 0.43 + leaves_b * 0.18 + broad * 0.08
        albedo[..., 2] = 0.27 + leaves_b * 0.08
        rough = 0.90 + fine * 0.05 - leaves_a * 0.05
        ao_extra = 1.0 - leaves_a * 0.12 - twigs * 0.16
    elif kind == "foliage":
        veins = 1.0 - smoothstep(0.015, 0.045, np.abs(np.sin(math.tau * (u * 6.0 + (v - 0.5) * 1.0))))
        veins += (1.0 - smoothstep(0.01, 0.035, np.abs(u - 0.5))) * 0.5
        veins = clamp01(veins)
        height = 0.45 + (broad - 0.5) * 0.13 + veins * 0.11 + (fine - 0.5) * 0.05
        value = 0.82 + (broad - 0.5) * 0.16 + (medium - 0.5) * 0.08 - veins * 0.08
        albedo[:] = value[..., None] * np.array([0.96, 1.04, 0.92], dtype=np.float32)
        rough = 0.76 + fine * 0.10
        ao_extra = 1.0 - veins * 0.10
    elif kind == "hair":
        strands = 0.5 + 0.5 * np.sin(math.tau * (v * 142.0 + broad * 1.2 + medium * 0.35))
        clumps = periodic_noise(size, seed + 1211, 5, 0.52, 2)
        height = 0.46 + (strands - 0.5) * 0.16 + (clumps - 0.5) * 0.12
        value = 0.72 + (strands - 0.5) * 0.12 + (clumps - 0.5) * 0.14
        albedo[:] = value[..., None] * np.array([1.02, 0.97, 0.92], dtype=np.float32)
        rough = 0.54 + (1.0 - strands) * 0.18 + clumps * 0.06
        ao_extra = 1.0 - (1.0 - clumps) * 0.08
    elif kind == "fur":
        strands = 0.5 + 0.5 * np.sin(math.tau * (v * 118.0 + broad * 1.1 + fine * 0.28))
        clumps = periodic_noise(size, seed + 1221, 5, 0.55, 2)
        height = 0.43 + (strands - 0.5) * 0.18 + (clumps - 0.5) * 0.16
        value = 0.78 + (strands - 0.5) * 0.10 + (clumps - 0.5) * 0.15
        albedo[:] = value[..., None] * np.array([1.04, 0.99, 0.93], dtype=np.float32)
        rough = 0.78 + (1.0 - strands) * 0.11
        ao_extra = 1.0 - (1.0 - clumps) * 0.10
    elif kind == "crystal":
        facets = np.maximum.reduce([
            np.abs(np.sin(math.tau * (u * 3.0 + v * 1.0))),
            np.abs(np.sin(math.tau * (u * 1.0 - v * 4.0 + 0.2))),
            np.abs(np.sin(math.tau * (u * 2.0 + v * 3.0 + 0.4))),
        ])
        bands = 0.5 + 0.5 * np.sin(math.tau * (u * 2.0 + v * 2.0 + broad * 0.4))
        inclusions = periodic_noise(size, seed + 1281, 4, 0.5, 4, 0.16)
        height = 0.46 + (facets - 0.5) * 0.10 + (bands - 0.5) * 0.08 + (inclusions - 0.5) * 0.035
        value = 0.82 + (facets - 0.5) * 0.18 + (bands - 0.5) * 0.09 + (inclusions - 0.5) * 0.045
        albedo[:] = value[..., None] * np.array([0.93, 1.0, 1.11], dtype=np.float32)
        rough = 0.16 + (1.0 - facets) * 0.22 + (inclusions - 0.5) * 0.12
        metallic[:] = 0.06 + inclusions * 0.035
        ao_extra = 1.0 - (1.0 - inclusions) * 0.045
    elif kind == "skin":
        skin_f1, skin_edges = periodic_worley(size, seed + 1301, 31, 0.92)
        pore_boundaries = 1.0 - smoothstep(0.018, 0.105, skin_edges)
        pore_centers = smoothstep(0.52, 0.86, skin_f1)
        pores = clamp01(pore_boundaries * 0.62 + pore_centers * 0.38)
        skin_micro = periodic_noise(size, seed + 1302, 4, 0.46, 9, 0.09)
        mottling = periodic_noise(size, seed + 1303, 4, 0.52, 2, 0.15)
        height = 0.50 + (broad - 0.5) * 0.042 + (fine - 0.5) * 0.024 + (skin_micro - 0.5) * 0.025 - pores * 0.047
        value = 0.90 + (broad - 0.5) * 0.045 + (medium - 0.5) * 0.022 + (mottling - 0.5) * 0.032 - pores * 0.018
        albedo[:] = value[..., None] * np.array([1.04, 0.995, 0.96], dtype=np.float32)
        rough = 0.61 + broad * 0.08 + (skin_micro - 0.5) * 0.11 + pores * 0.045
        ao_extra = 1.0 - pores * 0.055 - (1.0 - skin_micro) * 0.018
    else:
        raise ValueError(kind)

    height = clamp01(height)
    # Keep authored values away from impossible pure black/white endpoints.
    # The files are stored in sRGB for base color, so these bounds are a
    # practical authoring guard rather than a claim that the PNG values are
    # already linear-light reflectance measurements.
    albedo = np.clip(albedo, 0.025, 0.94)
    rough = np.clip(rough, 0.045, 0.97)
    metallic = clamp01(metallic)

    # Approximate small-scale cavity AO from the height field, combined with
    # explicit seams/cracks. It is intentionally subtle to avoid baked-lighting artifacts.
    local_average = blur_periodic(height, 4)
    cavity = clamp01((local_average - height) * 3.4)
    ao = clamp01((1.0 - cavity * 0.42) * ao_extra)

    # Tangent-space OpenGL normal map from the periodic height gradients.
    dx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    dy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)
    strength = {
        "wood": 5.2, "stone": 6.6, "roof": 6.0, "plaster": 3.0,
        "cloth": 4.0, "leather": 3.7, "metal": 2.2, "ground": 7.0,
        "grass": 5.8, "dirt": 6.5, "mud": 4.5, "moss": 5.3, "pebble": 7.2, "leaflitter": 5.4,
        "foliage": 3.5, "hair": 3.2, "fur": 4.2, "crystal": 2.4, "skin": 1.6,
    }[kind]
    nx = -dx * strength
    ny = -dy * strength
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx / length, ny / length, nz / length), axis=-1) * 0.5 + 0.5
    orm = np.stack((ao, rough, metallic), axis=-1)
    return albedo, normal, orm, height


def save_rgb(path: Path, data: np.ndarray) -> None:
    image = Image.fromarray(np.round(clamp01(data) * 255.0).astype(np.uint8), mode="RGB")
    image.save(path, optimize=True, compress_level=9)


def save_gray(path: Path, data: np.ndarray) -> None:
    image = Image.fromarray(np.round(clamp01(data) * 255.0).astype(np.uint8), mode="L")
    image.save(path, optimize=True, compress_level=9)


def sample_rgb_tile(data: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    """Bilinearly sample a seamless RGB tile at arbitrary repeating UVs."""
    height, width, _ = data.shape
    px = np.mod(u, 1.0) * width
    py = np.mod(v, 1.0) * height
    x0 = np.floor(px).astype(np.int32) % width
    y0 = np.floor(py).astype(np.int32) % height
    x1 = (x0 + 1) % width
    y1 = (y0 + 1) % height
    fx = (px - np.floor(px))[..., None]
    fy = (py - np.floor(py))[..., None]
    top = data[y0, x0] * (1.0 - fx) + data[y0, x1] * fx
    bottom = data[y1, x0] * (1.0 - fx) + data[y1, x1] * fx
    return top * (1.0 - fy) + bottom * fy


def preview_variant(seed: int, ix: int, iy: int) -> tuple[int, bool, float, float, float]:
    """Deterministic transform assigned to one macro-lattice corner."""
    mixed = (seed ^ (ix * 0x9E3779B1) ^ (iy * 0x85EBCA77)) & 0xFFFFFFFF
    rng = np.random.default_rng(mixed)
    rotation = int(rng.integers(0, 4))
    mirror = bool(rng.integers(0, 2))
    scale = float(rng.choice(np.array([0.883, 0.941, 1.057, 1.119], dtype=np.float32)))
    offset_u, offset_v = (float(value) for value in rng.random(2))
    return rotation, mirror, scale, offset_u, offset_v


def transformed_preview_uv(
    u: np.ndarray,
    v: np.ndarray,
    variant: tuple[int, bool, float, float, float],
) -> tuple[np.ndarray, np.ndarray]:
    rotation, mirror, scale, offset_u, offset_v = variant
    x = -u if mirror else u
    y = v
    if rotation == 1:
        x, y = -y, x
    elif rotation == 2:
        x, y = -x, -y
    elif rotation == 3:
        x, y = y, -x
    return x * scale + offset_u, y * scale + offset_v


def make_tiled_preview(data: np.ndarray, seed: int, tiles: int = 3, preview_cell: int = 256) -> np.ndarray:
    """Preview smooth stochastic tiling over a large virtual surface.

    Each macro-lattice corner owns a seeded rotation/mirror/phase/scale. Four
    corner projections are blended with quintic weights inside every cell. The
    corner transforms are shared between neighboring cells, so boundaries stay
    continuous while adjacent regions no longer expose the same source phase.
    """
    preview_size = preview_cell * tiles
    preview = np.zeros((preview_size, preview_size, 3), dtype=np.float32)
    local_y, local_x = np.mgrid[0:preview_cell, 0:preview_cell].astype(np.float32)
    fu = local_x / np.float32(preview_cell)
    fv = local_y / np.float32(preview_cell)
    sx = fade_quintic(fu)[..., None]
    sy = fade_quintic(fv)[..., None]

    for cell_y in range(tiles):
        for cell_x in range(tiles):
            world_u = cell_x + fu
            world_v = cell_y + fv
            samples: list[np.ndarray] = []
            for corner_y, corner_x in ((0, 0), (0, 1), (1, 0), (1, 1)):
                variant = preview_variant(seed, cell_x + corner_x, cell_y + corner_y)
                sample_u, sample_v = transformed_preview_uv(world_u, world_v, variant)
                samples.append(sample_rgb_tile(data, sample_u, sample_v))
            top = samples[0] * (1.0 - sx) + samples[1] * sx
            bottom = samples[2] * (1.0 - sx) + samples[3] * sx
            patch = top * (1.0 - sy) + bottom * sy

            # World-scale modulation is deliberately independent from the
            # source tile phase, matching the runtime material macro pass.
            normalized_u = world_u / np.float32(tiles)
            normalized_v = world_v / np.float32(tiles)
            macro = periodic_fbm_raw(normalized_u, normalized_v, seed + 0x9191, 3, 0.5, 2)
            patch *= 1.0 + macro[..., None] * 0.085
            y0 = cell_y * preview_cell
            x0 = cell_x * preview_cell
            preview[y0:y0 + preview_cell, x0:x0 + preview_cell] = patch
    return clamp01(preview)


def save_tiled_preview(path: Path, data: np.ndarray, seed: int, tiles: int = 3, preview_cell: int = 256) -> None:
    preview = make_tiled_preview(data, seed, tiles, preview_cell)
    image = Image.fromarray(np.round(preview * 255.0).astype(np.uint8), mode="RGB")
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, quality=92, subsampling=0, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--output", type=Path, default=Path("src/assets3d/pbr"))
    parser.add_argument("--preview-output", type=Path, default=Path("artifacts/pbr-tiled-previews"))
    parser.add_argument("--preview-tiles", type=int, default=3)
    parser.add_argument("--preview-cell", type=int, default=256)
    parser.add_argument("--skip-previews", action="store_true")
    parser.add_argument("--only", type=str, default="", help="Comma-separated material kinds")
    args = parser.parse_args()
    if args.size & (args.size - 1):
        raise SystemExit("Texture size must be a power of two for predictable mipmaps.")
    args.output.mkdir(parents=True, exist_ok=True)
    selected = set(filter(None, (part.strip() for part in args.only.split(","))))
    for index, kind in enumerate(KINDS):
        if selected and kind not in selected:
            continue
        albedo, normal, orm, height = make_surface(kind, args.size, 0x51A7 + index * 997)
        save_rgb(args.output / f"{kind}_basecolor.png", albedo)
        save_rgb(args.output / f"{kind}_normal.png", normal)
        save_rgb(args.output / f"{kind}_orm.png", orm)
        save_gray(args.output / f"{kind}_height.png", height)
        if not args.skip_previews:
            save_tiled_preview(
                args.preview_output / f"{kind}_tiled_preview.jpg",
                albedo,
                0xA17E + index * 1237,
                max(3, args.preview_tiles),
                max(128, args.preview_cell),
            )
        print(f"generated {kind}: {args.size}x{args.size}")


if __name__ == "__main__":
    main()
