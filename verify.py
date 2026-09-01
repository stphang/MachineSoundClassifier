"""
Lightweight CI verification script.

Runs in the GitHub Actions "verify" job (no microphone / GPU available) to
catch broken imports, syntax errors, and missing files before every deploy.
Exits non-zero on any failure so the workflow step fails the build.
"""

import ast
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent

REQUIRED_FILES = [
    "app.py",
    "requirements.txt",
    "README.md",
    ".gitignore",
]

REQUIRED_IMPORTS = [
    "gradio",
    "transformers",
    "numpy",
]


def check_required_files() -> list[str]:
    errors = []
    for name in REQUIRED_FILES:
        if not (REPO_ROOT / name).exists():
            errors.append(f"missing required file: {name}")
    return errors


def check_python_syntax() -> list[str]:
    errors = []
    for py_file in REPO_ROOT.glob("*.py"):
        source = py_file.read_text(encoding="utf-8")
        try:
            ast.parse(source, filename=str(py_file))
        except SyntaxError as exc:
            errors.append(f"syntax error in {py_file.name}: {exc}")
    return errors


def check_imports() -> list[str]:
    errors = []
    for module_name in REQUIRED_IMPORTS:
        try:
            __import__(module_name)
        except ImportError as exc:
            errors.append(f"failed to import '{module_name}': {exc}")
    return errors


def main() -> int:
    all_errors = []
    all_errors += check_required_files()
    all_errors += check_python_syntax()
    all_errors += check_imports()

    if all_errors:
        print("CI verify FAILED:")
        for err in all_errors:
            print(f"  - {err}")
        return 1

    print("CI verify passed: required files present, syntax OK, imports OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
