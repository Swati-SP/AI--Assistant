# import_app.py
import importlib, traceback, os
print("cwd:", os.getcwd())
try:
    m = importlib.import_module("app.main")
    print("module imported, app object =", getattr(m, "app", None))
except Exception:
    traceback.print_exc()
