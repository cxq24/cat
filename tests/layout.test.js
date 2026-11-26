import test from 'node:test';
import assert from 'node:assert/strict';
import { windowInsets } from '../src/layout.js';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

test('content clears status bar and full capsule using container coordinates once', () => {
  assert.deepEqual(windowInsets({ windowHeight: 844, windowWidth: 390, statusBarHeight: 47, screenTop: 0, safeArea: rect(0, 47, 390, 763), menuButtons: { capsule: rect(284, 52, 96, 32) } }), { top: 92, bottom: 34 });
});

test('already inset container does not add status bar height twice', () => {
  assert.deepEqual(windowInsets({ windowHeight: 797, windowWidth: 390, statusBarHeight: 47, screenTop: 47, safeArea: rect(0, 0, 390, 797), menuButtons: {} }), { top: 0, bottom: 0 });
});

test('independent native controls and invalid capsule use the lowest visible button', () => {
  assert.deepEqual(windowInsets({ windowHeight: 800, windowWidth: 390, safeArea: rect(0, 24, 390, 776), menuButtons: { capsule: rect(0, 0, 0, 0), back: rect(10, 30, 32, 32), share: rect(320, 32, 32, 35), me: null } }), { top: 75, bottom: 0 });
});

test('missing safe area can use status bar relative to container origin', () => {
  assert.deepEqual(windowInsets({ statusBarHeight: 24, screenTop: 0 }), { top: 32, bottom: null });
  assert.equal(windowInsets({}), null);
  assert.equal(windowInsets(null), null);
});
