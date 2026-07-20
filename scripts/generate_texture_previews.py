#!/usr/bin/env python3
"""Build human/machine QA previews from retained BaseColor textures only."""
from pathlib import Path

import numpy as np
from PIL import Image

from generate_pbr_textures import KINDS, save_tiled_preview


def main() -> None:
    texture_root = Path("src/assets3d/pbr")
    preview_root = Path("artifacts/pbr-tiled-previews")
    preview_root.mkdir(parents=True, exist_ok=True)
    for index, kind in enumerate(KINDS):
        source = texture_root / f"{kind}_basecolor.png"
        if not source.exists():
            raise SystemExit(f"missing {source}")
        data = np.asarray(Image.open(source).convert("RGB"), dtype=np.float32) / 255.0
        save_tiled_preview(preview_root / f"{kind}_tiled_preview.jpg", data, 0xA17E + index * 1237, 3, 256)
    print(f"generated {len(KINDS)} tiled QA previews from retained BaseColor textures")


if __name__ == "__main__":
    main()
