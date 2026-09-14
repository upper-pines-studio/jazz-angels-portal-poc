import React from 'react';

export function Breadcrumb({items=[],style}){
  return (
    <nav style={{display:'flex',alignItems:'center',gap:'var(--space-2)',flexWrap:'wrap',
      font:'var(--type-body-sm)',fontSize:'var(--text-xs)',marginBottom:2,...style}}>
      {items.map((it,i)=>(
        <React.Fragment key={i}>
          {i>0&&<span style={{color:'var(--text-faint)'}}>/</span>}
          {it.href&&i<items.length-1
            ? <a href={it.href} style={{color:'var(--text-muted)'}}>{it.label}</a>
            : <span style={{color:i===items.length-1?'var(--text-body)':'var(--text-muted)'}}>{it.label}</span>}
        </React.Fragment>
      ))}
    </nav>
  );
}
