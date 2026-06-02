# Iconic CAD - Progress Logs

Dated narrative entries for the project. Each entry is the version-controlled
companion to a slide deck: the deck carries the visuals, the log carries the
greppable narrative, the decision/why, and the commit references.

**Conventions:** entries are `YYYY-MM-DD-slug.md`; commit references are bare
short SHAs (use `git show <sha>`), not links; load-bearing images live in `img/`
and are committed (never hotlinked); entries are append-only (corrections go in
a later entry, not by editing an old one); the canonical spec lives in
`docs/layout_schema.md` and `docs/aperture_framing_reference.md`, not here. New
entries are generated from the slide deck via the log jig.

## Entries (newest first)

| Date | Entry | Slides |
|------|-------|--------|
| 2026-06-02 | [Repo hardening - audit, tests, docs](2026-06-02-repo-hardening.md) | [deck](https://docs.google.com/presentation/d/1uY_FPbNI8iGXo31tNSqlWVGFWPkq9DjcaM--vZdgfBo/edit?usp=sharing) |
| 2026-06-01 | [Aperture system, web UI refactor, browser-side compile](2026-06-01-apertures-browser-compile.md) | [deck](https://docs.google.com/presentation/d/1vHQ19yCI7JtXhpin1AzwZWD58SGa1JyhoXT0GvU7VVA/edit?usp=sharing) |
| 2026-03-26 | [Interior walls, blocking, web UI maturation](2026-03-26-interior-walls.md) | [deck](https://docs.google.com/presentation/d/1W1HFC0I52Bm9d7WEm9Y1WvODG0cPXIeEO8frITdUUjo/edit?usp=sharing) |
| 2026-03-24 | [The web UI workflow is born](2026-03-24-web-ui-workflow.md) | [deck](https://docs.google.com/presentation/d/1xdUauu1AL27CrrKZTn76hu6gpEaj5B7qIkBZzGzrNAM/edit?usp=sharing) |

_Entries dated before this directory existed are backfilled from their original
decks and marked `backfilled: true`._

## Not logged here (by design)

The early SVG/Inkscape compiler work (3/18 proof-of-concept) and the
ports/grid/run-based compiler exploration (3/22-3/23) document a path that was
abandoned, so they don't get standing entries. Their lessons are preserved where
they belong: the SVG-PoC context is folded into the 3/24 entry's intro, and the
"why not grids/ports/runs" reasoning belongs in the design-decisions deck as
rejected alternatives. The AI quality-control / photogrammetry work is a separate
research thread (physical QC of wall modules), not Iconic CAD software, and is
not part of this repo's logs.
