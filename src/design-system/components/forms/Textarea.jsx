import React from 'react';

export function Textarea({rows=4,invalid=false,disabled=false,style,...rest}){
  const [focus,setFocus]=React.useState(false);
  return (
    <textarea rows={rows} disabled={disabled} onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
      style={{width:'100%',padding:'var(--space-3)',background:disabled?'var(--neutral-50)':'var(--neutral-0)',
        color:'var(--text-strong)',resize:'vertical',
        border:'var(--border-width) solid '+(invalid?'var(--danger-500)':focus?'var(--border-focus)':'var(--border-default)'),
        borderRadius:'var(--radius-sm)',font:'var(--type-body-sm)',outline:'none',
        boxShadow:focus?'var(--focus-ring)':'var(--shadow-inset)',transition:'var(--transition-control)',...style}} {...rest}/>
  );
}
