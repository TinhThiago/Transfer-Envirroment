import React,{useEffect,useRef} from 'react';
import {X} from 'lucide-react';
export function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;if(dialog?.showModal)dialog.showModal();return()=>{dialog?.close?.()};},[]);
 return <dialog ref={ref} open={typeof HTMLDialogElement==='undefined'||!HTMLDialogElement.prototype.showModal?true:undefined} className={'modal '+(wide?'wide':'')} aria-label={title} onCancel={e=>{e.preventDefault();onClose()}} onKeyDown={e=>{if(e.key==='Escape')onClose();}}><header><h2>{title}</h2><button aria-label="Đóng" className="icon-button" onClick={onClose}><X size={19}/></button></header>{children}</dialog>;
}
