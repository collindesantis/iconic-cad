# 2026-03-24 - The web UI workflow is born (drag-and-snap + JSON compiler)

**Tags:** web-ui, json-compiler, architecture-origin
**Commits:** 6717416…a01255c (5). Bare SHAs are git refs (`git show <sha>`), not links.
**Slides:** https://docs.google.com/presentation/d/1xdUauu1AL27CrrKZTn76hu6gpEaj5B7qIkBZzGzrNAM/edit?usp=sharing
**Public write-up:** none yet
<!-- backfilled: true (written 2026-06-02 from the original deck) -->

---

## Where we started

This is the origin point of the architecture that exists today, so the prior
approaches matter as context for why it was tried.

The first workflow (3/18 proof-of-concept) used Marcin's existing SVG/Inkscape
compiler: lay modules out as an SVG grid with metadata, and a compiler scans the
building in a loop to place walls. The core pipeline worked (YAML-generated CAD
was solid, the compiler assembled a simple house), but it required manual XML
input, was rectangular-only, and surfaced the "ports" dilemma: the loop needed
walls facing all four directions, and corner handling was ambiguous.

The following days (3/22-3/23) explored fixes to that compiler: directional
icons, a ports-based placement compiler, a grid-based one, and a run-based one.
Each hit a wall. Ports alone can't resolve corners (ambiguous selection); grids
can't express non-square modules connecting at angles; run-based placement works
for rectangles and L-shapes but introduces a "dominant vs recessive" run-priority
problem where the same layout compiles differently depending on icon placement.
The SVG compiler was, in short, a house of cards at corners.

That unreliability is the reason for the pivot: stop making the compiler *guess*
at corners and let the user place modules directly.

## Web UI drag-and-snap is born (6717416)

A browser-based drag-and-snap interface replaces Inkscape. Select a wall module
and direction from a sidebar, place the first module freely, and subsequent
modules snap to existing wall ports with a corner-connection preview before
placement (so architectural errors are visible before compiling). Export the
layout as JSON in one click; a new compiler, only ~60 lines, reads the JSON and
has FreeCAD place each module at its x/y/rotation. Both squares and L-shapes work,
all three module types supported.

## Why this is the origin

The entire current system descends from this commit. Because the user controls
placement directly, the compiler no longer guesses at corners, which is exactly
what killed every SVG-compiler variant. It also opened a clean expansion path:
once placement is explicit data, adding other systems (electrical, plumbing,
interior) becomes a layering problem rather than a compiler rewrite, which is the
seed of the v2 document model that landed on 6/1.

## README and workflow docs (f75f6cf, 9eaac74, 4ad81a6, a01255c)

Pointed the README at the `web-ui-poc` branch, rewrote setup and usage
instructions for the new workflow, clarified the compile output filename, and
removed files unrelated to the web UI path. (The branch merged to main on 3/26.)

## Decisions / why

- **Direct user placement over a smarter compiler.** Every attempt to make the
  compiler infer corners (ports, grids, runs) failed on real geometry. Letting
  the user place and snap modules removes the guessing entirely. This is the
  load-bearing decision of the whole project.
- **Browser + JSON over Inkscape + SVG.** A JSON layout is an explicit,
  inspectable contract between the UI and the compiler, and the web stack is fast
  to iterate. The new compiler collapsing to ~60 lines is the evidence the model
  was right.

## Next / open (at the time)

- [ ] 3D preview, BOM, save/load (built 3/26)
- [ ] Interior walls (built 3/26)
- [ ] Staged interface for trades (seeded here, realized in the 6/1 doc model)
