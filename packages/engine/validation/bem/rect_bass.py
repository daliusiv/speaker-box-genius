"""Low-frequency dipole path D of a thin rigid rectangular board, without BEM.

By reciprocity, D at the driver equals the potential jump across the board when the whole
board moves normal to itself at unit velocity (Laplace problem, hypersingular equation).
For a thin disc this gives 4a/pi exactly.

Method: spectral Galerkin. The jump is expanded in edge-singular Chebyshev products
    psi_mn(x, y) = sqrt(1 - X^2) sqrt(1 - Y^2) U_2m(X) U_2n(Y),  X = 2x/W, Y = 2y/H
(even modes only: the plate moves uniformly, so the jump is symmetric). Their Fourier
transforms are closed form,
    int_{-1}^{1} sqrt(1 - t^2) U_2m(t) e^{-i a t} dt = pi (-1)^m (2m + 1) J_{2m+1}(a) / a,
and the operator is |k|/2 in Fourier space, so the Galerkin matrix is a smooth 2D integral.

    python3 rect_bass.py          # convergence table, then D vs BEM for every board
"""
import numpy as np
from scipy.special import jv, eval_chebyu
from data import boards, curve

C_AIR = 343.2  # as in sweep.py


def _g(m, a):
    """1D transform of sqrt(1 - t^2) U_2m(t), divided by pi (-1)^m."""
    a = np.asarray(a, float)
    out = np.empty_like(a)
    small = np.abs(a) < 1e-8
    out[~small] = (2 * m + 1) * jv(2 * m + 1, a[~small]) / a[~small]
    out[small] = 0.5 if m == 0 else 0.0
    return out


def solve(W, H, modes=4, nq=4000, qmax=400.0, nth=96):
    """Coefficients c_mn of the jump for a W x H plate at unit normal velocity."""
    pairs = [(m, n) for m in range(modes) for n in range(modes)]
    th, wth = np.polynomial.legendre.leggauss(nth)
    th = 0.25 * np.pi * (th + 1.0)  # first quadrant (integrand is even in kx, ky)
    wth = 0.25 * np.pi * wth
    # radial: composite Gauss on [0, qmax] (q = |k| * L, L = min(W, H) / 2)
    L = 0.5 * min(W, H)
    seg = np.linspace(0.0, qmax, nq // 8 + 1)
    gx, gw = np.polynomial.legendre.leggauss(8)
    q = (0.5 * (seg[1:] - seg[:-1])[:, None] * (gx + 1) + seg[:-1, None]).ravel()
    wq = (0.5 * (seg[1:] - seg[:-1])[:, None] * gw).ravel()
    A = np.zeros((len(pairs), len(pairs)))
    for t, wt in zip(th, wth):
        k = q / L  # |k| in 1/m
        a = k * np.cos(t) * W / 2
        b = k * np.sin(t) * H / 2
        G = np.array([((-1) ** (m + n)) * _g(m, a) * _g(n, b) for m, n in pairs])
        # A_ij = (1/4pi^2) * 4 * int_quadrant (|k|/2) psi_i^ psi_j^ k dk dtheta,
        # psi^ = (W/2)(H/2) pi^2 (-1)^(m+n) g_m g_n
        f = (k / 2) * k * (wq / L) * wt
        A += (G * f) @ G.T
    A *= 4 / (4 * np.pi ** 2) * ((W / 2) * (H / 2) * np.pi ** 2) ** 2
    rhs = np.zeros(len(pairs))
    rhs[0] = W * H * np.pi ** 2 / 16  # int psi_00 dx dy
    return pairs, np.linalg.solve(A, rhs)


def jump(pairs, c, W, H, x, y):
    """Potential jump at (x, y) measured from the board's lower-left corner."""
    X, Y = 2 * (x - W / 2) / W, 2 * (y - H / 2) / H
    if abs(X) >= 1 or abs(Y) >= 1:
        return 0.0
    s = np.sqrt(1 - X * X) * np.sqrt(1 - Y * Y)
    return s * sum(ci * eval_chebyu(2 * m, X) * eval_chebyu(2 * n, Y) for ci, (m, n) in zip(c, pairs))


def path_D(W, H, x, y, a, **kw):
    """D at a cone of radius a centred at (x, y): the jump averaged over the cone area."""
    pairs, c = solve(W, H, **kw)
    r = a * np.sqrt((np.arange(8) + 0.5) / 8)
    th = np.linspace(0, 2 * np.pi, 16, endpoint=False)
    return float(np.mean([jump(pairs, c, W, H, x + ri * np.cos(t), y + ri * np.sin(t)) for ri in r for t in th]))


def bem_D(name):
    """D from the lowest BEM frequency: |F| = 2 sin(kD/2) ~ kD."""
    f, dB, _ = curve(name)
    k = 2 * np.pi * f[0] / C_AIR
    return 2 / k * np.arcsin(min(10 ** (dB[0] / 20) / 2, 1.0))


def path_D_extrap(W, H, x, y, a, qmax=400.0, **kw):
    """path_D with the radial cut-off error removed: the Galerkin integrand decays as 1/|k|
    (oscillating), so the truncation error goes as 1/qmax; Richardson over qmax, 2*qmax."""
    d1 = path_D(W, H, x, y, a, qmax=qmax, nq=int(10 * qmax), **kw)
    d2 = path_D(W, H, x, y, a, qmax=2 * qmax, nq=int(20 * qmax), **kw)
    return 2 * d2 - d1


if __name__ == "__main__":
    print("convergence, 45 x 45 centre jump / W (BEM 31.43/45 = 0.6984):")
    for kw in [dict(modes=3), dict(modes=4), dict(modes=6), dict(modes=4, nth=192),
               dict(modes=4, qmax=800, nq=8000), dict(modes=4, qmax=1600, nq=16000)]:
        p, c = solve(0.45, 0.45, **kw)
        print(f"  {kw}: {jump(p, c, 0.45, 0.45, 0.225, 0.225) / 0.45:.5f}")

    print("\nboard   BEM D cm   rect D cm (qmax 400 -> 800 extrapolated)   error")
    for name, b in boards().items():
        if name == "N1":  # starts at 250 Hz, no low-frequency point
            continue
        Db = 100 * bem_D(name)
        Dr = 100 * path_D_extrap(b["W"], b["H"], b["x"], b["y"], b["a"])
        print(f"{name:6} {Db:9.2f} {Dr:11.2f}   {100 * (Dr / Db - 1):+5.2f} %  {20 * np.log10(Dr / Db):+5.2f} dB")
