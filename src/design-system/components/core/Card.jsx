import React from 'react';

export function Card({title,subtitle,action,padding='var(--space-6)',accent,elevation='sm',style,children}){
  const shadow={none:'var(--shadow-none)',sm:'var(--shadow-sm)',md:'var(--shadow-md)',lg:'var(--shadow-lg)'}[elevation];
  return (
    <section style={{background:'var(--surface-card)',border:'var(--border-width) solid var(--border-subtle)',
      borderRadius:'var(--radius-md)',boxShadow:shadow,overflow:'hidden',...style}}>
      {accent&&<div style={{height:'var(--rule-accent-width)',background:accent}}/>}
      {(title||action)&&(
        <header style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'var(--space-4)',
          padding:'var(--space-5) '+'var(--space-6)',borderBottom:'var(--border-width) solid var(--border-subtle)'}}>
          <div>
            <h3 style={{font:'var(--type-h4)',color:'var(--text-strong)',letterSpacing:0}}>{title}</h3>
            {subtitle&&<p style={{margin:'4px 0 0',font:'var(--type-body-sm)',color:'var(--text-muted)'}}>{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div style={{padding}}>{children}</div>
    </section>
  );
}
