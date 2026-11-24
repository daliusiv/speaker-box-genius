"""Score models against the BEM curves.

  python3 score.py            # v2 / v3 table (markdown) and the 30 × 120 bass check
  python3 score.py --sens     # v3 sensitivity, one parameter at a time

Metrics per board: bass = mean |model − BEM| dB, 20–100 Hz; peak = frequency of the model's
maximum vs BEM's (parabola-refined in log f), and the level difference; hump = largest |error|
where BEM is within 1 dB of its peak; rms = 20–900 Hz.
Acceptance: bass ≤ 0.4 dB, peak within ±10 %, peak level −2…0 dB.
"""
import sys, functools, numpy as np
import ob_models as M
from data import boards, curve

NAMES = {"B1": "45 × 45, centred", "B2": "45 × 100, (22.5, 35)", "B3": "30 × 45, (10, 30)", "B4": "60 × 60, centred",
         "B5": "45 × 45, 247 mm cone", "N1": "45 × 45, dense 250–900 Hz", "N2": "30 × 90, (15, 30), held out",
         "N3": "60 × 60, (15, 20), held out", "N4": "25 × 25, centred, held out", "T120": "30 × 120, (15, 40), new"}
ORDER = list(NAMES)

def bem_peak(f, L):
    k = int(np.argmax(L))
    if 0 < k < len(f) - 1:
        l0, l1, l2 = L[k-1:k+2]; st = np.log(f[k+1]/f[k]); dx = 0.5*(l0 - l2)/(l0 - 2*l1 + l2)
        return f[k]*np.exp(st*dx), l1 - 0.25*(l0 - l2)*dx
    return f[k], L[k]

def metrics(n, model):
    b = boards()[n]; f, L, _ = curve(n); W, H, x, y, a = b["W"], b["H"], b["x"], b["y"], b["a"]
    lvl = lambda ff: 20*np.log10(np.abs(model(ff, W, H, x, y, a)))
    m = lvl(f); win = f <= 1400
    fp, lp = bem_peak(f[win], L[win])
    fg = np.geomspace(f[0], min(f[-1], 1400), 1500); mg = lvl(fg); k = int(np.argmax(mg))
    bass = (f >= 19.9) & (f <= 100); hump = win & (L >= lp - 1); r900 = f <= 900
    return dict(bass=np.mean(np.abs(m[bass] - L[bass])) if bass.any() else np.nan, pk=fg[k]/fp - 1, lvl=mg[k] - lp,
                hump=np.max(np.abs(m[hump] - L[hump])), rms=np.sqrt(np.mean((m[r900] - L[r900])**2)), fp=fp, lp=lp,
                D=10**(L[0]/20)/(2*np.pi*f[0]/M.C) if f[0] < 35 else np.nan, Dpred=M.d_bass(W, H, x, y, a))

def passes(r):
    return (np.isnan(r["bass"]) or r["bass"] <= 0.4) and abs(r["pk"]) <= 0.10 and -2 <= r["lvl"] <= 0

def summary(model):
    R = [metrics(n, model) for n in ORDER]
    bass = [r["bass"] for r in R if not np.isnan(r["bass"])]; pk = [abs(r["pk"]) for r in R]; lv = [r["lvl"] for r in R]
    return (f"pass {sum(passes(r) for r in R)}/10 | bass max {max(bass):.2f} dB | |peak| max {100*max(pk):.0f} % "
            f"(median {100*np.median(pk):.0f} %) | level {min(lv):+.1f}…{max(lv):+.1f} dB | rms mean {np.mean([r['rms'] for r in R]):.2f} dB")

if __name__ == "__main__":
    if "--sens" in sys.argv:
        V = lambda **k: functools.partial(M.v3, **k)
        for label, mdl in [("v3", V()), ("ζ 0.50", V(zeta=0.50)), ("ζ 0.60", V(zeta=0.60)), ("f_b 100/√S", V(kb=100)),
                           ("f_b 130/√S", V(kb=130)), ("f_t 109/√S", V(kt=109)), ("weights dl/r²", V(weights="len")),
                           ("f_t 600/√S", V(kt=600)), ("no path change (f_t → ∞)", V(kt=1e12)), ("v2", M.v2)]:
            print(f"{label:26s} {summary(mdl)}")
        sys.exit()
    print("| Board | BEM D (cm) | BEM peak | v2 bass (dB) | v2 peak freq | v2 peak level (dB) | v3 bass (dB) | v3 peak freq | v3 peak level (dB) | v3 hump max dev (dB) | v2 rms | v3 rms | v3 |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for n in ORDER:
        a, b = metrics(n, M.v2), metrics(n, M.v3)
        D = "—" if np.isnan(b["D"]) else f"{b['D']*100:.1f}"
        bs = lambda r: "—" if np.isnan(r["bass"]) else f"{r['bass']:.2f}"
        print(f"| {NAMES[n]} | {D} | {b['fp']:.0f} Hz, +{b['lp']:.1f} dB | {bs(a)} | {a['pk']*100:+.0f} % | {a['lvl']:+.1f} | {bs(b)} | "
              f"{b['pk']*100:+.0f} % | {b['lvl']:+.1f} | {b['hump']:.1f} | {a['rms']:.2f} | {b['rms']:.2f} | {'pass' if passes(b) else 'fail'} |")
    r = metrics("T120", M.v3)
    print(f"\n30 × 120: BEM D {r['D']*100:.2f} cm; predicted with 0.967 {r['Dpred']*100:.2f} cm "
          f"({100*(r['Dpred']/r['D'] - 1):+.1f} %, {20*np.log10(r['Dpred']/r['D']):+.2f} dB); exact constant {0.967*r['D']/r['Dpred']:.4f}")
