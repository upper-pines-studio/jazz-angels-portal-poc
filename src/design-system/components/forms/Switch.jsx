import React from 'react';

export function Switch({checked,defaultChecked,label,disabled=false,onChange,style}){
  const [inner,setInner]=React.useState(!!defaultChecked);
  const on=checked!==undefined?checked:inner;
  const toggle=()=>{if(disabled)return;if(checked===undefined)setInner(!on);onChange&&onChange(!on)};
  return (
    <label onClick={toggle} style={{display:'inline-flex',alignItems:'center',gap:'var(--space-3)',
      cursor:disabled?'not-allowed':'pointer',opacity:disabled?.5:1,font:'var(--type-body-sm)',color:'var(--text-body)',...style}}>
      <span style={{width:38,height:22,borderRadius:'var(--radius-pill)',padding:2,flex:'0 0 auto',
        background:on?'var(--teal-500)':'var(--neutral-300)',transition:'background-color var(--duration-base) var(--ease-standard)'}}>
        <span style={{display:'block',width:18,height:18,borderRadius:'var(--radius-pill)',background:'var(--neutral-0)',
          boxShadow:'var(--shadow-xs)',transform:'translateX('+(on?16:0)+'px)',
          transition:'transform var(--duration-base) var(--ease-out)'}}/>
      </span>
      {label}
    </label>
  );
}
