import React,{useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {invoke, Channel, isTauri} from '@tauri-apps/api/core';
import {getVersion} from '@tauri-apps/api/app';
import {version as buildVersion} from '../package.json';
import {check as checkForUpdate} from '@tauri-apps/plugin-updater';
import {relaunch} from '@tauri-apps/plugin-process';
import {LayoutDashboard, Rocket, Bot, CloudSun, CheckSquare, Server, Settings, Plus, Trash2, Send, RefreshCw, Clock3, ExternalLink, Wifi, CircleCheck, CircleAlert, Activity, Cpu, Square, Pencil, Save, FileText, X, Check, StickyNote, Palette, ArrowUp, ArrowDown, Search, CalendarDays, RotateCcw, FolderPlus, PlusCircle, Download, Gauge, AppWindow, MessageCircle, Code2, Folder, Terminal, Globe, GripVertical} from 'lucide-react';
import './style.css';
import './design.css';
import UtilizationChart from './dashboard/UtilizationChart.jsx';
import {recordSamples} from './dashboard/telemetry.js';
import {DEFAULT_WIDGETS, PROFILE_NAMES, defaultLayout, presetLayout, loadProfiles, moveLayout, changeWidget} from './dashboard/layout.js';

const STORE='hcc-v1';
const CHECK_KEY='hcc-last-update-check';
const UPDATE_INTERVAL=24*60*60*1000;
const load=()=>{try{return JSON.parse(localStorage.getItem(STORE))||{}}catch{return {}}};
const nav=[['Overview',LayoutDashboard],['Launcher',Rocket],['AI Center',Bot],['Weather',CloudSun],['Tasks & Notes',CheckSquare],['Servers',Server],['Hardware',Activity],['Appearance',Palette],['Settings',Settings]];
const apps=[['Steam','steam',AppWindow],['Discord','discord',MessageCircle],['VS Code','vscode',Code2],['File Explorer','explorer',Folder],['Terminal','terminal',Terminal],['Browser','browser',Globe]];
const THEMES=[
 {id:'violet',name:'Violet',description:'The signature violet command center',swatch:'#9b78f3'},
 {id:'midnight',name:'Midnight',description:'Deep blue and cool highlights',swatch:'#38bdf8'},
 {id:'emerald',name:'Emerald',description:'Dark green monitoring workspace',swatch:'#34d399'},
 {id:'sunset',name:'Sunset',description:'Warm copper and orange',swatch:'#fb923c'},
 {id:'light',name:'Light',description:'Bright, crisp and comfortable',swatch:'#8b5cf6'},
 {id:'cyber',name:'Cyberpunk',description:'Electric neon pink and cyan',swatch:'#f02ecf'}
];
const WMO={0:'Clear sky',1:'Mostly clear',2:'Partly cloudy',3:'Cloudy',45:'Fog',48:'Fog',51:'Drizzle',61:'Rain',63:'Rain',65:'Heavy rain',71:'Snow',80:'Showers',95:'Thunderstorm'};
function App(){
 const [appVersion,setAppVersion]=useState(buildVersion);
 useEffect(()=>{if(isTauri())getVersion().then(setAppVersion).catch(error=>console.error('Unable to read application version:',error))},[]);
 const [saved,setSaved]=useState(load),[page,setPage]=useState('Overview'),[now,setNow]=useState(new Date());
 const [updateState,setUpdateState]=useState('idle'),[updateInfo,setUpdateInfo]=useState(null),[updateError,setUpdateError]=useState(''),[updateProgress,setUpdateProgress]=useState(0),[lastChecked,setLastChecked]=useState(Number(localStorage.getItem(CHECK_KEY)||0));
 const [city,setCity]=useState(saved.city||'Salt Lake City'),[weather,setWeather]=useState(null),[weatherErr,setWeatherErr]=useState('');
 const [models,setModels]=useState([]),[model,setModel]=useState(''),[aiErr,setAiErr]=useState(''),[messages,setMessages]=useState([]),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false);
 const [ts,setTs]=useState(null),[tsErr,setTsErr]=useState(''),[notice,setNotice]=useState('');
 const [gpus,setGpus]=useState([]),[gpuError,setGpuError]=useState(''),[history,setHistory]=useState({}),[seconds,setSeconds]=useState(0),[speed,setSpeed]=useState(null),[streaming,setStreaming]=useState(false);
 const [gpuUpdatedAt,setGpuUpdatedAt]=useState(0);
 const gpuStale=Boolean(gpuError)||(gpuUpdatedAt>0&&now.getTime()-gpuUpdatedAt>6000);
 const [theme,setTheme]=useState(saved.theme||'violet'),[density,setDensity]=useState(saved.density||'comfortable'),[motion,setMotion]=useState(saved.motion!==false);
 const [dashboardProfiles,setDashboardProfiles]=useState(()=>loadProfiles(saved).profiles);
 const [activeProfile,setActiveProfile]=useState(()=>loadProfiles(saved).active);
 const [layoutEditing,setLayoutEditing]=useState(false);
 const dragWidgetRef=useRef(null);
 const [draggingWidget,setDraggingWidget]=useState(null);
 const layoutRef=useRef(null);
 const widgetOrder=dashboardProfiles[activeProfile].map(x=>x.id);
 const hiddenWidgets=dashboardProfiles[activeProfile].filter(x=>x.hidden).map(x=>x.id);
 const activeLayout=dashboardProfiles[activeProfile];
 function saveProfileLayout(next,profile=activeProfile){const updated={...dashboardProfiles,[profile]:next};setDashboardProfiles(updated);persist({dashboardProfiles:updated,activeDashboardProfile:profile})}
 function selectProfile(name){if(!dashboardProfiles[name])return;setActiveProfile(name);persist({activeDashboardProfile:name})}
 function addProfile(){const name=window.prompt('New layout profile name (up to 40 characters)');if(!name||!name.trim())return;const key=name.trim().slice(0,40);if(dashboardProfiles[key]){selectProfile(key);return}const updated={...dashboardProfiles,[key]:activeLayout.map(x=>({...x}))};setDashboardProfiles(updated);setActiveProfile(key);persist({dashboardProfiles:updated,activeDashboardProfile:key})}
 function resetActiveProfile(){if(!window.confirm('Restore the '+activeProfile+' layout to its preset?'))return;saveProfileLayout(presetLayout(activeProfile))}
 function resizeWidget(id){const current=activeLayout.find(x=>x.id===id);saveProfileLayout(changeWidget(activeLayout,id,{w:current?.w===2?1:2}))}
 function startWidgetDrag(e,id){
  if(e.button!==0)return;
  e.preventDefault();
  dragWidgetRef.current={id,pointerId:e.pointerId};
  setDraggingWidget(id);
  e.currentTarget.setPointerCapture(e.pointerId);
 }
 function finishWidgetDrag(e){
  const drag=dragWidgetRef.current;
  if(!drag||drag.pointerId!==e.pointerId)return;
  dragWidgetRef.current=null;
  setDraggingWidget(null);
  const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-dashboard-widget]')?.getAttribute('data-dashboard-widget');
  if(target&&target!==drag.id)saveProfileLayout(moveLayout(activeLayout,drag.id,target));
 }
 function cancelWidgetDrag(){dragWidgetRef.current=null;setDraggingWidget(null)}
 function moveWidgetBy(id,delta){const i=widgetOrder.indexOf(id),j=i+delta;if(j<0||j>=widgetOrder.length)return;saveProfileLayout(moveLayout(activeLayout,id,widgetOrder[j]))}
 const [noteSearch,setNoteSearch]=useState(''),[taskPriority,setTaskPriority]=useState('normal'),[taskDue,setTaskDue]=useState('');
 const [customName,setCustomName]=useState(''),[customUrl,setCustomUrl]=useState(''),[serverSearch,setServerSearch]=useState('');
 const [chats,setChats]=useState(saved.chats||[]),[chatId,setChatId]=useState(null);
 const chatRun=useRef(0);
 const [task,setTask]=useState(''),[note,setNote]=useState(saved.note||''),[noteTitle,setNoteTitle]=useState(''),[editingNote,setEditingNote]=useState(null),[taskFilter,setTaskFilter]=useState('active');
 useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.density=density;document.documentElement.dataset.motion=motion?'on':'off'},[theme,density,motion]);
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
 async function refreshGPU(){
  try{
   const data=await invoke('gpu_stats');const at=Date.now();
   setGpus(data.gpus||[]);setGpuError('');setGpuUpdatedAt(at);
   setHistory(old=>recordSamples(old,data.gpus||[],at));
  }catch(e){setGpuError(String(e));setHistory(old=>recordSamples(old,[],Date.now()))}
 }
 useEffect(()=>{refreshGPU();const id=setInterval(refreshGPU,2000);return()=>clearInterval(id)},[]);
 async function refreshWeather(q=city){try{setWeatherErr('');const geo=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`).then(r=>r.json());if(!geo.results?.length)throw Error('City not found');const p=geo.results[0];const result=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=5&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`).then(r=>r.json());setWeather({...result.current,daily:result.daily,location:`${p.name}, ${p.admin1||p.country}`});persist({city:q})}catch(e){setWeatherErr(String(e.message));setWeather(null)}}
 async function refreshAI(){try{setAiErr('');const r=await invoke('ollama_models');const list=r.models||[];setModels(list);setModel(m=>list.some(x=>x.name===m)?m:(list[0]?.name||''))}catch(e){setAiErr('Ollama unavailable: '+e);setModels([])}}
 async function refreshTS(){try{setTsErr('');setTs(await invoke('tailscale_status'))}catch(e){setTs(null);setTsErr(String(e))}}
 useEffect(()=>{refreshWeather();refreshAI();refreshTS();const id=setInterval(()=>{refreshAI();refreshTS()},60000);return()=>clearInterval(id)},[]);
 async function launch(id){try{notify(await invoke('launch_app',{app:id}))}catch(e){notify('Could not launch: '+e)}}
 function addTask(){if(!task.trim())return;persist({tasks:[...tasks,{id:Date.now(),text:task.trim(),done:false,priority:taskPriority,due:taskDue}]});setTask('');setTaskDue('')}
 function setAppearance(key,value){persist({[key]:value});({theme:setTheme,density:setDensity,motion:setMotion}[key])(value)}
 function moveWidget(name,delta){const i=widgetOrder.indexOf(name),j=i+delta;if(j<0||j>=widgetOrder.length)return;saveProfileLayout(moveLayout(activeLayout,name,widgetOrder[j]))}
 function toggleWidget(name){saveProfileLayout(changeWidget(activeLayout,name,{hidden:!hiddenWidgets.includes(name)}))}
 function addShortcut(){const name=customName.trim(),url=customUrl.trim();if(!name||!/^https?:\/\//i.test(url)){notify('Enter a name and a full https:// URL');return}const next=[...(saved.shortcuts||[]),{id:crypto.randomUUID(),name,url}];persist({shortcuts:next});setCustomName('');setCustomUrl('');notify('Shortcut added')}
 function newChat(){setChatId(null);setMessages([]);setQuestion('');setAiErr('')}
 function saveChat(){if(!messages.length)return;const id=chatId||crypto.randomUUID();const entry={id,model,title:messages.find(x=>x.role==='user')?.content?.slice(0,60)||'Conversation',messages,updatedAt:new Date().toISOString()};const next=[entry,...chats.filter(c=>c.id!==id)].slice(0,50);setChats(next);setChatId(id);persist({chats:next});notify('Conversation saved')}
 function openChat(c){if(busy)return;setChatId(c.id);setMessages(c.messages||[]);setModel(c.model||model);setPage('AI Center')}
 function stopChat(){chatRun.current++;setBusy(false);setStreaming(false);notify('Stopped displaying response. Ollama may finish its current request in the background.')}

 function toggleTask(id){persist({tasks:tasks.map(t=>t.id===id?{...t,done:!t.done}:t)})}
 function saveNote(){if(!note.trim())return;const now=new Date().toISOString();const title=noteTitle.trim()||note.trim().split('\n')[0].slice(0,55)||'Untitled note';const entry={id:editingNote||crypto.randomUUID(),title,content:note.trim(),updatedAt:now};persist({notes:editingNote?notes.map(n=>n.id===editingNote?entry:n):[entry,...notes],note:''});setNote('');setNoteTitle('');setEditingNote(null);notify(editingNote?'Note updated':'Note saved')}
 function editNote(n){setEditingNote(n.id);setNoteTitle(n.title);setNote(n.content);setPage('Tasks & Notes')}
 function clearEditor(){setEditingNote(null);setNoteTitle('');setNote('');persist({note:''})}
 function removeNote(id){if(!window.confirm('Delete this note permanently?'))return;persist({notes:notes.filter(n=>n.id!==id)});if(editingNote===id)clearEditor()}
 const taskRow=(t,showDelete=false)=><div className={'task-item '+(t.done?'is-done':'')} key={t.id}><label className="task-check"><input type="checkbox" checked={t.done} onChange={()=>toggleTask(t.id)} aria-label={'Complete '+t.text}/><span className="task-checkmark"><Check size={13} strokeWidth={3}/></span></label><span className="task-copy">{t.text}{(t.priority==='high'||t.due)&&<small className="task-meta">{t.priority==='high'?'● High priority':''}{t.due?' · Due '+t.due:''}</small>}</span>{showDelete&&<button className="task-delete" title="Delete task" aria-label={'Delete '+t.text} onClick={()=>persist({tasks:tasks.filter(x=>x.id!==t.id)})}><Trash2 size={16}/></button>}</div>;
 async function send(){
  if(!question.trim()||!model||busy)return;
  const run=++chatRun.current;const next=[...messages,{role:'user',content:question.trim()}];
  setMessages([...next,{role:'assistant',content:''}]);setQuestion('');setBusy(true);setStreaming(true);setSeconds(0);setSpeed(null);setAiErr('');
  try{
   const channel=new Channel();
   channel.onmessage=event=>{
    if(run!==chatRun.current)return;
    if(event.type==='token')setMessages(old=>old.map((m,i)=>i===next.length?{...m,content:m.content+event.text}:m));
    if(event.type==='done'&&event.eval_duration>0)setSpeed((event.eval_count*1e9/event.eval_duration).toFixed(1));
   };
   await invoke('ollama_chat_stream',{model,messages:next.slice(-20),onEvent:channel});
  }catch(e){setAiErr('Chat error: '+e)}finally{if(run===chatRun.current){setBusy(false);setStreaming(false)}}
 }
 function gpuCard(gpu){
  return <section className={'panel gpu-panel'+(gpuStale?' is-stale':'')} key={gpu.index}>
   <div className="panel-head"><h3>GPU {gpu.index} · {gpu.name}</h3><span className={'telemetry-status '+(gpuStale?'stale':'')}><span className={'dot '+(gpuStale?'warning':'good')}/>{gpuStale?'Stale':'Live'}</span></div>
   <div className="gpu-metrics"><div><span>Utilization</span><strong>{gpu.util??'—'}<small>%</small></strong></div><div><span>Temperature</span><strong>{gpu.temp??'—'}<small>°C</small></strong></div><div><span>Power</span><strong>{gpu.power==null?'—':Math.round(gpu.power)}<small>W</small></strong></div></div>
   <UtilizationChart samples={history[gpu.index]||[]} now={now.getTime()} name={'GPU '+gpu.index}/>
   <div className="gpu-vram"><span>VRAM capacity</span><span>{gpu.used??'—'} / {gpu.total??'—'} MiB</span></div>
   <div className="gpu-track" role="meter" aria-label={'GPU '+gpu.index+' VRAM usage'} aria-valuemin={0} aria-valuemax={gpu.total||1} aria-valuenow={gpu.used??0} aria-valuetext={gpu.used==null?'Unavailable':gpu.used+' of '+gpu.total+' MiB'}><div style={{width:`${gpu.total?Math.min(100,100*(gpu.used||0)/gpu.total):0}%`}}/></div>
   <p className="telemetry-updated">{gpuStale?'Last successful reading':'Updated'} {gpuUpdatedAt?new Date(gpuUpdatedAt).toLocaleTimeString():'—'} · Local NVIDIA telemetry</p>
  </section>
 }

 const hardwareCard=<section className="panel"><div className="panel-head"><h3>GPU monitoring</h3><button className="icon-btn" onClick={refreshGPU} title="Refresh GPUs" aria-label="Refresh GPUs"><RefreshCw size={16}/></button></div>{gpuError?<p className="error">{gpuError}</p>:<div className="gpu-summary">{!gpus.length&&<p className="muted">{gpuUpdatedAt?'No NVIDIA GPU detected.':'Connecting to local telemetry…'}</p>}{gpus.map(g=><div key={g.index}><span>{g.name}</span><strong>{g.util??'—'}<small>%</small></strong><div className="gpu-track"><div style={{width:`${g.util??0}%`}}/></div><div className="gpu-summary-details"><span>{g.temp??'—'}°C</span><span>{g.used??'—'} / {g.total??'—'} MiB VRAM</span></div></div>)}</div>}<button className="secondary" onClick={()=>setPage('Hardware')}>View live graphs →</button></section>;

 const customShortcuts=saved.shortcuts||[];
 const launchCard=<section className="panel"><div className="panel-head"><h3>Quick launch</h3><span className="widget-meta"><Rocket size={14} aria-hidden="true"/>{apps.length+customShortcuts.length} shortcuts</span></div><div className="launch-grid">{apps.map(([name,id,Icon])=><button key={id} className="app-btn" onClick={()=>launch(id)}><span className="app-icon"><Icon size={20} aria-hidden="true"/></span><span className="launch-name">{name}</span><ExternalLink size={13} aria-hidden="true"/></button>)}{customShortcuts.map(item=><button key={item.id} className="app-btn" onClick={()=>invoke('open_url',{url:item.url}).catch(e=>notify(String(e)))}><span className="app-icon" aria-hidden="true">{item.name.slice(0,2).toUpperCase()}</span><span className="launch-name">{item.name}</span><ExternalLink size={13} aria-hidden="true"/></button>)}</div></section>;
 const weatherCard=<section className="panel"><div className="panel-head"><h3>Weather</h3><button className="icon-btn" onClick={()=>refreshWeather()} title="Refresh weather" aria-label="Refresh weather"><RefreshCw size={16}/></button></div>{weather?<div className="weather"><CloudSun size={36} className="weather-icon" aria-hidden="true"/><div><strong>{Math.round(weather.temperature_2m)}°F</strong><div className="muted">{WMO[weather.weather_code]||'Current conditions'}</div></div></div>:<p className="muted">{weatherErr||'Loading weather…'}</p>}<div className="weather-details"><span>{weather?.location||city}</span>{weather&&<span>Humidity {weather.relative_humidity_2m}% · Wind {Math.round(weather.wind_speed_10m)} mph</span>}</div>{weather?.daily&&<div className="forecast-strip">{weather.daily.time.slice(0,5).map((date,i)=><div key={date}><small>{new Date(date+'T12:00:00').toLocaleDateString([],{weekday:'short'})}</small><strong>{Math.round(weather.daily.temperature_2m_max[i])}°</strong><span>{Math.round(weather.daily.temperature_2m_min[i])}°</span></div>)}</div>}</section>;
 const aiCard=<section className="panel"><div className="panel-head"><h3>Local AI · Ollama</h3><button className="icon-btn" onClick={refreshAI} aria-label="Refresh AI models"><RefreshCw size={16}/></button></div><div className="status service-status"><span className={'dot '+(models.length?'good':'bad')}/>{models.length?`${models.length} model(s) available`:'Not connected'}</div><div className="muted">{model||'Start Ollama to connect'}</div><button className="secondary" onClick={()=>setPage('AI Center')}>Open AI chat →</button></section>;
 const taskCard=<section className="panel"><div className="panel-head"><h3>Tasks</h3><span className="muted tiny">{tasks.filter(x=>!x.done).length} remaining</span></div><div className="tasks task-list">{tasks.slice(0,5).map(t=>taskRow(t))}{!tasks.length&&<p className="muted">No tasks yet.</p>}</div><button className="secondary" onClick={()=>setPage('Tasks & Notes')}>Manage tasks →</button></section>;
 const peers=Object.values(ts?.Peer||{});
 const serverCard=<section className="panel"><div className="panel-head"><h3>Tailscale</h3><button className="icon-btn" onClick={refreshTS} aria-label="Refresh devices"><RefreshCw size={16}/></button></div><div className="status service-status"><span className={'dot '+(ts?'good':'bad')}/>{ts?`${ts.BackendState||'Connected'} · ${peers.filter(p=>p.Online).length}/${peers.length} peers online`:'Not connected'}</div>{tsErr&&<p className="muted tiny">{tsErr}</p>}<button className="secondary" onClick={()=>setPage('Servers')}>View devices →</button></section>;
 return <div className="shell"><aside className="sidebar"><div className="brand"><div className="brand-logo">H</div><div><strong>HYBRID</strong><small>COMMAND CENTER</small></div></div><nav className="navigation" aria-label="Main navigation">{nav.map(([name,Icon],i)=><React.Fragment key={name}>{(i===0||i===5||i===7)&&<div className={'nav-label'+(i===7?' nav-configuration':'')}>{i===0?'WORKSPACE':i===5?'MONITORING':'CONFIGURATION'}</div>}<button className={'nav '+(page===name?'selected':'')} aria-current={page===name?'page':undefined} onClick={()=>setPage(name)}><Icon size={19} aria-hidden="true"/>{name}</button></React.Fragment>)}</nav><div className="sidebar-foot"><span>Local-first workspace</span><small>Desktop · v{appVersion}</small></div></aside><main className="main"><header className="topbar"><div><div className="eyebrow">YOUR WORKSPACE / {page.toUpperCase()}</div><h1>{page}</h1>{page==='Overview'&&<p className="page-subtitle">Good {now.getHours()<12?'morning':now.getHours()<17?'afternoon':'evening'}. Your apps, local AI and systems, at a glance.</p>}</div><div className="clock"><Clock3 size={17}/><div><strong>{now.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</strong><small>{now.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})}</small></div></div></header>
 {page==='Overview'&&<><div className="overview-toolbar"><div className="row"><label className="muted">Layout <select aria-label="Dashboard layout profile" value={activeProfile} onChange={e=>selectProfile(e.target.value)}>{Object.keys(dashboardProfiles).map(name=><option key={name}>{name}</option>)}</select></label><button className="secondary" onClick={addProfile}><Plus size={14}/> New profile</button><button className="secondary" onClick={resetActiveProfile} title="Restore this profile's original layout"><RotateCcw size={14}/> Reset profile</button><button className="primary" aria-pressed={layoutEditing} onClick={()=>setLayoutEditing(x=>!x)}>{layoutEditing?'Done editing':'Edit layout'}</button></div><button className="secondary" onClick={()=>setPage('Appearance')}><Palette size={15}/> Appearance</button></div><div className="dashboard-grid" key={activeProfile}>{activeLayout.filter(item=>!item.hidden).map(item=><div key={item.id} className={'dashboard-widget '+(item.w===2?'dashboard-widget-wide':'')+(layoutEditing?' editing':'')+(draggingWidget===item.id?' is-dragging':'')} data-dashboard-widget={item.id}>{layoutEditing&&<div className="widget-edit-bar"><button type="button" className="drag-handle" title="Hold and drag onto another widget to move" onPointerDown={e=>startWidgetDrag(e,item.id)} onPointerUp={finishWidgetDrag} onPointerCancel={cancelWidgetDrag} aria-label={'⠿ Drag · '+item.id}><GripVertical size={16} aria-hidden="true"/> Drag · {item.id}</button><div className="row"><button className="secondary" title="Move widget up" onClick={()=>moveWidgetBy(item.id,-1)} aria-label={'Move '+item.id+' up'}><ArrowUp size={16}/></button><button className="secondary" title="Move widget down" onClick={()=>moveWidgetBy(item.id,1)} aria-label={'Move '+item.id+' down'}><ArrowDown size={16}/></button><button className="secondary" onClick={()=>resizeWidget(item.id)}>{item.w===2?'Half width':'Full width'}</button></div></div>}<React.Fragment>{({'Quick launch':launchCard,'Local AI · Ollama':aiCard,'Weather':weatherCard,'Tasks':taskCard,'Tailscale':serverCard,'GPU monitoring':hardwareCard,'Recent notes':<section className="panel"><div className="panel-head"><h3>Recent notes</h3><StickyNote size={18}/></div>{notes.length?<div className="recent-notes">{notes.slice(0,3).map(n=><button key={n.id} className="recent-note" onClick={()=>editNote(n)}><strong>{n.title}</strong><span>{n.content.slice(0,85)}</span></button>)}</div>:<p className="muted">No saved notes yet.</p>}<button className="secondary" onClick={()=>setPage('Tasks & Notes')}>Open notes →</button></section>})[item.id]}</React.Fragment></div>)}</div></>}
 {page==='Launcher'&&<div className="grid two">{launchCard}<section className="panel"><h3>Add a website shortcut</h3><p className="muted">Create launch tiles for websites you use often. HTTPS links open in your default browser.</p><input aria-label="Shortcut name" placeholder="Shortcut name" value={customName} onChange={e=>setCustomName(e.target.value)}/><input aria-label="Shortcut URL" placeholder="https://example.com" value={customUrl} onChange={e=>setCustomUrl(e.target.value)}/><button className="primary" onClick={addShortcut}><Plus size={15}/> Add shortcut</button><div className="shortcut-list">{customShortcuts.map(item=><div className="device" key={item.id}><div><strong>{item.name}</strong><small>{item.url}</small></div><button className="icon-btn" aria-label={'Delete shortcut '+item.name} onClick={()=>persist({shortcuts:customShortcuts.filter(x=>x.id!==item.id)})}><Trash2 size={15}/></button></div>)}</div></section><section className="panel"><h3>Launcher tips</h3><p className="muted">Apps must be installed locally. Steam, Discord, and VS Code use their registered Windows protocols. Terminal requires Windows Terminal.</p></section></div>}
 {page==='AI Center'&&<div className="panel chat-panel"><div className="panel-head"><h3>Ollama Chat</h3><button className="icon-btn" onClick={refreshAI} aria-label="Refresh AI models"><RefreshCw size={17}/></button></div><div className="row"><select aria-label="AI model" value={model} onChange={e=>{setModel(e.target.value);setMessages([])}}><option value="">Select a model</option>{models.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}</select><button className="secondary" onClick={newChat}><Plus size={14}/> New chat</button><button className="secondary" onClick={saveChat} disabled={!messages.length}>Save chat</button>{busy&&<button className="secondary stop-btn" onClick={stopChat}><Square size={14}/> Stop</button>}</div>{aiErr&&<p className="error">{aiErr}</p>}{chats.length>0&&<div className="chat-history"><span className="muted tiny">Saved conversations</span>{chats.slice(0,8).map(c=><button key={c.id} onClick={()=>openChat(c)}>{c.title}</button>)}</div>}<div className="chat-messages">{!messages.length&&<div className="empty"><Bot size={40}/><h3>Your local AI is ready when you are.</h3><p>Choose a model and ask a question. Chat stays in this application.</p></div>}{messages.map((m,i)=><div key={i} className={'bubble '+m.role}>{m.content}</div>)}{busy&&<p className="muted">{streaming?'Generating / loading':'Waiting'} · {seconds}s elapsed</p>}</div><div className="tiny muted">{speed&&`Last response: ${speed} tokens/sec`}</div><div className="chat-input"><input aria-label="Ask your local AI…" placeholder="Ask your local AI…" value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()}/><button className="primary" aria-label="Send message" disabled={!model||busy} onClick={send}><Send size={18}/></button></div></div>}
 {page==='Weather'&&<div className="grid two">{weatherCard}<section className="panel"><h3>Weather location</h3><p className="muted">Enter a city. No location permissions needed.</p><div className="row"><input aria-label="Weather city" value={city} onChange={e=>setCity(e.target.value)} onKeyDown={e=>e.key==='Enter'&&refreshWeather()}/><button className="primary" onClick={()=>refreshWeather()}>Update</button></div><p className="tiny muted">Powered by Open-Meteo</p></section></div>}
 {page==='Tasks & Notes'&&<div className="workspace-grid"><section className="panel workspace-panel"><div className="workspace-heading"><div><h3>My tasks</h3><p className="muted">Stay on top of what matters.</p></div><span className="count-pill">{tasks.filter(t=>!t.done).length} remaining</span></div><div className="task-compose"><input value={task} placeholder="What needs to get done?" aria-label="New task" onChange={e=>setTask(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addTask()}/><button className="primary" disabled={!task.trim()} onClick={addTask}><Plus size={17}/> Add</button></div><div className="task-options"><label>Priority <select value={taskPriority} onChange={e=>setTaskPriority(e.target.value)}><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label><label>Due date <input type="date" value={taskDue} onChange={e=>setTaskDue(e.target.value)}/></label></div><div className="task-tabs">{[['active','To do'],['completed','Completed'],['all','All']].map(([key,label])=><button key={key} className={taskFilter===key?'active':''} onClick={()=>setTaskFilter(key)}>{label}</button>)}</div><div className="task-list">{filteredTasks.map(t=>taskRow(t,true))}{!filteredTasks.length&&<div className="workspace-empty"><CircleCheck size={25}/><p>{taskFilter==='completed'?'No completed tasks yet.':taskFilter==='active'?'All caught up!':'Add your first task above.'}</p></div>}</div></section><section className="panel workspace-panel"><div className="workspace-heading"><div><h3>Notes</h3><p className="muted">Capture ideas and keep them organized.</p></div><span className="count-pill">{notes.length} saved</span></div><div className="note-editor"><input value={noteTitle} onChange={e=>setNoteTitle(e.target.value)} placeholder="Note title" aria-label="Note title" maxLength={120}/><textarea value={note} onChange={e=>{setNote(e.target.value);persist({note:e.target.value})}} placeholder="Start writing your note…" aria-label="Note content"/><div className="note-actions"><span className="tiny muted">{editingNote?'Editing saved note':'New note · draft kept locally'}</span><div className="row">{(editingNote||note||noteTitle)&&<button className="secondary compact" onClick={clearEditor}><X size={15}/> Clear</button>}<button className="primary" disabled={!note.trim()} onClick={saveNote}><Save size={16}/>{editingNote?'Update Note':'Save Note'}</button></div></div></div><div className="saved-heading"><h3>Saved notes</h3><span className="muted tiny">Newest first</span></div><div className="note-search"><Search size={17}/><input aria-label="Search saved notes…" placeholder="Search saved notes…" value={noteSearch} onChange={e=>setNoteSearch(e.target.value)}/></div><div className="saved-notes">{[...notes].filter(n=>(n.title+' '+n.content).toLowerCase().includes(noteSearch.toLowerCase())).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).map(n=><article className="saved-note" key={n.id}><div className="saved-note-top"><div className="saved-note-icon"><FileText size={17}/></div><div className="saved-note-heading"><strong>{n.title}</strong><span>{n.updatedAt?new Date(n.updatedAt).toLocaleString([],{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'Saved note'}</span></div></div><p>{n.content}</p><div className="saved-note-actions"><button onClick={()=>editNote(n)}><Pencil size={14}/> Edit</button><button className="danger" onClick={()=>removeNote(n.id)}><Trash2 size={14}/> Delete</button></div></article>)}{!notes.length&&<div className="workspace-empty"><StickyNote size={25}/><p>Save your first note to see it here.</p></div>}</div><p className="tiny muted privacy-note">Notes are stored locally and are not encrypted. Do not store passwords or PHI.</p></section></div>}
 {page==='Servers'&&<div className="panel"><div className="panel-head"><h3>Tailscale devices</h3><button className="secondary" onClick={refreshTS}><RefreshCw size={15}/> Refresh</button></div>{ts?<><div className="status"><CircleCheck color="#4ade80" size={18}/> {ts.BackendState} · {peers.length} peers</div><div className="note-search"><Search size={17}/><input aria-label="Find a device…" placeholder="Find a device…" value={serverSearch} onChange={e=>setServerSearch(e.target.value)}/></div><div className="device-list">{peers.filter(p=>(p.HostName+' '+p.DNSName+' '+(p.TailscaleIPs||[]).join(' ')).toLowerCase().includes(serverSearch.toLowerCase())).sort((a,b)=>Number(b.Online)-Number(a.Online)).map((p,i)=><div className="device" key={i}>{p.Online?<CircleCheck color="#4ade80" size={17}/>:<CircleAlert color="#f59e0b" size={17}/>}<div><strong>{p.HostName||p.DNSName||'Unknown device'}</strong><small>{p.TailscaleIPs?.join(', ')||'No IP'}</small></div><span className="muted">{p.Online?'Online':'Offline'}</span></div>)}</div></>:<p className="error">{tsErr||'Tailscale is not available.'}</p>}<p className="tiny muted">Status only. No remote shell or admin actions in v1.</p></div>}
 {page==='Hardware'&&<><div className="panel-head hardware-heading"><div><h3>GPU performance</h3><p className="muted">Local NVIDIA telemetry · refreshes every 2 seconds</p></div><button className="secondary" onClick={refreshGPU}><RefreshCw size={15}/> Refresh</button></div>{gpuError&&<p className="error" role="alert">Telemetry unavailable. Retained readings may be stale. {gpuError}</p>}{!gpus.length&&<div className="panel hardware-empty"><Activity size={28}/><h3>{gpuError?'Telemetry unavailable':gpuUpdatedAt?'No NVIDIA GPU detected':'Connecting to telemetry…'}</h3><p className="muted">Hardware monitoring requires a supported NVIDIA GPU and local nvidia-smi.</p></div>}<div className="grid two hardware-grid">{gpus.map(gpuCard)}</div><p className="tiny muted">Metrics come from your local nvidia-smi executable. Graphs show recent GPU utilization.</p></>}
 {page==='Appearance'&&<div className="appearance-page"><section className="panel"><div className="panel-head"><h3>Appearance & Themes</h3><Palette size={20}/></div><p className="muted">Switch instantly. Your choice is saved and carries over to future updates.</p><div className="theme-grid">{THEMES.map(t=><button key={t.id} aria-pressed={theme===t.id} className={'theme-tile '+(theme===t.id?'active':'')} onClick={()=>setAppearance('theme',t.id)}><div className={'theme-sample sample-'+t.id} aria-hidden="true"><span className="preview-nav"/><span className="preview-content"><i/><i/><i/></span></div><div className="theme-name"><strong>{t.name}</strong>{theme===t.id&&<CircleCheck size={16}/>}</div><small>{t.description}</small></button>)}</div></section><section className="panel"><h3>Display preferences</h3><div className="appearance-options"><label>Interface density<select value={density} onChange={e=>setAppearance('density',e.target.value)}><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option></select></label><label className="appearance-toggle"><input type="checkbox" role="switch" checked={motion} onChange={e=>setAppearance('motion',e.target.checked)}/> Enable subtle animations</label></div></section><section className="panel"><div className="panel-head"><h3>Customize Overview</h3><LayoutDashboard size={18}/></div><p className="muted">Show or hide widgets, move their order, or drag and resize them directly on the Overview page. Each profile has its own layout.</p><p className="profile-context">Editing profile <strong>{activeProfile}</strong></p><div className="widget-list">{widgetOrder.map((name,i)=><div className="widget-row" key={name}><label><input type="checkbox" checked={!hiddenWidgets.includes(name)} onChange={()=>toggleWidget(name)}/>{name}</label><div className="row"><button className="icon-btn" disabled={i===0} onClick={()=>moveWidget(name,-1)} title="Move up" aria-label={'Move '+name+' up'}><ArrowUp size={16}/></button><button className="icon-btn" disabled={i===widgetOrder.length-1} onClick={()=>moveWidget(name,1)} title="Move down" aria-label={'Move '+name+' down'}><ArrowDown size={16}/></button></div></div>)}</div><button className="secondary" onClick={()=>{saveProfileLayout(defaultLayout())}}><RotateCcw size={14}/> Reset widgets</button></section></div>}
 {page==='Settings'&&<div className="settings-page">
  <section className="panel settings"><div className="settings-heading"><Settings size={20}/><div><h3>Preferences</h3><p className="muted">Make this workspace yours.</p></div></div>
   <div className="settings-city-row"><label>Weather city<input value={city} onChange={e=>setCity(e.target.value)}/></label><button className="secondary" onClick={()=>refreshWeather()}>Save city</button></div>
   <div className="settings-link"><div><strong>Appearance & display</strong><p className="muted">{THEMES.find(t=>t.id===theme)?.name} · {density} density</p></div><button className="secondary" onClick={()=>setPage('Appearance')}><Palette size={15}/> Customize</button></div>
  </section>
  <section className="panel settings"><div className="settings-heading"><Download size={20}/><div><h3>Application Updates</h3><p className="muted">Version {appVersion} · Daily checks · Manual installation</p></div></div>
   <p className={'settings-status '+(updateState==='error'?'error':'')} role="status">{updateState==='checking'?'Checking for updates…':updateState==='available'?`Version ${updateInfo?.version} is available`:updateState==='current'?'You are up to date':updateState==='installing'?`Installing update: ${updateProgress}%`:updateState==='error'?'Update check failed':'Ready to check for updates'}</p>
   {updateInfo&&<p className="muted release-notes">{updateInfo.body||'New release available.'}</p>}{updateError&&<p className="error">{updateError}</p>}
   <div className="row"><button className="primary" disabled={updateState==='checking'||updateState==='installing'} onClick={()=>checkUpdates(true)}><RefreshCw size={16}/> Check for Updates</button>{updateState==='available'&&<button className="primary" onClick={installUpdate}>Install v{updateInfo.version}</button>}</div>
   <p className="tiny muted">Last successful check: {lastChecked?new Date(lastChecked).toLocaleString():'Never'}. Updates are cryptographically verified before installation.</p>
  </section>
  <section className="panel settings"><div className="settings-heading"><Save size={20}/><div><h3>Backup & Restore</h3><p className="muted">Keep a copy of your workspace.</p></div></div>
   <p className="muted">Export tasks, saved notes, weather settings and other dashboard preferences to a JSON file.</p>
   <div className="row"><button className="secondary" onClick={backup}><Save size={16}/> Export Backup</button><button className="secondary restore-button" onClick={restore}>Restore Backup</button></div>
   <p className="backup-warning"><CircleAlert size={16}/> Backup files are NOT encrypted. Store them securely. Restore replaces existing local data.</p>
  </section>
  <section className="panel settings"><div className="settings-heading"><LayoutDashboard size={20}/><div><h3>About</h3><p className="muted">Hybrid Command Center v{appVersion}</p></div></div>
   <p className="muted">Your local-first Windows desktop workspace for applications, AI, tasks and hardware monitoring.</p>
   <p className="tiny muted">Do not store credentials or PHI in local notes.</p>
  </section>
 </div>}

 {notice&&<div className="toast" role="status">{notice}</div>}
 </main></div>
}
createRoot(document.getElementById('root')).render(<App/>);
