#!/usr/bin/env python3
"""Step 4 verification gate. Stdlib only; installed into each pilot repo as .github/sb-gate/gate.py.

  gate.py static     --base SHA --head SHA [--title T]   # never executes PR code (runs from pull_request_target)
  gate.py regression --base SHA --head SHA [--title T]   # fix PRs: head's tests must FAIL on base source, PASS on head

Config is read from the BASE commit (.github/sb-gate.json), never from the PR. Exit 0 = pass, 1 = violations, 2 = gate error.
Every failure is fail-closed: a git error, an unparseable config or an unknown file mode is a violation, not a pass.
"""
import argparse, fnmatch, json, re, shutil, subprocess, sys, tempfile
from pathlib import Path

DEFAULT = {
    # owner-only paths: CI, the gate itself, build/deploy, dependencies, test wiring
    "protected": [".github/", ".gitattributes", ".gitmodules", ".gitignore", "package.json", "package-lock.json",
                  "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "build.mjs", "render.yaml", "Dockerfile",
                  "pyproject.toml", "setup.py", "setup.cfg", "requirements*.txt", "conftest.py", "pytest.ini", "tox.ini",
                  ".npmrc", ".nvmrc", ".env*", "*.pem", "*.key", "id_rsa*", "id_ed25519*"],
    "tests": ["test/", "tests/", "*.test.*", "*_test.py", "test_*.py"],
    "max_files": 25,
    "max_lines": 800,
    "test_cmd": "npm test",
}
SECRET = re.compile(r"(gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}"
                    r"|xox[abpr]-[A-Za-z0-9-]{10,}|rnd_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)")
SKIP = re.compile(r"\.(skip|only|todo)\b|\b(skip|todo|only)\s*:\s*(true|['\"`])|pytest\.mark\.(skip|xfail)|pytest\.skip\("
                  r"|unittest\.skip|\bxit\(|\bxdescribe\(")
TEST_SNIFF = re.compile(r"NODE_TEST_CONTEXT|PYTEST_CURRENT_TEST|['\"]pytest['\"]\s+in\s+sys\.modules|--test\b|node:test")
CODE = re.compile(r"\.(m?js|cjs|jsx|tsx?|py)$", re.I)
DOC = re.compile(r"(^|/)(docs?|reports)/|\.(md|txt)$", re.I)
CI_SKIP = re.compile(r"\[(skip ci|ci skip|no ci|skip actions|actions skip)\]|skip-checks\s*:\s*true", re.I)
DECL = re.compile(r"(?:^|[^\w.])(?:test|it)\s*\(|^\s*(?:async\s+)?def\s+test_", re.M)
ASSERT = re.compile(r"\bassert\w*\b|\bexpect\s*\(")


class GateError(Exception):
    pass


def gitb(repo, *a) -> bytes:
    r = subprocess.run(["git", "-C", str(repo), "-c", "core.quotepath=off", *a], capture_output=True)
    if r.returncode:
        raise GateError(f"git {' '.join(a)}: {r.stderr.decode(errors='replace').strip()}")
    return r.stdout


def git(repo, *a) -> str:
    return gitb(repo, *a).decode("utf-8", errors="replace")


def match(path, pats):
    p, base = path.lower(), path.lower().rsplit("/", 1)[-1]
    for pat in (x.lower() for x in pats):
        if pat.endswith("/"):
            if p.startswith(pat) or ("/" + pat) in ("/" + p):
                return True
        elif fnmatch.fnmatchcase(p, pat) or fnmatch.fnmatchcase(base, pat):
            return True
    return False


