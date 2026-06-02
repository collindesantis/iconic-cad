#!/usr/bin/env bash
# Compile a web-UI layout JSON to a FreeCAD .FCStd assembly.
# Usage: ./compile.sh layout.json
if [ -z "$1" ]; then
  echo "Usage: $0 <layout.json>"; exit 1
fi
freecadcmd -c "import sys; sys.argv=['compile_from_json.py',\"$1\"]; exec(open('compile_from_json.py').read())"
