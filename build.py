#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DIST = ROOT / "dist"
PARTIALS = SRC / "partials"

PARTIAL_RE = re.compile(r"\{\{\s*>\s*([a-zA-Z0-9_\-]+)\s*\}\}")

def load_partial(name: str) -> str:
    path = PARTIALS / f"{name}.html"
    if not path.exists():
        raise FileNotFoundError(f"Missing partial: {path}")
    return path.read_text(encoding="utf-8")

def expand_partials(text: str, depth: int = 0) -> str:
    if depth > 20:
        raise RuntimeError("Partial expansion too deep (possible recursion loop).")

    def repl(match: re.Match) -> str:
        name = match.group(1)
        content = load_partial(name)
        return expand_partials(content, depth + 1)

    while True:
        new_text = PARTIAL_RE.sub(repl, text)
        if new_text == text:
            return new_text
        text = new_text

def build():
    DIST.mkdir(parents=True, exist_ok=True)
    template = (SRC / "index.template.html").read_text(encoding="utf-8")
    out = expand_partials(template)
    (DIST / "index.html").write_text(out, encoding="utf-8")
    print("Built dist/index.html")

if __name__ == "__main__":
    build()
