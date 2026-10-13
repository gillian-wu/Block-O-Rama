// Unit tests for src/ui.js, run in a bare VM context with a fake `chrome`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');

// BOM_UI as loaded on a page where `chrome` is `chrome`.
function loadUI(chrome) {
  const sandbox = { chrome };
  vm.createContext(sandbox);
  vm.runInContext(`${source}\nglobalThis.BOM_UI = BOM_UI;`, sandbox);
  const UI = sandbox.BOM_UI;
  // Objects made in the VM have its Object.prototype; copy for deepEqual.
  return { sendToBackground: async (msg) => structuredClone(await UI.sendToBackground(msg)) };
}

const STALE = { ok: false, error: 'Block-O-Rama was updated or reloaded. Refresh this page and try again.' };

test('sendToBackground: passes the message on and returns the reply', async () => {
  const sent = [];
  const UI = loadUI({ runtime: { id: 'x', sendMessage: async (m) => (sent.push(m), { ok: true }) } });
  assert.deepEqual(await UI.sendToBackground({ type: 't' }), { ok: true });
  assert.deepEqual(sent, [{ type: 't' }]);
});

test('sendToBackground: asks for a refresh when the extension was reloaded', async () => {
  // Chrome removes chrome.runtime, or leaves it without an id, from a
  // content script orphaned by a reload.
  assert.deepEqual(await loadUI(undefined).sendToBackground({}), STALE);
  assert.deepEqual(await loadUI({}).sendToBackground({}), STALE);
  assert.deepEqual(await loadUI({ runtime: {} }).sendToBackground({}), STALE);
  const invalidated = async () => {
    throw new Error('Extension context invalidated.');
  };
  assert.deepEqual(await loadUI({ runtime: { id: 'x', sendMessage: invalidated } }).sendToBackground({}), STALE);
});

test('sendToBackground: reports other errors as they are', async () => {
  const fail = async () => {
    throw new Error('Could not establish connection.');
  };
  assert.deepEqual(await loadUI({ runtime: { id: 'x', sendMessage: fail } }).sendToBackground({}), {
    ok: false,
    error: 'Could not establish connection.',
  });
});
