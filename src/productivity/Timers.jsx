import React, {useState} from 'react';
import {Clock3, Timer, Play, Pause, RotateCcw, Flag} from 'lucide-react';
import {useProductivity, useTiming} from './Provider.jsx';
import {idleWatch, idleTimer, watchElapsed, timerRemaining, toggleWatch, toggleTimer, durationMs, formatTime} from '../dashboard/productivity.js';
import './productivity.css';

function Ring({progress, children}) {
  return <div className="time-dial"><svg viewBox="0 0 200 200" aria-hidden="true"><circle className="dial-track" cx="100" cy="100" r="90"/><circle className="dial-progress" cx="100" cy="100" r="90" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - Math.min(100, Math.max(0, progress * 100))}/></svg><div className="dial-copy">{children}</div></div>;
}
export function Stopwatch({compact = false}) {
  const {watch, mono, update} = useTiming();
  const elapsed = watchElapsed(watch, mono);
  return <section className={'panel timing-panel' + (compact ? ' compact-timing' : '')} aria-label="Stopwatch">
    <div className="panel-head"><h3>Stopwatch</h3><Clock3 size={18} aria-hidden="true"/></div>
    <Ring progress={(elapsed % 60000) / 60000}><span className="time-state">{watch.running ? 'Running' : elapsed ? 'Paused' : 'Stopped'}</span><output role="timer" aria-live="off" className="time-value" aria-label="Elapsed time">{formatTime(elapsed, true)}</output><span className="muted tiny">HOURS : MINUTES : SECONDS</span></Ring>
    <div className="time-controls"><button className="primary" onClick={() => update((s, at) => ({...s, watch: toggleWatch(s.watch, at)}))}>{watch.running ? <Pause size={16}/> : <Play size={16}/>}{watch.running ? 'Pause' : elapsed ? 'Resume' : 'Start'}</button><button className="secondary" onClick={() => update(s => ({...s, watch: idleWatch()}))}><RotateCcw size={16}/>Reset</button>{!compact && <button className="secondary" disabled={!watch.running || watch.laps.length >= 100} onClick={() => update((s, at) => ({...s, watch: {...s.watch, laps: [...s.watch.laps, watchElapsed(s.watch, at)]}}))}><Flag size={16}/>Lap</button>}</div>
    {!compact && <><p className="muted tiny">Continues while minimized and through sleep. Restarts paused at the last saved time.</p>{watch.laps.length > 0 && <ol className="lap-list" aria-label="Recorded laps">{watch.laps.map((total, i) => <li key={i}><span>Lap {i + 1}</span><span>{formatTime(total - (watch.laps[i - 1] || 0), true)}</span><span className="muted">Total {formatTime(total, true)}</span></li>)}</ol>}</>}
  </section>;
}
export function Countdown({compact = false}) {
  const {timer, mono, update, status} = useTiming();
  const [hours, setHours] = useState(0), [minutes, setMinutes] = useState(25), [seconds, setSeconds] = useState(0), [error, setError] = useState('');
  const remaining = timerRemaining(timer, mono);
  function configure(ms) { setError(''); update(s => ({...s, timer: {...idleTimer(), duration: ms, remaining: ms}})); }
  return <section className={'panel timing-panel' + (compact ? ' compact-timing' : '') + (timer.finished ? ' timer-finished' : '')} aria-label="Countdown timer">
    <div className="panel-head"><h3>Countdown timer</h3><Timer size={18} aria-hidden="true"/></div>
    <Ring progress={remaining / timer.duration}><span className="time-state" role="status">{timer.finished ? 'Time is up' : timer.running ? 'Running' : remaining < timer.duration ? 'Paused' : 'Ready'}</span><output role="timer" aria-live="off" className="time-value" aria-label="Time remaining">{formatTime(Math.ceil(remaining / 1000) * 1000)}</output><span className="muted tiny">{Math.round(timer.duration / 60000 * 100) / 100} MINUTE SESSION</span></Ring>
    <div className="time-controls"><button className="primary" onClick={() => update((s, at) => ({...s, timer: toggleTimer(s.timer, at, crypto.randomUUID())}))}>{timer.running ? <Pause size={16}/> : <Play size={16}/>}{timer.running ? 'Pause' : timer.finished ? 'Start again' : remaining < timer.duration ? 'Resume' : 'Start'}</button><button className="secondary" onClick={() => configure(timer.duration)}><RotateCcw size={16}/>Reset</button></div>
    {!compact && <><div className="timer-presets" aria-label="Timer presets">{[5, 10, 15, 25, 30, 60].map(n => <button className="secondary" key={n} disabled={timer.running} onClick={() => { configure(n * 60000); setHours(Math.floor(n / 60)); setMinutes(n % 60); setSeconds(0); }}>{n} min</button>)}</div><form onSubmit={e => { e.preventDefault(); try { configure(durationMs(hours, minutes, seconds)); } catch (failure) { setError(failure.message); } }}><fieldset disabled={timer.running}><legend>Custom duration</legend><div className="duration-fields">{[['Hours', hours, setHours, 99], ['Minutes', minutes, setMinutes, 59], ['Seconds', seconds, setSeconds, 59]].map(([label, value, set, max]) => <label key={label}>{label}<input type="number" min="0" max={max} required value={value} onChange={e => set(e.target.value)} /></label>)}<button className="secondary" type="submit">Set timer</button></div></fieldset>{error && <p role="alert" className="error">{error}</p>}</form><p className="muted tiny">Runs through sleep and minimization. Restarts using saved time; clock changes while closed can affect restoration.</p><p className="muted tiny">{status}</p></>}
  </section>;
}
export function TimersPage() {
  const {error} = useProductivity();
  return <>{error && <p role="alert" className="error">{error}</p>}<div className="productivity-grid"><Stopwatch/><Countdown/></div></>;
}
