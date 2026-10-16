import React,{useEffect,useId,useRef,useState} from 'react';
import {Check,ChevronDown,Search,X} from 'lucide-react';
import type {TableMetadata} from '../../shared/contracts';
const fold=(value:string)=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[đĐ]/g,'d').toLowerCase();
export function TablePicker({tables,value,onChange}:{tables:Pick<TableMetadata,'id'|'displayName'|'logicalName'>[];value:string;onChange:(id:string)=>void}){
 const [open,setOpen]=useState(false);const [query,setQuery]=useState('');const [active,setActive]=useState(0);const root=useRef<HTMLDivElement>(null);const button=useRef<HTMLButtonElement>(null);const search=useRef<HTMLInputElement>(null);const uid=useId();const listId=uid+'-list';
 const selected=tables.find(t=>t.id===value);const filtered=tables.filter(t=>fold(`${t.displayName} ${t.logicalName}`).includes(fold(query.trim())));
 const close=()=>{setOpen(false);setQuery('');setActive(0);};
 const choose=(id:string)=>{onChange(id);close();button.current?.focus();};
 useEffect(()=>{if(!open)return;search.current?.focus();const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)){setOpen(false);setQuery('');setActive(0);}};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[open]);
 useEffect(()=>{close()},[tables]);
 const keyboard=(event:React.KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();button.current?.focus();}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setActive(index=>Math.max(0,Math.min(filtered.length-1,index+(event.key==='ArrowDown'?1:-1))));}else if(event.key==='Enter'&&event.target===search.current){event.preventDefault();if(filtered[active])choose(filtered[active].id);}};
 return <div className="table-selector searchable-table-picker" ref={root} onKeyDown={keyboard}>
  <label id={uid+'-label'} htmlFor={uid+'-trigger'}>Bảng cần chuyển column</label>
  <button ref={button} id={uid+'-trigger'} type="button" role="combobox" aria-labelledby={uid+'-label'} aria-expanded={open} aria-haspopup="listbox" aria-controls={listId} className="table-picker-trigger" onClick={()=>{if(open)close();else setOpen(true)}}><span>{selected?`${selected.displayName} · ${selected.logicalName}`:'Chọn bảng custom unmanaged có ở cả hai môi trường'}</span><ChevronDown size={17}/></button>
  {open&&<div className="table-picker-popup"><div className="table-picker-search"><Search size={16}/><input ref={search} type="search" aria-label="Lọc bảng" placeholder="Tìm tên bảng hoặc logical name…" value={query} onChange={event=>{setQuery(event.target.value);setActive(0)}}/>{query&&<button className="icon-button" type="button" aria-label="Xóa bộ lọc bảng" onClick={()=>{setQuery('');setActive(0);search.current?.focus()}}><X size={14}/></button>}</div><div id={listId} role="listbox" aria-label="Bảng custom unmanaged ở nguồn" className="table-picker-options">{filtered.map((table,index)=><button key={table.id} type="button" role="option" aria-selected={table.id===value} className={'table-picker-option '+(index===active?'highlighted':'')} onMouseEnter={()=>setActive(index)} onClick={()=>choose(table.id)}><span><strong>{table.displayName}</strong><code>{table.logicalName}</code></span>{table.id===value&&<Check size={16}/>}</button>)}{!filtered.length&&<p className="table-picker-empty" role="status">Không tìm thấy bảng</p>}</div><div className="table-picker-count">{filtered.length} / {tables.length} bảng custom unmanaged</div></div>}
 </div>;
}
