import React from 'react';

export function StatCard({label,value,unit,delta,deltaTone='teal',footnote,accent='var(--blue-500)',icon,style}){
  const tone={teal:'var(--teal-600)',gold:'var(--gold-600)',danger:'var(--danger-600)',neutral:'var(--text-muted)'}[deltaTone];
  return (
    <div style={{background:'var(--surface-card)',border:'var(--border-width) solid var(--border-subtle)',
      borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-sm)',padding:'var(--space-5)',
      display:'flex',flexDirection:'column',gap:'var(--space-3)',position:'relative',overflow:'hidden',...style}}>
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:'var(--rule-accent-width)',background:accent}}/>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'var(--space-3)'}}>
        <span style={{font:'var(--type-eyebrow)',letterSpacing:'var(--tracking-caps)',textTransform:'uppercase',color:'var(--text-muted)'}}>{label}</span>
        {icon&&<span style={{color:accent,display:'flex'}}>{icon}</span>}
      </div>
      <div style={{display:'flex',alignItems:'baseline',gap:'var(--space-2)'}}>
        <span style={{font:'var(--weight-bold) var(--text-3xl)/1 var(--font-display)',color:'var(--text-strong)',
          letterSpacing:'var(--tracking-display)'}}>{value}</span>
        {unit&&<span style={{font:'var(--type-body-sm)',color:'var(--text-muted)'}}>{unit}</span>}
        {delta&&<span style={{font:'var(--weight-medium) var(--text-xs)/1 var(--font-mono)',color:tone,marginLeft:'auto'}}>{delta}</span>}
      </div>
      {footnote&&<span style={{font:'var(--type-body-sm)',fontSize:'var(--text-xs)',color:'var(--text-muted)'}}>{footnote}</span>}
    </div>
  );
}
