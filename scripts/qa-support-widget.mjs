import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync('lib/tawk-handoff.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
 const scripts=[],timers=new Map();let timerId=0;
 const context={exports:{},window:{},document:{createElement:()=>({remove(){this.removed=true;}}),head:{appendChild:script=>scripts.push(script)}},setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),Error,encodeURIComponent};
 vm.runInNewContext(compiled,context);
 return {context,scripts,timers,api:context.exports};
}
const input={name:'QA',email:'qa@example.invalid',reference:'qa-reference',turns:[],onError:()=>{}};
const checks=[];
async function check(name,fn){await fn();checks.push(name);}
await check('Network failure allows a fresh tawk retry',async()=>{
 const f=fixture();const first=f.api.openTawkHandoff(input);const rejected=assert.rejects(first,/could not load/);f.scripts[0].onerror();await rejected;assert.equal(f.scripts[0].removed,true);assert.equal(f.timers.size,0);
 const second=f.api.openTawkHandoff(input);assert.equal(f.scripts.length,2);f.context.window.Tawk_API.onLoad();await second;assert.equal(f.timers.size,0);
});
await check('Timeout removes stale loader and permits retry',async()=>{
 const f=fixture();const first=f.api.openTawkHandoff(input);const rejected=assert.rejects(first,/longer to connect/);[...f.timers.values()][0]();await rejected;assert.equal(f.scripts[0].removed,true);
 const second=f.api.openTawkHandoff(input);assert.equal(f.scripts.length,2);f.context.window.Tawk_API.onLoad();await second;
});
await check('Loaded tawk reopens without duplicate scripts',async()=>{
 const f=fixture();const first=f.api.openTawkHandoff(input);f.context.window.Tawk_API.onLoad();await first;await f.api.openTawkHandoff(input);assert.equal(f.scripts.length,1);
});
const widget=fs.readFileSync('app/components/ChatWidget.tsx','utf8');
await check('No personal phone or retired handoff controls',()=>assert.ok(!/971585580053|Continue with the support team|humanRequest\(/.test(widget)));
await check('AI messages always go to the chatbot endpoint',()=>assert.ok(widget.includes('fetch("/api/chatbot"')&&!widget.includes('fetch("/api/support/chat",{method:"POST"')));
console.log(JSON.stringify({passed:checks.length,checks},null,2));
