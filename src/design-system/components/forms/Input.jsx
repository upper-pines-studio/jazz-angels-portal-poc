import React from 'react';

export function Input({type='text',value,defaultValue,placeholder,invalid=false,disabled=false,prefix,suffix,onChange,mono=false,style,...rest}){
  const [focus,setFocus]=React.useState(false);
  const border=invalid?'var(--danger-500)':focus?'var(--border-focus)':'var(--border-default)';
  return (
    <div style={{display:'flex',alignItems:'center',gap:'var(--space-2)',width:'100%',
      height:'var(--control-h)',padding:'0 var(--space-3)',background:disabled?'var(--neutral-50)':'var(--neutral-0)',
      border:'var(--border-width) solid '+border,borderRadius:'var(--radius-sm)',
      boxShadow:focus?'var(--focus-ring)':'var(--shadow-inset)',transition:'var(--transition-control)',...style}}>
      {prefix&&<span style={{color:'var(--text-faint)',display:'flex'}}>{prefix}</span>}
      <input type={type} value={value} defaultValue={defaultValue} placeholder={placeholder} disabled={disabled}
        onChange={onChange} onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
        style={{flex:1,minWidth:0,border:0,outline:'none',background:'transparent',color:'var(--text-strong)',
          font:mono?'var(--type-numeric)':'var(--type-body-sm)'}} {...rest}/>
      {suffix&&<span style={{color:'var(--text-faint)',display:'flex',font:'var(--type-body-sm)'}}>{suffix}</span>}
    </div>
  );
}
