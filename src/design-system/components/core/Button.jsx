import React from 'react';

const base={display:'inline-flex',alignItems:'center',justifyContent:'center',gap:'var(--space-2)',
  font:'var(--weight-semibold) var(--text-sm)/1 var(--font-display)',letterSpacing:'var(--tracking-wide)',
  border:'var(--border-width) solid transparent',borderRadius:'var(--radius-sm)',cursor:'pointer',
  transition:'var(--transition-control)',textDecoration:'none',whiteSpace:'nowrap',
  fontFamily:'var(--font-display)'};

const sizes={
  sm:{height:'var(--control-h-sm)',padding:'0 var(--space-3)',fontSize:'var(--text-2xs)'},
  md:{height:'var(--control-h)',padding:'0 var(--space-5)',fontSize:'var(--text-sm)'},
  lg:{height:'var(--control-h-lg)',padding:'0 var(--space-7)',fontSize:'var(--text-base)'}
};

const variants={
  primary:{background:'var(--action-primary-bg)',color:'var(--action-primary-fg)',boxShadow:'var(--shadow-xs)'},
  secondary:{background:'var(--action-secondary-bg)',color:'var(--action-secondary-fg)',borderColor:'var(--border-default)',boxShadow:'var(--shadow-xs)'},
  accent:{background:'var(--action-accent-bg)',color:'var(--action-accent-fg)',boxShadow:'var(--shadow-xs)'},
  ghost:{background:'transparent',color:'var(--blue-600)'},
  danger:{background:'var(--action-danger-bg)',color:'var(--action-danger-fg)'},
  link:{background:'transparent',color:'var(--text-link)',padding:0,height:'auto',textDecoration:'underline',textUnderlineOffset:'3px'}
};

const hovers={
  primary:{background:'var(--action-primary-bg-hover)'},
  secondary:{background:'var(--neutral-50)',borderColor:'var(--border-strong)'},
  accent:{background:'var(--action-accent-bg-hover)'},
  ghost:{background:'var(--blue-50)'},
  danger:{background:'var(--danger-600)'},
  link:{color:'var(--text-link-hover)'}
};

export function Button({variant='primary',size='md',iconLeft,iconRight,disabled=false,fullWidth=false,as='button',href,onClick,style,children,...rest}){
  const [hover,setHover]=React.useState(false);
  const [press,setPress]=React.useState(false);
  const Tag=href?'a':as;
  const s={...base,...sizes[size],...variants[variant],...(hover&&!disabled?hovers[variant]:null),
    ...(fullWidth?{width:'100%'}:null),
    ...(press&&!disabled?{transform:'scale(var(--press-scale))'}:null),
    ...(disabled?{opacity:.45,cursor:'not-allowed',boxShadow:'none'}:null),...style};
  return (
    <Tag href={href} style={s} disabled={Tag==='button'?disabled:undefined} onClick={disabled?undefined:onClick}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>{setHover(false);setPress(false)}}
      onMouseDown={()=>setPress(true)} onMouseUp={()=>setPress(false)} {...rest}>
      {iconLeft}{children}{iconRight}
    </Tag>
  );
}
