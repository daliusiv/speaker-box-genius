"""Edge diffraction (Biot-Tolstoy-Medwin edge sources, all orders) for a driver through a thick
rigid slab W x H x T, on-axis far field, relative to a free monopole of equal volume velocity.

Slab: x in [0, W], y in [0, H], z in [-T, 0]; front face z = 0, listener on +z at infinity.
Front source +U on the front face, rear source -U on the rear face (a piston through the slab).
Twelve edges, each a 90-degree convex wedge (exterior angle 3pi/2, wedge index nu = 2/3):
four front edges, four rear edges, four corner edges along z.

  F = 2 + sum over edge paths of  sigma * prod_edges[-nu/(4 pi) * beta] * prod_hops[1/2 * e^{-jkd}/d]
                                   * e^{-jk m}/m * e^{+jk z_last} * (listener weight)

beta (Svensson, Fred & Vanderkooy 1999) = sum over phi = pi +- thS +- thR of
sin(nu phi) / (cosh(nu eta) - cos(nu phi)); a source or the previous edge point lies on a face of
the next edge (thS = that face's angle), and every edge-to-edge hop runs along one shared face
(factor 1/2, as in btm.py where a hop grazes both faces of the thin board: 2 x 1/2).

The on-axis listener lies in the plane of the four side faces. For a rear edge it is grazing
(direction along the side face) and on the zone boundary of the front edge in front of it, so the
rear edge's own path to the listener counts 1/2 and the front edge's boundary terms (sin(nu phi) = 0)
drop out. Corner edges point at the listener and send nothing to it directly. Nothing is fitted.
"""
import numpy as np
from numpy.polynomial.legendre import leggauss

TWO_PI = 2 * np.pi


def graded(L, n):
    s, ws = leggauss(n)
    s = (s + 1) / 2; ws = ws / 2
    t = s * s * (3 - 2 * s); wt = ws * 6 * s * (1 - s)
    return t * L, wt * L


def slab_edges(W, H, T):
    """Edges: dict(p0, t, L, a, nA, thw, nu, faces=(A, B)). Faces: F, R, L, Rt, B, Tp."""
    n = {"F": (0, 0, 1), "R": (0, 0, -1), "L": (-1, 0, 0), "Rt": (1, 0, 0), "B": (0, -1, 0), "Tp": (0, 1, 0)}
    n = {k: np.array(v, float) for k, v in n.items()}
    E = []

    def edge(p0, p1, fA, fB):
        p0 = np.array(p0, float); p1 = np.array(p1, float)
        L = np.linalg.norm(p1 - p0); t = (p1 - p0) / L
        # a: direction from the edge into face A = -(outward normal of face B) for a 90-degree corner
        a = -n[fB]; nA = n[fA]
        assert abs(a @ t) < 1e-12 and abs(nA @ t) < 1e-12
        E.append(dict(p0=p0, t=t, L=L, a=a, nA=nA, thw=1.5 * np.pi, nu=2 / 3, faces=(fA, fB)))

    sides = [("B", (0, 0), (W, 0)), ("Rt", (W, 0), (W, H)), ("Tp", (W, H), (0, H)), ("L", (0, H), (0, 0))]
    for f, (x0, y0), (x1, y1) in sides:
        edge((x0, y0, 0), (x1, y1, 0), f, "F")      # front edge: face A = side, B = front
        edge((x0, y0, -T), (x1, y1, -T), "R", f)    # rear edge: face A = rear, B = side
    corners = [((0, 0), "L", "B"), ((W, 0), "B", "Rt"), ((W, H), "Rt", "Tp"), ((0, H), "Tp", "L")]
    for (x, y), f1, f2 in corners:
        edge((x, y, 0), (x, y, -T), f1, f2)
    return E


