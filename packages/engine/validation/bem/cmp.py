"""The engine's current flat model (geometric edge paths) and Hornresp's path rule (0.862·√S) against BEM.

  python3 cmp.py
"""
import numpy as np, ob_models as M
from data import boards, curve
for n, b in boards().items():
    f, L, _ = curve(n); W, H, x, y = b["W"], b["H"], b["x"], b["y"]
    w, d = M._edges(W, H, x, y); D = (w*d).sum(); hr = 0.862*np.sqrt(W*H)
    app = 20*np.log10(np.abs(M.app_current(f, W, H, x, y)))
    hrm = 20*np.log10(np.abs(1 - np.exp(-2j*np.pi*f*hr/M.C)))
    lf = f <= 100; r9 = f <= 900
    Dbem = 10**(L[0]/20)/(2*np.pi*f[0]/M.C) if f[0] < 35 else np.nan
    print(f"{n:5s} {W*100:.0f}×{H*100:.0f}: bass D BEM {Dbem*100:5.1f}  app {D*100:5.1f}  Hornresp {hr*100:5.1f} cm | "
          f"bass offset app {np.mean((app-L)[lf]) if lf.any() else np.nan:+.2f}  Hornresp {np.mean((hrm-L)[lf]) if lf.any() else np.nan:+.2f} dB | "
          f"rms ≤ 900 Hz app {np.sqrt(np.mean((app-L)[r9]**2)):.2f}  Hornresp {np.sqrt(np.mean((hrm-L)[r9]**2)):.2f} dB")
