"""Open-baffle frames with real wall thickness: boundary-element solve of the frame as one rigid solid.

  python3 frame_thick.py NAME            # a case from CASES below
  python3 frame_thick.py NAME --mesh     # build the mesh only and print its size

The frame is an outer box W x H x D (front rim at z = 0, listener on +z) minus its duct cavities, so
its walls and board are T thick: a U-frame's board closes the front, an H-frame's sits mid-way. The
cone is a disc of radius a through the board, moving +z: +v on the board's front face, -v on its
back face (Q = the front patch's area). Exterior Neumann problem in Burton-Miller form, as thick.py
(its solve(): P1 pressure, piecewise-constant normal derivative, dense LU), so the cavities' and the
solid's interior resonances don't spoil it. Same field point and normalisation as every curve here:
on axis at 100 m against a free monopole of the cone's volume velocity, delay removed, e^{+jwt}.

Mesh: gmsh (OpenCASCADE box minus boxes), element size h = lambda/9.53 at fmax, refined to he =
min(1 cm, T/2) at every edge and to a/4 round the cone; triangles turned to face out of the solid.
Writes curves/NAME.csv and thick/NAME.json; finished frequencies are kept in thick/NAME.partial.jsonl.

The engine's frame model (duct + edge diffraction round the frame as a block) is checked against these
in open-baffle-frame-bem.test.ts; the zero-thickness runs (F1-F4, frame.py) are the same frames with
T = 0.
"""
import argparse, json, sys, time
from pathlib import Path
import numpy as np

HERE = Path(__file__).parent
C = 343.2

# name: (kind, W, H, D, T, cone radius a); the cone centred.
CASES = {
    "FT1": ("H", 0.45, 0.45, 0.30, 0.018, 0.1236),   # F1 with 18 mm walls and board
    "FT4": ("U", 0.45, 0.45, 0.30, 0.018, 0.1236),   # F4 with 18 mm walls and board
    "FT5": ("U", 0.45, 1.00, 0.30, 0.018, 0.1236),   # a tall U-frame, cone at the default 35 % up
}
CONE_Y = {"FT5": 0.35}


