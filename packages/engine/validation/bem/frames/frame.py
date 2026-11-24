"""Open-baffle frames (H, U, flat control, closed tube): thin-screen BEM with C4v symmetry.

Geometry: a square open-ended tube of zero-thickness rigid walls (outside W x W, depth D) and a
rigid board across it, all thin screens. z is the frame axis: front rim at z = 0, rear rim at
z = -D, board at z = -zb. The cone is a centred disc patch on the board moving +z (front face +U,
rear face -U). The listener is on +z.

Formulation (same as screen.py): the unknown is the pressure jump mu = p(+n side) - p(-n side) on
every screen; W mu = -dp/dn (hypersingular operator, Galerkin, Maue form), p = D[mu]. mu is
continuous piecewise linear and vanishes on free edges (rims). Where the board meets the walls
three screens join; mu on each piece is the difference of the pressures of the two regions it
separates, so at a junction vertex the unknowns are the region pressures (one region fixed to 0):
basis = sum over pieces of ([plus = r] - [minus = r]) * hat. That is the Kirchhoff condition
mu_board = mu_rear wall - mu_front wall, which also cancels the edge terms of the Maue form.

Symmetry: the mesh is one eighth (0 <= y <= x) replicated by the 8 symmetries of the square, so it
is exactly symmetric. The cone excites only the fully symmetric solution, so the unknowns are one
per vertex orbit: the system keeps the Galerkin rows of the orbit representatives and sums the
columns over each orbit (exact for the symmetric solution, 8x fewer unknowns).

Integrals: 1/r part of coincident and touching pairs by the closed-form potential of a linear
density on a triangle (inner) and a 25-point rule (outer); the smooth rest by 6x6 points; distant
pairs by 6x6 or 3x3 points. bempp convention e^{-iwt} inside; results are conjugated to e^{+jwt}.
"""
import numpy as np, numba as nb, gmsh
RHO, C = 1.204, 343.2
O, F, R, I = 0, 1, 2, 3

# ----------------------------------------------------------------------------- quadrature
def _collapsed(n):
    g, w = np.polynomial.legendre.leggauss(n); g = (g+1)/2; w = w/2
    L, Wt = [], []
    for u, wu in zip(g, w):
        for v, wv in zip(g, w):
            l1, l2 = u, v*(1-u); L.append((1-l1-l2, l1, l2)); Wt.append(2*wu*wv*(1-u))
    return np.array(L), np.array(Wt)
L3 = np.array([[2/3, 1/6, 1/6], [1/6, 2/3, 1/6], [1/6, 1/6, 2/3]]); W3 = np.full(3, 1/3)
_a, _b = 0.445948490915965, 0.091576213509771
L6 = np.array([[1-2*_a, _a, _a], [_a, 1-2*_a, _a], [_a, _a, 1-2*_a],
               [1-2*_b, _b, _b], [_b, 1-2*_b, _b], [_b, _b, 1-2*_b]])
W6 = np.array([0.223381589678011]*3 + [0.109951743655322]*3)
LO, WO = _collapsed(5)

# ----------------------------------------------------------------------------- mesh
CASES = {  # W, D, zb (board from front rim), a (cone radius), kind
    "F1": (0.45, 0.30, 0.15, 0.1236, "H"),
    "F2": (0.60, 0.40, 0.20, 0.1587, "H"),
    "F3": (0.45, 0.60, 0.30, 0.1236, "H"),
    "F4": (0.45, 0.30, 0.00, 0.1236, "U"),
    "F5": (0.45, 0.00, 0.00, 0.1235, "flat"),
    "BOX1": (0.45, 0.30, 0.00, 0.0, "box"),  # F1 tube closed at both ends (diagnostic A/B)
}

def mesh_size(case, fmax=600.0, half=False):
    W, D, zb, a, kind = CASES[case]
    duct = {"H": min(zb, D-zb), "U": D, "flat": np.inf, "box": D}[kind]
    if case == "BOX1": duct = min(CASES["F1"][2], CASES["F1"][1]-CASES["F1"][2])
    h = min(C/fmax/8, W/10, duct/10); he = 0.005
    return (h/2, he/2) if half else (h, he)

