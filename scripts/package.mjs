import { buildApp } from './build.mjs';
import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

await buildApp();
await buildApp('.preview', true);
await mkdir('artifacts', { recursive: true });
execFileSync('python3', ['-c', `
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
for directory, name in [('dist', 'cat-cafe-platform-candidate.zip'), ('.preview', 'cat-cafe-browser-preview.zip')]:
    root = Path(directory)
    with ZipFile(Path('artifacts') / name, 'w', ZIP_DEFLATED) as archive:
        for file in sorted(root.rglob('*')):
            if file.is_file():
                archive.write(file, file.relative_to(root))
    with ZipFile(Path('artifacts') / name) as archive:
        assert archive.testzip() is None
        assert archive.namelist().count('index.html') == 1
        assert all(Path(item).suffix in ['.html', '.css', '.js', '.png'] for item in archive.namelist())
    print(name, (Path('artifacts') / name).stat().st_size, 'bytes')
`], { stdio: 'inherit' });