def config(repo, base):
    cfg = dict(DEFAULT)
    try:
        raw = git(repo, "show", f"{base}:.github/sb-gate.json")
    except GateError:
        return cfg  # no config on base -> defaults
    try:
        loaded = json.loads(raw)
    except json.JSONDecodeError as e:
        raise GateError(f"base .github/sb-gate.json unparseable: {e}")
    if not isinstance(loaded, dict) or set(loaded) - set(DEFAULT):
        raise GateError("base .github/sb-gate.json has unknown keys")
    # repo config may only ADD protected/test patterns, never remove the defaults
    for k in ("protected", "tests"):
        cfg[k] = DEFAULT[k] + list(loaded.get(k, []))
    for k in ("max_files", "max_lines", "test_cmd"):
        if k in loaded:
            cfg[k] = loaded[k]
    return cfg


def changes(repo, base, head):
    """[(status, old_mode, new_mode, path)] for merge-base(base, head)..head, renames split into D + A."""
    out = gitb(repo, "diff", "--raw", "-z", "--no-renames", "--no-ext-diff", "--no-textconv", f"{base}...{head}")
    parts = out.split(b"\0")
    res, i = [], 0
    while i < len(parts) - 1:
        meta = parts[i].decode()
        if not meta.startswith(":"):
            raise GateError(f"unparseable diff record {meta!r}")
        om, nm, _, _, st = meta[1:].split(" ")
        res.append((st[0], om, nm, parts[i + 1].decode("utf-8", errors="replace")))
        i += 2
    return res


def file_at(repo, rev, path):
    try:
        return git(repo, "show", f"{rev}:{path}")
    except GateError:
        return ""


def count(repo, rev, paths, rx):
    return sum(len(rx.findall(file_at(repo, rev, p))) for p in paths)


def tests_at(repo, rev, cfg):
    return [p for p in git(repo, "ls-tree", "-r", "-z", "--name-only", rev).split("\0") if p and match(p, cfg["tests"])]


def diff_lines(repo, base, head):
    """({path: [added]}, {path: [removed]}) with textconv/ext-diff/attributes neutralised (--text)."""
    out = git(repo, "diff", "--text", "--no-ext-diff", "--no-textconv", "--no-renames", "-U0", f"{base}...{head}")
    add, rem, cur = {}, {}, None
    for line in out.splitlines():
        if line.startswith(("--- ", "+++ ")):
            name = line[4:]
            if name.startswith('"'):
                raise GateError(f"path the gate can't scan safely: {name}")  # fail closed rather than skip it
            if name != "/dev/null":
                cur = name[2:]
                add.setdefault(cur, []); rem.setdefault(cur, [])
        elif line.startswith("+"):
            add[cur].append(line[1:])
        elif line.startswith("-"):
            rem[cur].append(line[1:])
    return add, rem


def static(repo, base, head, title=""):
    v = []
    cfg = config(repo, base)
    ch = changes(repo, base, head)
    if not ch:
        v.append("empty change: nothing to verify")
    for st, om, nm, p in ch:
        if match(p, cfg["protected"]):
            v.append(f"protected path changed ({st}): {p}")
        if nm in ("120000",) or om in ("120000",):
            v.append(f"symlink change: {p}")
        if "160000" in (om, nm):
            v.append(f"submodule change: {p}")
        if nm not in ("000000", "100644", "100755", "120000", "160000"):
            v.append(f"unknown file mode {nm}: {p}")
        if st == "D" and match(p, cfg["tests"]):
            v.append(f"test file deleted: {p}")
        if st not in "AMDT":
            v.append(f"unexpected change status {st}: {p}")
    # size
    files, lines, binary = len(ch), 0, []
    for rec in git(repo, "diff", "--numstat", "-z", "--no-renames", "--text", f"{base}...{head}").split("\0"):
        if rec.strip():
            a, d, p = rec.split("\t", 2)
            if a == "-":
                binary.append(p)
            else:
                lines += int(a) + int(d)
    if files > cfg["max_files"]:
        v.append(f"too many files: {files} > {cfg['max_files']}")
    if lines > cfg["max_lines"]:
        v.append(f"too many changed lines: {lines} > {cfg['max_lines']}")
    # content of added lines
    add, rem = diff_lines(repo, base, head)
    for p, added in add.items():
        is_test = match(p, cfg["tests"])
        gone = [ln.strip() for ln in rem.get(p, []) if DECL.search(ln)]
        if is_test and set(gone) - {ln.strip() for ln in added}:
            v.append(f"test declaration removed or renamed: {p}")
        for ln in added:
            if SECRET.search(ln):
                v.append(f"secret-like value added: {p}")
                break
        if is_test and any(SKIP.search(ln) for ln in added):
            v.append(f"skip/only/todo marker added in test: {p}")
        if not is_test and CODE.search(p) and any(TEST_SNIFF.search(ln) for ln in added):
            v.append(f"source detects the test runner: {p}")
    # test integrity: the suite may grow, never shrink
    bt, ht = tests_at(repo, base, cfg), tests_at(repo, head, cfg)
    for name, rx in (("test declarations", DECL), ("assertions", ASSERT)):
        b, h = count(repo, base, bt, rx), count(repo, head, ht, rx)
        if h < b:
            v.append(f"{name} decreased: {b} -> {h}")
    # commit messages must not suppress CI
    for msg in git(repo, "log", "-z", "--format=%B", f"{base}..{head}").split("\0"):
        if CI_SKIP.search(msg):
            v.append("commit message suppresses CI")
            break
    if needs_regression(ch, cfg, title) and not any(match(p, cfg["tests"]) and st in "AM" for st, _, _, p in ch):
        v.append("fix without an added or changed test")
    return v


