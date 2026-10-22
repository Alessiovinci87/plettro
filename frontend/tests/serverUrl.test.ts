import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsHttps } from '../src/pages/serverUrl';

test('pagina https e server http in rete: serve https', () => {
  assert.equal(needsHttps('https:', 'http://192.168.1.20:8000'), true);
  assert.equal(needsHttps('https:', 'HTTP://pc-di-casa:8000'), true);
});

test('localhost è ammesso anche da https', () => {
  assert.equal(needsHttps('https:', 'http://localhost:8000'), false);
  assert.equal(needsHttps('https:', 'http://127.0.0.1:8000'), false);
  assert.equal(needsHttps('https:', 'http://[::1]:8000'), false);
});

test('nessun avviso con server https o pagina http', () => {
  assert.equal(needsHttps('https:', 'https://abc.trycloudflare.com'), false);
  assert.equal(needsHttps('http:', 'http://192.168.1.20:8000'), false);
});
