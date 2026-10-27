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
