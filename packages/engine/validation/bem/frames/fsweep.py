"""Solve one frame case over a frequency list; one JSON line per frequency (appended, restartable).

python3 fsweep.py F1 out.jsonl f1 f2 ...            on-axis response and mouth flows
python3 fsweep.py F1 out.jsonl --half f1 ...         mesh with h and he halved (convergence)
python3 fsweep.py BOX1 out.jsonl f1 ...              F1 tube closed at both ends, front / rear plate driven

Mouth flows are complex volume velocities out of each mouth (front: +z, rear: -z) divided by the
cone volume velocity, from the Helmholtz volume identity over each duct:
    Q_mouth = Q_in - k^2/(i w rho) * integral of p over the duct
(e^{-iwt}; Q_in = +Q_cone for the front duct, -Q_cone for the rear duct; conjugated to e^{+jwt}).
"""
import sys, json, time, numpy as np
from frame import Frame

def main():
    a = sys.argv[1:]
    case, out = a[0], a[1]; half = "--half" in a
    freqs = [float(x) for x in a[2:] if not x.startswith("--")]
    fr = Frame(case, half=half, far1=12)
    done = set()
    try:
        for line in open(out): done.add(round(json.loads(line)["f"], 6))
    except FileNotFoundError: pass
    print(case, "tris", len(fr.T), "dofs", fr.nred, "h", fr.h, "he", fr.he, flush=True)
    for f in freqs:
        if round(f, 6) in done: continue
        t0 = time.time(); rec = {"f": f}
        fr.far1 = max(12.0, 12.0*(f/600.0)**2)  # centroid rule only beyond far1 element sizes
        if fr.kind == "box":
            for nm, drv in (("A", ("front",)), ("B", ("rear",))):
                mu, Q = fr.solve(f, drive=drv); r = fr.onaxis(f, mu, Q)
                rec[nm] = [r.real, r.imag]
        else:
            mu, Q = fr.solve(f); r = fr.onaxis(f, mu, Q); rec["p"] = [r.real, r.imag]
            n = (10, 10, 8)
            if fr.kind == "H":
                uf = np.conj(Q + fr.duct_flow(f, mu, Q, -fr.zb, 0.0, n=n))/Q
                ur = np.conj(-Q + fr.duct_flow(f, mu, Q, -fr.D, -fr.zb, n=n))/Q
                rec["Uf"] = [uf.real, uf.imag]; rec["Ur"] = [ur.real, ur.imag]
            elif fr.kind == "U":
                ur = np.conj(-Q + fr.duct_flow(f, mu, Q, -fr.D, 0.0, n=n))/Q
                rec["Ur"] = [ur.real, ur.imag]
        rec["s"] = round(time.time()-t0, 1)
        with open(out, "a") as fh: fh.write(json.dumps(rec) + "\n")
        print(json.dumps(rec), flush=True)

if __name__ == "__main__":
    main()
