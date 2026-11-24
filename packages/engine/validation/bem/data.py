"""Load the BEM curves: boards.json (geometry) + curves/<name>.csv."""
import json, numpy as np
from pathlib import Path
HERE = Path(__file__).parent
def boards():
    return json.loads((HERE / "boards.json").read_text())
def curve(name):
    d = np.loadtxt(HERE / "curves" / f"{name}.csv", delimiter=",", skiprows=1, ndmin=2)
    return d[:, 0], d[:, 1], d[:, 2]
