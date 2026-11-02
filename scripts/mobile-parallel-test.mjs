import assert from 'node:assert/strict';
import test from 'node:test';
const streamModule = await import('../lib/deliberation-stream.ts');
const viewportModule = await import('../lib/particle-viewport.ts');
const clientModule = await import('../lib/deliberation-client.ts');
const units=['MELCHIOR','BALTHASAR','CASPER'];
const result=(id)=>({id,number:units.indexOf(id)+1,model:'test',reasoningLevel:'default',reasoning:'完整议题的真实返回',vote:'APPROVE'});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const record=async(reader)=>JSON.parse(new TextDecoder().decode((await reader.read()).value));
const required=(mod,name)=>{assert.equal(typeof mod[name],'function',name+' implementation missing');return mod[name]};

test('all three units start before any result, with one identical complete topic',async()=>{
 const create=required(streamModule,'createDeliberationStream'); const pending=Object.fromEntries(units.map(id=>[id,deferred()])); const calls=[];
 const reader=create('完整议题',(id,topic)=>{calls.push([id,topic]);return pending[id].promise}).getReader();
 assert.deepEqual(calls,units.map(id=>[id,'完整议题']));
 assert.equal((await record(reader)).type,'started');
 pending.CASPER.resolve(result('CASPER')); assert.equal((await record(reader)).result.id,'CASPER');
 pending.MELCHIOR.resolve(result('MELCHIOR')); assert.equal((await record(reader)).result.id,'MELCHIOR');
 pending.BALTHASAR.resolve(result('BALTHASAR')); assert.equal((await record(reader)).result.id,'BALTHASAR');
 assert.equal((await record(reader)).type,'done'); assert.equal((await reader.read()).done,true); assert.equal(calls.length,3);
});

test('one failed unit preserves the other two and completes, without retries',async()=>{
 const create=required(streamModule,'createDeliberationStream'); const calls=[];
 const reader=create('topic',async(id)=>{calls.push(id);if(id==='BALTHASAR')throw Error('internal secret');return result(id)}).getReader();
 const events=[];for(;;){const part=await reader.read();if(part.done)break;events.push(JSON.parse(new TextDecoder().decode(part.value)))}
 assert.equal(events.filter(e=>e.type==='unit').length,2); assert.equal(events.filter(e=>e.type==='unit-error').length,1);
 assert.equal(events.find(e=>e.type==='unit-error').unit,'BALTHASAR');assert.ok(!JSON.stringify(events).includes('internal secret'));assert.equal(events.at(-1).type,'done');assert.equal(calls.length,3);
});

test('disconnect does not enqueue late responses or start replacement model calls',async()=>{
 const create=required(streamModule,'createDeliberationStream');const pending=units.map(()=>deferred());let calls=0;
 const reader=create('topic',(id)=>{calls++;return pending[units.indexOf(id)].promise}).getReader();await reader.read();await reader.cancel();
 units.forEach((id,i)=>pending[i].resolve(result(id))); await Promise.resolve();await Promise.resolve(); assert.equal(calls,3);
});

test('input accepts only same-origin JSON, a bounded full topic and no easter inference',async()=>{
 const read=required(streamModule,'readDeliberationTopic');
 const request=(topic,headers={})=>new Request('https://magi.example.test/maji/api/deliberate',{method:'POST',headers:{origin:'https://magi.example.test','content-type':'application/json',...headers},body:JSON.stringify({topic})});
 assert.equal(await read(request('  完整议题  ')),'完整议题');
 for(const req of [request('topic',{origin:'https://other.example'}),request('topic',{'content-type':'text/plain'}),request(''),request('x'.repeat(501)),request('CODE:666'),request('使徒入侵'),request('王勇杰666')])await assert.rejects(()=>read(req));
});

test('particle canvas pixels follow actual CSS box, including keyboard/toolbar offsets',()=>{
 const fit=required(viewportModule,'fitParticleCanvas');let matrix;const canvas={width:0,height:0,getBoundingClientRect:()=>({left:12,top:-84,width:390,height:844})};
 fit(canvas,{setTransform:(...v)=>matrix=v},2);assert.equal(canvas.width,780);assert.equal(canvas.height,1688);assert.deepEqual(matrix,[2,0,0,2,-24,168]);
 // Device pixels mapped back to CSS coordinates must land on the original unit point.
 const point={x:220,y:300};const px=point.x*matrix[0]+matrix[4],py=point.y*matrix[3]+matrix[5];
 assert.equal(canvas.getBoundingClientRect().left+px/2,point.x);assert.equal(canvas.getBoundingClientRect().top+py/2,point.y);
});

test('fractional zoom and landscape bounds keep canvas scale exact and DPR bounded',()=>{
 const fit=required(viewportModule,'fitParticleCanvas');let matrix;const bounds={left:-3.25,top:22.5,width:844.25,height:390.75};const canvas={width:0,height:0,getBoundingClientRect:()=>bounds};
 fit(canvas,{setTransform:(...v)=>matrix=v},3);assert.equal(canvas.width,1689);assert.equal(canvas.height,782);
 assert.equal(matrix[0],1689/844.25);assert.equal(matrix[3],782/390.75);assert.equal(matrix[4],-bounds.left*matrix[0]);assert.equal(matrix[5],-bounds.top*matrix[3]);
});

test('one browser request receives all three independently and decodes split UTF-8',async()=>{
 const together=required(clientModule,'deliberateTogether'); const saved=globalThis.fetch;let calls=0;const actual=[];
 const payload=[{type:'started',units},...units.slice().reverse().map(id=>({type:'unit',result:result(id)})),{type:'done'}].map(e=>JSON.stringify(e)+'\n').join(''); const bytes=new TextEncoder().encode(payload);
 globalThis.fetch=async(url,opts)=>{calls++;assert.ok(String(url).endsWith('/api/deliberate'));assert.deepEqual(JSON.parse(opts.body),{topic:'完整议题'});return new Response(new ReadableStream({start(c){for(let n=0;n<bytes.length;n+=7)c.enqueue(bytes.slice(n,n+7));c.close()}}),{headers:{'content-type':'application/x-ndjson'}})};
 try{await together('完整议题',r=>actual.push(r.id),()=>assert.fail('unexpected error'));assert.deepEqual(actual,units.slice().reverse());assert.equal(calls,1)}finally{globalThis.fetch=saved}
});

test('truncated response fails without dropping received results or retrying calls',async()=>{
 const together=required(clientModule,'deliberateTogether'); const saved=globalThis.fetch;const actual=[];let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({type:'unit',result:result('CASPER')})+'\n',{headers:{'content-type':'application/x-ndjson'}})};
 try{await assert.rejects(()=>together('topic',r=>actual.push(r.id),()=>{}));assert.deepEqual(actual,['CASPER']);assert.equal(calls,1)}finally{globalThis.fetch=saved}
});