def sector(case, h, he, band=0.03):
    """gmsh mesh of the eighth 0 <= y <= x. Returns nodes, triangles, piece label per triangle."""
    W, D, zb, a, kind = CASES[case]; Wh = W/2
    gmsh.initialize(); gmsh.option.setNumber("General.Terminal", 0); gmsh.model.add("f")
    occ = gmsh.model.occ
    def poly(pts):
        p = [occ.addPoint(*q) for q in pts]
        return occ.addPlaneSurface([occ.addCurveLoop([occ.addLine(p[i], p[(i+1) % len(p)]) for i in range(len(p))])])
    def wall(z0, z1): return poly([(Wh, 0, z0), (Wh, Wh, z0), (Wh, Wh, z1), (Wh, 0, z1)])
    plates = [-zb] if kind != "box" else [0.0, -D]
    for z in plates: poly([(0, 0, z), (Wh, 0, z), (Wh, Wh, z)])
    if kind in ("H", "U", "flat") and a > 0:
        b = occ.getEntities(2)[0]
        d = occ.addDisk(0, 0, -zb, a, a)
        occ.intersect([(2, d)], [b], removeObject=True, removeTool=False)
    if kind == "H": wall(0, -zb); wall(-zb, -D)
    if kind in ("U", "box"): wall(0, -D)
    ents = occ.getEntities(2)
    if len(ents) > 1: occ.fragment(ents[:1], ents[1:])
    occ.synchronize()
    zr = {"H": [0, -D, -zb], "U": [0, -D], "flat": [-zb], "box": [0, -D]}[kind]
    ref = []
    for (_, c) in gmsh.model.getEntities(1):
        x0, y0, z0, x1, y1, z1 = gmsh.model.getBoundingBox(1, c)
        if abs(x0-Wh) < 1e-5 and abs(x1-Wh) < 1e-5 and abs(z1-z0) < 1e-5 and any(abs(z0-z) < 1e-5 for z in zr):
            ref.append(c)
    f = gmsh.model.mesh.field
    f.add("Distance", 1); f.setNumbers(1, "CurvesList", ref); f.setNumber(1, "Sampling", 800)
    f.add("Threshold", 2); f.setNumber(2, "InField", 1); f.setNumber(2, "SizeMin", he); f.setNumber(2, "SizeMax", h)
    f.setNumber(2, "DistMin", band); f.setNumber(2, "DistMax", band + 3*(h-he))
    fl = [2]
    if a > 0:
        f.add("MathEval", 3); f.setString(3, "F", f"Max({a/3}, 0.4*Abs(Sqrt(x^2+y^2)-{a})+{a/3})"); fl.append(3)
    f.add("Min", 4); f.setNumbers(4, "FieldsList", fl); f.setAsBackgroundMesh(4)
    for k in ["MeshSizeExtendFromBoundary", "MeshSizeFromPoints", "MeshSizeFromCurvature"]: gmsh.option.setNumber("Mesh." + k, 0)
    gmsh.option.setNumber("Mesh.MeshSizeMax", h)
    gmsh.model.mesh.generate(2)
    tags, xyz, _ = gmsh.model.mesh.getNodes()
    xyz = xyz.reshape(-1, 3); idx = {t: i for i, t in enumerate(tags)}
    tris, piece = [], []
    for (_, s) in gmsh.model.getEntities(2):
        x0, y0, z0, x1, y1, z1 = gmsh.model.getBoundingBox(2, s)
        cx, cy, cz = gmsh.model.occ.getCenterOfMass(2, s)
        if abs(z1-z0) < 1e-5:  # plate
            if kind == "box": p = "front" if abs(z0) < 1e-5 else "rear"
            else: p = "cone" if np.hypot(cx, cy) < a else "board"
        else:
            p = "wall" if kind in ("U", "box") else ("wallF" if cz > -zb else "wallR")
        et, _, en = gmsh.model.mesh.getElements(2, s)
        for e, nn in zip(et, en):
            assert e == 2
            for tri in nn.reshape(-1, 3): tris.append([idx[q] for q in tri]); piece.append(p)
    gmsh.finalize()
    return xyz, np.array(tris), piece

