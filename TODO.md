# TODO

## In Progress
- [ ] Create door and window module specs *(Marcin)*

## Todo
- [ ] 3D preview in browser (three.js)
- [ ] Interior walls (ladder blocking or continuous blocking options)
- [ ] Staging/phasing system: walls first, then roof, then plumbing/elec, then interior
- [ ] Library view toggle: swap between icon view and image preview of actual module
- [ ] Mobile/tablet support
- [ ] OSB notching detection at corners

## Done
- [x] Web UI drag-and-snap layout tool
- [x] JSON export from web UI
- [x] JSON-to-FreeCAD compiler
- [x] Directional wall icons (N/S/E/W) per Marcin's spec
- [x] Corner port snapping with overlap detection
- [x] Multi-platform repo (GitHub, GitLab, Codeberg)
- [x] UI layout: left library sidebar, right 3D preview sidebar, footer mode bar
- [x] Undo/redo with full action history (placements and erases)
- [x] Erase tool with toggle button
- [x] Zoom (scroll wheel) and pan (middle mouse)
- [x] Hotkey system (Ctrl+Z undo, Ctrl+Shift+Z redo, R rotate, Esc cancel)
- [x] Rotate tool for cycling module direction during placement
- [x] Save/load layouts (JSON file)
- [x] Live BOM estimator (lumber, hardware, cost from pricing.json)
