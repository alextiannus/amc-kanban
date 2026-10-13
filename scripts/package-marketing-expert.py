"""Build the installable, deterministic Skill archive from its reviewed sources."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
name = 'amc-marketing-expert'
target = root / 'public' / 'skills' / (name + '.zip')
target.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(target, 'w', compression=ZIP_DEFLATED) as archive:
    for relative in ['SKILL.md', 'agents/openai.yaml']:
        info = ZipInfo(f'{name}/{relative}', date_time=(2026, 10, 13, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, (root / 'skills' / name / relative).read_bytes())
print(target)
