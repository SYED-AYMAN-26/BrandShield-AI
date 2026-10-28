import { evaluate } from '/home/user/brandshield/server/src/services/evaluation.js';
import { DEMO_FACTS, DEMO_GUIDELINES } from '/home/user/brandshield/server/src/lib/demoBrand.js';
const facts = DEMO_FACTS.map((f,i)=>({...f,_id:'f'+i,version:1,status:'approved'}));
const guides = DEMO_GUIDELINES.map((g,i)=>({...g,_id:'g'+i,version:1,status:'active'}));
const r = evaluate(facts, guides, { batch: 3 });
console.log('BATCH 3 (hard, run once):', JSON.stringify(r.metrics));
for (const p of r.perExample) console.log(`${p.exactMatch?'PASS':'FAIL'} ${p.id} expected=${JSON.stringify(p.expected)} predicted=${JSON.stringify(p.predicted)}`);
const all = evaluate(facts, guides);
console.log('\nALL:', JSON.stringify(all.metrics));
