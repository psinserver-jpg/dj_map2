#!/usr/bin/env python
"""js/*.js (ES 모듈) -> app.js (일반 스크립트 1개)

file:// 로 index.html 을 직접 열면 브라우저가 ES 모듈을 차단하므로,
소스 모듈들을 의존 순서대로 하나의 IIFE 로 묶는다. (모듈마다 독립 스코프 유지)

사용법:  python tools/bundle.py      (js/ 를 수정한 뒤 실행)
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = os.path.join(ROOT, "js")
OUT = os.path.join(ROOT, "app.js")

IMPORT_RE = re.compile(r"^import\s+(.+?)\s+from\s+'\./([\w-]+)\.js';[ \t]*\r?\n", re.M)
EXPORT_DECL_RE = re.compile(r"^export\s+(async\s+function|function|const|let)\s+([\w$]+)", re.M)
EXPORT_LIST_RE = re.compile(r"^export\s*\{([^}]*)\};[ \t]*\r?\n", re.M)


def read(name):
    with open(os.path.join(JS, name + ".js"), encoding="utf-8") as fh:
        return fh.read()


def parse(name):
    src = read(name)
    deps = []
    binds = []
    for m in IMPORT_RE.finditer(src):
        spec, dep = m.group(1).strip(), m.group(2)
        deps.append(dep)
        if spec.startswith("* as "):
            binds.append(f"const {spec[5:].strip()} = __m_{dep};")
        else:
            names = [x.strip() for x in spec.strip("{} ").split(",") if x.strip()]
            names = [re.sub(r"\s+as\s+", ": ", n) for n in names]
            binds.append(f"const {{ {', '.join(names)} }} = __m_{dep};")
    body = IMPORT_RE.sub("", src)

    exports = []  # (name, kind)
    for m in EXPORT_DECL_RE.finditer(body):
        exports.append((m.group(2), m.group(1)))
    for m in EXPORT_LIST_RE.finditer(body):
        for n in m.group(1).split(","):
            if n.strip():
                exports.append((n.strip(), "list"))
    body = EXPORT_LIST_RE.sub("", body)
    body = re.sub(r"^export\s+(?=(async\s+function|function|const|let)\b)", "", body, flags=re.M)

    if re.search(r"^\s*(import|export)\s", body, re.M):
        sys.exit(f"{name}.js: 지원하지 않는 import/export 형식이 있어요")
    return deps, binds, body, exports


def main():
    names = [f[:-3] for f in os.listdir(JS) if f.endswith(".js")]
    mods = {n: parse(n) for n in names}

    order, seen = [], set()

    def visit(n, stack=()):
        if n in seen:
            return
        if n in stack:
            sys.exit("순환 참조: " + " -> ".join(stack + (n,)))
        for d in mods[n][0]:
            visit(d, stack + (n,))
        seen.add(n)
        order.append(n)

    visit("main")
    for n in sorted(names):  # main 에서 안 쓰이는 모듈도 포함
        visit(n)

    parts = ["/* 자동 생성 파일 — 수정하지 마세요. 소스는 js/*.js, 생성은 python tools/bundle.py */",
             "(function () {", "'use strict';"]
    for n in order:
        deps, binds, body, exports = mods[n]
        ret = []
        for name, kind in exports:
            ret.append(f"get {name}() {{ return {name}; }}" if kind == "let" else name)
        parts.append(f"\n// ===== {n}.js =====")
        parts.append(f"const __m_{n} = (() => {{")
        parts.extend(binds)
        parts.append(body.rstrip())
        parts.append(f"return {{ {', '.join(ret)} }};")
        parts.append("})();")
    parts.append("})();\n")
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(parts))
    print(f"app.js  {os.path.getsize(OUT) / 1024:.1f} KB  (모듈 순서: {', '.join(order)})")


if __name__ == "__main__":
    main()
