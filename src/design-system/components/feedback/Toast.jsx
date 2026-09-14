import React from 'react';

const tones={
  success:{bar:'var(--teal-500)',icon:'✓'},
  info:{bar:'var(--blue-500)',icon:'i'},
  warning:{bar:'var(--gold-400)',icon:'!'},
  danger:{bar:'var(--danger-500)',icon:'!'}
};

export function Toast({tone='success',title,message,onDismiss,style}){
  const t=tones[tone]||tones.info;
  return (
    <div style={{display:'flex',gap:'var(--space-3)',alignItems:'flex-start',minWidth:280,maxWidth:400,
      background:'var(--neutral-0)',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-lg)',
      border:'var(--border-width) solid var(--border-subtle)',padding:'var(--space-4)',
      borderLeft:'var(--rule-accent-width) solid '+t.bar,...style}}>
      <span style={{width:20,height:20,borderRadius:'var(--radius-pill)',background:t.bar,color:'var(--neutral-0)',
        display:'flex',alignItems:'center',justifyContent:'center',flex:'0 0 auto',
        font:'var(--weight-bold) 12px/1 var(--font-sans)'}}>{t.icon}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{font:'var(--weight-semibold) var(--text-sm)/1.35 var(--font-sans)',color:'var(--text-strong)'}}>{title}</div>
        {message&&<div style={{marginTop:2,font:'var(--type-body-sm)',fontSize:'var(--text-xs)',color:'var(--text-muted)'}}>{message}</div>}
      </div>
      {onDismiss&&<button onClick={onDismiss} aria-label="Dismiss" style={{border:0,background:'none',cursor:'pointer',
        color:'var(--text-faint)',font:'16px/1 var(--font-sans)',padding:0}}>&times;</button>}
    </div>
  );
}
