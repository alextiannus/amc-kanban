#!/usr/bin/env python3
"""Manage the AMC Skill package using only Python's standard library."""
import argparse
import hashlib
import io
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def digest(body):
    return hashlib.sha256(body).hexdigest()


def inside(root, relative):
    part = Path(relative)
    if part.is_absolute() or '..' in part.parts or not part.parts:
        raise ValueError('Unsafe relative path: ' + str(relative))
    path = root / part
    for parent in [path, *path.parents]:
        if parent == root:
            break
        if parent.is_symlink():
            raise ValueError('Symlink is not allowed: ' + str(path))
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('Path escapes root: ' + str(path))
    return path


def read_manifest(root=ROOT):
    return json.loads((root / 'manifest.json').read_text())


def skill_files(root=ROOT):
    files = {}
    for path in sorted((root / 'skills').rglob('*')):
        if path.is_symlink():
            raise ValueError('Symlink is not distributable: ' + str(path))
        if path.is_file():
            files[str(path.relative_to(root))] = path.read_bytes()
    return files


def skill_version(entry, hashes):
    relevant = {name: value for name, value in hashes.items() if name.startswith(entry['path'] + '/')}
    return 'sha256:' + digest(json.dumps(relevant, sort_keys=True).encode())


def selected(manifest, ids=None, profile='external'):
    index = {s['id']: s for s in manifest['skills']}
    names = ids or [s['id'] for s in manifest['skills'] if profile == 'all' or s['audience'] == 'external']
    result = []
    active = set()

    def visit(name):
        if name not in index:
            raise ValueError('Unknown Skill: ' + name)
        if name in active:
            raise ValueError('Skill dependency cycle: ' + name)
        if name in result:
            return
        active.add(name)
        for dependency in index[name]['dependsOn']:
            visit(dependency)
        active.remove(name)
        result.append(name)

    for name in names:
        visit(name)
    return [index[name] for name in result]


def validate(root=ROOT):
    m = read_manifest(root)
    assert m['schemaVersion'] == 1
    names = [s['id'] for s in m['skills']]
    assert len(names) == len(set(names)), 'Duplicate Skill IDs'
    actual_dirs = {p.name for p in (root / 'skills').iterdir() if p.is_dir()}
    assert actual_dirs == set(names), 'Unlisted or missing Skill directory'
    for entry in m['skills']:
        name = entry['id']
        assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name) and len(name) <= 64
        assert entry['path'] == 'skills/' + name
        assert entry['audience'] in ['external', 'host', 'repository', 'compatibility']
        selected(m, [name])
        folder = inside(root, entry['path'])
        text = (folder / 'SKILL.md').read_text()
        assert text.startswith('---\n'), name + ': missing frontmatter'
        header = text[4:].split('\n---\n', 1)[0]
        assert re.search(r'^name: ' + re.escape(name) + r'$', header, re.M), name + ': name mismatch'
        assert re.search(r'^description: .+', header, re.M), name + ': description missing'
        for item in folder.rglob('*'):
            if item.is_symlink():
                raise ValueError('Symlink is not distributable: ' + str(item))
            if not item.is_file():
                continue
            inside(root, str(item.relative_to(root)))
            if item.suffix != '.md':
                continue
            content = item.read_text()
            assert 'file:///Users/' not in content and '/Users/alextian/' not in content, str(item) + ': machine-specific path'
            # Validate actual relative Markdown links; ignore web links and template paths.
            for link in re.findall(r'\]\(([^)]+)\)', content):
                link = link.split('#', 1)[0].strip('<>')
                if not link or ':' in link or '{' in link or ' ' in link:
                    continue
                resolved = (item.parent / link).resolve()
                assert resolved.is_relative_to(folder.resolve()) or any(
                    resolved.is_relative_to(inside(root, e['path']).resolve())
                    for e in selected(m, [name]) if e['id'] != name
                ), str(item) + ': undeclared external dependency ' + link
                assert resolved.exists(), str(item) + ': broken link ' + link
    actual = {name: digest(body) for name, body in skill_files(root).items()}
    assert actual == m['files'], 'Manifest hashes stale; review source changes then run refresh'
    for entry in m['skills']:
        assert entry['version'] == skill_version(entry, actual), 'Stale Skill version: ' + entry['id']
    targets = set()
    for mirror in m['mirrors']:
        source = inside(root, mirror['source'])
        assert source.is_file()
        inside(Path('/consumer'), mirror['target'])
        assert mirror['consumer'] in ['kanban', 'growth', 'content']
        key = (mirror['consumer'], mirror['target'])
        assert key not in targets, 'Duplicate consumer destination'
        targets.add(key)
    return m


def mirror_bytes(root, entry):
    body = inside(root, entry['source']).read_bytes()
    if 'platformLegacy' in entry:
        # Preserve the old loader's flat metadata without weakening the canonical Skill format.
        extra = ''.join(k + ': ' + v + '\n' for k, v in entry['platformLegacy'].items())
        body = body.replace(b'\n---\n', ('\n' + extra + '---\n').encode(), 1)
    return body


