import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { isIP } from 'node:net';
import { Reader, type Response } from 'maxmind';
import { requestIp } from './request-ip';
let reader:Reader<Response>|null=null;
export function countryForIp(ip:string):string|null{
 const clean=ip.replace(/^::ffff:/,'');if(!isIP(clean))return null;
 try{reader??=new Reader(fs.readFileSync(path.join(process.cwd(),'data/user-country.mmdb')));const value=reader.get(clean) as unknown as {country_code?:string}|null;const code=value?.country_code;return code&&/^[A-Z]{2}$/.test(code)?code:null;}catch{return null;}
}
export function countryForRequest(headers:Headers){return countryForIp(requestIp(headers));}
