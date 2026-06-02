# Contributing

## Build

```bash
pip install -r requirements.txt
./generate.sh          # requires FreeCAD — builds cad_library/
python3 -m http.server 8080 && open http://localhost:8080/web/
```

## Test

```bash
python -m pytest tests/test_blocking_math.py -v   # no FreeCAD required
node tests/parity.mjs                              # no FreeCAD required
```

To regenerate the golden after changing blocking math (requires FreeCAD):

```bash
freecadcmd -c "import sys,os; os.chdir('$(pwd)'); exec(open('tests/gen_golden.py').read())"
```

To regenerate wall specs after editing `wall_instances.yaml`:

```bash
python scripts/gen_specs.py
```

## License

This project is licensed under [AGPL-3.0](LICENSE). Contributions are covered by
the same license. Contributors are responsible for the provenance and
license-cleanliness of any code they submit, including AI-assisted code.
