import {NextResponse} from "next/server";
import {getServerSession} from "next-auth";
import {authOptions} from "@/lib/auth";
import {sameSiteRequest} from "@/lib/crm";
import {businessScorecard} from "@/lib/business-scorecard";
import {appendBusinessEntry} from "@/lib/business-ledger";
async function admin(){const session=await getServerSession(authOptions);return Boolean((session?.user as {isAdmin?:boolean}|undefined)?.isAdmin);}
export async function GET(){if(!await admin())return NextResponse.json({error:"Forbidden"},{status:403});try{return NextResponse.json(await businessScorecard(),{headers:{"Cache-Control":"no-store"}});}catch{return NextResponse.json({error:"Business records unavailable"},{status:503});}}
export async function POST(req:Request){if(!await admin())return NextResponse.json({error:"Forbidden"},{status:403});if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin"},{status:403});try{const body=await req.json();const entry=await appendBusinessEntry(body);return NextResponse.json({entry},{status:201});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to save"},{status:400});}}
