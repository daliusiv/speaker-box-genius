"""Solve one board over a frequency list and write curves/<name>.csv.

  python3 sweep.py NAME W H X Y A [--h 0.03] [--he 0.01] [--f0 20 --f1 900 --ppo 24 | --freqs f1,f2,...]

W, H: board size; X, Y: cone centre from the left and bottom edges; A: cone radius (all metres).
"""
import argparse, json, time, numpy as np
from pathlib import Path
from screen import mesh, run_complex

ap = argparse.ArgumentParser()
ap.add_argument("name"); [ap.add_argument(k, type=float) for k in ("W", "H", "X", "Y", "A")]
ap.add_argument("--h", type=float, default=0.03); ap.add_argument("--he", type=float, default=0.01)
ap.add_argument("--f0", type=float, default=20); ap.add_argument("--f1", type=float, default=900)
ap.add_argument("--ppo", type=int, default=24); ap.add_argument("--freqs")
a = ap.parse_args()
if a.freqs: freqs = [float(v) for v in a.freqs.split(",")]
else:
    n = int(np.floor(np.log2(a.f1 / a.f0) * a.ppo + 1e-9)) + 1
    freqs = list(np.round(a.f0 * 2 ** (np.arange(n) / a.ppo), 3))
here = Path(__file__).parent
g = mesh(a.W, a.H, a.X, a.Y, a.A, a.h, a.he, name=str(here / f"{a.name}.msh"))
t = time.time()
out, dofs = run_complex(g, a.X, a.Y, a.A, freqs, log=None)
(here / "curves").mkdir(exist_ok=True)
with open(here / "curves" / f"{a.name}.csv", "w") as fh:
    fh.write("f_Hz,dB_re_monopole,phase_deg\n")
    for f, L, ph in out: fh.write(f"{f:.3f},{L:.4f},{ph:.3f}\n")
meta = here / "boards.json"
boards = json.loads(meta.read_text()) if meta.exists() else {}
boards[a.name] = {**boards.get(a.name, {}), "W": a.W, "H": a.H, "x": a.X, "y": a.Y, "a": a.A, "h": a.h, "he": a.he, "dofs": dofs}
meta.write_text(json.dumps(boards, indent=1, ensure_ascii=False) + "\n")
print(f"{a.name}: {len(freqs)} frequencies, {dofs} unknowns, {time.time() - t:.0f} s")
