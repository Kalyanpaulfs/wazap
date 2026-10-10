import {readFile,writeFile,mkdir,rename,open,unlink} from "node:fs/promises";
import {dirname} from "node:path";
import {randomUUID} from "node:crypto";
export type BusinessEntry={id:string;kind:"cost"|"work";date:string;category:string;currency:string;amount:number|null;minutes:number|null;hourlyRate:number|null;reference:string;recordedAt:string};
const file=()=>process.env.WAZAP_BUSINESS_LEDGER||"/opt/wazap-private/business-ledger.json";
export function parseBusinessEntry(raw:Record<string,unknown>):BusinessEntry{
 const kind=raw.kind;if(kind!=="cost"&&kind!=="work")throw Error("Choose cost or work");
 const date=String(raw.date||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error("Valid date required");
 const currency=String(raw.currency||"").toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw Error("Three-letter currency required");
 const category=String(raw.category||"").trim().slice(0,80),reference=String(raw.reference||"").trim().slice(0,200);if(!category||!reference)throw Error("Category and invoice/case reference required");
 if(kind==="cost"&&(raw.amount===null||raw.amount===undefined||String(raw.amount).trim()===""))throw Error("Actual cost amount required");
 const amount=kind==="cost"?Number(raw.amount):null,minutes=kind==="work"?Number(raw.minutes):null;
 const hourlyRate=kind==="work"&&raw.hourlyRate!==undefined&&raw.hourlyRate!==null&&raw.hourlyRate!==""?Number(raw.hourlyRate):null;
 if(amount!==null&&(!Number.isFinite(amount)||amount<0)||minutes!==null&&(!Number.isFinite(minutes)||minutes<=0)||hourlyRate!==null&&(!Number.isFinite(hourlyRate)||hourlyRate<0))throw Error("Valid nonnegative costs and positive minutes required");
 return {id:randomUUID(),kind,date,category,currency,amount,minutes,hourlyRate,reference,recordedAt:new Date().toISOString()};
}
export async function readBusinessLedger():Promise<BusinessEntry[]>{try{const data=JSON.parse(await readFile(file(),"utf8"));if(!Array.isArray(data.entries))throw Error("Invalid ledger");return data.entries;}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return [];throw e;}}
export async function appendBusinessEntry(raw:Record<string,unknown>){const entry=parseBusinessEntry(raw);await mkdir(dirname(file()),{recursive:true,mode:0o700});const lock=await open(file()+".lock","wx",0o600).catch(()=>{throw Error("Ledger is busy; retry shortly");});try{const entries=await readBusinessLedger();const temp=file()+"."+randomUUID();await writeFile(temp,JSON.stringify({version:1,entries:[...entries,entry]}),{mode:0o600});await rename(temp,file());return entry;}finally{await lock.close();await unlink(file()+".lock");}}
export function summarizeBusinessLedger(entries:BusinessEntry[],month:string){const selected=entries.filter(e=>e.date.startsWith(month));const byCurrency:Record<string,{recordedCosts:number;valuedLabor:number;workMinutes:number;unvaluedWorkMinutes:number}>={};for(const e of selected){const row=byCurrency[e.currency]??={recordedCosts:0,valuedLabor:0,workMinutes:0,unvaluedWorkMinutes:0};if(e.kind==="cost")row.recordedCosts+=e.amount||0;else{row.workMinutes+=e.minutes||0;if(e.hourlyRate===null)row.unvaluedWorkMinutes+=e.minutes||0;else row.valuedLabor+=(e.minutes||0)/60*e.hourlyRate;}}return {month,entries:selected.length,byCurrency,coverage:"Partial recorded costs only. Missing invoices, allocation, labor and reconciled revenue remain unknown; not a profit calculation."};}
