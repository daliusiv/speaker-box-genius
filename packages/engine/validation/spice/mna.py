#!/usr/bin/env python3
"""
SPICE validation: a small AC solver (modified nodal analysis) for the netlist subset the builder
writes. Standard library only, so it runs anywhere python3 does, with no installs.

It is an independent second solver next to ngspice: both read the same .cir file. It is not an
independent physical model: the closed-form tests in spice-analytic.test.ts guard the netlist.

Elements: R, L, C; V (with "AC <value>" or a DC value, used as current senses); I (AC);
E (VCVS), G (VCCS), F (CCCS), H (CCVS) in SPICE's node order and sign conventions, and XSPICE
s_xfer blocks ("A1 %vd(in 0) %vd(out 0) model" with ".model model s_xfer(num_coeff=[…]
den_coeff=[…] [gain=…])", coefficients in descending powers of s): a voltage-controlled voltage
source whose gain is H(jω), evaluated at each frequency:
  - a V/H/E source's branch current flows from n+ through the source to n-;
  - an F/G source's current flows from n+ through the source to n- (out of n+, into n-).
Analysis: ".ac dec N f1 f2" or ".ac lin N f1 f2".

Usage:
  python3 mna.py [--all] case1.cir [case2.cir ...]
prints one JSON object {path: result} to stdout. A result holds
  freq: [...], v: {node: [[re, im], ...]}, i: {source: [[re, im], ...]}, residual: max relative.
Without --all only the probes listed on "* probes:" comment lines are returned.
"""
import json
import math
import re
import sys


def parse_value(tok):
    return float(tok)


XFER = re.compile(r"^a\S*\s+%vd\(\s*(\S+)\s+(\S+)\s*\)\s+%vd\(\s*(\S+)\s+(\S+)\s*\)\s+(\S+)\s*$", re.I)
MODEL = re.compile(r"^\.model\s+(\S+)\s+s_xfer\s*\((.*)\)\s*$", re.I)
# LTspice's s-domain source: "Exx out+ out- in+ in- Laplace=<expression in s>".
LAPLACE = re.compile(r"^(e\S*)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+laplace\s*=\s*(.+?)\s*$", re.I)
LAPLACE_CHARS = re.compile(r"^[0-9eE.+\-*/()s ]+$")


def laplace(expr):
    """H(s) from an arithmetic expression in s (numbers, s, + - * / and brackets only)."""
    if not LAPLACE_CHARS.match(expr) or "**" in expr:
        raise ValueError(f"unsupported Laplace expression: {expr}")
    code = compile(expr, "<laplace>", "eval")
    return lambda sj: eval(code, {"__builtins__": {}}, {"s": sj})


def coeffs(body, key):
    m = re.search(key + r"\s*=\s*\[([^\]]*)\]", body, re.I)
    if not m:
        raise ValueError(f"s_xfer model without {key}")
    return [float(x) for x in m.group(1).split()]


