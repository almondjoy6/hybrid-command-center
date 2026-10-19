import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireStandardUser} from './host.js';

test('elevated or unknown launch context is refused before native app startup', () => {
  for (const elevated of [true, undefined, null, 'false']) {
    assert.throws(() => requireStandardUser(elevated), /non-administrator terminal.*no test application was launched/);
  }
});

test('verified non-elevated launch context is allowed', () => {
  assert.doesNotThrow(() => requireStandardUser(false));
});
