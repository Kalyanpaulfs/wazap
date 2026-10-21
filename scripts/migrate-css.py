#!/usr/bin/env python3
"""Convert hard-coded dark-theme colours in plain CSS files to design tokens, by property role.

usage: python3 scripts/migrate-css.py [--dry] file.css ...
Roles: background* -> surface/bg/accent tokens; color/fill -> text/muted/accent; border*/outline* -> border tokens;
box-shadow -> soft ink shadows. Semi-transparent colours become color-mix(in srgb, token N%, transparent).
Prints a summary and any colour it could not classify.
"""
import re, sys, colorsys

HEX = re.compile(r"#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b")
RGBA = re.compile(r"rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)")

def parse_hex(h):
    if len(h) in (3, 4): h = "".join(c * 2 for c in h)
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
    return r, g, b, a

def hsl(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    return h * 360, s, l

def is_accent(h, s, l): return 110 <= h <= 170 and s > 0.4 and 0.35 <= l <= 0.85

def mix(token, a):
    if a >= 0.995: return f"var(--color-{token})"
    return f"color-mix(in srgb,var(--color-{token}) {round(a * 100)}%,transparent)"

def convert(r, g, b, a, role, has_accent_bg):
    h, s, l = hsl(r, g, b)
    acc = is_accent(h, s, l)
    if role == "shadow":
        if acc: return f"rgb(15 169 104 / {round(min(a, .5) * .6, 2)})"
        return f"rgb(14 23 38 / {round(min(a, .6) * .3, 2)})"
    if role == "bg":
        if acc: return mix("accent", a if a >= .995 else min(a, .9))
        if l > 0.85: return mix("surface", a)
        if l > 0.55: return mix("surface-2", a)
        if l < 0.058: return mix("bg", a)
        if l < 0.115: return mix("surface", a)
        if l < 0.3: return mix("accent-soft" if s > 0.28 else "surface-2", a)
        return mix("surface-2", a)
    if role == "border":
        if acc: return mix("accent", a)
        if l > 0.6: return mix("border-strong", a)
        return mix("border", a) if l < 0.4 else mix("border-strong", a)
    # text / fill / default
    if acc: return mix("accent-hover" if l > 0.55 else "accent", a)
    if l < 0.2: return mix("on-accent" if has_accent_bg else "text", a)
    if l > 0.8: return mix("text", a)
    if l > 0.5: return mix("muted", a)
    return mix("muted", a)

def role_for(prop):
    p = prop.strip().lower()
    if p.startswith("background"): return "bg"
    if p.startswith("border") or p.startswith("outline") or p in ("column-rule", "caret-color") and False: return "border"
    if "shadow" in p: return "shadow"
    if p.startswith("--"): return "text"
    return "text"

def convert_value(prop, value, has_accent_bg, unknown):
    role = role_for(prop)
    if prop.strip().lower() in ("fill", "stroke"): role = "text"
    def hx(m):
        r, g, b, a = parse_hex(m.group(1)); return convert(r, g, b, a, role, has_accent_bg)
    def rg(m):
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        a = m.group(4)
        a = 1.0 if a is None else (float(a[:-1]) / 100 if a.endswith("%") else float(a))
        return convert(r, g, b, a, role, has_accent_bg)
    out = HEX.sub(hx, value)
    out = RGBA.sub(rg, out)
    return out

def process_block(body, unknown):
    decls = re.split(r";(?![^()]*\))", body)
    parsed = []
    for d in decls:
        if ":" in d and not d.strip().startswith("/*"):
            prop, _, val = d.partition(":"); parsed.append((prop, val))
        else: parsed.append((None, d))
    has_accent_bg = any(p and p.strip().lower().startswith("background") and any(
        is_accent(*hsl(*parse_hex(m.group(1))[:3])) for m in HEX.finditer(v)) for p, v in parsed)
    out = []
    for p, v in parsed:
        out.append(f"{p}:{convert_value(p, v, has_accent_bg, unknown)}" if p is not None else v)
    return ";".join(out)

def migrate(css):
    unknown = []
    res, i, n = [], 0, len(css)
    # walk innermost {...} blocks
    stack = []
    last = 0
    out = []
    for idx, ch in enumerate(css):
        if ch == "{": stack.append(idx)
        elif ch == "}":
            if not stack: continue
            start = stack.pop()
            inner = css[start + 1:idx]
            if "{" not in inner:
                out.append((start + 1, idx, process_block(inner, unknown)))
    out.sort()
    buf, pos = [], 0
    for s, e, new in out:
        buf.append(css[pos:s]); buf.append(new); pos = e
    buf.append(css[pos:])
    return "".join(buf)

def main(argv):
    dry = "--dry" in argv
    for f in [a for a in argv if not a.startswith("--")]:
        src = open(f, encoding="utf-8").read()
        new = migrate(src)
        left = sorted(set(HEX.findall(new)))
        if not dry: open(f, "w", encoding="utf-8").write(new)
        print(f"{f}: {len(HEX.findall(src))} hex before, {len(HEX.findall(new))} after")

if __name__ == "__main__": main(sys.argv[1:])