def build_mesh(kind, W, H, D, T, a, h, he, y0=None):
    import gmsh
    x0 = W / 2
    y0 = H / 2 if y0 is None else y0
    gmsh.initialize()
    gmsh.option.setNumber("General.Terminal", 0)
    gmsh.model.add("frame")
    occ = gmsh.model.occ
    outer = occ.addBox(0, 0, -D, W, H, D)
    e = 0.01  # cavities run past the open rims
    if kind == "U":
        cav = [occ.addBox(T, T, -D - e, W - 2 * T, H - 2 * T, D - T + e)]
        boards = [(-T, 0.0)]                      # (back face z, front face z) of the board
    else:
        zb = -D / 2
        cav = [occ.addBox(T, T, zb + T / 2, W - 2 * T, H - 2 * T, D / 2 - T / 2 + e),
               occ.addBox(T, T, -D - e, W - 2 * T, H - 2 * T, D / 2 - T / 2 + e)]
        boards = [(zb - T / 2, zb + T / 2)]
    occ.cut([(3, outer)], [(3, c) for c in cav])
    # Points round the cone on the board's two faces, for the size field.
    pts = []
    for zf in boards[0]:
        for k in range(48):
            t = 2 * np.pi * k / 48
            pts.append(occ.addPoint(x0 + a * np.cos(t), y0 + a * np.sin(t), zf))
    occ.synchronize()
    curves = [c[1] for c in gmsh.model.getEntities(1)]
    f = gmsh.model.mesh.field
    d1 = f.add("Distance"); f.setNumbers(d1, "CurvesList", curves); f.setNumber(d1, "Sampling", 200)
    t1 = f.add("Threshold"); f.setNumber(t1, "InField", d1)
    f.setNumber(t1, "SizeMin", he); f.setNumber(t1, "SizeMax", h)
    f.setNumber(t1, "DistMin", 0.0); f.setNumber(t1, "DistMax", 3 * (h - he))
    d2 = f.add("Distance"); f.setNumbers(d2, "PointsList", pts)
    t2 = f.add("Threshold"); f.setNumber(t2, "InField", d2)
    f.setNumber(t2, "SizeMin", a / 4); f.setNumber(t2, "SizeMax", h)
    f.setNumber(t2, "DistMin", 0.0); f.setNumber(t2, "DistMax", 2 * a)
    mn = f.add("Min"); f.setNumbers(mn, "FieldsList", [t1, t2])
    f.setAsBackgroundMesh(mn)
    for k in ("Mesh.MeshSizeExtendFromBoundary", "Mesh.MeshSizeFromPoints", "Mesh.MeshSizeFromCurvature"):
        gmsh.option.setNumber(k, 0)
    gmsh.model.mesh.generate(2)
    tags, coords, _ = gmsh.model.mesh.getNodes()
    idx = {t: i for i, t in enumerate(tags)}
    V = coords.reshape(-1, 3)
    E = []
    for dim, tag in gmsh.model.getEntities(2):
        types, _, nodes = gmsh.model.mesh.getElements(dim, tag)
        for ty, nd in zip(types, nodes):
            if ty == 2:
                E.extend(nd.reshape(-1, 3).tolist())
    gmsh.finalize()
    E = np.array([[idx[n] for n in t] for t in E])
    used = np.unique(E)
    remap = -np.ones(len(V), int); remap[used] = np.arange(len(used))
    V = V[used]; E = remap[E]

    # Turn every triangle to face out of the solid (the box minus its cavities).
    def inside(p):
        if not (0 < p[0] < W and 0 < p[1] < H and -D < p[2] < 0):
            return False
        inner = T < p[0] < W - T and T < p[1] < H - T
        if not inner:
            return True
        return any(zl <= p[2] <= zh for zl, zh in boards)
    P = V[E]
    n = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]); n /= np.linalg.norm(n, axis=1)[:, None]
    cen = P.mean(axis=1)
    flip = np.array([inside(c + 1e-5 * m) for c, m in zip(cen, n)])
    E[flip] = E[flip][:, [0, 2, 1]]
    return V, E, boards, (x0, y0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name"); ap.add_argument("--mesh", action="store_true")
    ap.add_argument("--fmax", type=float, default=600); ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--freqs"); ap.add_argument("--he", type=float, help="edge element size (m); default min(1 cm, T/2)")
    o = ap.parse_args()
    kind, W, H, D, T, a = CASES[o.name]
    h = C / o.fmax / 9.53 * o.scale
    he = (o.he if o.he else min(0.01, T / 2)) * o.scale
    t0 = time.time()
    V, E, boards, (x0, y0) = build_mesh(kind, W, H, D, T, a, h, he, CONE_Y.get(o.name, 0) * H or None)
    P = V[E]; cen = P.mean(axis=1)
    area = 0.5 * np.linalg.norm(np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]), axis=1)
    rr = np.hypot(cen[:, 0] - x0, cen[:, 1] - y0)
    zb, zf = boards[0]
    on_front = (np.abs(cen[:, 2] - zf) < 1e-7) & (rr < a)
    on_back = (np.abs(cen[:, 2] - zb) < 1e-7) & (rr < a)
    Q = float(area[on_front].sum())
    print(f"{o.name}: {len(E)} triangles, {len(V)} nodes, cone patch {Q*1e4:.1f} cm² front / {area[on_back].sum()*1e4:.1f} back "
          f"(disc {np.pi*a*a*1e4:.1f}), h {h*100:.2f} cm, he {he*100:.2f} cm, closed area {area.sum():.3f} m²", flush=True)
    # Closed and outward: every edge in two triangles, the divergence-theorem volume = the solid's.
    from collections import Counter
    ec = Counter(tuple(sorted((t[i], t[(i + 1) % 3]))) for t in E for i in range(3))
    vol = np.sum(np.einsum("ij,ij->i", P[:, 0], np.cross(P[:, 1], P[:, 2]))) / 6
    cav = (W - 2 * T) * (H - 2 * T) * (D - T)
    print(f"  open edges {sum(1 for v in ec.values() if v != 2)}, volume {vol*1e3:.3f} L (solid {(W*H*D - cav)*1e3:.3f} L)", flush=True)
    if o.mesh:
        return
    import bempp_cl.api as bempp
    from thick import solve
    grid = bempp.Grid(V.T.copy(), E.T.copy())
    vn = np.where(on_front, 1.0, 0.0) + np.where(on_back, -1.0, 0.0)
    field = np.array([[x0], [y0], [100.0]])
    (HERE / "thick").mkdir(exist_ok=True)
    part = HERE / "thick" / f"{o.name}.partial.jsonl"
    done = {}
    if part.exists():
        for line in part.read_text().splitlines():
            r = json.loads(line); done[r[0]] = tuple(r)

    def log(row):
        with open(part, "a") as fh:
            fh.write(json.dumps(row) + "\n")
        print(f"{row[0]:9.3f} {row[1]:8.3f} {row[2]:8.2f}  ({time.time() - t0:.0f} s)", flush=True)

    freqs = [round(float(v), 3) for v in (o.freqs.split(",") if o.freqs else np.geomspace(10, o.fmax, 36))]
    res, dofs = solve(grid, vn, Q, freqs, field, done, log)
    with open(HERE / "curves" / f"{o.name}.csv", "w") as fh:
        fh.write("f_Hz,dB_re_monopole,phase_deg\n")
        for f, L, ph in sorted(res):
            fh.write(f"{f:.3f},{L:.4f},{ph:.3f}\n")
    meta = {"kind": kind, "W": W, "H": H, "D": D, "T": T, "a": a, "x": x0, "y": y0, "cone_patch_cm2": Q * 1e4, "h": h, "he": he,
            "triangles": int(len(E)), "dofs": int(dofs), "scale": o.scale, "seconds": round(time.time() - t0)}
    (HERE / "thick" / f"{o.name}.json").write_text(json.dumps(meta, indent=1) + "\n")
    print(f"{o.name}: done, {len(res)} frequencies, {dofs} unknowns, {time.time() - t0:.0f} s", flush=True)


if __name__ == "__main__":
    main()
