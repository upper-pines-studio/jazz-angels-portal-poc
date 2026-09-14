import React from 'react';

const tones={
  neutral:{bg:'var(--neutral-100)',fg:'var(--neutral-700)'},
  blue:{bg:'var(--blue-50)',fg:'var(--blue-700)'},
  teal:{bg:'var(--teal-50)',fg:'var(--teal-700)'},
  olive:{bg:'var(--olive-50)',fg:'var(--olive-700)'},
  gold:{bg:'var(--gold-50)',fg:'var(--gold-700)'},
  danger:{bg:'var(--danger-50)',fg:'var(--danger-600)'},
  solid:{bg:'var(--blue-500)',fg:'var(--neutral-0)'}
};

export function Badge({tone='neutral',dot=false,style,children}){
  const t=tones[tone]||tones.neutral;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:'var(--space-2)',background:t.bg,color:t.fg,
      font:'var(--weight-semibold) var(--text-3xs)/1 var(--font-sans)',letterSpacing:'var(--tracking-wide)',
      textTransform:'uppercase',padding:'5px var(--space-2)',borderRadius:'var(--radius-xs)',...style}}>
      {dot&&<span style={{width:6,height:6,borderRadius:'var(--radius-pill)',background:'currentColor'}}/>}
      {children}
    </span>
  );
}
