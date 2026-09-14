import React from 'react';

export function DataTable({columns=[],rows=[],onRowClick,selectable=false,selected=[],onToggle,emptyLabel='Nothing here yet',style}){
  const [hover,setHover]=React.useState(-1);
  const grid=columns.map(c=>c.width||'1fr').join(' ');
  const template=(selectable?'40px ':'')+grid;
  return (
    <div style={{width:'100%',...style}}>
      <div style={{display:'grid',gridTemplateColumns:template,gap:'var(--space-4)',alignItems:'center',
        padding:'var(--space-3) var(--space-5)',background:'var(--surface-sunken)',
        borderBottom:'var(--border-width) solid var(--border-default)',
        font:'var(--weight-semibold) var(--text-3xs)/1.2 var(--font-sans)',letterSpacing:'var(--tracking-wide)',
        textTransform:'uppercase',color:'var(--text-muted)'}}>
        {selectable&&<span/>}
        {columns.map(c=><span key={c.key} style={{textAlign:c.align||'left'}}>{c.label}</span>)}
      </div>
      {rows.length===0&&(
        <div style={{padding:'var(--space-8)',textAlign:'center',font:'var(--type-body-sm)',color:'var(--text-muted)'}}>{emptyLabel}</div>
      )}
      {rows.map((r,i)=>(
        <div key={r.id||i} onClick={()=>onRowClick&&onRowClick(r)}
          onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(-1)}
          style={{display:'grid',gridTemplateColumns:template,gap:'var(--space-4)',alignItems:'center',
            minHeight:'var(--row-h)',padding:'var(--space-3) var(--space-5)',
            borderBottom:'var(--border-width) solid var(--border-subtle)',
            background:hover===i?'var(--blue-50)':'var(--neutral-0)',
            cursor:onRowClick?'pointer':'default',font:'var(--type-body-sm)',color:'var(--text-body)',
            transition:'background-color var(--duration-fast) var(--ease-standard)'}}>
          {selectable&&(
            <span onClick={e=>{e.stopPropagation();onToggle&&onToggle(r)}} style={{display:'flex'}}>
              <span style={{width:18,height:18,borderRadius:'var(--radius-xs)',cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',
                background:selected.includes(r.id)?'var(--blue-500)':'var(--neutral-0)',
                border:'var(--border-width) solid '+(selected.includes(r.id)?'var(--blue-500)':'var(--border-strong)')}}>
                {selected.includes(r.id)&&<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>}
              </span>
            </span>
          )}
          {columns.map(c=>(
            <span key={c.key} style={{textAlign:c.align||'left',minWidth:0,
              font:c.mono?'var(--type-numeric)':'inherit',
              color:c.strong?'var(--text-strong)':'inherit',
              fontWeight:c.strong?'var(--weight-medium)':undefined,
              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:c.wrap?'normal':'nowrap'}}>
              {c.render?c.render(r):r[c.key]}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
