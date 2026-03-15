# RedScript Cube Demo — Software Rasterizer

Renders a rotating 3D cube in Minecraft using **pre-rasterized block art**.

## How it works

`rasterizer.py` is a standalone Python 3D software renderer:
1. Defines a unit cube (8 vertices, 6 faces)
2. For each of **60 frames**: rotates around Y axis + 28° tilt, orthographic projects to a 21×17 grid
3. Scanline fills each face with Z-buffer for correct occlusion
4. Writes one `.mcfunction` per frame containing `fill` (clear) + `setblock` commands
5. The game `@tick` driver advances the frame counter and executes the current frame

The "screen" is anchored by an invisible marker entity placed 6 blocks in front of the
player using `^` (local) coordinates — it stays fixed even if the player moves.

## Generate & deploy

```bash
# 1. Generate the datapack
python3 rasterizer.py

# 2. Copy to server
cp -r out/ ~/mc-test-server/world/datapacks/cubedemo/

# 3. In-game
/reload
# Face the wall you want to draw on, then:
/function cubedemo:start
# Stop:
/function cubedemo:stop
```

## Stats
- **Frames:** 60 (one full rotation)
- **Screen:** 21 × 17 blocks  
- **Pixels/frame:** ~207 avg (varies by angle)
- **Face colors:** red, blue, cyan, lime, yellow, orange concrete
- **Tick rate:** 1 frame/tick = 3 full rotations/second
