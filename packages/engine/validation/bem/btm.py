"""Edge-diffraction (Biot-Tolstoy-Medwin edge sources) for a driver on a thin
rectangular screen, on-axis far field, relative to a free monopole of equal
volume velocity.

Front source +U on the front face, rear source -U on the rear face, receiver on
the front axis at infinity.  Thin screen => wedge index nu = 1/2.

  F = 2 + sum_n F_n
  F_n = 2 (-1/2pi)^n  int..int  b_1 ... b_n  exp(-jk L) / (m d_12 ... d_n-1,n)

b_i = 1/cosh(eta_i/2) at grazing (edge-to-edge) hops, b_n = sqrt(r (d+r)) / d at
the last edge (receiver on axis).  Each grazing hop has the usual factor 1/2;
the front/rear face paths and the front/rear sources all add with equal sign,
which gives the leading 2 and no extra counting factor.  See README.
"""
import numpy as np
from numpy.polynomial.legendre import leggauss


NEAR_EDGE = 3  # an edge closer to the driver than this many node spacings is split at its foot point


def perimeter(W, H, n, h=None, src=None):
    """Graded Gauss nodes on each edge (n per edge, or one per h metres, min 6). With h and the
    driver position src, an edge within NEAR_EDGE·h of the driver is split at the driver's foot
    point, so nodes crowd there too (as the engine's edgeDiffraction.ts)."""
    corners = [(0, 0), (W, 0), (W, H), (0, H)]
    P, Wt, E, geo = [], [], [], []
    for e in range(4):
        p0 = np.array(corners[e], float); p1 = np.array(corners[(e + 1) % 4], float)
        L = np.linalg.norm(p1 - p0); u = (p1 - p0) / L
        parts = [(0.0, L)]
        if h and src is not None:
            rel = np.asarray(src, float) - p0
            dist = abs(rel[0] * u[1] - rel[1] * u[0]); foot = min(L, max(0.0, rel @ u))
            if dist < NEAR_EDGE * h and 0.02 * L < foot < 0.98 * L:
                parts = [(0.0, foot), (foot, L)]
        for s0, s1 in parts:
            ln = s1 - s0
            ne = (max(4 if len(parts) > 1 else 6, int(np.ceil(ln / h))) if h else n)
            s, ws = leggauss(ne)
            s = (s + 1) / 2; ws = ws / 2
            t = s0 + s * s * (3 - 2 * s) * ln; wt = ws * 6 * s * (1 - s) * ln
            P.append(p0 + np.outer(t, u)); Wt.append(wt); E.append(np.full(ne, e))
        geo.append((p0, u))
    return np.vstack(P), np.concatenate(Wt), np.concatenate(E), geo


def _ch(A, z, B, p0, u):
    """cosh(eta/2) for edge point z (line p0 + c u), in-plane points A and B."""
    def split(X):
        rel = X - p0
        c = rel @ u
        r = np.abs(rel[..., 0] * u[1] - rel[..., 1] * u[0])
        return c, r
    cA, rA = split(A); cz, _ = split(z); cB, rB = split(B)
    mA = np.linalg.norm(A - z, axis=-1); mB = np.linalg.norm(B - z, axis=-1)
    rr = np.maximum(rA * rB, 1e-300)
    coshe = (mA * mB + (cz - cA) * (cz - cB)) / rr
    return np.sqrt((np.maximum(coshe, 1.0) + 1) / 2)


def _rdist(X, p0, u):
    rel = X - p0
    return np.abs(rel[..., 0] * u[1] - rel[..., 1] * u[0])


def cone_points(x, y, a, nr=6, nth=16):
    """Area-uniform quadrature over a flat cone of radius a (one point if a = 0)."""
    if not a:
        return np.array([[x, y]]), np.array([1.0])
    s, ws = leggauss(nr)
    s = (s + 1) / 2; ws = ws / 2                       # s = (r/a)^2 is area-uniform
    r = a * np.sqrt(s); th = 2 * np.pi * (np.arange(nth) + 0.5) / nth
    pts = np.stack([x + np.outer(r, np.cos(th)), y + np.outer(r, np.sin(th))], -1).reshape(-1, 2)
    return pts, np.repeat(ws, nth) / nth


