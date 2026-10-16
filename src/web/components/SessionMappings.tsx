import React,{useEffect,useState} from 'react';
import type {Job,TransferPlan,FlowMappings} from '../../shared/contracts';
import {api} from '../api';
import {Modal} from './Modal';
export function SessionMappings({job,onClose,onSaved}:{job:Job;onClose:()=>void;onSaved:()=>void}){
 const [plan,setPlan]=useState<TransferPlan>();const [mappings,setMappings]=useState<FlowMappings>({connections:{},variables:{}});const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;void api<TransferPlan>(`/api/plans/${job.planId}`).then(p=>{if(active)setPlan(p)}).catch(e=>{if(active)setError((e as Error).message)});return()=>{active=false}},[job.planId]);
 const field=(kind:keyof FlowMappings,name:string,label:string)=><label key={`${kind}:${name}`}>{label}<input value={mappings[kind][name]||''} autoComplete="off" onChange={e=>setMappings(previous=>({...previous,[kind]:{...previous[kind],[name]:e.target.value}}))}/></label>;
 return <Modal title="Khôi phục cấu hình Flow" onClose={onClose}><form onSubmit={event=>{event.preventDefault();setBusy(true);setError('');void api(`/api/jobs/${job.id}/session-mappings`,mappings).then(onSaved).catch(e=>setError((e as Error).message)).finally(()=>setBusy(false))}}><p>Nhập lại đúng connection và biến môi trường đã duyệt cho job này. Giá trị chỉ được giữ trong phiên hiện tại. Sau khi khôi phục, chọn thử lại bước còn lại.</p>{plan?.flowPreflight?.connections.map(c=>field('connections',c.logicalName,c.displayName))}{plan?.flowPreflight?.variables.map(v=>field('variables',v.logicalName,v.displayName))}{error&&<p role="alert" className="error-text">{error}</p>}<button className="button primary" type="submit" disabled={!plan||busy}>Khôi phục cấu hình</button></form></Modal>;
}
