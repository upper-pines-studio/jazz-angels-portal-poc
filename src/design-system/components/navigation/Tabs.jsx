import React from 'react';

export function Tabs({tabs=[],active,onChange,style}){
  const [inner,setInner]=React.useState(active||(tabs[0]&&(tabs[0].id||tabs[0])));
  const current=active!==undefined?active:inner;
  const pick=id=>{if(active===undefined)setInner(id);onChange&&onChange(id)};
  return (
    <div style={{display:'flex',gap:'var(--space-6)',borderBottom:'var(--border-width) solid var(--border-default)',...style}}>
      {tabs.map(t=>{
        const id=t.id||t;const label=t.label||t;const on=current===id;
        return (
          <button key={id} onClick={()=>pick(id)} style={{border:0,background:'none',cursor:'pointer',
            padding:'0 0 var(--space-3)',marginBottom:-1,display:'flex',alignItems:'center',gap:'var(--space-2)',
            borderBottom:'var(--border-width-thick) solid '+(on?'var(--blue-500)':'transparent'),
            color:on?'var(--text-strong)':'var(--text-muted)',
            font:(on?'var(--weight-semibold)':'var(--weight-regular)')+' var(--text-sm)/1.4 var(--font-sans)',
            transition:'var(--transition-control)'}}>
            {label}
            {t.count!==undefined&&<span style={{font:'var(--type-numeric)',fontSize:'var(--text-3xs)',
              background:'var(--neutral-100)',color:'var(--text-muted)',borderRadius:'var(--radius-xs)',padding:'2px 5px'}}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
