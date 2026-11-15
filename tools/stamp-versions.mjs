// Pins every script and the stylesheet in index.html to a content hash, so a deploy can never mix old and new files
// from the browser cache (GitHub Pages caches each file for 10 minutes). Run before committing changes to js/ or css/:
//   node tools/stamp-versions.mjs        (npm run stamp; `npm run stamp -- --check` fails if index.html is stale)
// The import map rewrites every module URL, including imports between modules, so each file has exactly one URL.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hash = (file) => createHash('sha256').update(readFileSync(join(root, file))).digest('hex').slice(0, 10);
const scripts = readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js')).sort();
const imports = Object.fromEntries(scripts.map((f) => [`./js/${f}`, `./js/${f}?v=${hash(`js/${f}`)}`]));
const map = `<script type="importmap">\n${JSON.stringify({ imports }, null, 2).split('\n').map((l) => '  ' + l).join('\n')}\n  </script>`;
const htmlPath = join(root, 'index.html');
const before = readFileSync(htmlPath, 'utf8');
let html = before
  .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace(/<link rel="stylesheet" href="css\/styles\.css[^"]*">/, `<link rel="stylesheet" href="css/styles.css?v=${hash('css/styles.css')}">`)
  .replace(/<script type="module" src="(?:\.\/)?js\/app\.js[^"]*"><\/script>/, `${map}\n  <script type="module" src="${imports['./js/app.js']}"></script>`);
if (process.argv.includes('--check')) {
  if (html !== before) { console.error('index.html is out of date: run npm run stamp'); process.exit(1); }
  console.log('index.html versions are current');
} else {
  writeFileSync(htmlPath, html);
  console.log(html === before ? 'index.html already current' : 'index.html stamped');
}
