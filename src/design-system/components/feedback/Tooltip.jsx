import React from 'react';

export function Tooltip({label,placement='top',children,style}){
  const [show,setShow]=React.useState(false);
  const pos=placement==='top'
    ?{bottom:'calc(100% + 6px)',left:'50%',transform:'translateX(-50%)'}
    :{top:'calc(100% + 6px)',left:'50%',transform:'translateX(-50%)'};
  return (
    <span style={{position:'relative',display:'inline-flex',...style}}
      onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      {children}
      {show&&(
        <span style={{position:'absolute',...pos,whiteSpace:'nowrap',zIndex:40,
          background:'var(--neutral-800)',color:'var(--neutral-0)',borderRadius:'var(--radius-xs)',
          padding:'5px var(--space-3)',font:'var(--weight-medium) var(--text-2xs)/1.3 var(--font-sans)',
          boxShadow:'var(--shadow-md)'}}>{label}</span>
      )}
    </span>
  );
}
