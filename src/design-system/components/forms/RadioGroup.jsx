import React from 'react';

export function RadioGroup({options=[],value,defaultValue,name,direction='column',onChange,style}){
  const [inner,setInner]=React.useState(defaultValue);
  const current=value!==undefined?value:inner;
  const pick=v=>{if(value===undefined)setInner(v);onChange&&onChange(v)};
  return (
    <div style={{display:'flex',flexDirection:direction,gap:direction==='row'?'var(--space-6)':'var(--space-3)',...style}}>
      {options.map(o=>{
        const v=typeof o==='string'?o:o.value;const l=typeof o==='string'?o:o.label;
        const on=current===v;
        return (
          <label key={v} onClick={()=>pick(v)} style={{display:'inline-flex',alignItems:'center',gap:'var(--space-3)',
            cursor:'pointer',font:'var(--type-body-sm)',color:'var(--text-body)'}}>
            <span style={{width:18,height:18,borderRadius:'var(--radius-pill)',flex:'0 0 auto',
              display:'flex',alignItems:'center',justifyContent:'center',transition:'var(--transition-control)',
              border:'var(--border-width-thick) solid '+(on?'var(--blue-500)':'var(--border-strong)'),background:'var(--neutral-0)'}}>
              {on&&<span style={{width:8,height:8,borderRadius:'var(--radius-pill)',background:'var(--blue-500)'}}/>}
            </span>
            <input type="radio" name={name} value={v} checked={on} readOnly style={{display:'none'}}/>
            {l}
          </label>
        );
      })}
    </div>
  );
}