def setup(W, H, x, y, n=30, h=None, a=0.0):
    """Kernels for a board W x H (m) with the cone centre at (x, y) and radius a (0 = point)."""
    P, w, E, geo = perimeter(W, H, n, h, src=(x, y))
    N = len(P)
    d = np.linalg.norm(P[:, None] - P[None], axis=-1)
    diff = E[:, None] != E[None]                      # hops only between different edges
    # last-edge factor b_n for source X at node i, last node j: sqrt(r(d+r))/d
    r_last = np.empty((N, N))
    for e, (p0, u) in enumerate(geo):
        idx = E == e
        r_last[:, idx] = _rdist(P, p0, u)[:, None]     # distance of node i to edge of j
    with np.errstate(divide="ignore", invalid="ignore"):
        last = np.where(diff, np.sqrt(r_last * (d + r_last)) / d**2, 0.0)  # i -> j, then axis
    # source terms, one row per cone quadrature point (weights ws sum to 1)
    Sp, ws = cone_points(x, y, a)
    m = np.linalg.norm(P[None] - Sp[:, None], axis=-1)              # [s, i]
    a_S = np.stack([np.array([_rdist(S, *geo[e]) for e in E]) for S in Sp])
    k1 = np.sqrt(a_S * (m + a_S)) / m / m * w * ws[:, None]         # order 1 kernel (no phase)
    first = np.empty((len(Sp), N, N))                               # S -> i -> j : 1/ch(S, i, j)
    for q, S in enumerate(Sp):
        ch_S = np.ones((N, N))
        for e, (p0, u) in enumerate(geo):
            idx = np.where(E == e)[0]
            ch_S[idx] = _ch(S[None, None], P[idx][:, None], P[None], p0, u)
        first[q] = np.where(diff, 1.0 / ch_S, 0.0) * (ws[q] * w / m[q])[:, None]
    mid = np.zeros((N, N, N), np.float32)                           # i -> j -> l : 1/ch(i, j, l)
    for e, (p0, u) in enumerate(geo):
        jdx = np.where(E == e)[0]
        ch = _ch(P[:, None, None], P[jdx][None, :, None], P[None, None], p0, u)
        mid[:, jdx, :] = 1.0 / ch
    mid *= (diff[:, :, None] & diff[None, :, :]).astype(np.float32)
    invd = np.where(diff, 1.0 / np.where(diff, d, 1.0), 0.0)
    return dict(m=m, d=d, w=w, invd=invd, k1=k1, first=first, last=last, mid=mid)


def response(st, f, c=343.2, order=None, tol=1e-6):
    """Complex F(f), summing orders until the term falls below tol (or `order`)."""
    nmax = order or 200
    m, d, w = st["m"], st["d"], st["w"]
    f = np.atleast_1d(f); F = np.zeros(len(f), complex); nused = []
    for q, fq in enumerate(f):
        k = 2 * np.pi * fq / c
        em = np.exp(-1j * k * m); ed = np.exp(-1j * k * d)
        tot = 2 + 2 * (-1 / (2 * np.pi)) * np.sum(st["k1"] * em)
        X = np.einsum("sij,si->ij", st["first"], em) * (ed * w[None])
        T = ed * w[None]
        n = 2
        while True:
            term = 2 * (-1 / (2 * np.pi))**n * np.sum(X * st["last"])
            tot += term
            if n >= nmax or abs(term) < tol:
                break
            X = np.einsum("ij,ijl->jl", X * st["invd"], st["mid"]) * T
            n += 1
        F[q] = tot; nused.append(n)
    return F, np.array(nused)


if __name__ == "__main__":
    import data, json, sys
    if "--fixture" in sys.argv:
        # Reference values for the engine's TypeScript port (test/fixtures/ob-edge/python.json).
        f = np.round(np.geomspace(20, 1200, 30), 3)
        out = {}
        for nm in ("B1", "B2", "B3", "N3", "N4", "T120"):
            b = data.boards()[nm]
            F, _ = response(setup(b["W"], b["H"], b["x"], b["y"], h=0.05, a=b["a"]), f, tol=1e-8)
            out[nm] = {"f": f.tolist(), "re": F.real.round(8).tolist(), "im": F.imag.round(8).tolist()}
        print(json.dumps(out))
        sys.exit()
    print("board  D_cm  rms_dB  max_dB  max_phase_deg  peak_dB_err   (20-900 Hz vs BEM, h = 5 cm, cone averaged)")
    for nm, b in data.boards().items():
        f, dB, ph = data.curve(nm)
        st = setup(b["W"], b["H"], b["x"], b["y"], h=0.05, a=b["a"])
        F, _ = response(st, np.r_[0.5, f], tol=1e-6)
        D = (F[0] / (1j * 2 * np.pi * 0.5 / 343.2)).real * 100; F = F[1:]
        e = 20 * np.log10(abs(F)) - dB; eph = (np.degrees(np.angle(F)) - ph + 180) % 360 - 180
        s = f <= 900; i = np.argmax(dB)
        print(f"{nm:5s} {D:5.2f} {np.sqrt(np.mean(e[s]**2)):6.2f} {abs(e[s]).max():7.2f} {abs(eph[s]).max():9.1f} {e[i]:+11.2f}")
