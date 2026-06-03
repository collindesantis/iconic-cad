#!/usr/bin/env python3
"""
build_lib.py — one command to regenerate EVERY derived artifact from
wall_instances.yaml. Run from the repo root.

    python build_lib.py               # regenerate everything, in place
    python build_lib.py --verify      # regenerate to a temp dir, diff vs committed
    python build_lib.py --no-thumbs   # skip the headless-Chromium thumbnail bake

What it produces (and the tool each step needs):

    cad_library/<id>.FCStd          Python-compiler library     [freecadcmd]   (gitignored)
    web/assets/lib/<id>__<dir>.brp  browser solids, 4 per id    [freecadcmd]   (committed)
    web/assets/lib/volumes.json     canonical volume per module [freecadcmd]   (committed)
    web/assets/lib/specs.json       framing params              [plain python] (committed)
    web/thumbs/<id>.png             isometric thumbnails        [chromium]     (committed)

Before this script existed, only specs.json and cad_library/ had a generator;
the .brp solids, volumes.json, and thumbnails were baked by hand and committed,
so editing wall_instances.yaml silently staled the browser export. build_lib is
the single reproducible path the contributor guide (docs/adding_modules.md) now
points at.

The geometry steps are delegated to scripts/bake_geometry.py (which runs under
freecadcmd); specs are generated in-process via scripts/gen_specs.py; thumbnails
reuse the existing web/tools/bake_thumbs.html headless flow. box_template.brp is
a generic unit box for procedural blocking, not a per-module artifact, and is
left untouched.
"""
import argparse
import base64
import contextlib
import html
import http.client
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
LIB_DIR = os.path.join("web", "assets", "lib")
CAD_DIR = "cad_library"
THUMB_DIR = os.path.join("web", "thumbs")
SPECS_PATH = os.path.join(LIB_DIR, "specs.json")
BAKE_GEOMETRY = os.path.join("scripts", "bake_geometry.py")
THUMB_PAGE = "tools/bake_thumbs.html"  # relative to the web/ server root


def fail(msg):
    print("ERROR: " + msg, file=sys.stderr)
    sys.exit(1)


# --------------------------------------------------------------------------- #
# specs.json  (no FreeCAD)
# --------------------------------------------------------------------------- #
def run_specs(out_path):
    """Generate specs.json to out_path via scripts/gen_specs.py (in-process)."""
    sys.path.insert(0, os.path.join(REPO_ROOT, "scripts"))
    import gen_specs
    orig = gen_specs.OUT_PATH
    gen_specs.OUT_PATH = out_path
    try:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        gen_specs.main()
    finally:
        gen_specs.OUT_PATH = orig


# --------------------------------------------------------------------------- #
# geometry: cad_library/*.FCStd + lib/*.brp + volumes.json  (freecadcmd)
# --------------------------------------------------------------------------- #
def run_geometry(mode, libdir, cadlibdir):
    freecadcmd = shutil.which("freecadcmd")
    if not freecadcmd:
        fail("freecadcmd not found on PATH — install FreeCAD to bake geometry.")
    cmd = [freecadcmd, BAKE_GEOMETRY, mode, libdir, cadlibdir]
    print("[geometry] " + " ".join(cmd))
    # freecadcmd is chatty on stderr; stream it through so the user sees progress.
    res = subprocess.run(cmd, cwd=REPO_ROOT)
    return res.returncode


# --------------------------------------------------------------------------- #
# thumbnails: web/thumbs/*.png  (headless Chromium + bake_thumbs.html)
# --------------------------------------------------------------------------- #
def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _wait_for_server(port, timeout=10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            c = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
            c.request("GET", "/index.html")
            c.getresponse().read()
            c.close()
            return True
        except OSError:
            time.sleep(0.2)
    return False


def _extract_thumb_json(dom):
    # bake_thumbs.html's header comment literally contains the string
    # `<pre id="out">`, so strip HTML comments before matching the real element.
    dom = re.sub(r'<!--.*?-->', '', dom, flags=re.DOTALL)
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.DOTALL)
    if not m:
        return None
    payload = html.unescape(m.group(1)).strip()
    if payload == "PENDING" or not payload:
        return None
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return None


