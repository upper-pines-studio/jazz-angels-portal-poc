import React from 'react';

/* Lucide, loaded from CDN by the host page (see docs/design-system.md ICONOGRAPHY).
   Jazz Angels ships no icon set of its own; Lucide's 2px round-cap line style
   is the documented substitution. */
export function Icon({name,size=18,strokeWidth=2,color='currentColor',style,...rest}){
  const ref=React.useRef(null);
  React.useEffect(()=>{
    const el=ref.current; if(!el) return;
    el.innerHTML='';
    const i=document.createElement('i');
    i.setAttribute('data-lucide',name);
    el.appendChild(i);
    if(window.lucide&&window.lucide.createIcons) window.lucide.createIcons({root:el});
  },[name]);
  return <span ref={ref} aria-hidden="true" style={{display:'inline-flex',width:size,height:size,
    color,flex:'0 0 auto','--lucide-size':size+'px',...style}}
    data-icon-size={size} data-stroke={strokeWidth} {...rest}/>;
}
