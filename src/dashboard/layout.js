const productivityWidgets = ['Stopwatch','Countdown timer','Upcoming reminders'];
export const DEFAULT_WIDGETS = ['Quick launch','Local AI · Ollama','Weather','Tasks','Tailscale','GPU monitoring','Recent notes',...productivityWidgets];
export const PROFILE_NAMES = ['Default','Gaming','Development','Servers'];
const wide = ['Quick launch','GPU monitoring'];
const presets={
 Gaming:{order:['GPU monitoring','Quick launch','Local AI · Ollama','Tailscale','Weather','Tasks','Recent notes'],hidden:['Recent notes','Tasks'],wide:['GPU monitoring','Quick launch']},
 Development:{order:['Local AI · Ollama','Quick launch','GPU monitoring','Tasks','Recent notes','Tailscale','Weather'],hidden:['Weather'],wide:['Local AI · Ollama','Quick launch']},
 Servers:{order:['Tailscale','GPU monitoring','Tasks','Quick launch','Local AI · Ollama','Weather','Recent notes'],hidden:['Weather','Recent notes'],wide:['Tailscale','GPU monitoring']}
};
export function presetLayout(name){const p=presets[name];if(!p)return defaultLayout();return defaultLayout(p.order,p.hidden).map(x=>({...x,w:p.wide.includes(x.id)?2:1}));}
export function defaultLayout(order=DEFAULT_WIDGETS, hidden=[]) {
  const seen = new Set();
  return [...order,...DEFAULT_WIDGETS].filter(name=>DEFAULT_WIDGETS.includes(name)&&!seen.has(name)&&seen.add(name)).map(id=>({id,w:wide.includes(id)?2:1,hidden:hidden.includes(id)||productivityWidgets.includes(id)}));
}
export function normalizeLayout(items) {
  if(!Array.isArray(items)) return defaultLayout();
  const seen=new Set();
  const cleaned=items.filter(x=>x&&typeof x.id==='string'&&DEFAULT_WIDGETS.includes(x.id)&&!seen.has(x.id)&&seen.add(x.id)).map(x=>({id:x.id,w:x.w===2?2:1,hidden:x.hidden===true}));
  for(const item of defaultLayout()) if(!seen.has(item.id)) cleaned.push(item);
  return cleaned;
}
export function loadProfiles(saved={}) {
  const old=defaultLayout(saved.widgetOrder||DEFAULT_WIDGETS,saved.hiddenWidgets||[]);
  const incoming=saved.dashboardProfiles;
  const profiles={};
  for(const name of PROFILE_NAMES) profiles[name]=normalizeLayout(incoming?.[name]||(name==='Default'?old:presetLayout(name)));
  if(incoming&&typeof incoming==='object') for(const [name,items] of Object.entries(incoming)) if(!profiles[name]&&name.length<=40) profiles[name]=normalizeLayout(items);
  const active=profiles[saved.activeDashboardProfile]?saved.activeDashboardProfile:'Default';
  return {profiles,active};
}
export function moveLayout(items,from,to) {
  const next=normalizeLayout(items);
  const a=next.findIndex(x=>x.id===from),b=next.findIndex(x=>x.id===to);
  if(a<0||b<0||a===b)return next;
  const [item]=next.splice(a,1);next.splice(b,0,item);return next;
}
export function changeWidget(items,id,patch) {
  return normalizeLayout(items).map(x=>x.id===id?{...x,...patch,id:x.id,w:patch.w===undefined?x.w:(patch.w===2?2:1)}:x);
}
