#!/usr/bin/env python3
"""
Minecraft Rotating Cube Rasterizer
Generates a complete datapack with 60 pre-rasterized frames.
Each frame is a .mcfunction with fill + setblock commands.
"""
import math, os, json, shutil

# ── Config ────────────────────────────────────────────────────────────────────
N_FRAMES = 60
W, H     = 21, 17       # screen width × height in blocks
HALF_W   = W // 2       # 10
HALF_H   = H // 2       # 8
SCALE    = 7.5          # cube projection scale
TILT     = math.radians(28)  # constant X tilt (see top face)
NS       = "cubedemo"

FACE_COLORS = [
    "yellow_concrete",   # top    (+Y)
    "orange_concrete",   # bottom (-Y)
    "red_concrete",      # front  (+Z)
    "blue_concrete",     # back   (-Z)
    "lime_concrete",     # right  (+X)
    "cyan_concrete",     # left   (-X)
]

# ── Cube geometry ─────────────────────────────────────────────────────────────
VERTS = [
    (-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
    (-1,-1, 1),(1,-1, 1),(1,1, 1),(-1,1, 1),
]
FACES = [                       # (vertex indices ×4, color index)
    ([3,2,6,7], 0),   # top
    ([0,1,5,4], 1),   # bottom
    ([4,5,6,7], 2),   # front
    ([1,0,3,2], 3),   # back
    ([1,5,6,2], 4),   # right
    ([0,4,7,3], 5),   # left
]

# ── Math ──────────────────────────────────────────────────────────────────────
def ry(v, a):
    c,s = math.cos(a), math.sin(a)
    return ( c*v[0]+s*v[2], v[1], -s*v[0]+c*v[2] )

def rx(v, a):
    c,s = math.cos(a), math.sin(a)
    return ( v[0], c*v[1]-s*v[2], s*v[1]+c*v[2] )

def cross(a,b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])

def sub(a,b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
def lerp(a,b,t): return a+(b-a)*t

# ── Scanline rasterizer ───────────────────────────────────────────────────────
def raster_tri(p0,p1,p2, z0,z1,z2):
    verts = sorted([(p0,z0),(p1,z1),(p2,z2)], key=lambda v:v[0][1])
    (x0,y0),d0 = verts[0]
    (x1,y1),d1 = verts[1]
    (x2,y2),d2 = verts[2]
    pixels = []

    def fill(y, ax,bx, az,bz):
        if ax>bx: ax,bx,az,bz = bx,ax,bz,az
        for x in range(max(-HALF_W,ax), min(HALF_W,bx)+1):
            t = (x-ax)/(bx-ax) if bx!=ax else 0
            pixels.append((x, y, lerp(az,bz,t)))

    def xz_at_y(y, xa,ya, xb,yb, za,zb):
        t = (y-ya)/(yb-ya) if yb!=ya else 0
        return int(round(lerp(xa,xb,t))), lerp(za,zb,t)

    for y in range(int(math.ceil(min(y0,y1,y2))), int(math.floor(max(y0,y1,y2)))+1):
        if not (-HALF_H <= y <= HALF_H): continue
        # edge 0→2 always spans full height
        if y2!=y0:
            ax2,az2 = xz_at_y(y, x0,y0,x2,y2, d0,d2)
        else:
            ax2,az2 = x0,d0
        if y <= y1:
            if y1!=y0: ax1,az1 = xz_at_y(y, x0,y0,x1,y1, d0,d1)
            else: ax1,az1 = x0,d0
        else:
            if y2!=y1: ax1,az1 = xz_at_y(y, x1,y1,x2,y2, d1,d2)
            else: ax1,az1 = x1,d1
        fill(y, ax2,ax1, az2,az1)
    return pixels

# ── Render frame ──────────────────────────────────────────────────────────────
def render(frame_idx):
    yaw = frame_idx * 2*math.pi / N_FRAMES
    zbuf = {}

    for vidx, cidx in FACES:
        rv = []
        for i in vidx:
            v = ry(VERTS[i], yaw)
            v = rx(v, TILT)
            rv.append(v)

        n = cross(sub(rv[1],rv[0]), sub(rv[2],rv[0]))
        if n[2] <= 0: continue   # backface cull

        def proj(v): return (int(round(v[0]*SCALE)), int(round(v[1]*SCALE)))
        p = [proj(v) for v in rv]
        z = [v[2] for v in rv]

        for tri in [(0,1,2),(0,2,3)]:
            for px,py,pz in raster_tri(p[tri[0]],p[tri[1]],p[tri[2]],
                                        z[tri[0]],z[tri[1]],z[tri[2]]):
                if (-HALF_W<=px<=HALF_W) and (-HALF_H<=py<=HALF_H):
                    if (px,py) not in zbuf or pz > zbuf[(px,py)][0]:
                        zbuf[(px,py)] = (pz, FACE_COLORS[cidx])
    return zbuf

# ── Generate datapack ─────────────────────────────────────────────────────────
BASE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(BASE, "out")
FN   = os.path.join(OUT, "data", NS, "function")

if os.path.exists(OUT): shutil.rmtree(OUT)
os.makedirs(os.path.join(FN, "frame"), exist_ok=True)
os.makedirs(os.path.join(OUT, "data", NS, "tags", "function"), exist_ok=True)
os.makedirs(os.path.join(OUT, "data", "minecraft", "tags", "function"), exist_ok=True)

# pack.mcmeta
with open(os.path.join(OUT,"pack.mcmeta"),"w") as f:
    json.dump({"pack":{"pack_format":26,"description":"RedScript cube rasterizer demo"}}, f, indent=2)

# load / tick tags
def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path,"w") as f: json.dump(data, f, indent=2)

