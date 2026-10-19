import test from 'node:test';
import assert from 'node:assert/strict';
import {recordSamples, utilizationPath, HISTORY_MS} from './telemetry.js';

test('telemetry preserves zero and records unavailable values and devices as gaps', () => {
  const old = recordSamples({}, [{index: 0, util: 42}, {index: 1, util: 10}], 0);
  const next = recordSamples(old, [{index: 0, util: 0}, {index: 2, util: null}, {index: 3, util: 150}], 2000);
  assert.deepEqual(next[0], [{at: 0, value: 42}, {at: 2000, value: 0}]);
  for (const id of [1, 2, 3]) assert.equal(next[id].at(-1).value, null);
  assert.equal(old[0].length, 1);
});

test('telemetry history remains bounded', () => {
  let history = {};
  for (let i = 0; i < 60; i++) history = recordSamples(history, [{index: 0, util: i}], i * 2000);
  assert.equal(history[0].length, 35);
  assert.deepEqual(history[0][0], {at: 50000, value: 25});
});

test('utilization uses real time on a fixed scale and does not connect across missing data', () => {
  const samples = [{at: 0, value: 0}, {at: 2000, value: 100}, {at: 4000, value: null},
    {at: 6000, value: 50}, {at: 14000, value: 42}];
  assert.equal(utilizationPath(samples, HISTORY_MS), 'M0.00,100 L2.86,0 M8.57,50 M20.00,58');
  assert.equal(utilizationPath(samples, HISTORY_MS * 2), '');
});
