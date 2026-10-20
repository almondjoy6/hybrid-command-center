import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_WIDGETS,loadProfiles,normalizeLayout,moveLayout,changeWidget} from './layout.js';
test('migrates v0.4.0 order and hidden widgets',()=>{const x=loadProfiles({widgetOrder:['Weather','Tasks'],hiddenWidgets:['Tasks']});assert.equal(x.profiles.Default[0].id,'Weather');assert.equal(x.profiles.Default[1].hidden,true);assert.equal(x.profiles.Default.length,DEFAULT_WIDGETS.length)});
test('invalid layout is normalized and duplicate widgets removed',()=>{const x=normalizeLayout([{id:'Weather',w:99},{id:'Weather',w:2},{id:'unknown'}]);assert.equal(x.length,DEFAULT_WIDGETS.length);assert.equal(x[0].w,1)});
test('moving and resizing preserves widget identity',()=>{let x=moveLayout(normalizeLayout(), 'Weather','Quick launch');assert.equal(x[0].id,'Weather');x=changeWidget(x,'Weather',{w:2});assert.equal(x[0].w,2)});
test('saved profiles remain separate',()=>{const x=loadProfiles({dashboardProfiles:{Gaming:[{id:'GPU monitoring',w:2}]},activeDashboardProfile:'Gaming'});assert.equal(x.active,'Gaming');assert.equal(x.profiles.Gaming[0].id,'GPU monitoring');assert.equal(x.profiles.Default[0].id,'Quick launch')});

test('built-in profiles have different arrangements',()=>{const p=loadProfiles({}).profiles;for(const name of ['Gaming','Development','Servers'])assert.notDeepEqual(p[name],p.Default);assert.notDeepEqual(p.Gaming,p.Servers)});
test('profile changes do not overwrite other layouts',()=>{const p=loadProfiles({dashboardProfiles:{Gaming:[{id:'GPU monitoring',w:2,hidden:false}],Servers:[{id:'Tailscale',w:2,hidden:false}]}}).profiles;assert.equal(p.Gaming[0].id,'GPU monitoring');assert.equal(p.Servers[0].id,'Tailscale')});

test('v0.5 profiles retain placement and append optional productivity widgets hidden',()=>{const old=[{id:'Tasks',w:2,hidden:false},{id:'Quick launch',w:1,hidden:true}];const p=loadProfiles({dashboardProfiles:{Default:old}}).profiles.Default;assert.deepEqual(p.slice(0,2),old);for(const id of ['Stopwatch','Countdown timer','Upcoming reminders'])assert.equal(p.find(x=>x.id===id).hidden,true);const visible=changeWidget(p,'Stopwatch',{hidden:false});assert.equal(visible.find(x=>x.id==='Stopwatch').hidden,false)});
