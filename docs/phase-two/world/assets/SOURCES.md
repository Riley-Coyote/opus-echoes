# assets/ — provenance

All models CC0 (Creative Commons Zero). Geometry only — every source material
and texture was stripped at bake time; the scene re-materials everything
through the graded helper in `flora.js`. Baked by `/tmp/elev-c/bake.py`
(positions + indices only, draco-free; normals recomputed flat at load).

## flora-pack.glb (~105 KB, 8,056 tris)

| mesh name | source file | pack | tris |
|---|---|---|---|
| common-a | CommonTree_5.obj | Quaternius — Ultimate Nature Pack | 1836 |
| common-b | CommonTree_4.obj | Quaternius — Ultimate Nature Pack | 1352 |
| birch | BirchTree_5.obj | Quaternius — Ultimate Nature Pack | 1734 |
| willow | Willow_1.obj | Quaternius — Ultimate Nature Pack | 1946 |
| fern | Plant_1.obj | Quaternius — Ultimate Nature Pack | 296 |
| reed | Grass.obj | Quaternius — Ultimate Nature Pack | 192 |
| flowers | Flowers.obj | Quaternius — Ultimate Nature Pack | 408 |
| rock-a / rock-b / rock-c | Rock_3 / Rock_5 / Rock_7 .obj | Quaternius — Ultimate Nature Pack | 72 / 90 / 94 |
| tuft | grass_leafs.glb | Kenney — Nature Kit 2.1 | 36 |

- Quaternius, Ultimate Nature Pack — https://quaternius.com/packs/ultimatenature.html
  License: CC0 1.0 (stated on the pack page and in the pack's License.txt).
- Kenney, Nature Kit 2.1 — https://kenney.nl/assets/nature-kit
  License: CC0 1.0 (License.txt in kenney_nature-kit.zip).

## curation notes (what was rejected, and why)

- Kenney trees (tree_default/oak/detailed/thin/fat…) — gumdrop-geometric
  silhouettes; read as toys against the diorama's slender stone. Exactly the
  "cartoon-bulbous" class the brief bans.
- Kenney rocks (rock_largeA–F, smallA–I) — baked two-tone dirt/grass caps;
  fights the neutral-stone vocabulary.
- Quaternius CommonTree_1/2 — sprawling double masses, ~2.9k tris each;
  too loose for terrace-scale planting.
- Quaternius BirchTree_4 — too bushy to read "slender birch".
- Quaternius Willow_2 — 2752 tris for one specimen role; Willow_1 reads
  cleaner at MV distance.
- Quaternius Plant_3/Plant_4, Bush_1/2, Grass_Short, Lilypad — role already
  owned (procedural bushes, procedural lawn tufts, existing lily pads) or
  tri-heavy for their role.
