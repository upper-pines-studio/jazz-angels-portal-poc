import React from 'react';

const fields={
  blue:{bg:'var(--blue-500)',fg:'var(--neutral-0)'},
  'blue-deep':{bg:'var(--blue-800)',fg:'var(--neutral-0)'},
  teal:{bg:'var(--teal-500)',fg:'var(--neutral-0)'},
  olive:{bg:'var(--olive-500)',fg:'var(--neutral-0)'},
  gold:{bg:'var(--gold-300)',fg:'var(--neutral-900)'},
  paper:{bg:'var(--neutral-50)',fg:'var(--neutral-900)'},
  white:{bg:'var(--neutral-0)',fg:'var(--neutral-900)'}
};

export function ColorBlock({tone='blue',pad='var(--section-y-tight)',ratio,align='left',style,children}){
  const f=fields[tone]||fields.blue;
  return (
    <div style={{background:f.bg,color:f.fg,padding:'var(--space-7)',paddingTop:pad,paddingBottom:pad,
      aspectRatio:ratio,display:'flex',flexDirection:'column',justifyContent:'center',
      alignItems:align==='center'?'center':'flex-start',textAlign:align,...style}}>
      {children}
    </div>
  );
}
