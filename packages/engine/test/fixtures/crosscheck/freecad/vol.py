# Speaker Box Genius volume check: inside volumes of walled shapes, built as solids in FreeCAD.
import FreeCAD as App, Part, json
V = App.Vector
out = {}
def rect(w, d, z, x0=0, y0=0):
    return Part.makePolygon([V(x0-w/2,y0-d/2,z),V(x0+w/2,y0-d/2,z),V(x0+w/2,y0+d/2,z),V(x0-w/2,y0+d/2,z),V(x0-w/2,y0-d/2,z)])
def frustum(bw, bd, tw, td, h, tx=0, ty=0):
    return Part.makeLoft([rect(bw,bd,0), rect(tw,td,h,tx,ty)], True, True)
def inside(solid, t):
    # Offset every face inward by t with sharp (intersection) joins: the inside of walls t thick.
    s = solid.makeOffsetShape(-t, 1e-6, join=2)
    return Part.Solid(s.Shells[0]) if s.ShapeType != "Solid" else s
cm3 = lambda s: s.Volume / 1000.0  # mm^3 -> cm^3 ... units in mm below
# all dimensions in mm
box = Part.makeBox(500, 400, 350)
out["box"] = inside(box, 18).Volume / 1e6
cyl = Part.makeCylinder(200, 600)
cyl_in = Part.makeCylinder(200-12, 600-2*18, V(0,0,18))
out["cylinder"] = cyl_in.Volume / 1e6
out["sphere"] = Part.makeSphere(200-12).Volume / 1e6
fr = frustum(500, 400, 300, 250, 450)
out["frustum"] = inside(fr, 18).Volume / 1e6
out["frustum_outer"] = fr.Volume / 1e6
wedge = frustum(500, 400, 500, 200, 450, 0, 100)  # back vertical, front sloped twice as steep
out["wedge"] = inside(wedge, 18).Volume / 1e6
out["wedge_outer"] = wedge.Volume / 1e6
steep = frustum(600, 600, 100, 100, 300)  # inside closes before the top? check pointy taper
out["steep"] = inside(steep, 18).Volume / 1e6
tube = Part.makeCylinder(50+3, 300)
out["tube"] = tube.Volume / 1e6
open("vol.json", "w").write(json.dumps(out, indent=1))
print(json.dumps(out))
