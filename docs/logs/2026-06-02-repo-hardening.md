# 2026-06-02 - Repo hardening: audit-driven fixes, tests, and docs

**Tags:** audit, tests, ci, reproducibility, docs
**Commits:** 4472f76…e6e62d1 (11). Bare SHAs in headers are git refs (`git show <sha>`), not links.
**Slides:** https://docs.google.com/presentation/d/1uY_FPbNI8iGXo31tNSqlWVGFWPkq9DjcaM--vZdgfBo/edit?usp=sharing
**Public write-up:** none yet

---

## Where we started

After yesterday the repo was feature-rich but had never been hardened for
outside eyes, and the docs still described the old monolithic file. The day's
goal was trust, not features: run a real audit, fix anything that breaks "clone
to run," and write the documentation a new contributor actually needs.

## AI deep audit

Ran a whole-repo audit using a *separate* AI agent, pointed at the codebase with
a strict brief and one bar: can a stranger understand, trust, run, and
contribute? It returned scored, ranked findings with file-level evidence. Two
were trust-critical: the documented workflow crashed on the exact README steps,
and the headline browser-compile had no committed proof of its core claim. The
rest of the day closed those plus reproducibility and docs. (Method written up
in the AI Documentation + Techniques deck.)

## Fixed the broken run path (4472f76)

The flagship workflow was silently broken: the web UI exports the v2 `entities`
schema, but `compile_from_json.py` still read `data["modules"]`, so the exact
clone to design to compile path in the README raised `KeyError: 'modules'`. The
compiler now accepts both the v2 `entities` schema and the legacy `modules`
shape, and exits with a clear message instead of a traceback on an empty layout.
Clone-and-run produces a `.FCStd` again.

## Backed the parity claim with real tests (17e6a09, e6e62d1)

The "browser export is byte-equivalent to the Python compiler" claim lived only
in a commit message. Now the geometry math is importable without FreeCAD
(guarded imports), a node parity harness (`tests/parity.mjs`) checks browser
output against golden data per blocking type, Python unit tests cover the framing
math, and CI runs both on every push with no FreeCAD install needed. A deliberate
one-line change to either compiler now fails a test, so the two implementations
can no longer drift silently.

## Single-sourced the wall specs (ae6ecc2)

The browser export hand-copied a `WALL_SPECS` subset of `wall_instances.yaml`;
editing the YAML would silently drift the browser export from spec. Now
`specs.json` is generated from the YAML by `scripts/gen_specs.py`, the browser
loads it at export time, and CI fails if the two fall out of sync. (This closes
the *spec* drift; the per-direction BREP *geometry* bake is still manual,
tracked as the `bake_lib.py` TODO.)

## Reproducibility + docs (5890da5, f3fd23a, 9f67ea5, 55081cb, 27627c6, 033b1fc, fbd908e)

Pinned dependencies and documented the toolchain (FreeCAD 1.1.1 / Python 3.14.5
/ ifcopenshell 0.8.5); synced the README and `adding_modules.md` to the modular
`web/js/` reality and all three export paths; added [`docs/layout_schema.md`](../layout_schema.md)
(the JSON contract the compilers consume), `CONTRIBUTING.md`, and `CHANGELOG.md`;
aligned `.FCStd` casing, deleted a stale duplicate branch, renamed the 3D tab,
removed a dead mirror link.

## Decisions / why

- **Cross-audit with a separate agent.** Don't let the model that wrote the code
  grade it; a different model surfaces blind spots the author-model shares with
  its own output.
- **Accept both schemas instead of force-migrating.** The compiler reads
  `entities` or legacy `modules`, mirroring `export_ifc.py`: backward compatible,
  no flag day.
- **Tests before the risky refactor.** Phase order put the parity harness in
  place before single-sourcing the specs, so the refactor had a safety net.
- **Generate `specs.json` rather than hand-maintain a literal.** A generated
  artifact the browser fetches is single-sourced and CI-enforceable; a
  hand-copied literal is a silent-drift trap.

## Next / open

- [ ] `bake_lib.py`: single-command part-library baking (no manual FreeCAD), then CI auto-bake on contribution
- [ ] OSB notching + corner stud for drywall nailing (carried from 3/26)
- [ ] Parameterize precut studs
- [ ] Expand test fixtures as module count grows
