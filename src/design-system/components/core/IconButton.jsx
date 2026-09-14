import React from 'react';

export function IconButton({label,size='md',variant='ghost',disabled=false,onClick,style,children,...rest}){
  const [hover,setHover]=React.useState(false);
  const dim=size==='sm'?'var(--control-h-sm)':size==='lg'?'var(--control-h-lg)':'var(--control-h)';
  const skin={
    ghost:{background:hover?'var(--neutral-100)':'transparent',color:'var(--neutral-600)'},
    solid:{background:hover?'var(--blue-600)':'var(--blue-500)',color:'var(--neutral-0)'},
    outline:{background:hover?'var(--neutral-50)':'var(--neutral-0)',color:'var(--neutral-700)',border:'var(--border-width) solid var(--border-default)'}
  }[variant];
  return (
    <button aria-label={label} title={label} disabled={disabled} onClick={onClick}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{width:dim,height:dim,display:'inline-flex',alignItems:'center',justifyContent:'center',
        borderRadius:'var(--radius-sm)',border:'var(--border-width) solid transparent',cursor:disabled?'not-allowed':'pointer',
        opacity:disabled?.45:1,transition:'var(--transition-control)',flex:'0 0 auto',...skin,...style}} {...rest}>
      {children}
    </button>
  );
}
