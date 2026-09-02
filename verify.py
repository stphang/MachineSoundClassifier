"""Validate the browser-only assets before each Static Space deployment."""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent

REQUIRED_FILES = [
    "index.html",
    "styles.css",
    "app.js",
    "README.md",
    ".gitignore",
]

def check_required_files() -> list[str]:
    errors = []
    for name in REQUIRED_FILES:
        if not (REPO_ROOT / name).exists():
            errors.append(f"missing required file: {name}")
    return errors


def check_asset_references() -> list[str]:
    errors = []
    html = (REPO_ROOT / "index.html").read_text(encoding="utf-8")
    for asset in ("styles.css", "app.js"):
        if asset not in html:
            errors.append(f"index.html does not reference {asset}")
    return errors


def check_static_only() -> list[str]:
    errors = []
    forbidden = ("gradio", "transformers", "torch", "import numpy")
    for name in ("index.html", "styles.css", "app.js"):
        source = (REPO_ROOT / name).read_text(encoding="utf-8").lower()
        for token in forbidden:
            if token in source:
                errors.append(f"static asset {name} contains server dependency: {token}")
    return errors


def main() -> int:
    all_errors = []
    all_errors += check_required_files()
    all_errors += check_asset_references()
    all_errors += check_static_only()

    if all_errors:
        print("CI verify FAILED:")
        for err in all_errors:
            print(f"  - {err}")
        return 1

    print("CI verify passed: static assets present and server dependencies absent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
