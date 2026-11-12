"""Speaker Box Genius - car wedge inside volume, worked out by FreeCAD itself.

Builds each wedge's OUTSIDE shape, then cuts away every wall as a slab of its
thickness (the sloped panel as a slab lying on the sloped face), and prints the
volume that is left. No inside formula from the app is used.

Run in FreeCAD 1.0: View > Panels > Python console, then
    exec(open(r"C:\\Users\\<you>\\Downloads\\wedge_check.py").read())
It prints one JSON line and writes wedge_check.json next to this file.
"""
import json
import math
import os

import FreeCAD as App
import Part

BIG = 10000.0  # mm, larger than any box

# mm: W width, H height, D1 top depth, D2 bottom depth, T walls, Tb sloped panel
CASES = [
    ("car-wedge-800x380", 800, 380, 250, 400, 18, 18),
    ("car-wedge-double-baffle", 500, 400, 200, 400, 18, 36),
    ("wedge-500x450-18", 500, 450, 200, 400, 18, 18),
    ("wedge-500x450-double", 500, 450, 200, 400, 18, 36),
    ("wedge-steep-double", 400, 300, 120, 450, 15, 30),
]


def slab(x0, y0, z0, dx, dy, dz):
    return Part.makeBox(dx, dy, dz, App.Vector(x0, y0, z0))


def inside(W, H, D1, D2, T, Tb):
    # Outside: side profile (x depth from the back, y height), extruded across z = width.
    prof = [App.Vector(0, 0, 0), App.Vector(D2, 0, 0), App.Vector(D1, H, 0), App.Vector(0, H, 0)]
    outer = Part.Face(Part.makePolygon(prof + [prof[0]])).extrude(App.Vector(0, 0, W))
    # Square walls: back, bottom, top, both sides.
    cut = [
        slab(-BIG / 2, -BIG / 2, -BIG / 2, BIG / 2 + T, BIG, BIG),       # back  x < T
        slab(-BIG / 2, -BIG / 2, -BIG / 2, BIG, BIG / 2 + T, BIG),       # bottom y < T
        slab(-BIG / 2, H - T, -BIG / 2, BIG, BIG, BIG),                  # top   y > H - T
        slab(-BIG / 2, -BIG / 2, -BIG / 2, BIG, BIG, BIG / 2 + T),       # side  z < T
        slab(-BIG / 2, -BIG / 2, W - T, BIG, BIG, BIG),                  # side  z > W - T
    ]
    # Sloped panel: a slab Tb thick lying on the sloped face, reaching inwards.
    ux, uy = D1 - D2, H
    L = math.hypot(ux, uy)
    ang = math.degrees(math.atan2(uy, ux))
    s = Part.makeBox(BIG, Tb, BIG, App.Vector(-BIG / 2, 0, -BIG / 2))
    s.rotate(App.Vector(0, 0, 0), App.Vector(0, 0, 1), ang)    # x along the slope, y inwards
    s.translate(App.Vector(D2, 0, 0))
    # Check the slab sits on the inside of the sloped face (its y axis points away from the outside).
    nx, ny = -uy / L, ux / L
    assert nx < 0, "slab would face outwards"
    cut.append(s)
    v = outer
    for c in cut:
        v = v.cut(c)
    return outer.Volume / 1e6, v.Volume / 1e6


out = {}
for name, W, H, D1, D2, T, Tb in CASES:
    o, i = inside(W, H, D1, D2, T, Tb)
    out[name] = {"outer_l": round(o, 6), "inside_l": round(i, 6)}
line = json.dumps({"freecad": App.Version()[:3], "cases": out})
print(line)
here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.path.expanduser("~")
try:
    with open(os.path.join(here, "wedge_check.json"), "w") as f:
        f.write(line)
except OSError:
    pass
