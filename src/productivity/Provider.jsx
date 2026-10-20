import React, {createContext, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {invoke, isTauri} from '@tauri-apps/api/core';
import {restoreProductivity, snapshot, timerRemaining, dueJobs} from '../dashboard/productivity.js';

const Context = createContext(null);
const ClockContext = createContext(0);
export const useProductivity = () => useContext(Context);
export const useTiming = () => ({...useProductivity(), mono: useContext(ClockContext)});
const load = () => { try { return JSON.parse(localStorage.getItem('hcc-v1'))?.productivity; } catch { return null; } };
export default function ProductivityProvider({children}) {
  const [state, setState] = useState(() => restoreProductivity(load(), performance.now(), Date.now()));
  const ref = useRef(state), clock = useRef({native: 0, perf: performance.now(), ready: false});
  const [mono, setMono] = useState(performance.now());
  const [status, setStatus] = useState(isTauri() ? 'Windows notifications: checking…' : 'Desktop notifications unavailable in browser preview.');
  const [error, setError] = useState('');
  const syncRequested = useRef(true);
  const currentMono = () => clock.current.ready ? clock.current.native + performance.now() - clock.current.perf : performance.now();
  function persist(next) {
    try {
      const saved = JSON.parse(localStorage.getItem('hcc-v1')) || {};
      localStorage.setItem('hcc-v1', JSON.stringify({...saved, productivity: snapshot(next, currentMono(), Date.now())}));
      setError('');
    } catch { setError('Unable to save timing and reminders. Free local storage before closing the app.'); }
  }
  function update(change) {
    const next = change(ref.current, currentMono());
    ref.current = next; syncRequested.current = true; setState(next); persist(next);
  }
  useEffect(() => {
    let closed = false, busy = false, lastSync = -Infinity, lastSave = performance.now(), lastPaint = 0;
    async function tick() {
      const perf = performance.now();
      if (isTauri() && !busy && (syncRequested.current || perf - lastSync >= 1000)) {
        busy = true; lastSync = perf; syncRequested.current = false;
        try {
          const result = await invoke('productivity_sync', {jobs: dueJobs(ref.current, currentMono())});
          if (closed) return;
          const oldMono = currentMono();
          if (!clock.current.ready) {
            const delta = result.mono - oldMono;
            ref.current = {...ref.current, watch: {...ref.current.watch, anchor: ref.current.watch.anchor + delta}, timer: {...ref.current.timer, anchor: ref.current.timer.anchor + delta}};
          }
          clock.current = {native: result.mono, perf: performance.now(), ready: true};
          setStatus(result.status);
          let changed = false;
          const reminders = ref.current.reminders.map(r => {
            if (result.receipts[r.notificationId] && r.notification !== result.receipts[r.notificationId]) { changed = true; return {...r, notification: result.receipts[r.notificationId]}; }
            return r;
          });
          const timer = ref.current.timer;
          const receipt = result.receipts[timer.id];
          if (receipt && timer.notification !== receipt) changed = true;
          if (changed) { ref.current = {...ref.current, reminders, timer: receipt ? {...timer, notification: receipt, running: false, finished: true, remaining: 0, anchor: currentMono()} : timer}; persist(ref.current); }
        } catch (failure) { if (!closed) setStatus('Windows notifications unavailable: ' + String(failure)); }
        finally { busy = false; }
      }
      if (closed) return;
      const time = currentMono();
      if (ref.current.timer.running && timerRemaining(ref.current.timer, time) === 0) {
        // Native scheduler owns the notification even after the visual timer reaches zero.
        ref.current = {...ref.current, timer: {...ref.current.timer, remaining: 0, anchor: time, running: false, finished: true}};
        persist(ref.current);
      }
      setState(ref.current);
      if (!document.hidden && (ref.current.watch.running || ref.current.timer.running || perf - lastPaint >= 1000)) { setMono(time); lastPaint = perf; }
      if ((ref.current.watch.running || ref.current.timer.running) && perf - lastSave >= 1000) { persist(ref.current); lastSave = perf; }
    }
    tick();
    const interval = setInterval(tick, 33);
    const save = () => { persist(ref.current); syncRequested.current = true; tick(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    return () => { closed = true; clearInterval(interval); window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', save); };
  }, []);
  const wallMinute = Math.floor(Date.now() / 60000);
  const value = useMemo(() => ({...state, update, status, error}), [state, status, error, wallMinute]);
  return <Context.Provider value={value}><ClockContext.Provider value={mono}>{children}</ClockContext.Provider></Context.Provider>;
}
