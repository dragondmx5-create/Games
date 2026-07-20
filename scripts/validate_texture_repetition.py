#!/usr/bin/env python3
"""Automated seam/repetition QA for generated PBR BaseColor textures.

This is intentionally a blocking validator. It checks that the source tile is
continuous across wrapping edges and that the 3x3 stochastic application
preview does not collapse into nine near-identical cells. The preview remains a
human-review artifact; the metrics prevent obvious regressions from silently
shipping.
"""
from __future__ import annotations

import argparse
import json
from itertools import combinations
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

KINDS = ("wood", "plaster", "stone", "roof", "metal", "cloth", "leather", "ground", "grass", "dirt", "mud", "moss", "pebble", "leaflitter", "foliage", "hair", "fur", "crystal", "skin")
FOCUS_KINDS = {"ground", "grass", "foliage", "dirt", "moss", "leaflitter"}


def rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0


def grayscale(data: np.ndarray) -> np.ndarray:
    return data[..., 0] * 0.2126 + data[..., 1] * 0.7152 + data[..., 2] * 0.0722


def grass_readability_metrics(path: Path) -> tuple[float, float, float]:
    """Reject photo-noise grass that turns into shimmer at game distance."""
    image = Image.open(path).convert("RGB")
    data = np.asarray(image, dtype=np.float32) / 255.0
    gray = grayscale(data)
    blurred = np.asarray(image.convert("L").filter(ImageFilter.GaussianBlur(radius=2.0)), dtype=np.float32) / 255.0
    high_frequency = float(np.std(gray - blurred))
    channel_max = data.max(axis=-1)
    channel_min = data.min(axis=-1)
    mean_saturation = float(np.mean((channel_max - channel_min) / np.maximum(channel_max, 1e-5)))
    mean_luminance = float(np.mean(gray))
    return high_frequency, mean_saturation, mean_luminance


def edge_ratio(tile: np.ndarray) -> float:
    gray = grayscale(tile)
    horizontal = np.abs(gray[:, 1:] - gray[:, :-1])
    vertical = np.abs(gray[1:, :] - gray[:-1, :])
    # Compare a full wrap line with the strongest authored internal transition
    # lines. This avoids false positives on masonry/pebble patterns where most
    # pixels are flat but legitimate cell boundaries are intentionally sharp.
    internal_lines = np.concatenate((horizontal.mean(axis=0), vertical.mean(axis=1)))
    baseline = float(np.percentile(internal_lines, 99.0) + 1e-5)
    wrap = float((np.mean(np.abs(gray[:, 0] - gray[:, -1])) + np.mean(np.abs(gray[0, :] - gray[-1, :]))) * 0.5)
    return wrap / baseline


def high_pass_cell(cell: Image.Image) -> np.ndarray:
    small = cell.resize((96, 96), Image.Resampling.LANCZOS).convert("L")
    blurred = small.filter(ImageFilter.GaussianBlur(radius=5.0))
    a = np.asarray(small, dtype=np.float32)
    b = np.asarray(blurred, dtype=np.float32)
    high = a - b
    high -= float(high.mean())
    scale = float(high.std())
    return (high / max(scale, 1e-5)).ravel()


def max_cell_correlation(preview_path: Path, tile_size: int = 256, tiles: int = 3) -> float:
    image = Image.open(preview_path).convert("RGB")
    if image.size != (tile_size * tiles, tile_size * tiles):
        raise ValueError(f"expected {tile_size * tiles}x{tile_size * tiles}, got {image.size[0]}x{image.size[1]}")
    cells = []
    margin = 32
    for row in range(tiles):
        for col in range(tiles):
            x0 = col * tile_size + margin
            y0 = row * tile_size + margin
            x1 = (col + 1) * tile_size - margin
            y1 = (row + 1) * tile_size - margin
            cells.append(high_pass_cell(image.crop((x0, y0, x1, y1))))
    correlations = [float(np.mean(a * b)) for a, b in combinations(cells, 2)]
    return max(correlations, default=0.0)


def preview_seam_ratio(preview_path: Path, tile_size: int = 256, tiles: int = 3) -> float:
    data = grayscale(rgb(preview_path))
    dx = np.abs(data[:, 1:] - data[:, :-1])
    dy = np.abs(data[1:, :] - data[:-1, :])
    baseline = float(np.percentile(np.concatenate((dx.ravel(), dy.ravel())), 95.0) + 1e-5)
    seams = []
    for boundary in range(1, tiles):
        x = boundary * tile_size
        y = boundary * tile_size
        seams.append(float(np.mean(np.abs(data[:, x] - data[:, x - 1]))))
        seams.append(float(np.mean(np.abs(data[y, :] - data[y - 1, :]))))
    return max(seams, default=0.0) / baseline


