import test from 'node:test';
import assert from 'node:assert/strict';
import {idleWatch, idleTimer, watchElapsed, timerRemaining, toggleWatch, toggleTimer, durationMs, formatTime, reminderTime, makeReminder, updateReminder, sortedReminders, restoreProductivity, snapshot, dueJobs} from './productivity.js';

test('stopwatch uses elapsed monotonic time with pause, resume and delayed rendering', () => {
  let watch = toggleWatch(idleWatch(), 100);
  assert.equal(watchElapsed(watch, 12345), 12245);
  watch = toggleWatch(watch, 12345);
  assert.equal(watchElapsed(watch, 90000), 12245);
  watch = toggleWatch(watch, 100000);
  assert.equal(watchElapsed(watch, 100010), 12255);
  assert.equal(formatTime(3661010, true), '01:01:01.01');
});
test('countdown pause, resume and expiration use monotonic time and a new run identity', () => {
  let timer = toggleTimer({...idleTimer(), duration: 5000, remaining: 5000}, 100, 'run-1');
  assert.equal(timerRemaining(timer, 1100), 4000);
  timer = toggleTimer(timer, 1100, 'unused');
  assert.equal(timerRemaining(timer, 9000), 4000);
  timer = toggleTimer(timer, 10000, 'run-2');
  assert.equal(timer.id, 'run-2');
  assert.equal(timerRemaining(timer, 14000), 0);
  assert.equal(timerRemaining(timer, 90000), 0);
});
test('duration inputs reject zero, fractions, negatives, nonnumbers and overflow', () => {
  assert.equal(durationMs(1, 2, 3), 3723000);
  for (const args of [[0, 0, 0], [-1, 0, 0], [0, 60, 0], [0, 0, 60], [0, 0, .5], ['x', 1, 0], [100, 0, 0]]) assert.throws(() => durationMs(...args));
});
const input = {name: 'Test reminder', description: 'Local only', email: 'test@example.test', date: '2026-10-20', time: '13:00'};
test('reminder create and edit preserve stable identity and replace the delivery identity', () => {
  const first = makeReminder(input, null, 'one');
  const edited = makeReminder({...input, name: 'Edited', time: '14:00'}, first, 'two');
  assert.equal(edited.id, 'one'); assert.equal(edited.notificationId, 'two'); assert.equal(edited.notification, null);
  let list = updateReminder([], first); list = updateReminder(list, edited);
  assert.equal(list.length, 1); assert.equal(list[0].name, 'Edited');
  assert.deepEqual(list.filter(r => r.id !== edited.id), []);
  assert.deepEqual(dueJobs({reminders: [{...edited, complete: true}], timer: idleTimer()}, 0), []);
});
test('reminder validation rejects normalized dates, invalid time, blank names and invalid email', () => {
  for (const patch of [{date: '2026-02-30'}, {time: '24:00'}, {time: '01:99'}, {name: ' '}, {email: 'invalid'}, {description: 'x'.repeat(2001)}]) assert.throws(() => makeReminder({...input, ...patch}, null, 'one'));
});
test('reminders sort chronologically and delivered or completed reminders do not reschedule', () => {
  const first = makeReminder(input, null, 'one'), second = makeReminder({...input, time: '14:00'}, null, 'two');
  assert.deepEqual(sortedReminders([second, first]).map(r => r.id), ['one', 'two']);
  const state = {reminders: [{...first, notification: 'sent'}, {...second, complete: true}], timer: idleTimer()};
  assert.equal(dueJobs(state, 0).length, 0);
  assert.equal(dueJobs({...state, reminders: [first]}, 0)[0].due, first.due);
});
test('stopwatch restores paused while countdown accounts for time closed', () => {
  const state = {watch: {...toggleWatch(idleWatch(), 100), laps: [100]}, timer: toggleTimer({...idleTimer(), duration: 5000, remaining: 5000}, 100, 'timer'), reminders: [makeReminder(input, null, 'one')]};
  const saved = snapshot(state, 1100, 100000);
  const restored = restoreProductivity(saved, 10, 102000);
  assert.equal(restored.watch.running, false); assert.equal(restored.watch.elapsed, 1000); assert.deepEqual(restored.watch.laps, [100]);
  assert.equal(timerRemaining(restored.timer, 10), 2000); assert.equal(timerRemaining(restored.timer, 2010), 0);
  assert.equal(restored.reminders[0].id, 'one');
});
test('restart expiration, backward wall clock and malformed persistence are handled', () => {
  const saved = {version: 1, savedAt: 1000, timer: {...idleTimer(), remaining: 1000, running: true, id: 'timer'}};
  assert.equal(restoreProductivity(saved, 0, 10000).timer.remaining, 0);
  assert.equal(restoreProductivity(saved, 0, 0).timer.remaining, 1000);
  assert.equal(restoreProductivity({version: 1, watch: {elapsed: -4}, timer: {duration: Infinity}, reminders: [null, {}, input]}, 0, 0).reminders.length, 0);
  assert.deepEqual(restoreProductivity(null, 0, 0), {watch: idleWatch(), timer: idleTimer(), reminders: []});
});
test('a completed visual timer keeps its notification job until the native receipt arrives', () => {
  const timer = {...idleTimer(), id: 'timer-1', finished: true, remaining: 0};
  assert.equal(dueJobs({reminders: [], timer}, 0)[0].remaining, 0);
  assert.deepEqual(dueJobs({reminders: [], timer: {...timer, notification: 'sent'}}, 0), []);
});
test('daylight-saving gaps reject and repeated times choose the first occurrence', () => {
  const old = process.env.TZ; process.env.TZ = 'America/Denver';
  try {
    assert.throws(() => reminderTime('2026-03-08', '02:30'));
    assert.equal(new Date(reminderTime('2026-11-01', '01:30')).toISOString(), '2026-11-01T07:30:00.000Z');
    assert.equal(reminderTime('2026-03-08', '03:30') - reminderTime('2026-03-08', '01:30'), 3600000);
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
});
test('persistence filters duplicate reminder IDs without mutating valid reminders', () => {
  const reminder = makeReminder(input, null, 'one');
  const data = restoreProductivity({version: 1, reminders: [reminder, reminder]}, 0, 0);
  assert.deepEqual(data.reminders, [reminder]);
});
