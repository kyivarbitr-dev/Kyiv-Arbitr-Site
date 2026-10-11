#!/usr/bin/env python3
"""Друкує sha256-хеші вбудованих <script> на всіх сторінках — для рядка Content-Security-Policy у netlify.toml."""
import base64, glob, hashlib, re
from pathlib import Path
root = Path(__file__).resolve().parent.parent
found = {}
for f in sorted(glob.glob(str(root / "*.html")) + glob.glob(str(root / "en" / "*.html"))):
    text = Path(f).read_text(encoding="utf-8")
    for m in re.finditer(r"<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>(.*?)</script>", text, re.S):
        h = "'sha256-" + base64.b64encode(hashlib.sha256(m.group(1).encode("utf-8")).digest()).decode() + "'"
        found.setdefault(h, []).append(Path(f).name)
for h, files in found.items():
    print(h, "->", ", ".join(sorted(set(files)))[:120])