def write_contact_sheet(preview_root: Path) -> None:
    """Write compact human-review artifacts beside the machine metrics."""
    columns = 4
    thumb = 236
    label_height = 28
    rows = (len(KINDS) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * thumb, rows * (thumb + label_height)), (18, 20, 23))
    draw = ImageDraw.Draw(sheet)
    for index, kind in enumerate(KINDS):
        preview = Image.open(preview_root / f"{kind}_tiled_preview.jpg").convert("RGB")
        preview.thumbnail((thumb, thumb), Image.Resampling.LANCZOS)
        col = index % columns
        row = index // columns
        x = col * thumb + (thumb - preview.width) // 2
        y = row * (thumb + label_height)
        sheet.paste(preview, (x, y))
        draw.text((col * thumb + 8, y + thumb + 7), kind, fill=(235, 229, 212))
    sheet.save(preview_root / "contact-sheet.jpg", quality=91, subsampling=1)

    focus = Image.new("RGB", (768 * 2, 768 + 34), (18, 20, 23))
    focus_draw = ImageDraw.Draw(focus)
    for col, kind in enumerate(("ground", "foliage")):
        preview = Image.open(preview_root / f"{kind}_tiled_preview.jpg").convert("RGB")
        focus.paste(preview, (col * 768, 0))
        focus_draw.text((col * 768 + 12, 778), f"{kind}: 3x3 stochastic tiled preview", fill=(235, 229, 212))
    focus.save(preview_root / "focus-ground-foliage.jpg", quality=93, subsampling=1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--texture-root", type=Path, default=Path("src/assets3d/pbr"))
    parser.add_argument("--preview-root", type=Path, default=Path("artifacts/pbr-tiled-previews"))
    parser.add_argument("--metrics", type=Path, default=Path("artifacts/pbr-tiled-previews/qa-metrics.json"))
    args = parser.parse_args()

    failures: list[str] = []
    metrics: dict[str, dict[str, float]] = {}
    for kind in KINDS:
        tile_path = args.texture_root / f"{kind}_basecolor.png"
        preview_path = args.preview_root / f"{kind}_tiled_preview.jpg"
        if not tile_path.exists():
            failures.append(f"missing {tile_path}")
            continue
        if not preview_path.exists():
            failures.append(f"missing {preview_path}")
            continue
        try:
            tile_edge = edge_ratio(rgb(tile_path))
            preview_edge = preview_seam_ratio(preview_path)
            repeat_corr = max_cell_correlation(preview_path)
        except Exception as error:  # noqa: BLE001 - validator should aggregate all failures
            failures.append(f"{kind}: {error}")
            continue
        metrics[kind] = {
            "source_wrap_edge_ratio": round(tile_edge, 4),
            "preview_boundary_ratio": round(preview_edge, 4),
            "max_highpass_cell_correlation": round(repeat_corr, 4),
        }
        if kind == "grass":
            high_frequency, mean_saturation, mean_luminance = grass_readability_metrics(tile_path)
            metrics[kind].update({
                "high_frequency_energy": round(high_frequency, 4),
                "mean_saturation": round(mean_saturation, 4),
                "mean_luminance": round(mean_luminance, 4),
            })
            if high_frequency > 0.035:
                failures.append(f"grass: high-frequency energy {high_frequency:.3f} will shimmer at gameplay distance")
            if mean_saturation > 0.65:
                failures.append(f"grass: mean saturation {mean_saturation:.3f} is too harsh for the stylized terrain palette")
            if not 0.38 <= mean_luminance <= 0.78:
                failures.append(f"grass: mean luminance {mean_luminance:.3f} falls outside the readable terrain range")
        if tile_edge > 1.35:
            failures.append(f"{kind}: source wrap edge ratio {tile_edge:.3f} suggests a visible seam")
        if preview_edge > 1.85:
            failures.append(f"{kind}: preview boundary ratio {preview_edge:.3f} suggests a cell seam")
        correlation_limit = 0.82 if kind in FOCUS_KINDS else 0.92
        if repeat_corr > correlation_limit:
            failures.append(f"{kind}: high-pass cell correlation {repeat_corr:.3f} exceeds {correlation_limit:.2f}; macro repetition is too obvious")

    args.metrics.parent.mkdir(parents=True, exist_ok=True)
    args.metrics.write_text(json.dumps(metrics, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if failures:
        print("\n".join(failures))
        raise SystemExit(1)
    write_contact_sheet(args.preview_root)
    print(f"validated seamless wrapping and 3x3 anti-repetition previews for {len(metrics)} material sets")


if __name__ == "__main__":
    main()
