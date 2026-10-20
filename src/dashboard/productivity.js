const finite = (n, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(n) && n >= 0 && n <= max;
export const idleWatch = () => ({elapsed: 0, running: false, anchor: 0, laps: []});
export const idleTimer = () => ({duration: 25 * 60000, remaining: 25 * 60000, running: false, anchor: 0, id: '', finished: false});
export const watchElapsed = (watch, mono) => watch.elapsed + (watch.running ? Math.max(0, mono - watch.anchor) : 0);
export const timerRemaining = (timer, mono) => Math.max(0, timer.remaining - (timer.running ? Math.max(0, mono - timer.anchor) : 0));
export function toggleWatch(watch, mono) {
  return {...watch, elapsed: watchElapsed(watch, mono), running: !watch.running, anchor: mono};
}
export function toggleTimer(timer, mono, id) {
  if (timer.finished) return {...idleTimer(), duration: timer.duration, remaining: timer.duration, running: true, anchor: mono, id};
  return {...timer, remaining: timerRemaining(timer, mono), running: !timer.running, anchor: mono, id: timer.running ? timer.id : id, notification: null};
}
export function durationMs(hours, minutes, seconds) {
  const values = [hours, minutes, seconds].map(Number);
  if (values.some(n => !Number.isInteger(n) || n < 0) || values[0] > 99 || values[1] > 59 || values[2] > 59) throw Error('Use 0–99 hours and 0–59 minutes and seconds.');
  const ms = (values[0] * 3600 + values[1] * 60 + values[2]) * 1000;
  if (!ms) throw Error('Enter a duration greater than zero.');
  return ms;
}
export function formatTime(ms, hundredths = false) {
  const cs = Math.floor(Math.max(0, ms) / 10);
  const parts = [Math.floor(cs / 360000), Math.floor(cs / 6000) % 60, Math.floor(cs / 100) % 60].map(n => String(n).padStart(2, '0'));
  return parts.join(':') + (hundredths ? '.' + String(cs % 100).padStart(2, '0') : '');
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function reminderTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw Error('Choose a valid local date and time.');
  const at = new Date(`${date}T${time}:00`);
  // Reject normalized dates and nonexistent spring-forward local times; folds use the first occurrence.
  if (!Number.isFinite(at.getTime()) || localDate(at) !== date || `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` !== time) throw Error('This local date or time does not exist. Choose another time.');
  return at.getTime();
}
export function makeReminder(input, previous, id) {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(id) || (previous && !/^[a-zA-Z0-9-]{1,100}$/.test(previous.id))) throw Error('Invalid reminder identifier.');
  const name = input.name.trim(), description = input.description.trim(), email = input.email.trim();
  if (!name || name.length > 120) throw Error('Enter a reminder name of 1–120 characters.');
  if (description.length > 2000 || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw Error('Check the description length and destination email address.');
  const due = reminderTime(input.date, input.time);
  return {id: previous?.id || id, name, description, email, date: input.date, time: input.time, due, complete: previous?.complete || false, notificationId: id, notification: null};
}
export function updateReminder(reminders, reminder) {
  return reminders.some(r => r.id === reminder.id) ? reminders.map(r => r.id === reminder.id ? reminder : r) : [...reminders, reminder];
}
export const sortedReminders = reminders => [...reminders].sort((a, b) => a.due - b.due || a.id.localeCompare(b.id));
export function restoreProductivity(raw, mono, wall) {
  const data = raw && raw.version === 1 ? raw : {};
  const watch = idleWatch();
  if (finite(data.watch?.elapsed)) watch.elapsed = data.watch.elapsed;
  watch.laps = Array.isArray(data.watch?.laps) ? data.watch.laps.filter(n => finite(n) && n <= watch.elapsed).slice(0, 100) : [];
  let timer = idleTimer();
  if (finite(data.timer?.duration, 359999000) && data.timer.duration > 0 && finite(data.timer.remaining, data.timer.duration)) {
    timer = {...timer, ...data.timer, anchor: mono, running: data.timer.running === true, finished: data.timer.finished === true};
    if (timer.running) {
      // After a process restart only wall time survives; never extend a timer after a backward clock change.
      timer.remaining = Math.max(0, timer.remaining - Math.max(0, wall - (finite(data.savedAt) ? data.savedAt : wall)));
    }
    if (typeof timer.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(timer.id)) { timer.id = ''; timer.running = false; }
  }
  const seen = new Set();
  const reminders = (Array.isArray(data.reminders) ? data.reminders : []).filter(r => {
    if (!r || typeof r.id !== 'string' || !r.id || seen.has(r.id) || typeof r.name !== 'string' || typeof r.description !== 'string' || typeof r.email !== 'string' || !finite(r.due) || typeof r.notificationId !== 'string') return false;
    try { makeReminder(r, r, r.notificationId); seen.add(r.id); return true; } catch { return false; }
  });
  return {watch, timer, reminders};
}
export function snapshot(state, mono, wall) {
  return {version: 1, savedAt: wall, watch: {...state.watch, elapsed: watchElapsed(state.watch, mono), running: false, anchor: 0}, timer: {...state.timer, remaining: timerRemaining(state.timer, mono), anchor: 0}, reminders: state.reminders};
}
export function dueJobs(state, mono) {
  const jobs = state.reminders.filter(r => !r.complete && !r.notification).map(r => ({id: r.notificationId, title: r.name, due: r.due}));
  if ((state.timer.running || state.timer.finished) && state.timer.id && !state.timer.notification) jobs.push({id: state.timer.id, title: 'Countdown complete', remaining: Math.ceil(timerRemaining(state.timer, mono))});
  return jobs;
}