SIDES = {  # piece -> (normal, plus region, minus region)
    "H": {"board": ("z", F, R), "cone": ("z", F, R), "wallF": ("out", O, F), "wallR": ("out", O, R)},
    "U": {"board": ("z", O, R), "cone": ("z", O, R), "wall": ("out", O, R)},
    "flat": {"board": ("z", F, R), "cone": ("z", F, R)},
    "box": {"front": ("z", O, I), "rear": ("-z", O, I), "wall": ("out", O, I)},
}

class Frame:
    def __init__(self, case, half=False, h=None, he=None, far1=1e9):
        self.far1 = far1
        self.case = case; W, D, zb, a, kind = CASES[case]; self.kind = kind
        self.W, self.D, self.zb, self.a = W, D, zb, a
        h0, he0 = mesh_size(case, half=half)
        self.h, self.he = h or h0, he or he0
        xs, ts, ps = sector(case, self.h, self.he)
        # replicate by the 8 symmetries of the square
        allv, allt, allp, gid = [], [], [], []
        for k, (sw, sx, sy) in enumerate([(sw, sx, sy) for sw in (0, 1) for sx in (1, -1) for sy in (1, -1)]):
            v = xs.copy()
            if sw: v[:, [0, 1]] = v[:, [1, 0]]
            v[:, 0] *= sx; v[:, 1] *= sy
            allv.append(v); allt.append(ts + k*len(xs)); allp += ps
        V = np.vstack(allv); key = np.round(V/1e-7).astype(np.int64)
        _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
        inv = inv.ravel(); self.V = V[first]; T = inv[np.vstack(allt)]
        nsv = len(xs)
        self.rep = np.empty(len(self.V), np.int64)
        for k in range(8): self.rep[inv[k*nsv:(k+1)*nsv]] = np.arange(nsv)
        self.idfull = inv[:nsv]
        sides = SIDES[kind]
        # orient triangles
        Vt = self.V[T]; c = Vt.mean(1); n = np.cross(Vt[:, 1]-Vt[:, 0], Vt[:, 2]-Vt[:, 0])
        want = np.zeros_like(n)
        for i, p in enumerate(allp):
            s = sides[p][0]
            if s == "z": want[i] = (0, 0, 1)
            elif s == "-z": want[i] = (0, 0, -1)
            elif abs(c[i, 0]) > abs(c[i, 1]): want[i] = (np.sign(c[i, 0]), 0, 0)
            else: want[i] = (0, np.sign(c[i, 1]), 0)
        flip = (n*want).sum(1) < 0
        T[flip] = T[flip][:, [0, 2, 1]]
        self.T, self.piece = T, allp
        self.plus = np.array([sides[p][1] for p in allp]); self.minus = np.array([sides[p][2] for p in allp])
        self._geom(); self._dofs()

    def _geom(self):
        V, T = self.V, self.T; P = V[T]
        e1, e2 = P[:, 1]-P[:, 0], P[:, 2]-P[:, 0]
        cr = np.cross(e1, e2); self.area = np.linalg.norm(cr, axis=1)/2; self.N = cr/(2*self.area[:, None])
        self.cen = P.mean(1)
        self.diam = np.max([np.linalg.norm(P[:, i]-P[:, j], axis=1) for i, j in [(0, 1), (1, 2), (2, 0)]], axis=0)
        J = np.stack([e1, e2], 2)  # nt,3,2
        G = np.linalg.inv(np.einsum("tki,tkj->tij", J, J))
        gl = np.einsum("tki,tij->tjk", J, G)  # rows: grad lambda1, lambda2
        self.grad = np.stack([-gl[:, 0]-gl[:, 1], gl[:, 0], gl[:, 1]], 1)  # nt,3(b),3
        self.curl = np.cross(self.N[:, None, :], self.grad)
        self.P = np.ascontiguousarray(P)
        self.X3 = np.einsum("qa,tak->tqk", L3, P); self.X6 = np.einsum("qa,tak->tqk", L6, P)
        self.XO = np.einsum("qa,tak->tqk", LO, P)

    def _dofs(self):
        nv, T = len(self.V), self.T
        e = np.sort(np.vstack([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]), 1)
        ue, cnt = np.unique(e, axis=0, return_counts=True)
        free = np.zeros(nv, bool); free[ue[cnt == 1].ravel()] = True
        regs = [set() for _ in range(nv)]
        for t in range(len(T)):
            for v in T[t]: regs[v] |= {self.plus[t], self.minus[t]}
        red = {}; vd = [[] for _ in range(nv)]
        for v in range(nv):
            if free[v]: continue
            rs = sorted(regs[v])
            for r in rs[1:]:
                key = (self.rep[v], r)
                if key not in red: red[key] = len(red)
                vd[v].append((r, red[key], v == self.idfull[self.rep[v]]))
        self.nred = len(red); nt = len(T)
        self.lcol = -np.ones((nt, 3, 2), np.int64); self.lrow = -np.ones((nt, 3, 2), np.int64)
        self.lcoef = np.zeros((nt, 3, 2))
        for t in range(nt):
            for a_ in range(3):
                k = 0
                for (r, j, isrow) in vd[T[t, a_]]:
                    cf = float(self.plus[t] == r) - float(self.minus[t] == r)
                    if cf == 0: continue
                    self.lcol[t, a_, k] = j; self.lcoef[t, a_, k] = cf
                    if isrow: self.lrow[t, a_, k] = j
                    k += 1
        self.test = np.where((self.lrow >= 0).any((1, 2)))[0]
        self.free = free

    def nfull(self):
        s = set()
        for t in range(len(self.T)):
            for a_ in range(3):
                for k in range(2):
                    if self.lcol[t, a_, k] >= 0: s.add((self.T[t, a_], self.lcol[t, a_, k]))
        return len(s)

    # ------------------------------------------------------------------ solve
    def solve(self, f, drive=("cone",)):
        """Returns the reduced solution and local mu (nt,3) for unit normal velocity on the driven pieces."""
        k = 2*np.pi*f/C; w = 2*np.pi*f
        if getattr(self, "_A", (None,))[0] == f: A = self._A[1]
        else:
            A = assemble(k, self.test, self.P, self.N, self.cen, self.diam, self.area, self.curl, self.X3, self.X6,
                         self.XO, L3, W3, L6, W6, LO, WO, self.lrow, self.lcol, self.lcoef, self.nred, self.far1)
            self._A = (f, A)
        drv = np.array([p in drive for p in self.piece])
        b = np.zeros(self.nred, complex)
        g = 1j*w*RHO  # dp/dn = i w rho v_n (e^{-iwt}), v_n = +1 along the piece normal
        for t in np.where(drv)[0]:
            for a_ in range(3):
                for kk in range(2):
                    r = self.lrow[t, a_, kk]
                    if r >= 0: b[r] -= self.lcoef[t, a_, kk]*g*self.area[t]/3
        x = np.linalg.solve(A, b)
        mu = np.zeros((len(self.T), 3), complex)
        for kk in range(2):
            m = self.lcol[:, :, kk] >= 0
            mu[m] += self.lcoef[:, :, kk][m]*x[self.lcol[:, :, kk][m]]
        return mu, float(self.area[drv].sum())

    def pressure(self, pts, f, mu):
        k = 2*np.pi*f/C
        return dl_pot(np.ascontiguousarray(pts, dtype=float), k, self.P, self.N, self.cen, self.diam, self.area, mu, L6, W6, L3, W3)

    def onaxis(self, f, mu, Q, Rd=100.0):
        k = 2*np.pi*f/C; w = 2*np.pi*f
        p = self.pressure(np.array([[0, 0, Rd]]), f, mu)[0]
        pm = -1j*w*RHO*Q*np.exp(1j*k*Rd)/(4*np.pi*Rd)
        return np.conj(p/pm)

    def duct_flow(self, f, mu, Q, z0, z1, n=(12, 12, 10)):
        """Volume velocity of the duct z0 < z < z1 out through its mouth, from the Helmholtz volume identity:
        Q_mouth = Q_in - k^2/(i w rho) * integral of p over the duct (e^{-iwt})."""
        k = 2*np.pi*f/C; w = 2*np.pi*f; Wh = self.W/2
        gx, wx = np.polynomial.legendre.leggauss(n[0]); gz, wz = np.polynomial.legendre.leggauss(n[2])
        xs = (gx+1)/2*Wh; wxs = wx/2*Wh; zs = z0 + (gz+1)/2*(z1-z0); wzs = wz/2*(z1-z0)
        X, Y, Z = np.meshgrid(xs, xs, zs, indexing="ij")
        Wt = (wxs[:, None, None]*wxs[None, :, None]*wzs[None, None, :]).ravel()*4
        p = self.pressure(np.c_[X.ravel(), Y.ravel(), Z.ravel()], f, mu)
        return -(k*k/(1j*w*RHO))*np.sum(Wt*p)

    def mouth_flow_direct(self, f, mu, zm, n=15, dz=0.002):
        """+z volume velocity through the plane z = zm inside the frame, central difference at +-dz, n x n midpoints."""
        w = 2*np.pi*f; Wh = self.W/2
        xs = (np.arange(n)+0.5)/n*self.W - Wh
        X, Y = np.meshgrid(xs, xs, indexing="ij")
        pts = np.c_[X.ravel(), Y.ravel()]
        pp = self.pressure(np.c_[pts, np.full(len(pts), zm+dz)], f, mu)
        pm = self.pressure(np.c_[pts, np.full(len(pts), zm-dz)], f, mu)
        vz = (pp-pm)/(2*dz)/(1j*w*RHO)
        return np.sum(vz)*(self.W/n)**2

