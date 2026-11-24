"""Candidate flat open-baffle models (thin board, on axis): complex pressure against a free monopole
of the same volume velocity, e^{+jωt} convention. Units: metres, Hz.

app_current: the engine's model today (four edges, geometric paths, no front step).
v1: four edges, paths × 0.62, first-order front step at 95/√S Hz.
v2: bass path from potential flow (d_bass), perimeter weights dl/r², path scale rising to 0.9 ×
    geometric above 400/√S Hz, first-order front step at 170/√S Hz.
v3: as v2 with subtended-angle weights dθ = (r·n)·dl/r², a second-order front shelf
    B = (1 + 2s + 2s²)/(1 + 2ζs + s²) at 115/√S Hz (ζ = 0.55), and the path moving from the bass
    path to 0.89 × geometric as (d_bass + x²·d_HF)/(1 + x²), x = f·√S/150.
"""
import numpy as np
from scipy.special import ellipe

C = 343.2
CAL = 0.967  # rectangle vs equal-area ellipse (BEM)

def d_bass(W, H, x, y, a, cal=CAL):
    """Bass path: cal × the potential jump of an equal-area elliptic plate in unit normal flow, averaged over the cone."""
    k = np.sqrt(4/np.pi); A, B = max(W, H)/2*k, min(W, H)/2*k; m = 1 - (B/A)**2
    rr = np.sqrt((np.arange(8)+0.5)/8)*a; th = np.arange(16)*2*np.pi/16
    px = (x + np.outer(rr, np.cos(th))).ravel(); py = (y + np.outer(rr, np.sin(th))).ravel()
    u, v = px - W/2, py - H/2
    if W < H: u, v = v, u
    rad = np.clip(1 - (u/A)**2 - (v/B)**2, 0, None)
    return cal * 2*B/ellipe(m) * np.mean(np.sqrt(rad))

def perimeter(W, H, n=500):
    """Element midpoints, lengths and outward normals (bottom, right, top, left), n per side."""
    t = (np.arange(n)+0.5)/n
    P = np.concatenate([np.c_[t*W, 0*t], np.c_[W+0*t, t*H], np.c_[W-t*W, H+0*t], np.c_[0*t, H-t*H]])
    dl = np.concatenate([np.full(n, W/n), np.full(n, H/n), np.full(n, W/n), np.full(n, H/n)])
    N = np.concatenate([np.tile([0, -1], (n, 1)), np.tile([1, 0], (n, 1)), np.tile([0, 1], (n, 1)), np.tile([-1, 0], (n, 1))])
    return P, dl, N

def v3(f, W, H, x, y, a, zeta=0.55, kb=115.0, kt=150.0, hf=0.89, weights="angle", cal=CAL):
    f = np.atleast_1d(np.asarray(f, float))
    P, dl, N = perimeter(W, H)
    rv = P - [x, y]; r = np.hypot(*rv.T)
    w = ((rv*N).sum(1)*dl/r**2) if weights == "angle" else dl/r**2
    w = w/w.sum()
    dg = 2*r
    db = dg*d_bass(W, H, x, y, a, cal)/(w*dg).sum()
    dh = hf*dg
    S = np.sqrt(W*H)
    X2 = (f/(kt/S))[:, None]**2
    d = (db + X2*dh)/(1 + X2)
    k = 2*np.pi*f[:, None]/C
    dip = 1 - (w*np.exp(-1j*k*d)).sum(1)
    s = 1j*f/(kb/S)
    B = (1 + 2*s + 2*s**2)/(1 + 2*zeta*s + s**2)
    return B*dip

def v2(f, W, H, x, y, a):
    """v2 (plan §2.6): dl/r² weights, scale from bass D rising to 0.9 × geometric above 400/√S, first-order step at 170/√S."""
    f = np.atleast_1d(np.asarray(f, float))
    P, dl, N = perimeter(W, H)
    rv = P - [x, y]; r = np.hypot(*rv.T)
    w = dl/r**2; w = w/w.sum()
    dg = 2*r; s0 = d_bass(W, H, x, y, a)/(w*dg).sum()
    S = np.sqrt(W*H); X2 = (f/(400/S))**2; sc = s0 + (0.9 - s0)*X2/(1 + X2)
    k = 2*np.pi*f[:, None]/C
    dip = 1 - (w*np.exp(-1j*k*dg*sc[:, None])).sum(1)
    jx = 1j*f/(170/S)
    return (1 + jx/(1 + jx))*dip

def _edges(W, H, x, y):
    a = [abs(np.arctan2(*_cr(x, y, 0, 0, 0, H))), abs(np.arctan2(*_cr(x, y, W, 0, W, H))),
         abs(np.arctan2(*_cr(x, y, 0, 0, W, 0))), abs(np.arctan2(*_cr(x, y, 0, H, W, H)))]
    w = np.array(a)/sum(a)
    return w, np.array([2*x, 2*(W - x), 2*y, 2*(H - y)])

def _cr(px, py, ax, ay, bx, by):
    ux, uy, vx, vy = ax - px, ay - py, bx - px, by - py
    return ux*vy - uy*vx, ux*vx + uy*vy

def app_current(f, W, H, x, y, a=0, t=0.0):
    f = np.atleast_1d(np.asarray(f, float)); w, d = _edges(W, H, x, y)
    return 1 - (w*np.exp(-2j*np.pi*f[:, None]*(d + t)/C)).sum(1)

def v1(f, W, H, x, y, a=0):
    f = np.atleast_1d(np.asarray(f, float)); w, d = _edges(W, H, x, y)
    dip = 1 - (w*np.exp(-2j*np.pi*f[:, None]*0.62*d/C)).sum(1)
    jx = 1j*f/(95/np.sqrt(W*H))
    return (1 + jx/(1 + jx))*dip
