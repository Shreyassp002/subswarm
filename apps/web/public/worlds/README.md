# Evening town

`town-evening-v3.png` is original generated background artwork. No paid asset
pack was purchased. Buildings and decorations are static art; player movement,
registered residents, clickable entrances and navigation are rendered separately.

Three neighborhoods are connected by broad paths.
The source image is displayed over a 3360 by 1888 world. The matching entrance
and collision coordinates live in `src/game/village.ts`. Replacing this image
requires remapping those coordinates. It is a flattened illustration, not a
layered Tiled map; characters cannot walk through the defined building bounds.

Generated with the built-in image tool.

Art direction: a full-width cozy pixel town at twilight with distinct workshops,
a library, forge, crystal laboratory, greenhouse, homes, art studio, observatory,
market stalls and a turquoise fountain plaza. Broad connected paths and warm
streetlights define the settlement. No baked characters, labels or UI.

The final generation request enlarged the land area to roughly three times the
initial composition, placed four workshops in a western neighborhood and five
buildings in an eastern neighborhood, and kept an open central square between
them. Broad paths connect all three areas. The final edit removes the rivers,
most fine decoration and strong glows while preserving the building layout.
Only a small outer pond remains.
