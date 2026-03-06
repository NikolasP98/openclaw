#!/usr/bin/env python3
"""
Comprehensive file move + import rewriter for TypeScript codebases.

Usage:
    python3 scripts/refactor-move.py <target-dir> <file1.ts> [file2.ts ...]

Handles:
  - Static imports: from "./foo.js", from "../foo.js"
  - Dynamic imports: import("./foo.js"), typeof import("./foo.js")
  - vi.mock paths: vi.mock("./foo.js", ...)
  - Sibling imports within moved files (adjusts depth)
  - Parent directory imports within moved files (adjusts depth)
"""

import os
import re
import sys
import subprocess
import glob
from pathlib import Path

ROOT = os.getcwd()

def find_ts_files(*dirs):
    """Find all .ts files in given directories."""
    files = []
    for d in dirs:
        for root, _, fnames in os.walk(d):
            for f in fnames:
                if f.endswith('.ts') and 'node_modules' not in root:
                    files.append(os.path.join(root, f))
    return files

def compute_relative(from_file, to_file):
    """Compute relative import path from one file to another."""
    from_dir = os.path.dirname(from_file)
    rel = os.path.relpath(to_file, from_dir)
    if not rel.startswith('.'):
        rel = './' + rel
    # Normalize Windows paths
    rel = rel.replace('\\', '/')
    return rel

def move_files(target_dir, source_files):
    """Move source files + associated test/harness files to target_dir."""
    os.makedirs(target_dir, exist_ok=True)

    moved = {}  # old_path -> new_path

    for src in source_files:
        src_dir = os.path.dirname(src)
        src_base = os.path.basename(src).replace('.ts', '')

        # Find all associated files (source, tests, harnesses, helpers, mocks)
        pattern = os.path.join(src_dir, f'{src_base}.*')
        associated = sorted(glob.glob(pattern))
        # Also grab files with the base name as prefix followed by dot-separated segments
        # e.g., model-catalog.test-harness.ts for model-catalog.ts

        for f in associated:
            if not f.endswith('.ts'):
                continue
            fname = os.path.basename(f)
            new_path = os.path.join(target_dir, fname)
            if os.path.exists(new_path):
                continue
            if not os.path.exists(f):
                continue

            # git mv
            result = subprocess.run(['git', 'mv', f, new_path],
                                  capture_output=True, text=True)
            if result.returncode != 0:
                # Fallback to regular move
                os.rename(f, new_path)

            moved[os.path.normpath(f)] = os.path.normpath(new_path)
            print(f'  moved: {f} -> {new_path}')

    return moved

