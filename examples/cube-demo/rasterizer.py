#!/usr/bin/env python3
"""
Minecraft Rotating Cube Rasterizer
Generates cube.mcrs — a complete RedScript source file with 60 pre-rasterized
frames. Each _frame_XX() uses setblock() with ^ (caret) local coordinates
so the screen always appears 6 blocks in front of the player's facing direction.

Pipeline: vertices → Y-rotation → X-tilt → orthographic projection →
          Z-buffer → scanline triangle fill → setblock() per pixel

Compile the output:
    node dist/cli.js compile examples/cube-demo/cube.mcrs \
        -o <datapack-dir> --namespace cubedemo
"""
import math, os

# ── Config ─────────────────────────────────────────────────────────────────────
N_FRAMES  = 60
W, H      = 21, 17      # screen width × height in blocks
HALF_W    = W // 2      # 10
HALF_H    = H // 2      # 8
SCALE     = 7.5         # cube projection scale (blocks)
TILT      = math.radians(28)  # constant X-axis tilt so top face is visible
DEPTH     = 6           # blocks ahead (^ direction)
NS        = "cubedemo"

FACE_COLORS = [
    "yellow_concrete",   # top    +Y
    "orange_concrete",   # bottom -Y
    "red_concrete",      # front  +Z
    "blue_concrete",     # back   -Z
    "lime_concrete",     # right  +X
    "cyan_concrete",     # left   -X
]

VERTS = [
    (-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
    (-1,-1, 1),(1,-1, 1),(1,1, 1),(-1,1, 1),
]
FACES = [
    ([3,2,6,7], 0),   # top
    ([0,1,5,4], 1),   # bottom
    ([4,5,6,7], 2),   # front
    ([1,0,3,2], 3),   # back
    ([1,5,6,2], 4),   # right
    ([0,4,7,3], 5),   # left
]

# ── Math helpers ────────────────────────────────────────────────────────────────
def ry(v, a):
    c, s = math.cos(a), math.sin(a)
    return (c*v[0] + s*v[2], v[1], -s*v[0] + c*v[2])

def rx(v, a):
    c, s = math.cos(a), math.sin(a)
    return (v[0], c*v[1] - s*v[2], s*v[1] + c*v[2])

def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])

