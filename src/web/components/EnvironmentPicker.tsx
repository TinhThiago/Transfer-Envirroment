import React from 'react';
import {ArrowLeftRight,Database} from 'lucide-react';
import type {EnvironmentId} from '../../shared/contracts';
const names={dev:'Development',production:'Production'};
const urls={dev:'phuochungdev.crm5.dynamics.com',production:'phuochung1.crm5.dynamics.com'};
export function EnvironmentPicker({source,target,onChange,connected}:{source:EnvironmentId;target:EnvironmentId;onChange:(source:EnvironmentId,target:EnvironmentId)=>void;connected:Partial<Record<EnvironmentId,boolean>>}){
 return <section className="environment-picker" aria-label="Chiều chuyển môi trường">
  {(['source','target'] as const).map((side,index)=>{const value=side==='source'?source:target;return <React.Fragment key={side}>{index===1&&<button className="swap-button" aria-label="Đổi chiều chuyển" onClick={()=>onChange(target,source)}><ArrowLeftRight size={19}/></button>}
   <div className="environment-field"><label htmlFor={side}>{side==='source'?'Môi trường nguồn':'Môi trường đích'}</label><div className="env-control"><span className={'env-icon '+value}><Database size={20}/></span><select id={side} value={value} onChange={e=>{const next=e.target.value as EnvironmentId;const opposite=next==='dev'?'production':'dev';onChange(side==='source'?next:opposite,side==='target'?next:opposite);}}><option value="dev">{names.dev}</option><option value="production">{names.production}</option></select><span className={'env-tag '+value}>{value==='dev'?'DEV':'PROD'}</span></div><div className="env-address"><span className={'dot '+(connected[value]?'online':'')}/>{urls[value]}</div></div>
  </React.Fragment>})}
 </section>;
}
