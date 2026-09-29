import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
async function walk(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory()
          ? walk(path.join(root, e.name))
          : path.join(root, e.name),
      ),
    )
  ).flat();
}
const files = await walk('dist');
for (const file of files.filter((f) => /\.(?:html|js|css)$/.test(f))) {
  const text = await readFile(file, 'utf8');
  for (const forbidden of [
    /localhost/i,
    /127\.0\.0\.1/,
    /__TAURI/,
    /@tauri-apps/,
    /invoke\(['"](?:save_session|load_session)/,
    /\/workspace\//,
    /\/home\//,
    /https?:\/\/[^\s"'<>]+\.(?:js|css)(?:["'\s]|$)/i,
  ]) {
    if (forbidden.test(text))
      throw new Error(
        `Forbidden primary-build dependency ${forbidden}: ${file}`,
      );
  }
  if (file.endsWith('.html')) {
    for (const [, url] of text.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (!url.startsWith('./'))
        throw new Error(`Non-relative asset/link: ${url} in ${file}`);
      await access(path.join(path.dirname(file), url));
    }
  }
}
const html = await readFile('dist/index.html', 'utf8');
if (/type="module"/.test(html))
  throw new Error(
    'File-protocol build must use the classic self-contained script.',
  );
if (!html.includes('defer src="./assets/'))
  throw new Error('Missing static entry script.');
console.log(
  `PASS: ${files.length} packaged files; relative assets resolve; no loopback/Tauri/desktop dependency in production files.`,
);
