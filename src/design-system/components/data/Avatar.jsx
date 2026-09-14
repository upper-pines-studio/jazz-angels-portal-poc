import React from 'react';

const palette=['var(--blue-500)','var(--teal-500)','var(--olive-500)','var(--gold-400)'];

export function Avatar({name='',size=32,src,tone,style}){
  const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
  const idx=name.length%palette.length;
  const bg=tone||palette[idx];
  return (
    <span style={{width:size,height:size,flex:'0 0 auto',borderRadius:'var(--radius-pill)',
      display:'inline-flex',alignItems:'center',justifyContent:'center',overflow:'hidden',
      background:src?'var(--neutral-100)':bg,color:'var(--neutral-0)',
      font:'var(--weight-semibold) '+Math.round(size*0.38)+'px/1 var(--font-display)',
      letterSpacing:'0.02em',...style}}>
      {src?<img src={src} alt={name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:initials}
    </span>
  );
}