def parse(path):
    elems = []
    models = {}
    ac = None
    probes_v, probes_i = [], []
    with open(path) as fh:
        for raw in fh:
            line = raw.strip()
            if not line:
                continue
            if line.startswith("*"):
                low = line[1:].strip()
                if low.startswith("probes:"):
                    for p in low[len("probes:"):].split():
                        if p.startswith("V(") and p.endswith(")"):
                            probes_v.append(p[2:-1].lower())
                        elif p.startswith("I(") and p.endswith(")"):
                            probes_i.append(p[2:-1].lower())
                continue
            mm = MODEL.match(line)
            if mm:
                body = mm.group(2)
                g = re.search(r"gain\s*=\s*(\S+)", body, re.I)
                models[mm.group(1).lower()] = (coeffs(body, "num_coeff"), coeffs(body, "den_coeff"), float(g.group(1)) if g else 1.0)
                continue
            ml = LAPLACE.match(line)
            if ml:
                g = ml.groups()
                elems.append(("a", g[0].lower(), g[1].lower(), g[2].lower(), g[3].lower(), g[4].lower(), laplace(g[5])))
                continue
            mx = XFER.match(line)
            if mx:
                name = line.split()[0].lower()
                elems.append(("a", name, mx.group(3).lower(), mx.group(4).lower(), mx.group(1).lower(), mx.group(2).lower(), mx.group(5).lower()))
                continue
            t = line.split()
            head = t[0].lower()
            if head == ".ac":
                kind = t[1].lower()
                n, f1, f2 = int(t[2]), parse_value(t[3]), parse_value(t[4])
                ac = (kind, n, f1, f2)
                continue
            if head.startswith("."):
                continue
            name = head
            k = name[0]
            if k in "rlc":
                # LTspice's "Rser=0" on an inductor (its default is 1 mΩ) changes nothing here.
                extra = [x.lower() for x in t[4:]]
                if extra and not (k == "l" and extra == ["rser=0"]):
                    raise ValueError(f"{path}: unsupported parameters on {t[0]}: {' '.join(t[4:])}")
                elems.append((k, name, t[1].lower(), t[2].lower(), parse_value(t[3])))
            elif k in "vi":
                val = 0.0
                rest = [x.lower() for x in t[3:]]
                if "ac" in rest:
                    val = parse_value(rest[rest.index("ac") + 1])
                    elems.append((k, name, t[1].lower(), t[2].lower(), val, True))
                else:
                    if rest and rest[0] != "dc":
                        val = parse_value(rest[0])
                    elif len(rest) > 1:
                        val = parse_value(rest[1])
                    elems.append((k, name, t[1].lower(), t[2].lower(), val, False))
            elif k in "eg":
                elems.append((k, name, t[1].lower(), t[2].lower(), t[3].lower(), t[4].lower(), parse_value(t[5])))
            elif k == "t":
                # Lossless line: Tname n1 n2 n3 n4 Z0=z Td=t
                kv = {x.split("=")[0].lower(): parse_value(x.split("=")[1]) for x in t[5:]}
                elems.append(("t", name, t[1].lower(), t[2].lower(), t[3].lower(), t[4].lower(), kv["z0"], kv["td"]))
            elif k in "fh":
                elems.append((k, name, t[1].lower(), t[2].lower(), t[3].lower(), parse_value(t[4])))
            else:
                raise ValueError(f"{path}: unsupported element {t[0]}")
    if ac is None:
        raise ValueError(f"{path}: no .ac line")
    resolved = []
    for e in elems:
        if e[0] == "a" and isinstance(e[6], str):
            if e[6] not in models:
                raise ValueError(f"{path}: no s_xfer model {e[6]}")
            e = e[:6] + (models[e[6]],)
        resolved.append(e)
    return resolved, ac, probes_v, probes_i


def frequencies(ac):
    kind, n, f1, f2 = ac
    if kind == "dec":
        # As ngspice 45: the number of steps is n per decade, rounded, and the grid is then
        # stretched to end exactly on f2 (5 to 2000 Hz at 50 per decade: 130 steps, ratio
        # 400^(1/130) = 1.0471668, 131 points). Seen in CI on 10 Nov 2026.
        steps = max(1, int(math.floor(n * math.log10(f2 / f1) + 0.5)))
        ratio = (f2 / f1) ** (1 / steps)
        return [f1 * ratio ** k for k in range(steps + 1)]
    if kind == "lin":
        if n == 1:
            return [f1]
        return [f1 + (f2 - f1) * k / (n - 1) for k in range(n)]
    raise ValueError(f"unsupported .ac {kind}")


def solve(A, b):
    """LU with row scaling and partial pivoting; returns x and the relative residual."""
    n = len(A)
    M = [row[:] for row in A]
    rhs = b[:]
    for r in range(n):
        s = max(abs(v) for v in M[r]) or 1.0
        M[r] = [v / s for v in M[r]]
        rhs[r] /= s
    Ms = [row[:] for row in M]
    bs = rhs[:]
    for k in range(n):
        p = max(range(k, n), key=lambda i: abs(M[i][k]))
        if abs(M[p][k]) < 1e-300:
            raise ArithmeticError("singular matrix")
        if p != k:
            M[k], M[p] = M[p], M[k]
            rhs[k], rhs[p] = rhs[p], rhs[k]
        pk = M[k][k]
        rowk = M[k]
        for i in range(k + 1, n):
            f = M[i][k] / pk
            if f != 0:
                rowi = M[i]
                for j in range(k, n):
                    rowi[j] -= f * rowk[j]
                rhs[i] -= f * rhs[k]
    x = [0j] * n
    for i in range(n - 1, -1, -1):
        s = rhs[i]
        row = M[i]
        for j in range(i + 1, n):
            s -= row[j] * x[j]
        x[i] = s / row[i]
    # Residual on the scaled system.
    num = 0.0
    den = 0.0
    for i in range(n):
        r = bs[i] - sum(Ms[i][j] * x[j] for j in range(n))
        num = max(num, abs(r))
        den = max(den, abs(bs[i]))
    return x, (num / den if den > 0 else num)


