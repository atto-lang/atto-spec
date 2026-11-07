#!/usr/bin/env python3
"""Verify raw worktree bytes against exact HEAD tree without Git clean filters.

Source-free checkout integrity only. Not GitHub runner or compiler evidence.
"""
import hashlib
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile

MAX_FILE_BYTES = 8 * 1024 * 1024


class CheckoutError(RuntimeError):
    pass


def git(root: Path, *args: str) -> bytes:
    return subprocess.check_output(
        ["git", "-c", "core.fsmonitor=false", *args],
        cwd=root, stderr=subprocess.PIPE,
    )


def same_file(before, after) -> bool:
    return (before.st_dev, before.st_ino, before.st_mode,
            before.st_size, before.st_mtime_ns, before.st_ctime_ns) == (
            after.st_dev, after.st_ino, after.st_mode,
            after.st_size, after.st_mtime_ns, after.st_ctime_ns)


def raw_blob_sha(path: Path, expected_mode: bytes, fmt: str) -> bytes:
    parents = list(path.parents)
    for parent in parents[:-1]:
        if parent.is_symlink():
            raise CheckoutError("symlinked parent in worktree path")
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
        raise CheckoutError("tracked item is not a unique regular file")
    if before.st_size > MAX_FILE_BYTES:
        raise CheckoutError("tracked file exceeds 8 MiB checkout limit")
    if bool(before.st_mode & stat.S_IXUSR) != (expected_mode == b"100755"):
        raise CheckoutError("tracked file executable mode changed")
    if not hasattr(os, "O_NOFOLLOW") or not hasattr(os, "O_NONBLOCK"):
        raise CheckoutError("platform lacks nofollow/nonblock flags")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        opened = os.fstat(fd)
        if not same_file(before, opened):
            raise CheckoutError("tracked file changed before read")
        h = hashlib.new(fmt)
        h.update(b"blob " + str(opened.st_size).encode("ascii") + b"\0")
        remaining = opened.st_size
        while remaining:
            data = os.read(fd, min(65536, remaining))
            if not data:
                raise CheckoutError("short raw file read")
            h.update(data)
            remaining -= len(data)
        if not same_file(opened, os.fstat(fd)) or not same_file(opened, path.lstat()):
            raise CheckoutError("tracked file changed while hashing")
        return h.hexdigest().encode("ascii")
    finally:
        os.close(fd)


def verify(root: Path) -> int:
    root = root.absolute()
    if root.is_symlink() or not root.is_dir():
        raise CheckoutError("checkout root must be an actual directory")
    if git(root, "rev-parse", "--show-toplevel").strip() != os.fsencode(str(root)):
        raise CheckoutError("must inspect exactly the Git top-level checkout")
    if git(root, "write-tree").strip() != git(root, "rev-parse", "HEAD^{tree}").strip():
        raise CheckoutError("index does not match HEAD tree")
    if git(root, "ls-files", "--others", "-z"):
        raise CheckoutError("untracked worktree files, including ignored files")
    fmt = git(root, "rev-parse", "--show-object-format").strip().decode("ascii")
    if fmt not in ("sha1", "sha256"):
        raise CheckoutError("unsupported Git object format")
    entries = git(root, "ls-files", "--stage", "-z").split(b"\0")
    seen = set()
    for entry in entries:
        if not entry:
            continue
        header, tab, raw_name = entry.partition(b"\t")
        parts = header.split()
        if not tab or len(parts) != 3 or parts[2] != b"0":
            raise CheckoutError("malformed or unmerged index")
        mode, sha, _stage = parts
        if mode not in (b"100644", b"100755"):
            raise CheckoutError("symlink, submodule or unsupported index mode")
        path = Path(os.fsdecode(raw_name))
        if path.is_absolute() or ".." in path.parts or not path.parts or raw_name in seen:
            raise CheckoutError("unsafe or duplicate tracked path")
        seen.add(raw_name)
        if raw_blob_sha(root / path, mode, fmt) != sha:
            raise CheckoutError("raw checked-out bytes differ from indexed Git blob")
    if not seen:
        raise CheckoutError("empty worktree")
    return len(seen)


def self_test() -> None:
    with tempfile.TemporaryDirectory(prefix="atto-spec-checkout-") as d:
        root = Path(d)
        git(root, "init", "-q")
        (root / ".gitignore").write_text("ignored.txt\n")
        (root / "example.atto").write_text("safe\n")
        git(root, "add", ".gitignore", "example.atto")
        git(root, "-c", "user.name=CI", "-c", "user.email=ci@example.invalid", "commit", "-qm", "baseline")
        if verify(root) != 2:
            raise CheckoutError("clean baseline was not accepted")
        (root / "example.atto").write_text("changed\n")
        try:
            verify(root)
        except CheckoutError:
            pass
        else:
            raise CheckoutError("modified tracked file went undetected")
        (root / "example.atto").write_text("safe\n")
        for name in ("untracked.txt", "ignored.txt"):
            (root / name).write_text("inject")
            try:
                verify(root)
            except CheckoutError:
                pass
            else:
                raise CheckoutError("untracked file went undetected: " + name)
            (root / name).unlink()
        (root / "example.atto").chmod(0o755)
        try:
            verify(root)
        except CheckoutError:
            pass
        else:
            raise CheckoutError("file-mode mutation went undetected")
        (root / "example.atto").chmod(0o644)
        (root / "staged.txt").write_text("staged")
        git(root, "add", "staged.txt")
        try:
            verify(root)
        except CheckoutError:
            pass
        else:
            raise CheckoutError("staged tree mutation went undetected")
    print("ATTO_SPEC_RAW_CHECKOUT_SELF_TEST_PASS clean=1 mutants=5")


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--self-test"]:
            self_test()
        elif len(sys.argv) == 2:
            print(f"ATTO_SPEC_RAW_HEAD_MATCH files={verify(Path(sys.argv[1]))}")
        else:
            raise CheckoutError("usage: verify_raw_checkout.py <root>|--self-test")
    except (CheckoutError, OSError, subprocess.CalledProcessError) as exc:
        print("ATTO_SPEC_RAW_CHECKOUT_NOT_VERIFIED: " + str(exc), file=sys.stderr)
        sys.exit(2)
