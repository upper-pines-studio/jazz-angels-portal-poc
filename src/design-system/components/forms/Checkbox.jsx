import React from 'react';

export function Checkbox({checked,defaultChecked,label,disabled=false,size=18,onChange,style}){
  const [inner,setInner]=React.useState(!!defaultChecked);
  const on=checked!==undefined?checked:inner;
  const toggle=()=>{if(disabled)return;if(checked===undefined)setInner(!on);onChange&&onChange(!on)};
  return (
    <label onClick={toggle} style={{display:'inline-flex',alignItems:'center',gap:'var(--space-3)',
      cursor:disabled?'not-allowed':'pointer',opacity:disabled?.5:1,font:'var(--type-body-sm)',color:'var(--text-body)',...style}}>
      <span style={{width:size,height:size,flex:'0 0 auto',display:'flex',alignItems:'center',justifyContent:'center',
        borderRadius:'var(--radius-xs)',transition:'var(--transition-control)',
        background:on?'var(--blue-500)':'var(--neutral-0)',
        border:'var(--border-width) solid '+(on?'var(--blue-500)':'var(--border-strong)'),
        boxShadow:on?'none':'var(--shadow-inset)'}}>
        {on&&<svg width={size*0.62} height={size*0.62} viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </span>
      {label}
    </label>
  );
}
