"""Behavioral checks for portable installation, dependencies, drift and deterministic delivery."""
import importlib.util
import json
import tempfile
import unittest
import zipfile
import io
from pathlib import Path

spec = importlib.util.spec_from_file_location('manage', Path(__file__).with_name('manage.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class PackageTests(unittest.TestCase):
    def test_integrity(self):
        manifest = m.validate()
        self.assertGreaterEqual(len(manifest['skills']), 16)

    def test_install_external_and_dependencies_without_overwrite(self):
        manifest = m.validate()
        with tempfile.TemporaryDirectory() as folder:
            dest = Path(folder) / 'external'
            ids = m.install(m.ROOT, manifest, dest)
            self.assertNotIn('amc-autopilot', ids)
            self.assertNotIn('amc-knowledge', ids)
            self.assertIn('amc-content-copywriting', ids)
            self.assertTrue((dest / 'amc-kanban/references/kanban-openapi.yaml').is_file())
            self.assertTrue((dest / 'brand-intelligence-intake/references/evidence-contract.md').is_file())
            original = (dest / 'amc-marketing-expert/SKILL.md').read_bytes()
            with self.assertRaisesRegex(ValueError, 'overwrite'):
                m.install(m.ROOT, manifest, dest)
            self.assertEqual((dest / 'amc-marketing-expert/SKILL.md').read_bytes(), original)
            deps = Path(folder) / 'dependency-install'
            installed = m.install(m.ROOT, manifest, deps, ['amc-brand-planning'])
            self.assertEqual(installed, ['amc-marketing-expert', 'amc-brand-planning'])

    def test_install_all(self):
        manifest = m.validate()
        with tempfile.TemporaryDirectory() as folder:
            ids = m.install(m.ROOT, manifest, Path(folder) / 'all', profile='all')
            self.assertEqual(len(ids), len(manifest['skills']))

    def test_consumer_drift_and_legacy_platform_metadata(self):
        manifest = m.validate()
        with tempfile.TemporaryDirectory() as folder:
            mappings = ['kanban=' + folder, 'growth=' + folder]
            m.consumers(m.ROOT, manifest, mappings, write=True)
            m.consumers(m.ROOT, manifest, mappings)
            legacy = Path(folder) / 'src/agents/skills/platforms/instagram/SKILL.md'
            self.assertIn('\nplatform: instagram\n', legacy.read_text())
            (Path(folder) / 'skills/amc-marketing-expert/SKILL.md').write_text('unreviewed drift')
            with self.assertRaisesRegex(ValueError, 'drift'):
                m.consumers(m.ROOT, manifest, mappings)

    def test_paths_and_symlinks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for path in ['../outside', '/absolute']:
                with self.assertRaises(ValueError):
                    m.inside(root, path)
            (root / 'link').symlink_to(root.parent, target_is_directory=True)
            with self.assertRaises(ValueError):
                m.inside(root, 'link/escape')
            with self.assertRaisesRegex(ValueError, 'symlink'):
                m.install(m.ROOT, m.validate(), root / 'link/install', ['amc-marketing-expert'])

    def test_content_code_snapshot_drift(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'package'
            defaults = root / 'skills/amc-content-copywriting/references/content-defaults.json'
            defaults.parent.mkdir(parents=True)
            consumer = Path(folder) / 'consumer'
            (consumer / 'src').mkdir(parents=True)
            code = consumer / 'src/rules.ts'
            code.write_bytes(b'reviewed code')
            defaults.write_text(json.dumps({'sourceHashes': {'src/rules.ts': m.digest(code.read_bytes())}}))
            m.consumers(root, {'mirrors': []}, ['content=' + str(consumer)])
            code.write_bytes(b'new rules')
            with self.assertRaisesRegex(AssertionError, 're-export'):
                m.consumers(root, {'mirrors': []}, ['content=' + str(consumer)])

    def test_archive_is_deterministic_and_self_contained(self):
        first = m.artifacts()
        self.assertEqual(first, m.artifacts())
        with zipfile.ZipFile(io.BytesIO(first['amc-skills.zip'])) as archive:
            names = archive.namelist()
            self.assertIn('amc-skills/scripts/manage.py', names)
            self.assertIn('amc-skills/skills/amc-content-copywriting/references/content-defaults.json', names)
            self.assertNotIn('amc-skills/SKILL.md', names)
            self.assertFalse(any('/__pycache__/' in n or '..' in Path(n).parts for n in names))
            self.assertEqual(archive.read('amc-skills/manifest.json'), (m.ROOT / 'manifest.json').read_bytes())


if __name__ == '__main__':
    unittest.main()
