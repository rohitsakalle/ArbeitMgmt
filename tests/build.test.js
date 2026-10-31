import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('production channel fails explicitly rather than enabling fake billing', () => {
  const result = spawnSync(process.execPath, ['scripts/build.js'], {
    env: { ...process.env, BUILD_CHANNEL: 'production' }, encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Production release blocked: billing enforcement, legal review and device acceptance are not configured/);
});

test('Android production release fails before touching signing or tooling', () => {
  const result = spawnSync(process.execPath, ['scripts/android-build.js', 'release'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Production Android release blocked/);
});
