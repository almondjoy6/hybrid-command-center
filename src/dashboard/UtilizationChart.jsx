import React, {useState} from 'react';
import {Pause, Play} from 'lucide-react';
import {HISTORY_MS, utilizationPath} from './telemetry.js';

export default function UtilizationChart({samples, now, name}) {
  const [frozen, setFrozen] = useState(null);
  const [selectedAt, setSelectedAt] = useState(null);
  const end = frozen?.end ?? now;
  const visible = (frozen?.samples ?? samples).filter(sample => sample.at >= end - HISTORY_MS && sample.at <= end);
  const index = Math.max(0, visible.findIndex(sample => sample.at === selectedAt));
  const selected = selectedAt == null ? visible.at(-1) : visible[index];
  const value = selected?.value == null ? 'Unavailable' : `${selected.value}% utilization`;
  const label = selected ? `${new Date(selected.at).toLocaleTimeString()} · ${value}` : 'Collecting history…';
  const valid = visible.filter(sample => sample.value != null);
  const path = utilizationPath(visible, end);
  return <div className="gpu-history">
    <div className="chart-heading"><span><i className="series-key"/>Utilization <span className="muted tiny">· last 70 seconds</span></span>
      <button className="icon-btn" aria-label={frozen ? 'Resume graph for '+name : 'Pause graph for '+name}
        aria-pressed={Boolean(frozen)} title={frozen ? 'Resume graph' : 'Pause graph'}
        onClick={()=>{setFrozen(frozen ? null : {end, samples: [...samples]});setSelectedAt(null)}}>
        {frozen ? <Play size={15}/> : <Pause size={15}/>}</button></div>
    <div className="gpu-chart" role="img" aria-label={`${name}: GPU utilization, 0 to 100 percent over the last 70 seconds. ${label}`}>
      <div className="chart-y-axis" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
      <div className="chart-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[0, 50, 100].map(y=><line key={y} className="chart-gridline" x1="0" x2="100" y1={y} y2={y} vectorEffect="non-scaling-stroke"/>)}
          <path className="chart-line" d={path} fill="none" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>
        </svg>
        {selected?.value != null&&<span className="chart-point" style={{left:`${100*(selected.at-end+HISTORY_MS)/HISTORY_MS}%`,top:`${100-selected.value}%`}}/>}
        {valid.length<2&&<span className="chart-empty">{visible.length>1&&!valid.length?'Utilization unavailable':'Collecting history…'}</span>}
      </div>
    </div>
    <div className="chart-time-axis" aria-hidden="true"><span>−70s</span><span>−35s</span><span>{frozen ? 'Paused' : 'Now'}</span></div>
    <div className="chart-inspect"><output aria-live="off">{label}</output>
      <input type="range" min="0" max={Math.max(0,visible.length-1)} value={selectedAt==null?Math.max(0,visible.length-1):index}
        disabled={!visible.length} aria-label={'Inspect history for '+name} aria-valuetext={label}
        onChange={event=>setSelectedAt(visible[Number(event.target.value)]?.at ?? null)}/></div>
  </div>;
}