def angle(e, Q):
    """Angle (0..2pi from face A, through the air) and perpendicular distance of points Q from edge e."""
    rel = Q - e["p0"]
    c = rel @ e["t"]
    v = rel - c[..., None] * e["t"]
    r = np.linalg.norm(v, axis=-1)
    th = np.arctan2(v @ e["nA"], v @ e["a"]) % TWO_PI
    return th, r, c


def snap(th):
    """Snap angles within 1e-9 of a multiple of pi/2 (faces, the listener's plane) onto it."""
    q = np.round(th / (np.pi / 2))
    return np.where(np.abs(th - q * np.pi / 2) < 1e-9, (q * np.pi / 2) % TWO_PI, th)


def beta(nu, thS, thR, ch_eta):
    eta = np.arccosh(np.maximum(ch_eta, 1.0))
    C = np.cosh(nu * eta)
    out = np.zeros(np.broadcast(thS, thR, ch_eta).shape)
    for s1 in (1, -1):
        for s2 in (1, -1):
            phi = np.pi + s1 * thS + s2 * thR
            s = np.sin(nu * phi); c = np.cos(nu * phi)
            s = np.where(np.abs(s) < 1e-12, 0.0, s)
            with np.errstate(divide="ignore", invalid="ignore"):
                out = out + np.where(s == 0, 0.0, s / (C - c))
    return out


def face_angle(e, f):
    return 0.0 if e["faces"][0] == f else e["thw"]


def disc(x, y, a, nr=6, nth=16):
    if not a:
        return np.array([[x, y]]), np.array([1.0])
    s, ws = leggauss(nr)
    s = (s + 1) / 2; ws = ws / 2
    r = a * np.sqrt(s); th = TWO_PI * (np.arange(nth) + 0.5) / nth
    pts = np.stack([x + np.outer(r, np.cos(th)), y + np.outer(r, np.sin(th))], -1).reshape(-1, 2)
    return pts, np.repeat(ws, nth) / nth


