import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber as f, formatInt, formatDuration, parseNumber } from '../engine/format.js';
import { D } from '../engine/decimal.js';

test('standard notation', () => {
  assert.equal(f(0), '0');
  assert.equal(f(999), '999');
  assert.equal(f(1234), '1,23 K');
  assert.equal(f(12345), '12,3 K');
  assert.equal(f(1.5e6), '1,50 Mio');
  assert.equal(f(2e9), '2,00 Mrd');
  assert.equal(f(999999), '1,00 Mio');
  assert.equal(f(D('1e33')), '1,00 Qid');
  assert.equal(f(D('1e36')), '1,00e36');
  assert.equal(f(-5000), '-5,00 K');
  assert.equal(f(0.5), '0,500');
  assert.equal(f(12.345), '12,3');
});
test('scientific and engineering', () => {
  assert.equal(f(1234, { notation: 'scientific' }), '1,23e3');
  assert.equal(f(D('9.999e20'), { notation: 'scientific' }), '1,00e21');
  assert.equal(f(D('1.5e45'), { notation: 'engineering' }), '1,50e45');
  assert.equal(f(D('1.5e46'), { notation: 'engineering' }), '15,0e45');
  assert.equal(f(D('1e1000'), { notation: 'standard' }), '1,00e1000');
});
test('formatInt, duration, parse', () => {
  assert.equal(formatInt(12345), '12345');
  assert.equal(formatInt(D('5e8')), '500 Mio');
  assert.equal(formatDuration(65), '1 Min 05 s');
  assert.equal(formatDuration(3 * 3600 + 120), '3 Std 02 Min');
  assert.equal(formatDuration(90000), '1 d 1 Std');
  assert.equal(parseNumber('1e5').toNumber(), 1e5);
  assert.equal(parseNumber('1,5 Mio').toNumber(), 1.5e6);
  assert.equal(parseNumber('abc'), null);
});
