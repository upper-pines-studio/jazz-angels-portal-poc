import React from 'react';

export function TopBar({title,subtitle,breadcrumb,actions,style}){
  return (
    <header style={{minHeight:'var(--topbar-h)',display:'flex',alignItems:'center',gap:'var(--space-5)',
      padding:'var(--space-4) var(--space-7)',background:'var(--neutral-0)',
      borderBottom:'var(--border-width) solid var(--border-default)',...style}}>
      <div style={{minWidth:0,flex:1}}>
        {breadcrumb}
        <h1 style={{font:'var(--weight-semibold) var(--text-xl)/1.2 var(--font-display)',color:'var(--text-strong)'}}>{title}</h1>
        {subtitle&&<p style={{margin:'3px 0 0',font:'var(--type-body-sm)',color:'var(--text-muted)'}}>{subtitle}</p>}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:'var(--space-3)',flex:'0 0 auto'}}>{actions}</div>
    </header>
  );
}