# ----------------------------------------------------------------------------- kernels
@nb.njit(cache=True, fastmath=False)
def tri_pot(x, v, n):
    """Integral over the triangle v (ccw about n) of 1/|x-y| and of (y - rho)/|x-y|, rho = projection of x."""
    d = (x[0]-v[0, 0])*n[0] + (x[1]-v[0, 1])*n[1] + (x[2]-v[0, 2])*n[2]
    rho = x - d*n; ad = abs(d)
    I0 = 0.0; Iv = np.zeros(3)
    for i in range(3):
        pm = v[i]; pp = v[(i+1) % 3]
        L = pp-pm; ll = np.sqrt(L[0]**2+L[1]**2+L[2]**2); lh = L/ll
        u = np.array([lh[1]*n[2]-lh[2]*n[1], lh[2]*n[0]-lh[0]*n[2], lh[0]*n[1]-lh[1]*n[0]])
        q = pm-rho
        P0 = q[0]*u[0]+q[1]*u[1]+q[2]*u[2]
        lm = q[0]*lh[0]+q[1]*lh[1]+q[2]*lh[2]; lp = lm + ll
        R0s = P0*P0 + d*d
        Rm = np.sqrt(lm*lm+R0s); Rp = np.sqrt(lp*lp+R0s)
        if R0s < 1e-24*ll*ll:
            fl = 0.0
        else:
            am = Rm+lm if lm > 0 else R0s/(Rm-lm)
            ap = Rp+lp if lp > 0 else R0s/(Rp-lp)
            fl = np.log(ap/am)
        I0 += P0*fl
        if ad > 1e-12*ll:
            I0 -= ad*(np.arctan(P0*lp/(R0s+ad*Rp)) - np.arctan(P0*lm/(R0s+ad*Rm)))
        Iv += 0.5*u*(R0s*fl + lp*Rp - lm*Rm)
    return I0, Iv

