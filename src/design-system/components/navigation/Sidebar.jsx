import React from 'react';

export function Sidebar({items=[],active,onNavigate,logoSrc,brandName='Jazz Angels',footer,style}){
  return (
    <nav style={{width:'var(--sidebar-w)',flex:'0 0 var(--sidebar-w)',minHeight:'100%',
      background:'var(--surface-inverse)',color:'var(--text-on-dark)',
      display:'flex',flexDirection:'column',...style}}>
      <div style={{height:'var(--topbar-h)',display:'flex',alignItems:'center',padding:'0 var(--space-5)',
        borderBottom:'1px solid rgba(255,255,255,.10)'}}>
        {logoSrc
          ? <span style={{background:'var(--neutral-0)',borderRadius:'var(--radius-xs)',padding:'5px 8px',display:'flex'}}>
              <img src={logoSrc} alt={brandName} style={{height:20,width:'auto'}}/>
            </span>
          : <span style={{font:'var(--weight-bold) var(--text-lg)/1 var(--font-display)',letterSpacing:'var(--tracking-display)'}}>{brandName}</span>}
      </div>
      <div style={{padding:'var(--space-4) var(--space-3)',display:'flex',flexDirection:'column',gap:2,flex:1}}>
        {items.map(it=>it.section
          ? <span key={it.section} style={{font:'var(--type-eyebrow)',letterSpacing:'var(--tracking-caps)',
              textTransform:'uppercase',color:'var(--text-on-dark-muted)',padding:'var(--space-5) var(--space-3) var(--space-2)'}}>{it.section}</span>
          : <SidebarItem key={it.id} item={it} active={active===it.id} onClick={()=>onNavigate&&onNavigate(it.id)}/>)}
      </div>
      {footer&&<div style={{padding:'var(--space-4)',borderTop:'1px solid rgba(255,255,255,.10)'}}>{footer}</div>}
    </nav>
  );
}

function SidebarItem({item,active,onClick}){
  const [hover,setHover]=React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{display:'flex',alignItems:'center',gap:'var(--space-3)',width:'100%',textAlign:'left',
        padding:'0 var(--space-3)',height:'var(--control-h)',borderRadius:'var(--radius-sm)',border:0,cursor:'pointer',
        background:active?'rgba(255,255,255,.12)':hover?'rgba(255,255,255,.06)':'transparent',
        color:active?'var(--neutral-0)':'var(--text-on-dark-muted)',
        font:(active?'var(--weight-semibold)':'var(--weight-regular)')+' var(--text-sm)/1 var(--font-sans)',
        transition:'var(--transition-control)'}}>
      {item.icon}
      <span style={{flex:1}}>{item.label}</span>
      {item.count!==undefined&&(
        <span style={{font:'var(--type-numeric)',fontSize:'var(--text-3xs)',color:'var(--gold-300)'}}>{item.count}</span>
      )}
    </button>
  );
}
