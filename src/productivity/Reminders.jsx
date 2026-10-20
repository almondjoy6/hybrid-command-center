import React, {useState} from 'react';
import {CalendarDays, ChevronLeft, ChevronRight} from 'lucide-react';
import {useProductivity} from './Provider.jsx';
import {localDate, makeReminder, updateReminder, sortedReminders} from '../dashboard/productivity.js';

const empty = date => ({name: '', description: '', email: '', date, time: '09:00'});
export function UpcomingReminders() {
  const {reminders} = useProductivity();
  const pending = sortedReminders(reminders.filter(r => !r.complete)).slice(0, 4);
  return <section className="panel"><div className="panel-head"><h3>Upcoming reminders</h3><CalendarDays size={18} aria-hidden="true"/></div>{pending.length ? <ul className="upcoming-list">{pending.map(r => <li key={r.id}><strong>{r.name}</strong><span className={r.due < Date.now() ? 'overdue' : 'muted'}>{r.due < Date.now() ? 'Overdue · ' : ''}{new Date(r.due).toLocaleString()}</span></li>)}</ul> : <p className="muted">No upcoming reminders. Create one in Reminders.</p>}</section>;
}
export default function RemindersPage() {
  const {reminders, update, status, error: storageError} = useProductivity();
  const today = localDate();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(today), [draft, setDraft] = useState(() => empty(today));
  const [editing, setEditing] = useState(null), [filter, setFilter] = useState('upcoming'), [error, setError] = useState('');
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  const days = Array.from({length: 42}, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  function select(date) { setSelected(date); setDraft(empty(date)); setEditing(null); setError(''); setFilter('date'); }
  function edit(r) { setEditing(r.id); setDraft({...r}); setSelected(r.date); setMonth(new Date(Number(r.date.slice(0, 4)), Number(r.date.slice(5, 7)) - 1, 1)); setError(''); }
  function save(e) {
    e.preventDefault();
    try {
      const reminder = makeReminder(draft, reminders.find(r => r.id === editing), crypto.randomUUID());
      update(s => ({...s, reminders: updateReminder(s.reminders, reminder)}));
      setDraft(empty(reminder.date)); setEditing(null); setSelected(reminder.date); setFilter('date'); setError('');
    } catch (failure) { setError(failure.message); }
  }
  const visible = sortedReminders(reminders.filter(r => filter === 'all' || (filter === 'date' ? r.date === selected : filter === 'completed' ? r.complete : !r.complete && (filter === 'overdue' ? r.due < Date.now() : r.due >= Date.now()))));
  return <div className="reminder-workspace">
    <section className="panel calendar-panel" aria-label="Reminder calendar"><div className="panel-head"><h3>{month.toLocaleDateString([], {month: 'long', year: 'numeric'})}</h3><div className="row"><button className="secondary" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16}/></button><button className="secondary" onClick={() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); select(today); }}>Today</button><button className="secondary" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16}/></button></div></div>
      <div className="calendar-grid">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <span className="calendar-weekday" key={d}>{d}</span>)}{days.map(d => { const date = localDate(d), count = reminders.filter(r => r.date === date && !r.complete).length; return <button key={date} className={'calendar-day' + (d.getMonth() !== month.getMonth() ? ' outside' : '') + (date === today ? ' today' : '')} aria-label={`${date}${date === today ? ', today' : ''}, ${count} reminders`} aria-pressed={selected === date} onClick={() => select(date)}><span>{d.getDate()}</span>{count > 0 && <small>{count}<span className="sr-only"> reminders</span></small>}</button>; })}</div><p className="muted tiny">Local time · {Intl.DateTimeFormat().resolvedOptions().timeZone}. Repeated daylight-saving times use the first occurrence.</p>
      <form className="reminder-form" onSubmit={save}><h3>{editing ? 'Edit reminder' : 'New reminder'}</h3><label>Name<input autoComplete="off" required maxLength={120} value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})}/></label><label>Description (optional)<textarea maxLength={2000} value={draft.description} onChange={e => setDraft({...draft, description: e.target.value})}/></label><div className="duration-fields"><label>Date<input required type="date" value={draft.date} onChange={e => setDraft({...draft, date: e.target.value})}/></label><label>Time<input required type="time" value={draft.time} onChange={e => setDraft({...draft, time: e.target.value})}/></label></div><label>Destination email (optional)<input type="email" maxLength={254} value={draft.email} onChange={e => setDraft({...draft, email: e.target.value})} aria-describedby="email-status"/></label><p id="email-status" className="muted tiny">Email delivery: Not yet enabled. This address stays on your device.</p>{error && <p role="alert" className="error">{error}</p>}<div className="row"><button className="primary" type="submit">{editing ? 'Save changes' : 'Create reminder'}</button>{editing && <button className="secondary" type="button" onClick={() => { setEditing(null); setDraft(empty(selected)); }}>Cancel edit</button>}</div></form>
    </section>
    <section className="panel reminders-panel"><div className="panel-head"><h3>Reminders</h3><select aria-label="Reminder filter" value={filter} onChange={e => setFilter(e.target.value)}>{[['upcoming', 'Upcoming'], ['overdue', 'Overdue'], ['completed', 'Completed'], ['date', selected], ['all', 'All reminders']].map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></div><p className="muted tiny" role="status">{status}</p>{storageError && <p role="alert" className="error">{storageError}</p>}<p className="muted tiny">Keep the app running for alerts. Missed reminders are checked after restart or resume. Windows Focus Assist may hide banners.</p>
      <div className="reminder-list">{visible.map(r => <article className={'reminder-item' + (r.complete ? ' is-complete' : '')} key={r.id}><div className="panel-head"><h4>{r.name}</h4><span className={r.complete ? 'muted' : r.due < Date.now() ? 'overdue' : 'time-state'}>{r.complete ? 'Completed' : r.due < Date.now() ? 'Overdue' : 'Upcoming'}</span></div><time dateTime={new Date(r.due).toISOString()}>{new Date(r.due).toLocaleString()}</time>{r.description && <p>{r.description}</p>}{r.email && <p className="muted tiny">{r.email} · Email delivery: Not yet enabled</p>}{r.notification && <p className="muted tiny">{r.notification === 'sent' ? 'Notification submitted to Windows' : r.notification}</p>}<div className="time-controls"><button className="secondary" onClick={() => update(s => ({...s, reminders: s.reminders.map(x => x.id === r.id ? {...x, complete: !x.complete} : x)}))}>{r.complete ? 'Reopen' : 'Mark complete'}</button><button className="secondary" onClick={() => edit(r)}>Edit</button><button className="secondary danger" onClick={() => { if (window.confirm(`Delete reminder “${r.name}”?`)) { update(s => ({...s, reminders: s.reminders.filter(x => x.id !== r.id)})); if (editing === r.id) { setEditing(null); setDraft(empty(selected)); } } }}>Delete</button></div></article>)}{!visible.length && <div className="workspace-empty"><CalendarDays size={28}/><p>No reminders in this view.</p><p className="tiny">Choose a date and create a reminder.</p></div>}</div>
    </section>
  </div>;
}
