import React from 'react';

export function Tag({onRemove,color='var(--teal-500)',style,children}){
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:'var(--space-2)',
      background:'var(--neutral-0)',border:'var(--border-width) solid var(--border-default)',
      borderRadius:'var(--radius-pill)',padding:'4px var(--space-3)',
      font:'var(--type-body-sm)',color:'var(--text-body)',...style}}>
      <span style={{width:7,height:7,borderRadius:'var(--radius-pill)',background:color,flex:'0 0 auto'}}/>
      {children}
      {onRemove&&<button onClick={onRemove} aria-label="Remove" style={{border:0,background:'none',cursor:'pointer',
        color:'var(--text-faint)',font:'var(--text-base)/1 var(--font-sans)',padding:0,marginLeft:2}}>&times;</button>}
    </span>
  );
}