def run_thumbs(outdir):
    """Render every module thumbnail via the existing bake_thumbs.html flow."""
    chromium = (shutil.which("chromium") or shutil.which("chromium-browser")
                or shutil.which("google-chrome") or shutil.which("chrome"))
    if not chromium:
        fail("chromium not found on PATH — install it or pass --no-thumbs.")

    port = _free_port()
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--directory",
         os.path.join(REPO_ROOT, "web")],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        if not _wait_for_server(port):
            fail("local http server did not come up for the thumbnail bake.")
        url = "http://127.0.0.1:%d/%s" % (port, THUMB_PAGE)
        with tempfile.TemporaryDirectory() as profile:
            cmd = [chromium, "--headless=new", "--enable-unsafe-swiftshader",
                   "--virtual-time-budget=8000", "--dump-dom",
                   "--no-sandbox", "--user-data-dir=" + profile, url]
            print("[thumbs] " + " ".join(cmd))
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        data = _extract_thumb_json(res.stdout)
        if not data:
            fail("thumbnail bake produced no PNG data (needs network for the "
                 "three.js CDN, or the page errored). Re-run with --no-thumbs to "
                 "skip, or bake thumbnails manually per web/tools/bake_thumbs.html.")
        os.makedirs(outdir, exist_ok=True)
        for mid, dataurl in data.items():
            b64 = dataurl.split(",", 1)[1]
            with open(os.path.join(outdir, mid + ".png"), "wb") as f:
                f.write(base64.b64decode(b64))
        print("  wrote %d thumbnails" % len(data))
        return set(data.keys())
    finally:
        server.terminate()
        with contextlib.suppress(Exception):
            server.wait(timeout=5)


# --------------------------------------------------------------------------- #
# verify helpers
# --------------------------------------------------------------------------- #
def _read(path):
    with open(path) as f:
        return f.read()


def verify_specs(tmp_specs):
    committed = _read(SPECS_PATH) if os.path.exists(SPECS_PATH) else None
    fresh = _read(tmp_specs)
    ok = committed == fresh
    print("  specs.json: %s" % ("PASS (identical)" if ok
                                 else "DIFF vs committed"))
    return ok


def verify_thumbs(tmp_thumbs):
    committed = {f[:-4] for f in os.listdir(THUMB_DIR)} if os.path.isdir(THUMB_DIR) else set()
    fresh = {f[:-4] for f in os.listdir(tmp_thumbs)} if os.path.isdir(tmp_thumbs) else set()
    missing = committed - fresh
    added = fresh - committed
    ok = not missing
    print("  thumbs: %d baked, %d committed%s%s" % (
        len(fresh), len(committed),
        ("; MISSING " + ", ".join(sorted(missing))) if missing else "",
        ("; NEW " + ", ".join(sorted(added))) if added else ""))
    return ok


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verify", action="store_true",
                    help="regenerate to a temp dir and diff against committed assets "
                         "(does not clobber anything)")
    ap.add_argument("--no-thumbs", action="store_true",
                    help="skip the headless-Chromium thumbnail bake")
    args = ap.parse_args()
    os.chdir(REPO_ROOT)

    if args.verify:
        tmp = tempfile.mkdtemp(prefix="build_lib_verify_")
        tmp_lib = os.path.join(tmp, "lib")
        tmp_cad = os.path.join(tmp, "cad_library")
        tmp_specs = os.path.join(tmp, "specs.json")
        tmp_thumbs = os.path.join(tmp, "thumbs")
        print("=== build_lib --verify (temp: %s) ===" % tmp)

        run_specs(tmp_specs)
        ok_specs = verify_specs(tmp_specs)

        rc = run_geometry("verify", tmp_lib, tmp_cad)  # compares .brp internally
        ok_geo = rc == 0

        ok_thumbs = True
        if args.no_thumbs:
            print("  thumbs: skipped (--no-thumbs)")
        else:
            try:
                run_thumbs(tmp_thumbs)
                ok_thumbs = verify_thumbs(tmp_thumbs)
            except SystemExit as e:
                print("  thumbs: skipped (%s)" % e)
                ok_thumbs = None  # could not check, not a hard fail

        print("\n=== verify summary ===")
        print("  specs.json : %s" % ("PASS" if ok_specs else "DIFF"))
        print("  geometry   : %s" % ("PASS" if ok_geo else "FAIL"))
        print("  thumbnails : %s" % ("PASS" if ok_thumbs else
                                      ("skipped" if ok_thumbs is None else "FAIL")))
        hard_fail = (not ok_geo) or (ok_thumbs is False)
        shutil.rmtree(tmp, ignore_errors=True)
        sys.exit(1 if hard_fail else 0)

    # ---- in-place regenerate -------------------------------------------- #
    print("=== build_lib: regenerating all derived artifacts ===")
    print("[specs] writing %s" % SPECS_PATH)
    run_specs(SPECS_PATH)

    rc = run_geometry("write", LIB_DIR, CAD_DIR)
    if rc != 0:
        fail("geometry bake (freecadcmd) failed with exit code %d" % rc)

    if args.no_thumbs:
        print("[thumbs] skipped (--no-thumbs)")
    else:
        run_thumbs(THUMB_DIR)

    print("\nDone. Regenerated specs.json, %s/*.brp, volumes.json, cad_library/*.FCStd%s."
          % (LIB_DIR, "" if args.no_thumbs else ", thumbs/*.png"))


if __name__ == "__main__":
    main()
