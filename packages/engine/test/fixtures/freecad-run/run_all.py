"""Speaker Box Genius: run every .FCMacro in this folder and record the results.

FreeCAD 1.x, Python console:
    exec(open(r"C:\\Users\\<you>\\Downloads\\sbg-macros\\run_all.py").read())
Set FOLDER below if the console can't find the folder by itself.
Writes results.txt and one <name>.png per macro (isometric view) into the folder.
"""
import contextlib
import glob
import io
import os
import traceback

import FreeCAD as App

FOLDER = r""  # e.g. r"C:\Users\daliu\Downloads\sbg-macros"
if not FOLDER:
    FOLDER = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.path.join(os.path.expanduser("~"), "Downloads", "sbg-macros")

try:
    import FreeCADGui as Gui
except ImportError:
    Gui = None

lines = ["FreeCAD %s" % ".".join(App.Version()[:3])]
for path in sorted(glob.glob(os.path.join(FOLDER, "*.FCMacro"))):
    name = os.path.splitext(os.path.basename(path))[0]
    buf = io.StringIO()
    ok = True
    try:
        with contextlib.redirect_stdout(buf):
            exec(open(path, encoding="utf-8").read(), {"__name__": "__main__"})
    except Exception:
        ok = False
        buf.write(traceback.format_exc())
    doc = App.ActiveDocument
    parts = []
    if doc is not None:
        for o in doc.Objects:
            if o.TypeId == "Part::Feature":
                s = o.Shape
                parts.append("    %-14s %-28s vol %10.3f L  faces %3d  valid %s" % (o.Name, o.Label[:28], s.Volume / 1e6, len(s.Faces), s.isValid()))
    lines.append("== %s: %s" % (name, "OK" if ok else "FAILED"))
    lines += ["  " + l for l in buf.getvalue().strip().splitlines()]
    lines += parts
    if Gui is not None and doc is not None:
        try:
            v = Gui.ActiveDocument.ActiveView
            v.viewIsometric()
            Gui.SendMsgToActiveView("ViewFit")
            v.saveImage(os.path.join(FOLDER, name + ".png"), 1200, 900, "White")
        except Exception as e:
            lines.append("  (no picture: %s)" % e)

text = "\n".join(lines)
with open(os.path.join(FOLDER, "results.txt"), "w", encoding="utf-8") as f:
    f.write(text)
print(text)
print("\nWrote results.txt and pictures to " + FOLDER)
