import type {Prisma} from "@prisma/client";
import {CRM_TRASH_TAG} from "./crm-trash-ui";
export {CRM_TRASH_TAG} from "./crm-trash-ui";
const PRIOR_DNC_TAG="__crm_prior_do_not_contact";
export const activeCrmContacts:Prisma.CrmLeadWhereInput={NOT:{tags:{has:CRM_TRASH_TAG}}};
export function isCrmTrashed(lead:{tags:string[]}){return lead.tags.includes(CRM_TRASH_TAG);}
// For a model with an optional `crmLead` relation (e.g. SupportConversation):
// matches rows with no lead at all, or whose lead isn't trashed. A plain
// `{crmLead: activeCrmContacts}` would wrongly exclude the no-lead case,
// since filtering a nullable to-one relation by an object requires the
// relation to exist.
export const activeConversationContacts:Prisma.SupportConversationWhereInput={OR:[{crmLeadId:null},{crmLead:activeCrmContacts}]};
export async function changeCrmTrash(tx:Prisma.TransactionClient,input:{id:string;updatedAt:Date;actorId:string;restore:boolean;reason:string}){
 const current=await tx.crmLead.findUnique({where:{id:input.id}});
 if(!current)return "missing";
 if(current.updatedAt.getTime()!==input.updatedAt.getTime()||isCrmTrashed(current)!==input.restore)return "conflict";
 const tags=current.tags.filter(t=>t!==CRM_TRASH_TAG&&t!==PRIOR_DNC_TAG);
 if(!input.restore){tags.push(CRM_TRASH_TAG);if(current.doNotContact)tags.push(PRIOR_DNC_TAG);}
 const changed=await tx.crmLead.updateMany({where:{id:input.id,updatedAt:input.updatedAt},data:{tags,doNotContact:input.restore?current.tags.includes(PRIOR_DNC_TAG):true,lastActivityAt:new Date()}});
 if(!changed.count)return "conflict";
 if(!input.restore){
  await tx.crmCampaignRecipient.updateMany({where:{leadId:input.id,status:"queued"},data:{status:"cancelled",lastError:"Contact moved to CRM Trash."}});
  await tx.outboundEmail.updateMany({where:{recipient:{equals:current.email,mode:"insensitive"},status:"queued",type:{in:["crm_subscription_confirmation","crm_campaign","support_auto_answer","billing_auto_answer","marketing_service_auto_answer"]}},data:{status:"cancelled",lastError:"Contact moved to CRM Trash."}});
 }
 await tx.crmActivity.create({data:{leadId:input.id,actorId:input.actorId,kind:input.restore?"restore":"trash",body:input.restore?"Contact restored from Trash. Cancelled outreach stays cancelled.":`Contact moved to Trash: ${input.reason}. Account, billing and support history retained.`}});
 return "ok";
}