@nb.njit(cache=True)
def _gs(r, k):  # (e^{ikr}-1)/(4 pi r)
    if r < 1e-12: return 1j*k/(4*np.pi)
    return (np.exp(1j*k*r)-1.0)/(4*np.pi*r)

@nb.njit(cache=True)
def assemble(k, test, P, N, cen, diam, area, curl, X3, X6, XO, L3, W3, L6, W6, LO, WO, lrow, lcol, lcoef, nred, far1):
    nt = P.shape[0]
    A = np.zeros((nred, nred), np.complex128)
    M = np.zeros((3, 3), np.complex128)
    inv4pi = 1/(4*np.pi)
    for s in test:
        for t in range(nt):
            dx = cen[s, 0]-cen[t, 0]; dy = cen[s, 1]-cen[t, 1]; dz = cen[s, 2]-cen[t, 2]
            dc = np.sqrt(dx*dx+dy*dy+dz*dz); hm = max(diam[s], diam[t])
            M[:, :] = 0
            if dc > far1*hm:
                g = np.exp(1j*k*dc)*inv4pi/dc/9.0
                for a in range(3):
                    for b in range(3): M[a, b] = g
            elif dc > 4*hm:
                for i in range(3):
                    for j in range(3):
                        ex = X3[s, i, 0]-X3[t, j, 0]; ey = X3[s, i, 1]-X3[t, j, 1]; ez = X3[s, i, 2]-X3[t, j, 2]
                        r = np.sqrt(ex*ex+ey*ey+ez*ez)
                        g = np.exp(1j*k*r)*inv4pi/r*W3[i]*W3[j]
                        for a in range(3):
                            for b in range(3): M[a, b] += g*L3[i, a]*L3[j, b]
            elif dc > 1.5*hm:
                for i in range(6):
                    for j in range(6):
                        ex = X6[s, i, 0]-X6[t, j, 0]; ey = X6[s, i, 1]-X6[t, j, 1]; ez = X6[s, i, 2]-X6[t, j, 2]
                        r = np.sqrt(ex*ex+ey*ey+ez*ez)
                        g = np.exp(1j*k*r)*inv4pi/r*W6[i]*W6[j]
                        for a in range(3):
                            for b in range(3): M[a, b] += g*L6[i, a]*L6[j, b]
            else:
                for i in range(6):
                    for j in range(6):
                        ex = X6[s, i, 0]-X6[t, j, 0]; ey = X6[s, i, 1]-X6[t, j, 1]; ez = X6[s, i, 2]-X6[t, j, 2]
                        r = np.sqrt(ex*ex+ey*ey+ez*ez)
                        g = _gs(r, k)*W6[i]*W6[j]
                        for a in range(3):
                            for b in range(3): M[a, b] += g*L6[i, a]*L6[j, b]
                # 1/r part: inner closed form (per unit area of t), outer rule on s
                nt_ = N[t]; v0 = P[t, 0]
                for q in range(LO.shape[0]):
                    x = XO[s, q]
                    I0, Iv = tri_pot(x, P[t], nt_)
                    d = (x[0]-v0[0])*nt_[0]+(x[1]-v0[1])*nt_[1]+(x[2]-v0[2])*nt_[2]
                    rho = x - d*nt_
                    for b in range(3):
                        # lambda_b(rho) via gradient: lambda_b(y) = lambda_b(v0) + grad.(y - v0)
                        gb = curl_to_grad(curl[t, b], nt_)
                        lb = (1.0 if b == 0 else 0.0) + gb[0]*(rho[0]-v0[0])+gb[1]*(rho[1]-v0[1])+gb[2]*(rho[2]-v0[2])
                        val = (lb*I0 + gb[0]*Iv[0]+gb[1]*Iv[1]+gb[2]*Iv[2])*inv4pi/area[t]
                        for a in range(3): M[a, b] += WO[q]*LO[q, a]*val
            I0s = 0j
            for a in range(3):
                for b in range(3): I0s += M[a, b]
            sc = area[s]*area[t]
            nn = N[s, 0]*N[t, 0]+N[s, 1]*N[t, 1]+N[s, 2]*N[t, 2]
            for a in range(3):
                for ka in range(2):
                    rw = lrow[s, a, ka]
                    if rw < 0: continue
                    ca = lcoef[s, a, ka]
                    for b in range(3):
                        cc = curl[s, a, 0]*curl[t, b, 0]+curl[s, a, 1]*curl[t, b, 1]+curl[s, a, 2]*curl[t, b, 2]
                        val = (cc*I0s - k*k*nn*M[a, b])*sc
                        for kb in range(2):
                            cl = lcol[t, b, kb]
                            if cl < 0: continue
                            A[rw, cl] += ca*lcoef[t, b, kb]*val
    return A

