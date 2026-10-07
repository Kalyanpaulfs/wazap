import {NextResponse}from"next/server";import{currentInboxContext}from"@/lib/inbox";import{developerReliability}from"@/lib/developer-reliability";
export async function GET(){const ctx=await currentInboxContext();if(!ctx)return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json(await developerReliability(ctx.workspaceId))}