def sub(a, b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
def lerp(a, b, t): return a + (b-a)*t

# ── Scanline triangle rasterizer ────────────────────────────────────────────────
def raster_tri(p0, p1, p2, z0, z1, z2):
    verts = sorted([(p0,z0),(p1,z1),(p2,z2)], key=lambda v: v[0][1])
    (x0,y0),d0 = verts[0]
    (x1,y1),d1 = verts[1]
    (x2,y2),d2 = verts[2]
    pixels = []

    def xz_at_y(y, xa,ya, xb,yb, za,zb):
        t = (y-ya)/(yb-ya) if yb != ya else 0
        return int(round(lerp(xa,xb,t))), lerp(za,zb,t)

    def fill_span(y, ax, bx, az, bz):
        if ax > bx: ax,bx,az,bz = bx,ax,bz,az
        for x in range(max(-HALF_W, ax), min(HALF_W, bx)+1):
            t = (x-ax)/(bx-ax) if bx != ax else 0
            pixels.append((x, y, lerp(az, bz, t)))

    for y in range(int(math.ceil(min(y0,y1,y2))), int(math.floor(max(y0,y1,y2)))+1):
        if not (-HALF_H <= y <= HALF_H):
            continue
        ax2, az2 = xz_at_y(y, x0,y0, x2,y2, d0,d2) if y2!=y0 else (x0,d0)
        if y <= y1:
            ax1, az1 = xz_at_y(y, x0,y0, x1,y1, d0,d1) if y1!=y0 else (x0,d0)
        else:
            ax1, az1 = xz_at_y(y, x1,y1, x2,y2, d1,d2) if y2!=y1 else (x1,d1)
        fill_span(y, ax2, ax1, az2, az1)

    return pixels

# ── Render one frame ────────────────────────────────────────────────────────────
def render(frame_idx):
    yaw = frame_idx * 2*math.pi / N_FRAMES
    zbuf = {}

    for vidx, cidx in FACES:
        rv = [rx(ry(VERTS[i], yaw), TILT) for i in vidx]
        n = cross(sub(rv[1], rv[0]), sub(rv[2], rv[0]))
        if n[2] <= 0:
            continue   # backface cull

        def proj(v): return (int(round(v[0]*SCALE)), int(round(v[1]*SCALE)))
        p = [proj(v) for v in rv]
        z = [v[2] for v in rv]

        for tri in [(0,1,2), (0,2,3)]:
            for px,py,pz in raster_tri(p[tri[0]], p[tri[1]], p[tri[2]],
                                        z[tri[0]], z[tri[1]], z[tri[2]]):
                if (-HALF_W <= px <= HALF_W) and (-HALF_H <= py <= HALF_H):
                    if (px,py) not in zbuf or pz > zbuf[(px,py)][0]:
                        zbuf[(px,py)] = (pz, FACE_COLORS[cidx])
    return zbuf

# ── Generate cube.mcrs ──────────────────────────────────────────────────────────
BASE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(BASE, "cube.mcrs")

lines = []

# Header + control logic
lines.append(f"""\
// cube.mcrs — RedScript software rasterizer demo
// A Python offline rasterizer pre-computes 60 frames of a rotating 3D cube.
// Each _frame_XX() function redraws the 21×17 block screen using setblock().
// Coordinates are ^ (local/caret) so the screen always appears {DEPTH} blocks
// ahead of the player's current facing direction.
//
// 3D pipeline: Y-rotation × X-tilt → ortho-project → Z-buffer → scanline fill
// 6 face colors: red·blue·cyan·lime·yellow·orange concrete
//
// Compile:
//   node dist/cli.js compile examples/cube-demo/cube.mcrs \\
//       -o <datapack-dir> --namespace {NS}
// In-game:
//   Stand ~15 blocks back, face the wall → /function {NS}:start
//   /function {NS}:stop

let frame:   int  = 0;
let running: bool = false;

@load fn _init() {{
    frame = 0;
}}

@tick fn _tick() {{
    if (!running) {{ return; }}
    frame = (frame + 1) % {N_FRAMES};
    // Render frame relative to each player's facing direction
    foreach (p in @a) at @s {{
""")

for i in range(N_FRAMES):
    lines.append(f"        if (frame == {i}) {{ _frame_{i:02d}(); }}\n")

lines.append(f"""\
    }}
}}

fn start() {{
    running = true;
    frame = 0;
    title(@a, "§6§lRedScript", "§7software rasterizer · 21×17 · {N_FRAMES} frames");
    say("§a▶ cube demo  — face any wall, stand back ~15 blocks");
    say("§7/function {NS}:stop  to clear");
}}

fn stop() {{
    running = false;
    // Clear the screen
    foreach (p in @a) at @s {{
        fill((^-{HALF_W}, ^-{HALF_H}, ^{DEPTH}), (^{HALF_W}, ^{HALF_H}, ^{DEPTH}), "air");
    }}
    say("§c■ cube demo stopped");
}}

// ── Pre-rasterized frame functions ────────────────────────────────────────────
// Generated by rasterizer.py — do not edit by hand.
// To regenerate: python3 examples/cube-demo/rasterizer.py

""")

total_px = 0
for fi in range(N_FRAMES):
    zbuf = render(fi)
    total_px += len(zbuf)
    lines.append(f"fn _frame_{fi:02d}() {{\n")
    lines.append(f"    fill((^-{HALF_W}, ^-{HALF_H}, ^{DEPTH}), (^{HALF_W}, ^{HALF_H}, ^{DEPTH}), \"air\");\n")
    for (px,py),(pz,color) in sorted(zbuf.items()):
        lines.append(f'    setblock((^{px}, ^{py}, ^{DEPTH}), "minecraft:{color}");\n')
    lines.append("}\n\n")

src = "".join(lines)
with open(OUT, "w") as f:
    f.write(src)

print(f"✓ {OUT}")
print(f"  {len(src.splitlines())} lines  |  {N_FRAMES} frames  |  avg {total_px//N_FRAMES} px/frame")