def run(path, all_out=False):
    elems, ac, probes_v, probes_i = parse(path)
    nodes = {}
    for e in elems:
        for nd in e[2:4]:
            if nd != "0" and nd not in nodes:
                nodes[nd] = len(nodes)
        if e[0] in "egat":
            for nd in e[4:6]:
                if nd != "0" and nd not in nodes:
                    nodes[nd] = len(nodes)
    branches = {}
    for e in elems:
        if e[0] in "veha":
            branches[e[1]] = len(nodes) + len(branches)
    size = len(nodes) + len(branches)
    freqs = frequencies(ac)
    vout = {nd: [] for nd in nodes} if all_out else {nd: [] for nd in probes_v}
    iout = {b: [] for b in branches} if all_out else {b: [] for b in probes_i}
    worst = 0.0
    for f in freqs:
        w = 2 * math.pi * f
        A = [[0j] * size for _ in range(size)]
        b = [0j] * size

        def idx(nd):
            return None if nd == "0" else nodes[nd]

        def stamp_y(n1, n2, y):
            a, c = idx(n1), idx(n2)
            if a is not None:
                A[a][a] += y
            if c is not None:
                A[c][c] += y
            if a is not None and c is not None:
                A[a][c] -= y
                A[c][a] -= y

        def stamp_branch(n1, n2, k):
            # Branch current k leaves n1 into the element and enters n2.
            a, c = idx(n1), idx(n2)
            if a is not None:
                A[a][k] += 1
                A[k][a] += 1
            if c is not None:
                A[c][k] -= 1
                A[k][c] -= 1

        for e in elems:
            k = e[0]
            if k == "r":
                stamp_y(e[2], e[3], 1 / e[4])
            elif k == "l":
                stamp_y(e[2], e[3], 1 / (1j * w * e[4]))
            elif k == "c":
                stamp_y(e[2], e[3], 1j * w * e[4])
            elif k == "v":
                br = branches[e[1]]
                stamp_branch(e[2], e[3], br)
                b[br] += e[4] if e[5] else 0
            elif k == "i":
                val = e[4] if e[5] else 0
                a, c = idx(e[2]), idx(e[3])
                if a is not None:
                    b[a] -= val
                if c is not None:
                    b[c] += val
            elif k == "h":
                br = branches[e[1]]
                stamp_branch(e[2], e[3], br)
                A[br][branches[e[4]]] -= e[5]
            elif k == "f":
                ctrl = branches[e[4]]
                a, c = idx(e[2]), idx(e[3])
                if a is not None:
                    A[a][ctrl] += e[5]
                if c is not None:
                    A[c][ctrl] -= e[5]
            elif k == "e":
                br = branches[e[1]]
                stamp_branch(e[2], e[3], br)
                p, q = idx(e[4]), idx(e[5])
                if p is not None:
                    A[br][p] -= e[6]
                if q is not None:
                    A[br][q] += e[6]
            elif k == "a":
                sj = 1j * w
                if callable(e[6]):
                    h = complex(e[6](sj))
                else:
                    num_c, den_c, gain = e[6]
                    h = gain * sum(c * sj ** (len(num_c) - 1 - n) for n, c in enumerate(num_c)) / sum(c * sj ** (len(den_c) - 1 - n) for n, c in enumerate(den_c))
                br = branches[e[1]]
                stamp_branch(e[2], e[3], br)
                p, q = idx(e[4]), idx(e[5])
                if p is not None:
                    A[br][p] -= h
                if q is not None:
                    A[br][q] += h
            elif k == "t":
                # Two-port admittances of a lossless line, θ = ω·Td: Y11 = Y22 = −j·cot θ / Z0, Y12 = Y21 = j / (Z0·sin θ).
                th = w * e[7]
                y11 = -1j / (e[6] * math.tan(th))
                y12 = 1j / (e[6] * math.sin(th))
                ports = ((idx(e[2]), idx(e[3])), (idx(e[4]), idx(e[5])))
                ys = ((y11, y12), (y12, y11))
                for pi, (pa, pb) in enumerate(ports):
                    for qi, (qa, qb) in enumerate(ports):
                        y = ys[pi][qi]
                        for row, rs in ((pa, 1), (pb, -1)):
                            if row is None:
                                continue
                            for col, cs in ((qa, 1), (qb, -1)):
                                if col is not None:
                                    A[row][col] += rs * cs * y
            elif k == "g":
                a, c = idx(e[2]), idx(e[3])
                p, q = idx(e[4]), idx(e[5])
                for row, sgn in ((a, 1), (c, -1)):
                    if row is None:
                        continue
                    if p is not None:
                        A[row][p] += sgn * e[6]
                    if q is not None:
                        A[row][q] -= sgn * e[6]
        x, res = solve(A, b)
        worst = max(worst, res)
        for nd in vout:
            z = 0j if nd == "0" else x[nodes[nd]]
            vout[nd].append([z.real, z.imag])
        for br in iout:
            z = x[branches[br]]
            iout[br].append([z.real, z.imag])
    return {"freq": freqs, "v": vout, "i": iout, "residual": worst}


def main(argv):
    all_out = False
    paths = []
    for a in argv:
        if a == "--all":
            all_out = True
        else:
            paths.append(a)
    out = {}
    for p in paths:
        out[p] = run(p, all_out)
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main(sys.argv[1:])