write_json(os.path.join(OUT,"data","minecraft","tags","function","load.json"),
    {"values":[f"{NS}:load"]})
write_json(os.path.join(OUT,"data","minecraft","tags","function","tick.json"),
    {"values":[f"{NS}:tick"]})

# ── load.mcfunction ──
with open(os.path.join(FN,"load.mcfunction"),"w") as f:
    f.write(f"scoreboard objectives add {NS}_frame dummy\n")
    f.write(f"scoreboard objectives add {NS}_on dummy\n")
    f.write(f'tellraw @a [{{"text":"[cubedemo] ","color":"gold"}},{{"text":"loaded. /function {NS}:start","color":"yellow"}}]\n')

# ── tick.mcfunction ──
tick_lines = [
    f'execute if score #on {NS}_on matches 1 run function {NS}:_tick\n'
]
with open(os.path.join(FN,"tick.mcfunction"),"w") as f:
    f.writelines(tick_lines)

# ── _tick.mcfunction — advance frame, call frame function ──
tick_inner = []
tick_inner.append(f"scoreboard players add #frame {NS}_frame 1\n")
tick_inner.append(f"execute if score #frame {NS}_frame matches {N_FRAMES}.. run scoreboard players set #frame {NS}_frame 0\n")
tick_inner.append(f"execute as @e[tag={NS}_screen,limit=1] at @s run function {NS}:_render\n")
with open(os.path.join(FN,"_tick.mcfunction"),"w") as f:
    f.writelines(tick_inner)

# ── _render.mcfunction — select frame function via score ──
render_lines = []
for i in range(N_FRAMES):
    render_lines.append(f"execute if score #frame {NS}_frame matches {i} run function {NS}:frame/f{i:02d}\n")
with open(os.path.join(FN,"_render.mcfunction"),"w") as f:
    f.writelines(render_lines)

# ── start.mcfunction ──
with open(os.path.join(FN,"start.mcfunction"),"w") as f:
    f.write(f"kill @e[tag={NS}_screen]\n")
    f.write(f"execute as @p at @p run summon minecraft:marker ^ ^ ^6 {{Tags:[\"{NS}_screen\"]}}\n")
    f.write(f"scoreboard players set #frame {NS}_frame 0\n")
    f.write(f"scoreboard players set #on {NS}_on 1\n")
    f.write(f'title @a title [{{"text":"RedScript","bold":true,"color":"gold"}},{{"text":" Cube","color":"white"}}]\n')
    f.write(f'title @a subtitle [{{"text":"software rasterizer · 3D → blocks","color":"gray"}}]\n')
    f.write(f'tellraw @a [{{"text":"▶ cube demo started","color":"green"}}]\n')

# ── stop.mcfunction ──
with open(os.path.join(FN,"stop.mcfunction"),"w") as f:
    f.write(f"scoreboard players set #on {NS}_on 0\n")
    f.write(f"kill @e[tag={NS}_screen]\n")
    f.write(f"fill ~-{HALF_W} ~-{HALF_H} ~-1 ~{HALF_W} ~{HALF_H} ~6 air\n")
    f.write(f'tellraw @a [{{"text":"■ cube demo stopped","color":"red"}}]\n')

# ── Frame functions ──
total_pixels = 0
for fi in range(N_FRAMES):
    zbuf = render(fi)
    total_pixels += len(zbuf)
    cmds = []
    cmds.append(f"fill ^-{HALF_W} ^-{HALF_H} ^0 ^{HALF_W} ^{HALF_H} ^0 minecraft:air\n")
    for (px,py),(pz,color) in sorted(zbuf.items()):
        cmds.append(f"setblock ^{px} ^{py} ^0 minecraft:{color}\n")
    with open(os.path.join(FN,"frame",f"f{fi:02d}.mcfunction"),"w") as f:
        f.writelines(cmds)

print(f"✓ Generated {N_FRAMES} frames, avg {total_pixels//N_FRAMES} pixels/frame")
print(f"  Output: {OUT}")
print(f"  Deploy: copy {OUT}/ → world/datapacks/cubedemo/")
print(f"  In-game: /function {NS}:start  (face the direction you want the screen)")
