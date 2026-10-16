import {it,expect} from 'vitest';
import {walkDependencies,selectAfterDecision} from '../src/server/plans/dependencies';
import {Planner} from '../src/server/plans/planner';
import type {ComponentRef,TransferRequest} from '../src/shared/contracts';
import {requestSchema} from '../src/shared/contracts';
const c=(id:string):ComponentRef=>({id,kind:'table',logicalName:'ph_'+id,displayName:id,componentType:1,selectable:true});
it('accepts Dataverse sequential GUIDs that are not RFC UUID versions',()=>{
 expect(requestSchema.safeParse({source:'dev',target:'production',kind:'table',ids:['0cf16ca9-1ac4-f111-a05a-70a8a5002956'],includeData:false}).success).toBe(true);
 expect(requestSchema.safeParse({source:'dev',target:'production',kind:'table',ids:['not-a-guid'],includeData:false}).success).toBe(false);
});
it('finds transitive dependencies and terminates cycles',async()=>{
 const graph:Record<string,ComponentRef[]>={a:[c('b')],b:[c('c')],c:[c('a')]};
 const deps=await walkDependencies([c('a')],async item=>graph[item.id]||[]);
 expect(deps.map(d=>d.id).sort()).toEqual(['b','c']);expect(deps.every(d=>d.forIds.includes('a'))).toBe(true);
});
it('refusing a dependency removes dependent roots and preserves independent roots',()=>{
 const selected=selectAfterDecision([c('a'),c('x')],[{...c('b'),forIds:['a']}],[]);
 expect(selected.map(x=>x.id)).toEqual(['x']);
});
it('rejects expired or stale plans before any write',async()=>{
 let available=true;
 const catalog={tables:async()=>({items:[{...c('a'),selectable:available}],total:1,eligible:1})};
 const planner=new Planner(catalog as never,{required:async()=>[]} as never);
 const request={source:'dev',target:'production',kind:'table',ids:['a'],includeData:false} satisfies TransferRequest;
 const plan=await planner.createPlan(request);available=false;
 await expect(planner.validatePlan(plan.id,plan.hash)).rejects.toMatchObject({code:'STALE_PLAN'});
});
it('requires dependency decision and keeps a new manifest after acceptance',async()=>{
 const catalog={tables:async()=>({items:[c('a'),c('b')],total:2,eligible:2})};
 const planner=new Planner(catalog as never,{required:async(_:unknown,item:ComponentRef)=>item.id==='a'?[c('b')]:[]} as never);
 const plan=await planner.createPlan({source:'dev',target:'production',kind:'table',ids:['a'],includeData:false});
 expect(plan.blockers.length).toBeGreaterThan(0);const accepted=await planner.resolveDependencies(plan.id,['b']);
 expect(accepted.components.map(x=>x.id)).toEqual(['a','b']);expect(accepted.hash).not.toBe(plan.hash);expect(accepted.blockers).toEqual([]);
});
