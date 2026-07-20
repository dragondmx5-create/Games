# WebGL2 Migration Summary

The main game scene uses WebGL2 and GLSL ES 3.00. The pipeline includes sprite batching, texture-array atlas sampling, depth ordering, dynamic lights, post-processing, quality scaling and resize/context-loss handling.

The six-land phase adds land-specific visual-layer selection and GPU-lit portal markers for dungeons, Fracture thresholds, Lost Territory thresholds and Black Market routes.

Final biome art remains separate from renderer architecture and can replace temporary procedural/sprite-family assets without changing gameplay systems.
