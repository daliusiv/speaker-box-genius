"""Thin rigid open baffle: boundary-element solve (bempp-cl).

The board is a zero-thickness rigid screen in the z = 0 plane. The cone is a disc patch moving
through it (+z); the unknown is the pressure jump across the screen (hypersingular equation,
continuous P1 functions that vanish at the board edge). Pressure is taken on axis at R = 100 m.
"""
import numpy as np, gmsh, bempp_cl.api as bempp
RHO, C = 1.204, 343.2
def mesh(W, H, dx, dy, a, h, he, disc=False, name="s.msh"):
    gmsh.initialize(); gmsh.option.setNumber("General.Terminal", 0); gmsh.model.add("s")
    occ = gmsh.model.occ
    s = occ.addDisk(W/2, W/2, 0, W/2, W/2) if disc else occ.addRectangle(0, 0, 0, W, H)
    d = occ.addDisk(dx, dy, 0, a, a)
    occ.fragment([(2, s)], [(2, d)]); occ.synchronize()
    f = gmsh.model.mesh.field
    # distance to outer boundary curves -> fine (he) at edges; fine near driver
    outer = [c for (dim, c) in gmsh.model.getBoundary(gmsh.model.getEntities(2), combined=True, oriented=False)]
    f.add("Distance", 1); f.setNumbers(1, "CurvesList", outer); f.setNumber(1, "Sampling", 400)
    f.add("Threshold", 2); f.setNumber(2, "InField", 1); f.setNumber(2, "SizeMin", he); f.setNumber(2, "SizeMax", h)
    f.setNumber(2, "DistMin", he); f.setNumber(2, "DistMax", 8*h)
    f.add("MathEval", 3); f.setString(3, "F", f"Max({a/3}, 0.4*(Sqrt((x-{dx})^2+(y-{dy})^2)-{a})+{a/3})")
    f.add("Min", 4); f.setNumbers(4, "FieldsList", [2, 3]); f.setAsBackgroundMesh(4)
    for k in ["MeshSizeExtendFromBoundary", "MeshSizeFromPoints", "MeshSizeFromCurvature"]: gmsh.option.setNumber("Mesh." + k, 0)
    gmsh.option.setNumber("Mesh.MeshSizeMax", h)
    gmsh.model.mesh.generate(2); gmsh.write(name); gmsh.finalize()
    return bempp.import_grid(name)

def run_complex(grid, dx, dy, a, freqs, R=100.0, log=None):
    """On-axis front pressure / free monopole of the same volume velocity, complex,
    e^{+jωt} convention (bempp works in e^{-iωt}; result conjugated). Propagation e^{-jkR} removed."""
    V, E = grid.vertices, grid.elements
    c = V[:, E].mean(axis=1)
    on = np.hypot(c[0]-dx, c[1]-dy) < a
    nz = np.sign(grid.normals[:, 2])
    P1 = bempp.function_space(grid, "P", 1)
    DP0 = bempp.function_space(grid, "DP", 0)
    Q = float(grid.volumes[on].sum())
    out = []
    for fq in freqs:
        k = 2*np.pi*fq/C; w = 2*np.pi*fq
        g = bempp.GridFunction(DP0, coefficients=1j*w*RHO*np.where(on, nz, 0.0))  # dp/dn = jωρ·v·n, cone moving +z
        Wop = bempp.operators.boundary.helmholtz.hypersingular(P1, P1, P1, k)
        Iop = bempp.operators.boundary.sparse.identity(DP0, P1, P1)
        mu = bempp.linalg.lu(Wop, -(Iop*g))
        pts = np.array([[dx], [dy], [R]])
        p = (bempp.operators.potential.helmholtz.double_layer(P1, pts, k) * mu)[0, 0]
        pm = -1j*w*RHO*Q*np.exp(1j*k*R)/(4*np.pi*R)
        r = np.conj(p/pm)
        out.append((fq, 20*np.log10(abs(r)), float(np.degrees(np.angle(r)))))
        if log: print("%9.3f %8.3f %8.2f" % out[-1], file=log, flush=True)
    return out, P1.global_dof_count
