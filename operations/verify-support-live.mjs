import {PrismaClient} from '@prisma/client';
import {encode} from 'next-auth/jwt';
const p=new PrismaClient();
try {
 const u=await p.user.findFirst({where:{email:'joseph@astraterra.ae',isAdmin:true}});if(!u)throw Error('Owner admin not found');
 const token=await encode({secret:process.env.NEXTAUTH_SECRET,token:{id:u.id,email:u.email,name:u.name,isAdmin:true,plan:u.plan,sessionVersion:u.sessionVersion},maxAge:300});
 const headers={Cookie:'__Secure-next-auth.session-token='+token};
 const res=await fetch('https://wazap.lt/api/admin/support',{headers});const data=await res.json();if(res.status!==200)throw Error('Admin API '+res.status);
 const html=await fetch('https://wazap.lt/admin/crm/support',{headers}).then(r=>r.text());
 const labels=html.includes('wp-support-summary')&&html.includes('Awaiting reply')&&html.includes('30 minutes');if(!labels)throw Error('Live support labels missing');
 if(data.conversations.some(c=>c.targetMinutes!==30))throw Error('Wrong target');
 const anon=await fetch('https://wazap.lt/api/admin/support');if(anon.status!==403)throw Error('Access restriction failed');
 const mails=await p.outboundEmail.groupBy({by:['status'],where:{type:'support_live_team_alert',createdAt:{gte:new Date(Date.now()-3600000)}},_count:{_all:true}});
 console.log(JSON.stringify({adminApi:res.status,labelsVerified:labels,conversations:data.conversations.length,unread:data.conversations.reduce((n,c)=>n+c.unread,0),awaiting:data.conversations.filter(c=>c.awaitingReply).length,health:data.health,notificationStatus:mails},null,2));
}finally{await p.$disconnect();}
