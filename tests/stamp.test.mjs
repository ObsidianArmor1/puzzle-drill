// index.html must pin the current content hash of every script and the stylesheet (npm run stamp).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('index.html script/style versions are current', () => {
  const r = spawnSync(process.execPath, [new URL('../tools/stamp-versions.mjs', import.meta.url).pathname, '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
