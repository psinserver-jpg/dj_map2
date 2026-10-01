"""Generate gzip JSON assets without changing the original data files."""
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'data' / 'regions'
original = compressed = 0
for folder in sorted(ROOT.iterdir()):
    if not folder.is_dir():
        continue
    for name in ('meta', 'points'):
        source = folder / (name + '.js')
        text = source.read_text(encoding='utf-8')
        body = text.split('=', 1)[1].strip().removesuffix(';').strip().encode('utf-8')
        json.loads(body)
        packed = gzip.compress(body, compresslevel=6, mtime=0)
        (folder / (name + '.json.gz')).write_bytes(packed)
        original += source.stat().st_size
        compressed += len(packed)
print(json.dumps({'originalBytes': original, 'compressedBytes': compressed, 'reductionPercent': round(100 * (1 - compressed / original), 1)}))
