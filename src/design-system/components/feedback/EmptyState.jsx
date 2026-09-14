import React from 'react';

export function EmptyState({icon,title,message,action,style}){
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center',
      gap:'var(--space-3)',padding:'var(--space-10) var(--space-6)',...style}}>
      {icon&&<span style={{width:44,height:44,borderRadius:'var(--radius-pill)',background:'var(--blue-50)',
        color:'var(--blue-500)',display:'flex',alignItems:'center',justifyContent:'center'}}>{icon}</span>}
      <h3 style={{font:'var(--weight-semibold) var(--text-lg)/1.3 var(--font-display)',color:'var(--text-strong)'}}>{title}</h3>
      {message&&<p style={{margin:0,maxWidth:360,font:'var(--type-body-sm)',color:'var(--text-muted)'}}>{message}</p>}
      {action&&<div style={{marginTop:'var(--space-2)'}}>{action}</div>}
    </div>
  );
}