@nb.njit(cache=True)
def curl_to_grad(cu, n):  # grad = curl x n  (curl = n x grad, grad tangential)
    return np.array([cu[1]*n[2]-cu[2]*n[1], cu[2]*n[0]-cu[0]*n[2], cu[0]*n[1]-cu[1]*n[0]])

@nb.njit(cache=True)
def dl_pot(pts, k, P, N, cen, diam, area, mu, L6, W6, L3, W3):
    """p(x) = sum_t int mu(y) dG/dn_y dy, adaptive uniform subdivision for near triangles."""
    npt = pts.shape[0]; nt = P.shape[0]
    out = np.zeros(npt, np.complex128)
    inv4pi = 1/(4*np.pi)
    for ip in range(npt):
        x = pts[ip]; acc = 0j
        for t in range(nt):
            dx = x[0]-cen[t, 0]; dy = x[1]-cen[t, 1]; dz = x[2]-cen[t, 2]
            dc = np.sqrt(dx*dx+dy*dy+dz*dz)
            n = N[t]
            if dc > 6*diam[t]:
                # far: centroid (beyond 15 sizes) or 3-point rule
                nq = 1 if dc > 15*diam[t] else 3
                for q in range(nq):
                    if nq == 1:
                        l0 = l1 = l2 = 1/3; wq = 1.0
                    else:
                        l0 = L3[q, 0]; l1 = L3[q, 1]; l2 = L3[q, 2]; wq = W3[q]
                    y0 = l0*P[t, 0, 0]+l1*P[t, 1, 0]+l2*P[t, 2, 0]
                    y1 = l0*P[t, 0, 1]+l1*P[t, 1, 1]+l2*P[t, 2, 1]
                    y2 = l0*P[t, 0, 2]+l1*P[t, 1, 2]+l2*P[t, 2, 2]
                    e0 = x[0]-y0; e1 = x[1]-y1; e2 = x[2]-y2
                    r = np.sqrt(e0*e0+e1*e1+e2*e2)
                    gp = np.exp(1j*k*r)*(1j*k*r-1)*inv4pi/(r*r)
                    acc += wq*area[t]*(-gp*(n[0]*e0+n[1]*e1+n[2]*e2)/r)*(l0*mu[t, 0]+l1*mu[t, 1]+l2*mu[t, 2])
                continue
            else:
                lb = max(dc - diam[t], 1e-5)
                ns = min(96, int(np.ceil(3*diam[t]/lb)))
            inv = 1.0/ns; sub = area[t]*inv*inv
            for i in range(ns):
                for j in range(ns-i):
                    for up in range(2):
                        if up == 1 and j >= ns-i-1: continue
                        # sub-triangle in (l1,l2) coordinates
                        if up == 0:
                            a1 = (i, j); a2 = (i+1, j); a3 = (i, j+1)
                        else:
                            a1 = (i+1, j); a2 = (i+1, j+1); a3 = (i, j+1)
                        for q in range(6):
                            l1 = (L6[q, 0]*a1[0]+L6[q, 1]*a2[0]+L6[q, 2]*a3[0])*inv
                            l2 = (L6[q, 0]*a1[1]+L6[q, 1]*a2[1]+L6[q, 2]*a3[1])*inv
                            l0 = 1-l1-l2
                            y0 = l0*P[t, 0, 0]+l1*P[t, 1, 0]+l2*P[t, 2, 0]
                            y1 = l0*P[t, 0, 1]+l1*P[t, 1, 1]+l2*P[t, 2, 1]
                            y2 = l0*P[t, 0, 2]+l1*P[t, 1, 2]+l2*P[t, 2, 2]
                            e0 = x[0]-y0; e1 = x[1]-y1; e2 = x[2]-y2
                            r = np.sqrt(e0*e0+e1*e1+e2*e2)
                            gp = np.exp(1j*k*r)*(1j*k*r-1)*inv4pi/(r*r)
                            K = -gp*(n[0]*e0+n[1]*e1+n[2]*e2)/r
                            m = l0*mu[t, 0]+l1*mu[t, 1]+l2*mu[t, 2]
                            acc += W6[q]*sub*K*m
        out[ip] = acc
    return out