def is_fix(title):
    return bool(re.match(r"\s*(fix|bug|hotfix)\b", title or "", re.I))


def needs_regression(ch, cfg, title):
    """A fix needs a regression test unless it only touches docs/reports (a typo fix has no behaviour to reproduce)."""
    return is_fix(title) and any(not DOC.search(p) and not match(p, cfg["tests"]) for _, _, _, p in ch)


def run_tests(repo, rev, overlay_from, test_paths, cmd):
    """Run cmd in a clean export of rev, with test_paths taken from overlay_from. Returns exit code."""
    d = Path(tempfile.mkdtemp(prefix="sb-gate-"))
    try:
        tar = subprocess.run(["git", "-C", str(repo), "archive", rev], capture_output=True, check=True).stdout
        subprocess.run(["tar", "-x", "-C", str(d)], input=tar, check=True)
        for p in test_paths:
            dst = d / p
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(gitb(repo, "show", f"{overlay_from}:{p}"))
        return subprocess.run(cmd, shell=True, cwd=d, capture_output=True, timeout=600).returncode
    finally:
        shutil.rmtree(d, ignore_errors=True)


def regression(repo, base, head, title=""):
    cfg = config(repo, base)
    ch = changes(repo, base, head)
    if not needs_regression(ch, cfg, title):
        return []
    tp = [p for st, _, _, p in ch if st in "AM" and match(p, cfg["tests"])]
    if not tp:
        return ["fix without an added or changed test"]
    v = []
    if run_tests(repo, base, head, tp, cfg["test_cmd"]) == 0:
        v.append("new/changed tests pass on base: they don't reproduce the bug")
    if run_tests(repo, head, head, [], cfg["test_cmd"]) != 0:
        v.append("tests fail on head")
    return v


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["static", "regression"])
    ap.add_argument("--repo", default=".")
    ap.add_argument("--base", required=True)
    ap.add_argument("--head", required=True)
    ap.add_argument("--title", default="")
    a = ap.parse_args(argv)
    try:
        v = (static if a.mode == "static" else regression)(a.repo, a.base, a.head, a.title)
    except Exception as e:  # fail closed on anything unexpected
        print(f"GATE ERROR (fail closed): {e}")
        return 2
    for x in v:
        print(f"VIOLATION: {x}")
    print(f"sb-gate {a.mode}: {'FAIL' if v else 'PASS'} ({len(v)} violation(s))")
    return 1 if v else 0


if __name__ == "__main__":
    sys.exit(main())
