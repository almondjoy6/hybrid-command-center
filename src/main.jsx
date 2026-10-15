import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {invoke, Channel} from '@tauri-apps/api/core';
import {check as checkForUpdate} from '@tauri-apps/plugin-updater';
import {relaunch} from '@tauri-apps/plugin-process';
import {LayoutDashboard, Rocket, Bot, CloudSun, CheckSquare, Server, Settings, Plus, Trash2, Send, RefreshCw, Clock3, ExternalLink, Wifi, CircleCheck, CircleAlert, Activity, Cpu, Square, Pencil, Save, FileText, X, Check, StickyNote} from 'lucide-react';
import './style.css';

const STORE='hcc-v1';
const CHECK_KEY='hcc-last-update-check';
const UPDATE_INTERVAL=24*60*60*1000;
const load=()=>{try{return JSON.parse(localStorage.getItem(STORE))||{}}catch{return {}}};
const nav=[['Overview',LayoutDashboard],['Launcher',Rocket],['AI Center',Bot],['Weather',CloudSun],['Tasks & Notes',CheckSquare],['Servers',Server],['Hardware',Activity],['Settings',Settings]];
const apps=[['Steam','steam'],['Discord','discord'],['VS Code','vscode'],['File Explorer','explorer'],['Terminal','terminal'],['Browser','browser']];
const WMO={0:'Clear sky',1:'Mostly clear',2:'Partly cloudy',3:'Cloudy',45:'Fog',48:'Fog',51:'Drizzle',61:'Rain',63:'Rain',65:'Heavy rain',71:'Snow',80:'Showers',95:'Thunderstorm'};
function App(){
 const [saved,setSaved]=useState(load),[page,setPage]=useState('Overview'),[now,setNow]=useState(new Date());
 const [updateState,setUpdateState]=useState('idle'),[updateInfo,setUpdateInfo]=useState(null),[updateError,setUpdateError]=useState(''),[updateProgress,setUpdateProgress]=useState(0),[lastChecked,setLastChecked]=useState(Number(localStorage.getItem(CHECK_KEY)||0));
 const [city,setCity]=useState(saved.city||'Salt Lake City'),[weather,setWeather]=useState(null),[weatherErr,setWeatherErr]=useState('');
 const [models,setModels]=useState([]),[model,setModel]=useState(''),[aiErr,setAiErr]=useState(''),[messages,setMessages]=useState([]),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false);
 const [ts,setTs]=useState(null),[tsErr,setTsErr]=useState(''),[notice,setNotice]=useState('');
 const [gpus,setGpus]=useState([]),[gpuError,setGpuError]=useState(''),[history,setHistory]=useState({}),[seconds,setSeconds]=useState(0),[speed,setSpeed]=useState(null),[streaming,setStreaming]=useState(false);
 const [task,setTask]=useState(''),[note,setNote]=useState(saved.note||''),[noteTitle,setNoteTitle]=useState(''),[editingNote,setEditingNote]=useState(null),[taskFilter,setTaskFilter]=useState('active');
 const tasks=saved.tasks||[];
 const notes=saved.notes||[];
 const filteredTasks=tasks.filter(t=>taskFilter==='all'||(taskFilter==='completed'?t.done:!t.done));
 const persist=patch=>setSaved(old=>{const next={...old,...patch};localStorage.setItem(STORE,JSON.stringify(next));return next});
 const notify=x=>{setNotice(x);setTimeout(()=>setNotice(''),4500)};
 async function checkUpdates(manual=false){
  if(updateState==='checking'||updateState==='installing')return;
  setUpdateState('checking');setUpdateError('');
  try{
   const result=await checkForUpdate();
   const at=Date.now();localStorage.setItem(CHECK_KEY,String(at));setLastChecked(at);
   if(result){setUpdateInfo(result);setUpdateState('available')}
   else{setUpdateInfo(null);setUpdateState('current');if(manual)notify('You are up to date')}
  }catch(e){setUpdateState('error');setUpdateError(String(e))}
 }
 useEffect(()=>{
  // Only run automatic checks when this release has been configured with real keys.
  const maybe=()=>{if(Date.now()-Number(localStorage.getItem(CHECK_KEY)||0)>=UPDATE_INTERVAL)checkUpdates(false)};
  maybe();const id=setInterval(maybe,60*60*1000);return()=>clearInterval(id)
 },[]);
 async function installUpdate(){
  if(!updateInfo||!window.confirm('Install the signed update now? Save any unfinished notes first.'))return;
  setUpdateState('installing');setUpdateProgress(0);setUpdateError('');
  try{
   let total=0,downloaded=0;
   await updateInfo.downloadAndInstall(event=>{
    if(event.event==='Started'){total=event.data.contentLength||0;downloaded=0}
    if(event.event==='Progress'){downloaded+=event.data.chunkLength||0;if(total)setUpdateProgress(Math.min(100,Math.round(downloaded/total*100)))}
    if(event.event==='Finished')setUpdateProgress(100);
   });
   await relaunch();
  }catch(e){setUpdateState('error');setUpdateError(String(e))}
 }
 async function backup(){try{const path=await invoke('export_backup',{data:load()});notify('Backup saved: '+path)}catch(e){if(!String(e).includes('canceled'))notify('Backup failed: '+e)}}
 async function restore(){
  try{
   const data=await invoke('import_backup');
   if(!window.confirm('Replace current tasks, notes and settings with this backup? This cannot be undone. Export a backup first.'))return;
   localStorage.setItem(STORE,JSON.stringify(data));window.location.reload();
  }catch(e){if(!String(e).includes('canceled'))notify('Restore failed: '+e)}
 }

 useEffect(()=>{const id=setInterval(()=>{setNow(new Date());setSeconds(v=>busy?v+1:0)},1000);return()=>clearInterval(id)},[busy]);
 async function refreshGPU(){try{const data=await invoke('gpu_stats');setGpus(data.gpus||[]);setGpuError('');setHistory(old=>{const next={...old};for(const gpu of data.gpus||[]){next[gpu.index]=[...(old[gpu.index]||[]),gpu.util||0].slice(-35)}return next})}catch(e){setGpuError(String(e))}}
 useEffect(()=>{refreshGPU();const id=setInterval(refreshGPU,2000);return()=>clearInterval(id)},[]);
 async function refreshWeather(q=city){try{setWeatherErr('');const geo=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`).then(r=>r.json());if(!geo.results?.length)throw Error('City not found');const p=geo.results[0];const result=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`).then(r=>r.json());setWeather({...result.current,location:`${p.name}, ${p.admin1||p.country}`});persist({city:q})}catch(e){setWeatherErr(String(e.message));setWeather(null)}}
 async function refreshAI(){try{setAiErr('');const r=await invoke('ollama_models');const list=r.models||[];setModels(list);setModel(m=>list.some(x=>x.name===m)?m:(list[0]?.name||''))}catch(e){setAiErr('Ollama unavailable: '+e);setModels([])}}
 async function refreshTS(){try{setTsErr('');setTs(await invoke('tailscale_status'))}catch(e){setTs(null);setTsErr(String(e))}}
 useEffect(()=>{refreshWeather();refreshAI();refreshTS();const id=setInterval(()=>{refreshAI();refreshTS()},60000);return()=>clearInterval(id)},[]);
 async function launch(id){try{notify(await invoke('launch_app',{app:id}))}catch(e){notify('Could not launch: '+e)}}
 function addTask(){if(!task.trim())return;persist({tasks:[...tasks,{id:Date.now(),text:task.trim(),done:false}]});setTask('')}
 function toggleTask(id){persist({tasks:tasks.map(t=>t.id===id?{...t,done:!t.done}:t)})}
 function saveNote(){if(!note.trim())return;const now=new Date().toISOString();const title=noteTitle.trim()||note.trim().split('\n')[0].slice(0,55)||'Untitled note';const entry={id:editingNote||crypto.randomUUID(),title,content:note.trim(),updatedAt:now};persist({notes:editingNote?notes.map(n=>n.id===editingNote?entry:n):[entry,...notes],note:''});setNote('');setNoteTitle('');setEditingNote(null);notify(editingNote?'Note updated':'Note saved')}
 function editNote(n){setEditingNote(n.id);setNoteTitle(n.title);setNote(n.content);setPage('Tasks & Notes')}
 function clearEditor(){setEditingNote(null);setNoteTitle('');setNote('');persist({note:''})}
 function removeNote(id){if(!window.confirm('Delete this note permanently?'))return;persist({notes:notes.filter(n=>n.id!==id)});if(editingNote===id)clearEditor()}
 const taskRow=(t,showDelete=false)=><div className={'task-item '+(t.done?'is-done':'')} key={t.id}><label className="task-check"><input type="checkbox" checked={t.done} onChange={()=>toggleTask(t.id)} aria-label={'Complete '+t.text}/><span className="task-checkmark"><Check size={13} strokeWidth={3}/></span></label><span className="task-copy">{t.text}</span>{showDelete&&<button className="task-delete" title="Delete task" aria-label={'Delete '+t.text} onClick={()=>persist({tasks:tasks.filter(x=>x.id!==t.id)})}><Trash2 size={16}/></button>}</div>;
 async function send(){
  if(!question.trim()||!model||busy)return;
  const next=[...messages,{role:'user',content:question.trim()}];
  setMessages([...next,{role:'assistant',content:''}]);setQuestion('');setBusy(true);setStreaming(true);setSeconds(0);setSpeed(null);setAiErr('');
  try{
   const channel=new Channel();
   channel.onmessage=event=>{
    if(event.type==='token')setMessages(old=>old.map((m,i)=>i===next.length?{...m,content:m.content+event.text}:m));
    if(event.type==='done'&&event.eval_duration>0)setSpeed((event.eval_count*1e9/event.eval_duration).toFixed(1));
   };
   await invoke('ollama_chat_stream',{model,messages:next.slice(-20),onEvent:channel});
  }catch(e){setAiErr('Chat error: '+e)}finally{setBusy(false);setStreaming(false)}
 }
 function gpuCard(gpu){
  const values=history[gpu.index]||[];
  const points=values.map((n,i)=>`${i*100/Math.max(values.length-1,1)},${100-n}`).join(' ');
  return <section className="panel gpu-panel" key={gpu.index}>
   <div className="panel-head"><h3>GPU {gpu.index} · {gpu.name}</h3><span className="status"><span className="dot good"/>Live</span></div>
   <div className="gpu-metrics"><div><span>Utilization</span><strong>{gpu.util??'—'}%</strong></div><div><span>Temperature</span><strong>{gpu.temp??'—'}°C</strong></div><div><span>Power</span><strong>{gpu.power==null?'—':Math.round(gpu.power)+' W'}</strong></div></div>
   <div className="gpu-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Recent GPU utilization"><polyline fill="none" stroke="#ad8aff" strokeWidth="2" vectorEffect="non-scaling-stroke" points={points}/></svg></div>
   <div className="gpu-vram"><span>VRAM</span><span>{gpu.used??'—'} / {gpu.total??'—'} MiB</span></div>
   <div className="gpu-track"><div style={{width:`${gpu.total?Math.min(100,100*gpu.used/gpu.total):0}%`}}/></div>
  </section>
 }
 const hardwareCard=<section className="panel"><div className="panel-head"><h3>GPU monitoring</h3><button className="icon-btn" onClick={refreshGPU} title="Refresh GPUs"><RefreshCw size={16}/></button></div>{gpuError?<p className="error">{gpuError}</p>:<div className="gpu-summary">{gpus.map(g=><div key={g.index}><span>{g.name}</span><strong>{g.util}%</strong><div className="gpu-track"><div style={{width:`${g.util}%`}}/></div></div>)}</div>}<button className="secondary" onClick={()=>setPage('Hardware')}>View live graphs →</button></section>;

 const launchCard=<section className="panel"><div className="panel-head"><h3>Quick launch</h3><Rocket size={18}/></div><div className="launch-grid">{apps.map(([name,id])=><button key={id} className="app-btn" onClick={()=>launch(id)}><span className="app-icon">{name.slice(0,2).toUpperCase()}</span>{name}<ExternalLink size={13}/></button>)}</div></section>;
 const weatherCard=<section className="panel"><div className="panel-head"><h3>Weather</h3><button className="icon-btn" onClick={()=>refreshWeather()} title="Refresh weather"><RefreshCw size={16}/></button></div>{weather?<div className="weather"><CloudSun size={36} color="#b9a5ff"/><div><strong>{Math.round(weather.temperature_2m)}°F</strong><div className="muted">{WMO[weather.weather_code]||'Current conditions'}</div></div></div>:<p className="muted">{weatherErr||'Loading weather…'}</p>}<p className="muted">{weather?.location||city}</p><p className="tiny">{weather?`Humidity ${weather.relative_humidity_2m}% · Wind ${Math.round(weather.wind_speed_10m)} mph`:''}</p></section>;
 const aiCard=<section className="panel"><div className="panel-head"><h3>Local AI · Ollama</h3><button className="icon-btn" onClick={refreshAI}><RefreshCw size={16}/></button></div><div className="status"><span className={'dot '+(models.length?'good':'bad')}/>{models.length?`${models.length} model(s) available`:'Not connected'}</div><div className="muted">{model||'Start Ollama to connect'}</div><button className="secondary" onClick={()=>setPage('AI Center')}>Open AI chat →</button></section>;
 const taskCard=<section className="panel"><div className="panel-head"><h3>Tasks</h3><span className="muted tiny">{tasks.filter(x=>!x.done).length} remaining</span></div><div className="tasks task-list">{tasks.slice(0,5).map(t=>taskRow(t))}{!tasks.length&&<p className="muted">No tasks yet.</p>}</div><button className="secondary" onClick={()=>setPage('Tasks & Notes')}>Manage tasks →</button></section>;
 const peers=Object.values(ts?.Peer||{});
 const serverCard=<section className="panel"><div className="panel-head"><h3>Tailscale</h3><button className="icon-btn" onClick={refreshTS}><RefreshCw size={16}/></button></div><div className="status"><span className={'dot '+(ts?'good':'bad')}/>{ts?`${ts.BackendState||'Connected'} · ${peers.filter(p=>p.Online).length}/${peers.length} peers online`:'Not connected'}</div>{tsErr&&<p className="muted tiny">{tsErr}</p>}<button className="secondary" onClick={()=>setPage('Servers')}>View devices →</button></section>;
 return <div className="shell"><aside className="sidebar"><div className="brand"><div className="brand-logo">H</div><div><strong>HYBRID</strong><small>COMMAND CENTER</small></div></div><div className="nav-label">WORKSPACE</div>{nav.map(([name,Icon])=><button key={name} className={'nav '+(page===name?'selected':'')} onClick={()=>setPage(name)}><Icon size={19}/>{name}</button>)}<div className="sidebar-foot"><span className="dot good"/> Desktop v0.3.0</div></aside><main className="main"><header className="topbar"><div><div className="eyebrow">YOUR WORKSPACE / {page.toUpperCase()}</div><h1>{page==='Overview'?'Good '+(now.getHours()<12?'morning':now.getHours()<17?'afternoon':'evening')+'.':page}</h1></div><div className="clock"><Clock3 size={17}/><div><strong>{now.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</strong><small>{now.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})}</small></div></div></header>
 {page==='Overview'&&<><div className="hero"><div><div className="eyebrow">YOUR PERSONAL CONTROL PANEL</div><h2>Everything in one place.</h2><p>Launch apps, chat with local AI, organize your day, and check your network.</p></div><div className="hero-orb">✦</div></div><div className="grid two">{launchCard}{aiCard}{weatherCard}{taskCard}{serverCard}{hardwareCard}<section className="panel"><div className="panel-head"><h3>Recent notes</h3><StickyNote size={18}/></div>{notes.length?<div className="recent-notes">{notes.slice(0,3).map(n=><button key={n.id} className="recent-note" onClick={()=>editNote(n)}><strong>{n.title}</strong><span>{n.content.slice(0,85)}</span></button>)}</div>:<p className="muted">No saved notes yet.</p>}<button className="secondary" onClick={()=>setPage('Tasks & Notes')}>Open notes →</button></section></div></>}
 {page==='Launcher'&&<div className="grid two">{launchCard}<section className="panel"><h3>Launcher tips</h3><p className="muted">Apps must be installed locally. Steam, Discord, and VS Code use their registered Windows protocols. Terminal requires Windows Terminal.</p></section></div>}
 {page==='AI Center'&&<div className="panel chat-panel"><div className="panel-head"><h3>Ollama Chat</h3><button className="icon-btn" onClick={refreshAI}><RefreshCw size={17}/></button></div><div className="row"><select value={model} onChange={e=>{setModel(e.target.value);setMessages([])}}><option value="">Select a model</option>{models.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}</select><button className="secondary" onClick={()=>setMessages([])}>Clear chat</button></div>{aiErr&&<p className="error">{aiErr}</p>}<div className="chat-messages">{!messages.length&&<div className="empty"><Bot size={40}/><h3>Your local AI is ready when you are.</h3><p>Choose a model and ask a question. Chat stays in this application.</p></div>}{messages.map((m,i)=><div key={i} className={'bubble '+m.role}>{m.content}</div>)}{busy&&<p className="muted">{streaming?'Generating / loading':'Waiting'} · {seconds}s elapsed</p>}</div><div className="tiny muted">{speed&&`Last response: ${speed} tokens/sec`}</div><div className="chat-input"><input placeholder="Ask your local AI…" value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()}/><button className="primary" disabled={!model||busy} onClick={send}><Send size={18}/></button></div></div>}
 {page==='Weather'&&<div className="grid two">{weatherCard}<section className="panel"><h3>Weather location</h3><p className="muted">Enter a city. No location permissions needed.</p><div className="row"><input value={city} onChange={e=>setCity(e.target.value)} onKeyDown={e=>e.key==='Enter'&&refreshWeather()}/><button className="primary" onClick={()=>refreshWeather()}>Update</button></div><p className="tiny muted">Powered by Open-Meteo</p></section></div>}
 {page==='Tasks & Notes'&&<div className="workspace-grid"><section className="panel workspace-panel"><div className="workspace-heading"><div><h3>My tasks</h3><p className="muted">Stay on top of what matters.</p></div><span className="count-pill">{tasks.filter(t=>!t.done).length} remaining</span></div><div className="task-compose"><input value={task} placeholder="What needs to get done?" aria-label="New task" onChange={e=>setTask(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addTask()}/><button className="primary" disabled={!task.trim()} onClick={addTask}><Plus size={17}/> Add</button></div><div className="task-tabs">{[['active','To do'],['completed','Completed'],['all','All']].map(([key,label])=><button key={key} className={taskFilter===key?'active':''} onClick={()=>setTaskFilter(key)}>{label}</button>)}</div><div className="task-list">{filteredTasks.map(t=>taskRow(t,true))}{!filteredTasks.length&&<div className="workspace-empty"><CircleCheck size={25}/><p>{taskFilter==='completed'?'No completed tasks yet.':taskFilter==='active'?'All caught up!':'Add your first task above.'}</p></div>}</div></section><section className="panel workspace-panel"><div className="workspace-heading"><div><h3>Notes</h3><p className="muted">Capture ideas and keep them organized.</p></div><span className="count-pill">{notes.length} saved</span></div><div className="note-editor"><input value={noteTitle} onChange={e=>setNoteTitle(e.target.value)} placeholder="Note title" aria-label="Note title" maxLength={120}/><textarea value={note} onChange={e=>{setNote(e.target.value);persist({note:e.target.value})}} placeholder="Start writing your note…" aria-label="Note content"/><div className="note-actions"><span className="tiny muted">{editingNote?'Editing saved note':'New note · draft kept locally'}</span><div className="row">{(editingNote||note||noteTitle)&&<button className="secondary compact" onClick={clearEditor}><X size={15}/> Clear</button>}<button className="primary" disabled={!note.trim()} onClick={saveNote}><Save size={16}/>{editingNote?'Update Note':'Save Note'}</button></div></div></div><div className="saved-heading"><h3>Saved notes</h3><span className="muted tiny">Newest first</span></div><div className="saved-notes">{[...notes].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).map(n=><article className="saved-note" key={n.id}><div className="saved-note-top"><div className="saved-note-icon"><FileText size={17}/></div><div className="saved-note-heading"><strong>{n.title}</strong><span>{n.updatedAt?new Date(n.updatedAt).toLocaleString([],{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'Saved note'}</span></div></div><p>{n.content}</p><div className="saved-note-actions"><button onClick={()=>editNote(n)}><Pencil size={14}/> Edit</button><button className="danger" onClick={()=>removeNote(n.id)}><Trash2 size={14}/> Delete</button></div></article>)}{!notes.length&&<div className="workspace-empty"><StickyNote size={25}/><p>Save your first note to see it here.</p></div>}</div><p className="tiny muted privacy-note">Notes are stored locally and are not encrypted. Do not store passwords or PHI.</p></section></div>}
 {page==='Servers'&&<div className="panel"><div className="panel-head"><h3>Tailscale devices</h3><button className="secondary" onClick={refreshTS}><RefreshCw size={15}/> Refresh</button></div>{ts?<><div className="status"><CircleCheck color="#4ade80" size={18}/> {ts.BackendState} · {peers.length} peers</div><div className="device-list">{peers.map((p,i)=><div className="device" key={i}>{p.Online?<CircleCheck color="#4ade80" size={17}/>:<CircleAlert color="#f59e0b" size={17}/>}<div><strong>{p.HostName||p.DNSName||'Unknown device'}</strong><small>{p.TailscaleIPs?.join(', ')||'No IP'}</small></div><span className="muted">{p.Online?'Online':'Offline'}</span></div>)}</div></>:<p className="error">{tsErr||'Tailscale is not available.'}</p>}<p className="tiny muted">Status only. No remote shell or admin actions in v1.</p></div>}
 {page==='Hardware'&&<><div className="panel-head"><h3>Live NVIDIA GPU telemetry · refreshes every 2 seconds</h3><button className="secondary" onClick={refreshGPU}><RefreshCw size={15}/> Refresh</button></div>{gpuError&&<p className="error">{gpuError}</p>}<div className="grid two">{gpus.map(gpuCard)}</div><p className="tiny muted">Metrics come from your local nvidia-smi executable. Graphs show recent GPU utilization.</p></>}
 {page==='Settings'&&<div className="grid two"><section className="panel settings"><h3>Application Updates</h3><p className="muted">Version 0.3.0 · Daily checks · Manual installation</p><p className="muted">{updateState==='checking'?'Checking for updates…':updateState==='available'?`Version ${updateInfo?.version} is available`:updateState==='current'?'You are up to date':updateState==='installing'?`Installing update: ${updateProgress}%`:updateState==='error'?'Update check failed':'Ready to check for updates'}</p>{updateInfo&&<p className="muted">{updateInfo.body||'New release available.'}</p>}{updateError&&<p className="error">{updateError}</p>}<div className="row"><button className="primary" disabled={updateState==='checking'||updateState==='installing'} onClick={()=>checkUpdates(true)}><RefreshCw size={16}/> Check for Updates</button>{updateState==='available'&&<button className="primary" onClick={installUpdate}>Install v{updateInfo.version}</button>}</div><p className="tiny muted">Last successful check: {lastChecked?new Date(lastChecked).toLocaleString():'Never'}. Updates are cryptographically verified before installation.</p></section><section className="panel settings"><h3>Backup & Restore</h3><p className="muted">Export tasks, saved notes, weather settings and other dashboard preferences to a JSON file.</p><div className="row"><button className="primary" onClick={backup}><Save size={16}/> Export Backup</button><button className="secondary" onClick={restore}>Restore Backup</button></div><p className="tiny muted">Backup files are NOT encrypted. Store them securely. Restore replaces existing local data.</p></section><section className="panel settings"><h3>Preferences</h3><label>Weather city<input value={city} onChange={e=>setCity(e.target.value)}/></label><button className="primary" onClick={()=>refreshWeather()}>Save city</button><h3>About</h3><p className="muted">Hybrid Command Center v0.3.0 · Violet theme · Local-first Windows desktop application.</p><p className="muted">Do not store credentials or PHI in local notes.</p></section></div>}
 {notice&&<div className="toast">{notice}</div>}
 </main></div>
}
createRoot(document.getElementById('root')).render(<App/>);