def fix_imports(moved, scan_dirs=None):
    """Fix all import paths across the codebase."""
    if scan_dirs is None:
        scan_dirs = ['src', 'extensions', 'test']

    all_ts = find_ts_files(*[d for d in scan_dirs if os.path.isdir(d)])

    # Build lookup: old_module_path -> new_module_path (without .ts extension)
    module_map = {}
    for old_path, new_path in moved.items():
        old_mod = old_path.replace('.ts', '')
        new_mod = new_path.replace('.ts', '')
        module_map[old_mod] = new_mod

    # Also track which basenames were moved and their new directories
    moved_basenames = {}
    for old_path, new_path in moved.items():
        bn = os.path.basename(old_path).replace('.ts', '')
        moved_basenames[bn] = (os.path.dirname(old_path), os.path.dirname(new_path))

    fixed_count = 0

    for fpath in all_ts:
        fpath = os.path.normpath(fpath)
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()

        original = content
        fdir = os.path.dirname(fpath)

        # Pattern matches:
        # from "..." / from '...'
        # import("...") / import('...')
        # vi.mock("...") / vi.mock('...')
        # typeof import("...")
        import_pattern = re.compile(
            r'''(from\s+["']|import\(["']|vi\.mock\(["']|typeof\s+import\(["'])(\.\.?/[^"']+?)(\.js["'])'''
        )

        def fix_match(m):
            prefix = m.group(1)
            rel_path = m.group(2)
            suffix = m.group(3)

            # Resolve the absolute path this import points to
            abs_target = os.path.normpath(os.path.join(fdir, rel_path + '.ts'))

            # Check if this target was moved
            if abs_target in moved:
                new_abs = moved[abs_target].replace('.ts', '')
                new_rel = compute_relative(fpath, new_abs + '.ts').replace('.ts', '')
                return f'{prefix}{new_rel}{suffix}'

            # Also check without .ts for directory imports
            abs_target_mod = abs_target.replace('.ts', '')
            if abs_target_mod in {k.replace('.ts', '') for k in moved}:
                for old_p, new_p in moved.items():
                    if old_p.replace('.ts', '') == abs_target_mod:
                        new_abs = new_p.replace('.ts', '')
                        new_rel = compute_relative(fpath, new_abs + '.ts').replace('.ts', '')
                        return f'{prefix}{new_rel}{suffix}'

            return m.group(0)

        content = import_pattern.sub(fix_match, content)

        # For moved files: also fix imports to non-moved siblings
        if fpath in moved.values():
            # This file was moved - check if any relative imports are now broken
            # Find the old path
            old_path = None
            for op, np in moved.items():
                if np == fpath:
                    old_path = op
                    break

            if old_path:
                old_dir = os.path.dirname(old_path)
                new_dir = os.path.dirname(fpath)

                def fix_sibling(m):
                    prefix = m.group(1)
                    rel_path = m.group(2)
                    suffix = m.group(3)

                    # Resolve what this import would point to from the NEW location
                    target_from_new = os.path.normpath(os.path.join(new_dir, rel_path + '.ts'))

                    # Resolve what it SHOULD point to (from old location)
                    target_from_old = os.path.normpath(os.path.join(old_dir, rel_path + '.ts'))

                    # If the target from new location doesn't exist but from old does,
                    # recompute the relative path
                    if not os.path.exists(target_from_new) and os.path.exists(target_from_old):
                        # Check if target_from_old was also moved
                        if target_from_old in moved:
                            actual_target = moved[target_from_old]
                        else:
                            actual_target = target_from_old

                        new_rel = compute_relative(fpath, actual_target).replace('.ts', '')
                        return f'{prefix}{new_rel}{suffix}'

                    # Also check for directories (e.g., ./auth-profiles/constants.js)
                    target_dir_check = os.path.normpath(os.path.join(new_dir, rel_path.split('/')[0]))
                    target_dir_old = os.path.normpath(os.path.join(old_dir, rel_path.split('/')[0]))
                    if not os.path.exists(target_dir_check) and os.path.isdir(target_dir_old):
                        actual_target = os.path.normpath(os.path.join(old_dir, rel_path + '.ts'))
                        if actual_target in moved:
                            actual_target = moved[actual_target]
                        new_rel = compute_relative(fpath, actual_target).replace('.ts', '')
                        return f'{prefix}{new_rel}{suffix}'

                    return m.group(0)

                content = import_pattern.sub(fix_sibling, content)

        if content != original:
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(content)
            fixed_count += 1
            print(f'  fixed imports: {fpath}')

    return fixed_count

def main():
    if len(sys.argv) < 3:
        print(f'Usage: {sys.argv[0]} <target-dir> <file1.ts> [file2.ts ...]')
        sys.exit(1)

    target_dir = sys.argv[1]
    source_files = sys.argv[2:]

    # Validate
    for f in source_files:
        if not os.path.exists(f):
            print(f'WARNING: {f} does not exist, skipping')

    source_files = [f for f in source_files if os.path.exists(f)]

    print(f'\n=== Moving {len(source_files)} files to {target_dir} ===\n')
    moved = move_files(target_dir, source_files)

    print(f'\n=== Fixing imports ({len(moved)} files moved) ===\n')
    fixed = fix_imports(moved)

    print(f'\n=== Done: {len(moved)} moved, {fixed} files had imports updated ===')

if __name__ == '__main__':
    main()