def setup(W, H, T, x, y, a=0.0, h=0.05, hT=None, front_src=None, rear_src=None):
    """Kernels. h: node spacing on the long edges away from the side-face hops; hT: spacing used
    when T is small (the front-rear hop along a side face is ~T wide), default min(h, T).
    front_src / rear_src: optional (points (n, 2), weights) on the front / rear face (frames: mouths)."""
    E = slab_edges(W, H, T)
    hT = hT or min(h, max(T, 1e-3) / 2)
    P, w, eid = [], [], []
    for k, e in enumerate(E):
        corner = e["faces"][0] not in ("F", "R") and e["faces"][1] not in ("F", "R")
        n = max(6, int(np.ceil(e["L"] / (h if corner else hT))))
        s, ws = graded(e["L"], n)
        P.append(e["p0"] + np.outer(s, e["t"])); w.append(ws); eid.append(np.full(n, k))
    P = np.vstack(P); w = np.concatenate(w); eid = np.concatenate(eid)
    N = len(P)
    nu = np.array([E[k]["nu"] for k in eid])
    faces = [set(E[k]["faces"]) for k in range(len(E))]
    share = np.full((len(E), len(E)), None, object)
    for i in range(len(E)):
        for j in range(len(E)):
            if i != j:
                f = faces[i] & faces[j]
                share[i, j] = next(iter(f)) if f else None
    vis = np.array([[share[eid[i], eid[j]] is not None for j in range(N)] for i in range(N)])
    d = np.linalg.norm(P[:, None] - P[None], axis=-1)
    invd = np.where(vis, 0.5 / np.where(vis, d, 1.0), 0.0)      # 1/2 per face-grazing hop

    # per node: angle of the listener (+z at infinity), listener weight, cosh(eta) factor parts
    zhat = np.array([0.0, 0.0, 1.0])
    thR_rcv = np.empty(N); wr = np.zeros(N); st = np.empty(N)
    for k, e in enumerate(E):
        idx = eid == k
        st[idx] = zhat @ e["t"]
        if abs(st[idx][0]) > 1 - 1e-12:      # corner edge: points at the listener
            thR_rcv[idx] = 0.0; wr[idx] = 0.0; continue
        v = zhat - (zhat @ e["t"]) * e["t"]
        th = snap(np.array([np.arctan2(v @ e["nA"], v @ e["a"]) % TWO_PI]))[0]
        thR_rcv[idx] = th
        wr[idx] = 0.5 if th in (0.0, e["thw"]) else 1.0          # grazing a side face: zone boundary
    zr = P[:, 2]

    # Edge-relative geometry of every node j as seen from every edge of node i: angle/r/along of P[j] w.r.t. edge(eid[i])
    th_e = np.empty((N, N)); r_e = np.empty((N, N)); c_e = np.empty((N, N))
    for k, e in enumerate(E):
        idx = eid == k
        th, r, c = angle(e, P)
        th_e[idx] = snap(th)[None]; r_e[idx] = r[None]; c_e[idx] = c[None]
    c_self = c_e[np.arange(N), np.arange(N)]                    # along-coordinate of node i on its own edge

    # incoming face angle at node j for a hop i -> j (along the shared face), and outgoing at i
    fang = np.zeros((N, N))     # fang[i, j] = angle at edge(j) of the face shared with edge(i)
    for i in range(len(E)):
        for j in range(len(E)):
            if share[i, j] is not None:
                fang[np.ix_(eid == i, eid == j)] = face_angle(E[j], share[i, j])

    # last: node i -> node j -> listener
    with np.errstate(divide="ignore", invalid="ignore"):
        ch_last = (d - (c_self[None, :] - c_e.T) * st[None, :]) / (r_e.T * np.sqrt(np.maximum(1 - st[None, :] ** 2, 1e-30)))
    # c_e.T[i, j] = along-coordinate of P[i] w.r.t. edge(j); r_e.T[i, j] its distance from edge(j)
    b_last = beta(nu[None, :], fang, thR_rcv[None, :], ch_last)
    last = np.where(vis, (-nu[None, :] / (4 * np.pi)) * b_last * (w * wr)[None, :], 0.0)

    # outgoing face angle at node i for a hop i -> j
    fout = np.zeros((N, N))
    for i in range(len(E)):
        for j in range(len(E)):
            if share[i, j] is not None:
                fout[np.ix_(eid == i, eid == j)] = face_angle(E[i], share[i, j])

    # mid: i -> j -> l  (cosh eta at node j from the previous point i and the next point l)
    mid = np.zeros((N, N, N))
    for jn in range(N):
        e = E[eid[jn]]
        rs = r_e[jn]; cs = c_e[jn]                                   # every node w.r.t. edge(j)
        with np.errstate(divide="ignore", invalid="ignore"):
            ch = (d[:, jn][:, None] * d[jn][None, :] + (c_self[jn] - cs)[:, None] * (c_self[jn] - cs)[None, :]) / (rs[:, None] * rs[None, :])
        b = beta(e["nu"], fang[:, jn][:, None], fout[jn][None, :], ch)
        mask = vis[:, jn][:, None] & vis[jn][None, :]
        mid[:, jn, :] = np.where(mask, (-e["nu"] / (4 * np.pi)) * b * w[jn], 0.0)

    # sources
    def src(face, sigma, pts2, ws):
        z = 0.0 if face == "F" else -T
        S = np.column_stack([pts2, np.full(len(pts2), z)])
        m = np.linalg.norm(P[None] - S[:, None], axis=-1)          # [q, i]
        ok = np.array([face in faces[k] for k in eid])
        thS = np.array([face_angle(E[k], face) if face in faces[k] else 0.0 for k in eid])
        rows_first = np.zeros((len(S), N, N)); rows_k1 = np.zeros((len(S), N))
        for q in range(len(S)):
            # S w.r.t. edge(i): along-coordinate and distance
            cS = np.empty(N); rS = np.empty(N)
            for k, e in enumerate(E):
                idx = eid == k
                _, rr, cc = angle(e, S[q])
                cS[idx] = cc; rS[idx] = rr
            # S -> i -> listener
            with np.errstate(divide="ignore", invalid="ignore"):
                ch1 = (m[q] - (c_self - cS) * st) / (rS * np.sqrt(np.maximum(1 - st ** 2, 1e-30)))
            b1 = beta(nu, thS, thR_rcv, ch1)
            rows_k1[q] = np.where(ok, sigma * ws[q] * (-nu / (4 * np.pi)) * b1 * w * wr / m[q], 0.0)
            # S -> i -> j
            with np.errstate(divide="ignore", invalid="ignore"):
                ch2 = (m[q][:, None] * d + (c_self - cS)[:, None] * (c_self[:, None] - c_e)) / (rS[:, None] * r_e)
            b2 = beta(nu[:, None], thS[:, None], fout, ch2)
            rows_first[q] = np.where(ok[:, None] & vis, sigma * ws[q] * (-nu[:, None] / (4 * np.pi)) * b2 * w[:, None] / m[q][:, None], 0.0)
        return m, rows_k1, rows_first

    S_all = []
    fp, fw = front_src if front_src is not None else disc(x, y, a)
    rp, rw = rear_src if rear_src is not None else disc(x, y, a)
    for face, sigma, pts, ws in (("F", 1.0, fp, fw), ("R", -1.0, rp, rw)):
        S_all.append(src(face, sigma, pts, ws))
    return dict(P=P, w=w, eid=eid, d=d, invd=invd, last=last, mid=mid, zr=zr, src=S_all, direct=2.0 * fw.sum())


