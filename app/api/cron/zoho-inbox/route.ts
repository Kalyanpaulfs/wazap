import {pollZohoInboxes} from '@/lib/zoho-inbox';
import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(req:Request){if(!process.env.CRON_SECRET||req.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:'Unauthorized'},{status:401});return NextResponse.json(await pollZohoInboxes());}
