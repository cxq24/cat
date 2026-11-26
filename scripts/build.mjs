import { build } from 'esbuild';
import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function buildApp(directory = 'dist', preview = false) {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  await build({ entryPoints: ['src/app.js'], bundle: true, format: 'iife', target: ['es2017', 'chrome61'], outfile: path.join(directory, 'app.js'), minify: false, legalComments: 'none', charset: 'utf8' });
  let html = await readFile('index.html', 'utf8');
  if (preview) {
    html = html.replace('<script src="./app.js"', '<script src="./preview.js"></script>\n    <script src="./app.js"');
    await cp('scripts/preview.js', path.join(directory, 'preview.js'));
  }
  await writeFile(path.join(directory, 'index.html'), html);
  await cp('public/assets', path.join(directory, 'assets'), { recursive: true });
  console.log(`Built ${directory} (${preview ? 'browser simulator' : 'platform package'})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await buildApp();
