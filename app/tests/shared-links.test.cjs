const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('../web/links.js');
test('preserves timestamps from YouTube share link formats', () => {
  for (const suffix of ['?t=90', '?t=90s', '?t=1m30s', '?start=90', '#t=90']) assert.equal(parse(`https://youtu.be/abcdefghijk${suffix}`).at, 90);
  assert.equal(parse('https://www.youtube.com/watch?v=abcdefghijk&t=1h2m3s').at, 3723);
});
test('accepts share messages but rejects lookalike hosts and unrelated links', () => {
  assert.equal(parse('Watch this: https://youtu.be/abcdefghijk?t=12.').at, 12);
  assert.equal(parse('https://example.com/other https://www.youtube.com/watch?v=abcdefghijk').id, 'abcdefghijk');
  assert.throws(() => parse('https://youtube.com.evil.test/watch?v=abcdefghijk'));
  assert.throws(() => parse('javascript:alert(1)'));
});
test('invalid or excessive timestamps are surfaced instead of silently reset', () => {
  for (const time of ['-10', 'invalid', '', '999999999h']) assert.throws(() => parse(`https://youtu.be/abcdefghijk?t=${time}`));
});
