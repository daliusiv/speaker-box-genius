"""Fit v1's two constants (path scale s, step corner K/√S) to the fitting boards by least squares to 900 Hz.

  python3 fit.py
"""
import numpy as np, ob_models as M
from data import boards, curve
FIT = ["B1", "B2", "B3", "B4", "B5"]
def model(f, W, H, x, y, s, K):
    w, d = M._edges(W, H, x, y)
    dip = 1 - (w*np.exp(-2j*np.pi*f[:, None]*s*d/M.C)).sum(1)
    jx = 1j*f/(K/np.sqrt(W*H)); return 20*np.log10(np.abs((1 + jx/(1 + jx))*dip))
best = None
for s in np.arange(0.50, 0.80, 0.005):
    for K in np.geomspace(40, 400, 60):
        e = 0
        for n in FIT:
            b = boards()[n]; f, L, _ = curve(n); m = f <= 900
            e += np.mean((model(f[m], b["W"], b["H"], b["x"], b["y"], s, K) - L[m])**2)
        if best is None or e < best[0]: best = (e, s, K)
print(f"path scale {best[1]:.3f}, step corner {best[2]:.0f}/√S Hz, mean rms {np.sqrt(best[0]/len(FIT)):.2f} dB")