def response(st, f, c=343.2, tol=1e-7, nmax=300):
    f = np.atleast_1d(f); out = np.zeros(len(f), complex); used = []
    d, invd, mid, last, zr = st["d"], st["invd"], st["mid"], st["last"], st["zr"]
    for qf, fq in enumerate(f):
        k = TWO_PI * fq / c
        ed = np.exp(-1j * k * d) * invd
        er = np.exp(1j * k * zr)
        tot = st["direct"]
        X = 0
        for m, k1, first in st["src"]:
            em = np.exp(-1j * k * m)
            tot += np.sum(k1 * em * er[None])
            X = X + np.einsum("qij,qi->ij", first, em)
        X = X * ed
        n = 2
        while True:
            term = np.sum(X * last * er[None])
            tot += term
            if n >= nmax or abs(term) < tol:
                break
            X = np.einsum("ij,ijl->jl", X, mid) * ed
            n += 1
        out[qf] = tot; used.append(n)
    return out, np.array(used)


# ---------------------------------------------------------------------------------------------
# Checks against the BEM: python btm_thick.py [boards|frames]
# ---------------------------------------------------------------------------------------------
def _curve(name):
    import csv
    return np.array([[float(x) for x in r] for r in list(csv.reader(open(f"curves/{name}.csv")))[1:]])


def _boards():
    import json, glob
    print("board   D_cm   rms_dB  max_dB  max_phase  peak_err_dB   (20-900 Hz vs BEM)")
    for fn in sorted(glob.glob("thick/K*.json")):
        name = fn[6:-5]
        if name.endswith("s"):
            continue
        g = json.load(open(fn)); r = _curve(name)
        st = setup(g["W"], g["H"], g["T"], g["x"], g["y"], a=g["a"])
        F, _ = response(st, np.r_[0.5, r[:, 0]])
        D = (F[0] / (1j * TWO_PI * 0.5 / 343.2)).real * 100; F = F[1:]
        e = 20 * np.log10(abs(F)) - r[:, 1]; ph = (np.degrees(np.angle(F)) - r[:, 2] + 180) % 360 - 180
        s = r[:, 0] <= 900; i = np.argmax(r[:, 1])
        print(f"{name:7s} {D:6.2f} {np.sqrt(np.mean(e[s]**2)):7.2f} {abs(e[s]).max():7.2f} {abs(ph[s]).max():9.1f} {e[i]:+11.2f}", flush=True)


