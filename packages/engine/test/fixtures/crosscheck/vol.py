"""Rebuild each case's inside as a FreeCAD solid and print its volume.

Run inside FreeCAD (Python console or `freecadcmd vol.py`) from this folder. Lengths mm,
volumes printed in litres next to the expected value from shapes.json.
"""
import json
import math
import os

import FreeCAD as App
import Part

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()


def wedge_inside(c):
    W, H, D1, D2, T = c["width"], c["height"], c["topDepth"], c["bottomDepth"], c["wall"]
    Tb = c.get("slopeWall", T)
    s = (D2 - D1) / H
    k = math.hypot(1, s)
    # Side view (x depth, y height), extruded across the inside width (z).
    pts = [(T, T), (D2 - s * T - Tb * k, T), (D1 + s * T - Tb * k, H - T), (T, H - T)]
    wire = Part.makePolygon([App.Vector(x, y, T) for x, y in pts] + [App.Vector(pts[0][0], pts[0][1], T)])
    return Part.Face(wire).extrude(App.Vector(0, 0, W - 2 * T))


def frustum_inside(c):
    w1, d1, w2, d2, H, t = c["bottomWidth"], c["bottomDepth"], c["topWidth"], c["topDepth"], c["height"], c["wall"]
    sw, sd = (w1 - w2) / (2 * H), (d1 - d2) / (2 * H)
    ow, od = t * math.hypot(1, sw), t * math.hypot(1, sd)

    def rect(z):
        w, d = w1 - 2 * sw * z - 2 * ow, d1 - 2 * sd * z - 2 * od
        p = [App.Vector(-w / 2, -d / 2, z), App.Vector(w / 2, -d / 2, z), App.Vector(w / 2, d / 2, z), App.Vector(-w / 2, d / 2, z)]
        return Part.makePolygon(p + [p[0]])

    return Part.makeLoft([rect(t), rect(H - t)], True)


with open(os.path.join(HERE, "shapes.json")) as f:
    cases = json.load(f)["cases"]
for c in cases:
    solid = wedge_inside(c) if c["shape"] == "wedge" else frustum_inside(c)
    got = solid.Volume / 1e6
    print(f"{c['id']:28s} FreeCAD {got:10.4f} L   expected {c['expected_l']:10.4f} L   diff {got - c['expected_l']:+.4f}")
