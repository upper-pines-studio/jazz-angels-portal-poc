import React from 'react';

export function SectionHeading({eyebrow,title,lede,align='left',rule=true,style}){
  const center=align==='center';
  return (
    <header style={{display:'flex',flexDirection:'column',gap:'var(--space-3)',
      alignItems:center?'center':'flex-start',textAlign:center?'center':'left',
      maxWidth:center?720:640,margin:center?'0 auto':undefined,...style}}>
      {eyebrow&&(
        <span style={{font:'var(--type-eyebrow)',letterSpacing:'var(--tracking-caps)',textTransform:'uppercase',
          color:'var(--teal-600)'}}>{eyebrow}</span>
      )}
      <h2 style={{font:'var(--type-h2)',color:'var(--text-strong)',letterSpacing:'var(--tracking-display)'}}>{title}</h2>
      {rule&&<span style={{width:56,height:'var(--rule-accent-width)',background:'var(--gold-300)',borderRadius:2}}/>}
      {lede&&<p style={{margin:0,font:'var(--type-body)',color:'var(--text-body)'}}>{lede}</p>}
    </header>
  );
}
