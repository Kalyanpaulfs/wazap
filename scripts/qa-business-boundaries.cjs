const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),Module=require('module');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
process.env.NEXTAUTH_SECRET='isolated-test-secret-not-production';
const {createSupportToken,verifySupportToken,ownsSupport,SUPPORT_COOKIE}=require('../lib/support-session.ts');
const now=Date.now(),a=createSupportToken(now),b=createSupportToken(now);let checks=0;
const check=(fn)=>{fn();checks++;};
check(()=>assert.equal(verifySupportToken(a.token,now),a.visitorId));
check(()=>assert.equal(verifySupportToken(a.token.replace(a.visitorId,b.visitorId),now),null));
check(()=>assert.equal(verifySupportToken(a.token,now+31*86400000),null));
check(()=>assert.equal(verifySupportToken('not-a-token'),null));
const req=new Request('https://wazap.lt/api/support/tickets',{headers:{cookie:SUPPORT_COOKIE+'='+a.token}});
check(()=>assert(ownsSupport(req,a.visitorId)));check(()=>assert(!ownsSupport(req,b.visitorId)));check(()=>assert(!ownsSupport(new Request('https://wazap.lt'),a.visitorId)));
const {routerQuota,EXISTING_ROUTER_GRACE_END,TRIAL_ROUTED_LEADS}=require('../lib/router-entitlements.ts');
// Free-trial restructure (FEAT-FREE-TRIAL): the free-plan lifetime lead cap
// is gone — free/no-trial now blocks ALL routing (0 leads), regardless of
// count, except during the (now-inert) legacy grace window below.
const legacy={plan:'free',createdAt:new Date('2026-01-01')};const before=new Date(EXISTING_ROUTER_GRACE_END-1),at=EXISTING_ROUTER_GRACE_END;
check(()=>assert(routerQuota(legacy,500,before).allowed));check(()=>assert(!routerQuota(legacy,25,at).allowed));check(()=>assert(!routerQuota(legacy,0,at).allowed));
check(()=>assert(routerQuota({plan:'pro',planExpiresAt:new Date(Date.now()+86400000)},500,at).allowed));
check(()=>assert(!routerQuota({plan:'pro',planExpiresAt:new Date('2020-01-01')},25,at).allowed));
// 100-lead trial cap (FEAT-TRIAL-100-LEADS): active trial (no paid plan) is
// capped at TRIAL_ROUTED_LEADS; paid plans stay unlimited regardless of usage.
const trial={plan:'free',trialPlan:'basic',trialEndsAt:new Date(Date.now()+86400000),createdAt:at};
check(()=>assert(routerQuota(trial,TRIAL_ROUTED_LEADS-1,at).allowed));
check(()=>assert(!routerQuota(trial,TRIAL_ROUTED_LEADS,at).allowed));
check(()=>assert.equal(routerQuota(trial,0,at).limit,TRIAL_ROUTED_LEADS));
check(()=>assert(routerQuota({plan:'basic',planExpiresAt:new Date(Date.now()+86400000)},TRIAL_ROUTED_LEADS*10,at).allowed));
const {outboundReferences,outboundMessageId}=require('../lib/support-threading.ts');
check(()=>assert.deepEqual(outboundReferences('In-Reply-To: '+outboundMessageId('support_123')),['support_123']));
check(()=>assert.deepEqual(outboundReferences('Subject: <wazap.fake@wazap.lt>'),[]));
check(()=>assert.deepEqual(outboundReferences('References: <wazap.old@wazap.lt>\r\n <wazap.latest@wazap.lt>'),['latest','old']));
check(()=>assert.throws(()=>outboundMessageId('bad\r\nHeader')));
console.log(JSON.stringify({ok:true,checks,scope:'Executed isolated signature, routing boundary and reply-reference tests; no production mutation or email sends.'}));
