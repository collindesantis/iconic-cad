#!/usr/bin/env bash
# Generate wall module library (cad_library/) from wall_instances.yaml.
# Re-run after pulling or editing wall_instances.yaml.
freecadcmd -c "import sys; sys.argv=['generate_wall_library.py','wall_instances.yaml']; exec(open('generate_wall_library.py').read())"
