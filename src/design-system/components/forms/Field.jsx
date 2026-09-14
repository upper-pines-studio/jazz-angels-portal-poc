import React from 'react';

export function Field({label,hint,error,required=false,htmlFor,style,children}){
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'var(--space-2)',...style}}>
      {label&&(
        <label htmlFor={htmlFor} style={{font:'var(--type-label)',color:'var(--text-strong)'}}>
          {label}{required&&<span style={{color:'var(--danger-500)',marginLeft:4}}>*</span>}
        </label>
      )}
      {children}
      {error
        ? <span style={{font:'var(--type-body-sm)',fontSize:'var(--text-xs)',color:'var(--danger-600)'}}>{error}</span>
        : hint&&<span style={{font:'var(--type-body-sm)',fontSize:'var(--text-xs)',color:'var(--text-muted)'}}>{hint}</span>}
    </div>
  );
}
