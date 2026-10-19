#!/usr/bin/env python3
"""Swap legacy dark-theme Tailwind classes for design tokens (class names only: no copy or logic changes).

usage: python3 scripts/migrate-classes.py [--dry] file1.tsx file2.tsx ...
Prints what is left over (hex colours, slate/gray/green palette classes) so those can be reviewed by hand.
"""
import re, sys

# (pattern, replacement). Patterns match whole class tokens, with optional variant prefixes (hover:, md:, ...) kept.
BG = {
  r"\[#0a0f0a\]": "bg", r"black": "bg", r"\[#0d1a0d\]": "surface-2", r"\[#07110b\]": "bg",
  r"\[#111811\]": "surface", r"\[#101810\]": "surface", r"slate-900": "surface", r"slate-950": "bg",
  r"\[#142319\]": "surface-2", r"slate-800": "surface-2", r"\[#1b2c20\]": "surface-2", r"slate-700": "border",
  r"\[#25D366\]": "accent", r"\[#25d366\]": "accent",
  r"\[#1fba58\]": "accent-hover", r"\[#34eb70\]": "accent-hover",
}
NAMES = {"bg": "bg", "surface": "surface", "surface-2": "surface-2", "border": "border", "accent": "accent", "accent-hover": "accent-hover"}

def conv_bg(m):
    pre, key, alpha = m.group(1), m.group(2), m.group(3) or ""
    if key == "white": return f"{pre}bg-surface{alpha}"
    if key in ("green-900", "green-950", "emerald-900"): return f"{pre}bg-accent-soft"
    if key in ("amber-500", "amber-400", "yellow-500", "yellow-400") and not alpha: return f"{pre}bg-highlight"
    if key in ("slate-600", "slate-500", "gray-600", "gray-800") and not alpha: return f"{pre}bg-muted"
    for pat, tok in BG.items():
        if re.fullmatch(pat, key):
            if tok == "accent" and alpha and alpha in ("/5", "/10", "/15", "/20"): return f"{pre}bg-accent-soft"
            return f"{pre}bg-{tok}{alpha if tok=='accent' or alpha else ''}"
    if key in ("green-500", "green-600", "emerald-500") and alpha in ("/5", "/10", "/15", "/20"): return f"{pre}bg-accent-soft"
    if key in ("green-500", "green-600", "emerald-500", "green-400"): return f"{pre}bg-accent{alpha}"
    if key in ("white",) : return f"{pre}bg-surface{alpha}"
    if key in ("green-900", "green-950", "emerald-900") : return f"{pre}bg-accent-soft"
    if key in ("amber-500", "amber-400", "yellow-500", "yellow-400") and not alpha: return f"{pre}bg-highlight"
    if key in ("slate-600", "slate-500", "gray-600") and not alpha: return f"{pre}bg-muted"
    if key in ("red-500", "red-600") and not alpha: return f"{pre}bg-danger"
    if key.startswith("red-") and alpha: return f"{pre}bg-danger/10"
    if key.startswith(("yellow-", "amber-", "orange-")) and alpha: return f"{pre}bg-highlight-soft"
    return m.group(0)

TEXT = {
  "white": "text", "slate-100": "text", "slate-200": "text", "gray-100": "text", "gray-200": "text",
  "slate-300": "muted", "slate-400": "muted", "slate-500": "muted", "slate-600": "muted", "gray-300": "muted", "gray-400": "muted", "gray-500": "muted", "gray-600": "muted",
  "[#25D366]": "accent", "[#25d366]": "accent", "green-400": "accent", "green-500": "accent", "green-300": "accent-hover", "emerald-400": "accent", "emerald-300": "accent-hover",
  "[#1fba58]": "accent-hover", "[#34eb70]": "accent-hover", "[#8be8ac]": "accent-hover",
  "red-300": "danger", "red-400": "danger", "red-500": "danger",
  "yellow-300": "warning", "yellow-400": "warning", "amber-300": "warning", "amber-400": "warning", "orange-400": "warning",
}
TEXT.update({"amber-100": "warning", "amber-200": "warning", "yellow-100": "warning", "yellow-200": "warning",
  "slate-700": "text", "gray-700": "text", "slate-800": "text", "blue-300": "info", "blue-400": "info", "blue-500": "info",
  "red-100": "danger", "red-200": "danger"})

def conv_text(m):
    pre, key, alpha = m.group(1), m.group(2), m.group(3) or ""
    if key in TEXT: return f"{pre}text-{TEXT[key]}{alpha}"
    return m.group(0)

