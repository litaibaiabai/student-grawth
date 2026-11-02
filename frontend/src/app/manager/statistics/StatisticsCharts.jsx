import React from 'react';
import { UIIcon } from '../../core/illustrations';

const colors = { green:'#3f7751',gold:'#c5a15c',sage:'#a7bb86',blue:'#829fa5',gray:'#c7cfbf' };
const number = value => Number(value).toLocaleString('zh-CN');

export function MetricStrip({ items }) {
  return <div className="statistics-metrics">{items.map(item => <div className="statistics-metric" key={item.label}>
    <span><UIIcon name={item.icon} />{item.label}</span>
    <strong>{item.value}<small>{item.unit}</small></strong><p>{item.note}</p>
  </div>)}</div>;
}

export function BarChart({ rows, series, maximum, unit = '次', percent = false }) {
  const total = row => series.reduce((sum,s) => sum + (Number(row[s.key]) || 0),0);
  const max = maximum || Math.max(1,...rows.map(total));
  return <div className="statistics-bars">
    <div className="statistics-chart-legend">{series.map(s => <span key={s.key}><i style={{ background:colors[s.tone] }} />{s.label}</span>)}</div>
    {rows.length ? <div className="statistics-bar-rows">{rows.map((row,index) => <div className="statistics-bar-row" key={row.key || row.label || index}>
      <span>{row.label}</span><div className="statistics-bar-track" role="img" aria-label={`${row.label}，${series.map(s=>`${s.label} ${number(row[s.key] || 0)} ${unit}`).join('，')}`}>
        {series.map(s => <i key={s.key} style={{width:`${Math.max(0,Math.min(100,(Number(row[s.key]) || 0)/max*100))}%`,background:colors[s.tone]}} />)}
      </div><b>{percent ? row.rate === null ? '—' : `${row.rate}%` : number(total(row))}<small>{percent ? '' : unit}</small></b>
    </div>)}</div> : <p className="statistics-chart-empty">当前范围暂无学生数据</p>}
    <div className="statistics-chart-axis"><span>0{percent?'%':''}</span><span>{percent?'50%':number(Math.round(max/2))}</span><span>{percent?'100%':`${number(max)} ${unit}`}</span></div>
  </div>;
}

export function RingChart({ segments, centerValue, centerLabel, unit = '项' }) {
  const total=segments.reduce((sum,s)=>sum+s.value,0);
  let position=0;
  const gradient=total ? `conic-gradient(${segments.map(s=>{const start=position;position+=s.value/total*100;return `${colors[s.tone]} ${start}% ${position}%`}).join(',')})` : '#edf1e7';
  return <div className="statistics-ring-layout"><div className="statistics-ring" style={{background:gradient}} role="img" aria-label={total ? segments.map(s=>`${s.label} ${number(s.value)} ${unit}，${(s.value/total*100).toFixed(1)}%`).join('；') : '暂无数据'}>
    <div><strong>{centerValue}</strong><small>{centerLabel}</small></div>
  </div><div className="statistics-ring-legend">{segments.map(s=><div key={s.label}>
    <span><i style={{background:colors[s.tone]}} />{s.label}</span><b>{total ? `${(s.value/total*100).toFixed(1)}%` : '—'}<small>{number(s.value)} {unit}</small></b>
  </div>)}</div></div>;
}