FRAMES = {"F1": ("H", 0.45, 0.30, 0.15, 0.1236), "F2": ("H", 0.60, 0.40, 0.20, 0.1587),
          "F3": ("H", 0.45, 0.60, 0.30, 0.1236), "F4": ("U", 0.45, 0.30, 0.0, 0.1236)}


def open_pipe(ka):
    """Unflanged pipe end, normalised (Levine-Schwinger via Silva et al. 2009), as the engine."""
    kc = np.minimum(ka, 3.5)
    R = (1 + 0.2 * kc - 0.084 * kc**2) / (1 + 0.2 * kc + (0.5 - 0.084) * kc**2)
    dl = 0.6133 * (1 + 0.044 * kc**2) / (1 + 0.19 * kc**2) - 0.02 * np.sin(2.5 * kc)**2
    Rc = -R * np.exp(-2j * ka * dl)
    return (1 + Rc) / (1 - Rc)


def _frames(nq=10):
    """Frames as a slab of the frame's outline x depth; front source = front mouth (H) or the cone
    (U, board at the front rim), rear source = rear mouth; each mouth a uniform source over the
    whole face (zero-thickness walls). Mouth flows from the BEM, then from the 1-D duct model."""
    import csv
    s, w = leggauss(nq); s = (s + 1) / 2; w = w / 2
    print("frame  mouths      D_cm model/BEM  bass_dB(<100)  rms_dB  max_dB  peak BEM -> model   (below 0.9 c/W)")
    for name, (kind, W, D, zb, a) in FRAMES.items():
        r = _curve(name); f = r[:, 0]
        X, Y = np.meshgrid(s * W, s * W); full = (np.c_[X.ravel(), Y.ravel()], np.outer(w, w).ravel())
        st = setup(W, W, D, W / 2, W / 2, front_src=disc(W / 2, W / 2, a) if kind == "U" else full, rear_src=full)
        GF, _ = response(dict(st, src=[st["src"][0]]), f)
        GR, _ = response(dict(st, src=[st["src"][1]], direct=0.0), f); GR = -GR
        rows = list(csv.DictReader(open(f"curves/{name}-mouths.csv")))
        fm = np.array([float(x["f_Hz"]) for x in rows])
        ip = lambda key: np.interp(f, fm, [float(x[key + "_re"]) for x in rows]) + 1j * np.interp(f, fm, [float(x[key + "_im"]) for x in rows])
        k = TWO_PI * f / 343.2; L = zb if kind == "H" else D
        duct = 1 / (np.cos(k * L) + 1j * open_pipe(k * W / np.sqrt(np.pi)) * np.sin(k * L))
        top = 0.9 * 343.2 / W; m = f <= top
        for lab, uf, ur in (("BEM", ip("Uf") if kind == "H" else 1.0, ip("Ur")), ("duct model", duct if kind == "H" else 1.0, -duct)):
            F = uf * GF + ur * GR; Lm = 20 * np.log10(abs(F)); e = Lm - r[:, 1]
            Dm = 2 / k[0] * np.arcsin(min(abs(F[0]) / 2, 1)) * 100; Db = 2 / k[0] * np.arcsin(10 ** (r[0, 1] / 20) / 2) * 100
            i = np.argmax(np.where(m, r[:, 1], -99)); j = np.argmax(np.where(m, Lm, -99))
            print(f"{name:5s} {lab:11s} {Dm:6.1f} / {Db:5.1f}   {np.mean(abs(e[f < 100])):9.2f}   {np.sqrt(np.mean(e[m]**2)):6.2f} {abs(e[m]).max():7.2f}   {f[i]:.0f} Hz {r[i,1]:+.2f} -> {f[j]:.0f} Hz {Lm[j]:+.2f}", flush=True)


if __name__ == "__main__":
    import sys
    which = sys.argv[1] if len(sys.argv) > 1 else "boards"
    _frames() if which == "frames" else _boards()

