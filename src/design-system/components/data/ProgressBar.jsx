import React from 'react';

export function ProgressBar({value=0,max=100,label,caption,color='var(--blue-500)',height=8,showValue=false,style}){
  const pct=Math.max(0,Math.min(100,(value/max)*100));
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'var(--space-2)',...style}}>
      {(label||showValue)&&(
        <div style={{display:'flex',justifyContent:'space-between',gap:'var(--space-3)',
          font:'var(--type-body-sm)',color:'var(--text-body)'}}>
          <span>{label}</span>
          {showValue&&<span style={{font:'var(--type-numeric)',color:'var(--text-strong)'}}>{Math.round(pct)}%</span>}
        </div>
      )}
      <div style={{height,background:'var(--neutral-100)',borderRadius:'var(--radius-pill)',overflow:'hidden'}}>
        <div style={{width:pct+'%',height:'100%',background:color,borderRadius:'var(--radius-pill)',
          transition:'width var(--duration-slow) var(--ease-out)'}}/>
      </div>
      {caption&&<span style={{font:'var(--type-body-sm)',fontSize:'var(--text-xs)',color:'var(--text-muted)'}}>{caption}</span>}
    </div>
  );
}
