import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateManifest } from '../scripts/platform/schema.mjs';

const manifest = JSON.parse(readFileSync(new URL('../public/game.json', import.meta.url), 'utf8'));
const draft = { ...manifest, slug: 'game-template', status: 'draft' };

test('published game.json passes manifest schema for voxel-frontier', () => {
  const validated = validateManifest(manifest, 'voxel-frontier');
  assert.equal(validated.slug, 'voxel-frontier');
  assert.equal(validated.status, 'published');
  assert.equal(validated.dimension, '3D');
  assert.deepEqual(validated.supportedDevices, ['desktop']);
});

test('new template repositories stay drafts until the owner fills their slug', () => {
  assert.equal(validateManifest(draft, 'new-game').status, 'draft');
  assert.throws(() => validateManifest({ ...draft, status: 'published' }, 'new-game'), /slug/);
  assert.equal(validateManifest({ ...draft, slug: 'new-game', status: 'published' }, 'new-game').slug, 'new-game');
});

test('invalid metadata and address overrides cannot enter the catalog', () => {
  for (const patch of [
    { schemaVersion: 2 },
    { status: 'ready' },
    { title: '' },
    { categories: [] },
    { dimension: '4D' },
    { accent: 'blue' },
    { featured: 'true' },
    { startQuery: '//other.example' },
  ]) {
    assert.throws(() => validateManifest({ ...draft, ...patch }));
  }
});

test('device declarations accept supported targets and reject invalid lists', () => {
  for (const supportedDevices of [['desktop'], ['desktop', 'mobile']]) {
    assert.doesNotThrow(() => validateManifest({ ...draft, supportedDevices }));
  }
  for (const supportedDevices of [[], ['console'], ['desktop', 'desktop'], 'desktop']) {
    assert.throws(() => validateManifest({ ...draft, supportedDevices }), /supportedDevices/);
  }
});
