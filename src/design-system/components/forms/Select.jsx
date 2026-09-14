import React from 'react';

export function Select({options=[],value,defaultValue,disabled=false,invalid=false,onChange,style,...rest}){
  const [focus,setFocus]=React.useState(false);
  return (
    <div style={{position:'relative',width:'100%',...style}}>
      <select value={value} defaultValue={defaultValue} disabled={disabled} onChange={onChange}
        onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
        style={{width:'100%',height:'var(--control-h)',padding:'0 var(--space-8) 0 var(--space-3)',
          appearance:'none',background:disabled?'var(--neutral-50)':'var(--neutral-0)',color:'var(--text-strong)',
          border:'var(--border-width) solid '+(invalid?'var(--danger-500)':focus?'var(--border-focus)':'var(--border-default)'),
          borderRadius:'var(--radius-sm)',font:'var(--type-body-sm)',outline:'none',
          boxShadow:focus?'var(--focus-ring)':'var(--shadow-inset)',transition:'var(--transition-control)',cursor:'pointer'}} {...rest}>
        {options.map(o=>{const v=typeof o==='string'?o:o.value;const l=typeof o==='string'?o:o.label;
          return <option key={v} value={v}>{l}</option>})}
      </select>
      <span style={{position:'absolute',right:'var(--space-3)',top:'50%',transform:'translateY(-50%)',
        pointerEvents:'none',color:'var(--text-muted)',font:'10px/1 var(--font-sans)'}}>&#9662;</span>
    </div>
  );
}
