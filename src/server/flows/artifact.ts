import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {AppError} from '../errors';

// Change only the exported copy, never the workflow record in the source environment.
export function prepareInactiveFlowArtifact(base64:string,flowIds:string[],deferConfiguration=false):string{
 const fail=()=>new AppError('SAFE_FLOW_IMPORT_UNAVAILABLE','Không xác minh được trạng thái Off trong gói Cloud flow. Chưa gửi import; flow nguồn được giữ nguyên.');
 const normalize=(id:string)=>id.replace(/[{}]/g,'').toLowerCase();
 try{
  if(!flowIds.length)throw fail();
  const compressed=Buffer.from(base64,'base64');if(compressed.length>100*1024*1024)throw fail();let total=0;
  const files=unzipSync(compressed,{filter:file=>{total+=file.originalSize;if(total>250*1024*1024)throw fail();return true;}});
  const paths=Object.keys(files).filter(p=>p.toLowerCase()==='customizations.xml');if(paths.length!==1)throw fail();
  const path=paths[0],xml=strFromU8(files[path]);if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw fail();
  const doc=new DOMParser({onError:()=>{throw fail();}}).parseFromString(xml,'application/xml');
  if(doc.documentElement?.tagName!=='ImportExportXml')throw fail();
  const expected=new Set(flowIds.map(normalize)),seen=new Set<string>();let changed=false;
  for(const workflow of Array.from(doc.getElementsByTagName('Workflow'))){
   if(workflow.parentNode?.nodeName!=='Workflows')continue;
   const children=Array.from(workflow.childNodes).filter(n=>n.nodeType===1);
   const field=(name:string)=>children.filter(n=>n.nodeName===name);
   const category=field('Category');const id=normalize(workflow.getAttribute('WorkflowId')||'');
   if(category.length!==1){if(expected.has(id))throw fail();continue;}
   if(category[0].textContent?.trim()!=='5'){if(expected.has(id))throw fail();continue;}
   // Unexpected cloud flows must not be silently added by an export.
   if(!expected.has(id)||seen.has(id))throw fail();seen.add(id);
   for(const [name,value] of [['StateCode','0'],['StatusCode','1']]){
    const nodes=field(name);if(nodes.length!==1)throw fail();
    if(nodes[0].textContent!==value){nodes[0].textContent=value;changed=true;}
   }
   const definitions=field('JsonFileName');if(definitions.length!==1)throw fail();
   const definitionPath=(definitions[0].textContent||'').replace(/^\//,'');if(!files[definitionPath])throw fail();
   JSON.parse(strFromU8(files[definitionPath]));
  }
  if(seen.size!==expected.size)throw fail();
  if(deferConfiguration){
   for(const reference of Array.from(doc.getElementsByTagName('connectionreference'))){
    for(const binding of Array.from(reference.getElementsByTagName('connectionid'))){binding.parentNode?.removeChild(binding);changed=true;}
   }
   for(const values of Array.from(doc.getElementsByTagName('environmentvariablevalues'))){values.parentNode?.removeChild(values);changed=true;}
   const manifests=Object.keys(files).filter(p=>p.toLowerCase()==='solution.xml');
   if(manifests.length===1){const manifestXml=strFromU8(files[manifests[0]]);if(/<!DOCTYPE|<!ENTITY/i.test(manifestXml))throw fail();const manifest=new DOMParser({onError:()=>{throw fail();}}).parseFromString(manifestXml,'application/xml');let removed=false;
    for(const root of Array.from(manifest.getElementsByTagName('RootComponent')))if(root.getAttribute('type')==='381'){root.parentNode?.removeChild(root);removed=true;}
    if(removed){files[manifests[0]]=strToU8(new XMLSerializer().serializeToString(manifest));changed=true;}
   }
  }
  if(!changed)return base64;
  files[path]=strToU8(new XMLSerializer().serializeToString(doc));
  return Buffer.from(zipSync(files)).toString('base64');
 }catch{throw fail();}
}