BORDER = {
  "slate-800": "border", "slate-700": "border-strong", "slate-600": "border-strong", "gray-800": "border", "gray-700": "border-strong",
  "[#233325]": "border", "[#24422c]": "border", "[#294a32]": "border", "[#243b2b]": "border", "[#213525]": "border", "[#2b4432]": "border", "[#36533e]": "border-strong", "[#284331]": "border",
  "[#25D366]": "accent", "[#25d366]": "accent", "green-500": "accent", "green-400": "accent",
  "green-900": "border", "green-800": "border", "slate-900": "border",
  "amber-400": "warning", "amber-500": "warning", "amber-700": "warning", "yellow-500": "warning", "yellow-400": "warning",
  "red-500": "danger", "red-600": "danger", "red-400": "danger", "slate-500": "border-strong", "slate-400": "border-strong", "gray-500": "border-strong",
  "white": "border", "black": "border", "emerald-400": "accent", "emerald-500": "accent",
}
BORDER.update({"amber-400": "warning", "amber-500": "warning", "amber-700": "warning", "yellow-500": "warning", "yellow-400": "warning",
  "red-500": "danger", "red-600": "danger", "red-400": "danger", "slate-500": "border-strong", "slate-400": "border-strong", "gray-500": "border-strong",
  "white": "border", "black": "border", "emerald-400": "accent", "emerald-500": "accent"})

def conv_border(m):
    pre, key, alpha = m.group(1), m.group(2), m.group(3) or ""
    if key in BORDER:
        tok = BORDER[key]
        if tok in ("border", "border-strong") and alpha: alpha = ""
        return f"{pre}border-{tok}{alpha}"
    return m.group(0)

def migrate(src: str) -> str:
    P = r"((?:[\w\[\]\-\.&>:=]+:)*)"   # variant prefixes, e.g. hover: md: group-hover:
    tail = r"(/\d+)?(?![\w\-\]])"
    src = re.sub(rf"(?<![\w\-]){P}bg-(\[#[0-9a-fA-F]{{6}}\]|[a-z]+-\d{{3}}|black|white)" + tail, lambda m: conv_bg(m), src)
    src = re.sub(rf"(?<![\w\-]){P}text-(\[#[0-9a-fA-F]{{6}}\]|[a-z]+-\d{{3}}|white)" + tail, lambda m: conv_text(m), src)
    src = re.sub(rf"(?<![\w\-]){P}border-(\[#[0-9a-fA-F]{{6}}\]|[a-z]+-\d{{3}}|white|black)" + tail, lambda m: conv_border(m), src)
    src = re.sub(rf"(?<![\w\-]){P}divide-(slate-800|slate-700|\[#233325\])" + tail, lambda m: f"{m.group(1)}divide-border", src)
    src = re.sub(rf"(?<![\w\-]){P}placeholder-slate-\d00", lambda m: f"{m.group(1)}placeholder:text-muted/70", src)
    src = re.sub(rf"(?<![\w\-]){P}placeholder:text-slate-\d00", lambda m: f"{m.group(1)}placeholder:text-muted/70", src)
    src = re.sub(rf"(?<![\w\-]){P}(ring|outline|accent|fill|stroke|caret)-(\[#25[dD]366\]|green-500|green-400)" + tail, lambda m: f"{m.group(1)}{m.group(2)}-accent{m.group(4) or ''}", src)
    src = re.sub(r"(?<![\w\-])hero-bg\s", "", src)
    # button text on accent backgrounds: "bg-accent ... text-black" -> text-on-accent (class strings only)
    def fix_on_accent(m):
        s = m.group(0)
        return re.sub(r"(?<![\w\-])text-(black|text)(?![\w\-/])", "text-on-accent", s) if re.search(r"(?<![\w\-:])bg-accent(?![\w\-/])", s) else s
    src = re.sub(r'(?:className|class)=(?:"[^"]*"|\{`[^`]*`\})', fix_on_accent, src)
    return src

LEFT = re.compile(r"#[0-9a-fA-F]{6}\b|\b(?:bg|text|border|ring|from|to|via|fill|stroke)-(?:slate|gray|zinc|green|emerald|red|yellow|amber|orange|blue|white|black)(?:-\d{2,3})?\b")

def main(argv):
    dry = "--dry" in argv
    files = [a for a in argv if not a.startswith("--")]
    for f in files:
        s = open(f, encoding="utf-8").read()
        out = migrate(s)
        if out != s and not dry: open(f, "w", encoding="utf-8").write(out)
        left = sorted(set(LEFT.findall(out)))
        # LEFT has capture groups; use finditer for full match
        left = sorted({m.group(0) for m in LEFT.finditer(out)})
        print(f"{f}: {'changed' if out != s else 'unchanged'}; left: {', '.join(left) if left else '-'}")

if __name__ == "__main__":
    main(sys.argv[1:])
