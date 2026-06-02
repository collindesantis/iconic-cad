# 2026-03-26 - Interior walls, blocking, and web UI maturation

**Tags:** web-ui, interior-walls, blocking, bom, 3d-preview
**Commits:** b5de3d6…89efae6 (feature work; the web-ui-poc branch merged to main at 7fb17f0). Bare SHAs are git refs (`git show <sha>`), not links.
**Slides:** https://docs.google.com/presentation/d/1W1HFC0I52Bm9d7WEm9Y1WvODG0cPXIeEO8frITdUUjo/edit?usp=sharing
**Public write-up:** none yet
<!-- backfilled: true (written 2026-06-02 from the original deck) -->

---

## Where we started

The web UI born on 3/24 was functional but crude: a localhost page where you
drag wall modules onto a grid with snap logic, export to a JSON file carrying
each module's type, x/y, and rotation, and a JSON compiler that has FreeCAD fall
in line with those positions. It worked, but it was too bare to express the
complexity coming next (interior walls, build modes, large builds), so the day
was UI/UX maturation plus the first real structural addition.

## UI/UX quality-of-life (b5de3d6, dcd39d0, 25f41df, 6cf7ab6, 36cdee3, b20e504)

Layout overhaul, zoom and pan, undo/redo/erase with full history, a hotkey
system, a rotate tool, and save/load layouts. All of these were trivial to
implement with AI assistance, which is itself worth noting: the web UI's
simplicity made feature velocity high.

## Live 3D preview (cff610a)

Used three.js to render a crude 3D preview in a small viewport. Each module is
rebuilt as a box-geometry mesh positioned from the same x/y data the JSON
compiler uses, so the preview and the compiled output stay consistent. The
camera can orbit any part of the build.

## BOM + cost estimator (9051c1a)

Reads material specs and costs from `pricing.json` in the repo, tallies
lumber/hardware from placed modules, and renders a live cost breakdown under the
3D preview, updated on every placement. Prices are editable estimates.

## Interior walls + blocking (5eb1693, 89efae6)

The first non-exterior structural feature. Interior walls snap perpendicular to
exterior walls and automatically detect the blocking needed at the connection.
Continuous mode (C) adds vertical studs (one if near an existing stud, two if
out in the open); transverse mode (T) snaps to the midpoint between studs and
places horizontal ladder blocking. The blocking type, position, and stud count
are stored in the exported JSON and compiled into exact 3D geometry in FreeCAD;
in the web UI a pin marks the blocking. This C/T blocking system is still live
in the codebase today.

## Decisions / why

- **Box-geometry preview from the same x/y as the compiler.** Reusing the
  compiler's position data for the preview keeps what you see and what compiles
  in sync, instead of maintaining two notions of placement.
- **Auto-detect blocking instead of asking the user.** The connection geometry
  already determines what blocking is correct, so the tool infers C vs T and
  stud count rather than making the user specify it.

## Next / open

- [ ] Doors + windows (became the 6/1 aperture system)
- [ ] OSB notching
- [ ] Additional corner stud for drywall nailing
- [ ] Test stage/phase swapping; is a WUI refactor needed for the added complexity? (the v2 doc-model refactor on 6/1 answered this)