def consumers(root, m, mappings, write=False):
    drift = []
    for spec in mappings:
        name, location = spec.split('=', 1)
        if name not in ['kanban', 'growth', 'content']:
            raise ValueError('Unknown consumer: ' + name)
        target_root = Path(location).resolve()
        if name == 'content':
            defaults = json.loads((root / 'skills/amc-content-copywriting/references/content-defaults.json').read_text())
            for relative, expected in defaults['sourceHashes'].items():
                assert digest(inside(target_root, relative).read_bytes()) == expected, 'Content code changed; re-export repository defaults: ' + relative
        for entry in m['mirrors']:
            if entry['consumer'] != name:
                continue
            target = inside(target_root, entry['target'])
            expected = mirror_bytes(root, entry)
            if not target.exists() or target.read_bytes() != expected:
                if not write:
                    drift.append(name + ':' + entry['target'])
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(expected)
    if drift:
        raise ValueError('Consumer drift; edit canonical package, then sync:\n' + '\n'.join(drift))


def archive_bytes(files):
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for relative, body in sorted(files.items()):
            item = zipfile.ZipInfo(relative, (2026, 10, 18, 0, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            item.external_attr = 0o644 << 16
            archive.writestr(item, body)
    return out.getvalue()


def artifacts(root=ROOT):
    # Include package instructions and installer so the whole ZIP remains independently usable.
    files = {str(p.relative_to(root)): p.read_bytes() for folder in ['skills', 'scripts']
             for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts}
    for name in ['README.md', 'manifest.json', 'package.json']:
        files[name] = (root / name).read_bytes()
    full = archive_bytes({'amc-skills/' + name: body for name, body in files.items()})
    marketing = archive_bytes({'amc-marketing-expert/' + str(p.relative_to(root / 'skills/amc-marketing-expert')): p.read_bytes()
                               for p in sorted((root / 'skills/amc-marketing-expert').rglob('*')) if p.is_file()})
    return {'amc-skills.zip': full, 'amc-marketing-expert.zip': marketing}


def install(root, m, destination, ids=None, profile='external'):
    target_root = Path(destination).expanduser().absolute()
    # Check every parent, including destination itself; never follow a user-controlled symlink.
    system_aliases = {Path('/var'): Path('/private/var'), Path('/tmp'): Path('/private/tmp')}
    if any(p.is_symlink() and system_aliases.get(p) != p.resolve()
           for p in [target_root, *target_root.parents]):
        raise ValueError('Installation destination contains a symlink')
    chosen = selected(m, ids, profile)
    for entry in chosen:
        target = inside(target_root, entry['id'])
        if target.exists():
            raise ValueError('Refusing to overwrite existing Skill: ' + str(target))
    target_root.mkdir(parents=True, exist_ok=True)
    installed = []
    try:
        for entry in chosen:
            target = inside(target_root, entry['id'])
            target.mkdir()  # Atomically claim this new directory; never overwrite a racing writer.
            installed.append(target)
            shutil.copytree(inside(root, entry['path']), target, dirs_exist_ok=True)
    except Exception:
        for target in installed:
            shutil.rmtree(target)
        raise
    return [e['id'] for e in chosen]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['list', 'refresh', 'check', 'sync', 'build', 'install'])
    parser.add_argument('--consumer', action='append', default=[], metavar='NAME=PATH')
    parser.add_argument('--archive-dir')
    parser.add_argument('--dest')
    parser.add_argument('--skill', action='append')
    parser.add_argument('--profile', choices=['external', 'all'], default='external')
    args = parser.parse_args()
    if args.command == 'refresh':
        m = read_manifest()
        m['files'] = {name: digest(body) for name, body in skill_files().items()}
        for entry in m['skills']:
            entry['version'] = skill_version(entry, m['files'])
            text = (ROOT / entry['path'] / 'SKILL.md').read_text()
            description = re.search(r'^description: (.+)$', text.split('\n---\n', 1)[0], re.M).group(1)
            entry['description'] = json.loads(description) if description.startswith('"') else description
        (ROOT / 'manifest.json').write_text(json.dumps(m, ensure_ascii=False, indent=2) + '\n')
    m = validate()
    if args.command == 'list':
        for entry in m['skills']:
            print(entry['id'] + '\t' + entry['audience'] + '\t' + entry['category'])
    elif args.command in ['check', 'sync']:
        consumers(ROOT, m, args.consumer, write=args.command == 'sync')
        if args.archive_dir:
            for name, body in artifacts().items():
                assert (Path(args.archive_dir) / name).read_bytes() == body, 'Stale archive: ' + name
        print('PASS: package integrity' + (', consumer consistency' if args.consumer else ''))
    elif args.command == 'build':
        if not args.archive_dir:
            parser.error('build requires --archive-dir')
        dest = Path(args.archive_dir)
        dest.mkdir(parents=True, exist_ok=True)
        for name, body in artifacts().items():
            (dest / name).write_bytes(body)
            print(name + '\t' + digest(body))
    elif args.command == 'install':
        if not args.dest:
            parser.error('install requires an explicit --dest')
        print(json.dumps({'installed': install(ROOT, m, args.dest, args.skill, args.profile)}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (AssertionError, ValueError, OSError) as error:
        print('ERROR: ' + str(error), file=sys.stderr)
        sys.exit(1)
