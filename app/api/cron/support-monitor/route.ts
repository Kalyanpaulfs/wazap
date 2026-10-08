import { NextResponse } from 'next/server';
import { monitorSupport } from '@/lib/support-monitor';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(req:Request){if(!process.env.CRON_SECRET||req.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:'Unauthorized'},{status:401});return NextResponse.json(await monitorSupport());}
