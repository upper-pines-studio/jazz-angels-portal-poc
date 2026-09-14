import React from 'react';

export function Dialog({open=true,title,description,footer,onClose,width=480,children,style}){
  if(!open) return null;
  return (
    <div style={{position:'absolute',inset:0,background:'var(--scrim)',backdropFilter:'var(--blur-scrim)',
      display:'flex',alignItems:'center',justifyContent:'center',padding:'var(--space-7)',zIndex:50}}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width,maxWidth:'100%',background:'var(--surface-card)',
        borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-lg)',overflow:'hidden',
        animation:'none',...style}}>
        <header style={{padding:'var(--space-6) var(--space-6) var(--space-4)',display:'flex',gap:'var(--space-4)',
          alignItems:'flex-start'}}>
          <div style={{flex:1,minWidth:0}}>
            <h2 style={{font:'var(--weight-semibold) var(--text-xl)/1.25 var(--font-display)',color:'var(--text-strong)'}}>{title}</h2>
            {description&&<p style={{margin:'var(--space-2) 0 0',font:'var(--type-body-sm)',color:'var(--text-muted)'}}>{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{border:0,background:'none',cursor:'pointer',
            color:'var(--text-faint)',font:'20px/1 var(--font-sans)',padding:0}}>&times;</button>
        </header>
        {children&&<div style={{padding:'0 var(--space-6) var(--space-6)'}}>{children}</div>}
        {footer&&(
          <footer style={{padding:'var(--space-4) var(--space-6)',background:'var(--surface-sunken)',
            borderTop:'var(--border-width) solid var(--border-subtle)',
            display:'flex',justifyContent:'flex-end',gap:'var(--space-3)'}}>{footer}</footer>
        )}
      </div>
    </div>
  );
}
