"use client";

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Globe, ChevronDown } from "lucide-react";
import "./language-control.css";
import { usePathname } from 'next/navigation';
import { SITE_LANGUAGES, NATIVE_LANGUAGE_NAMES, normalizeSiteLanguage, siteDirection, type SiteLanguage } from '@/lib/site-languages';
import { SITE_LOCALE_VERSION } from '@/lib/site-locale-version';

type Locale = { language: SiteLanguage; country: string | null; choose: (language: SiteLanguage | 'auto') => void; automatic: boolean; t: (text:string)=>string };
const Context = createContext<Locale>({language:'en',country:null,choose:()=>{},automatic:true,t:text=>text});
export const useSiteLocale = () => useContext(Context);
const publicRoutes = new Set(['/', '/pricing', '/contact', '/support', '/about', '/faq', '/login', '/signup', '/register']);
const accountRoute = /^\/(dashboard|account|admin|workspace|inbox|channels|automations|reports|analytics|operations|partners)(\/|$)/;
const skip = 'script,style,pre,code,textarea,input,select,[contenteditable],[translate="no"],[data-no-localize],[aria-live],.wp-profile';
const decodeEntities = (text:string) => text.replace(/&(apos|amp|quot|nbsp|lsquo|rsquo|ldquo|rdquo|ndash|mdash);/g, match=>({'&apos;':"'",'&amp;':'&','&quot;':'"','&nbsp;':' ','&lsquo;':'‘','&rsquo;':'’','&ldquo;':'“','&rdquo;':'”','&ndash;':'–','&mdash;':'—'}[match]||match));
const normalize = (text:string) => decodeEntities(text).replace(/\s+/g,' ').trim();

export default function SiteLocaleProvider({children}:{children:React.ReactNode}) {
 const [language,setLanguage]=useState<SiteLanguage>('en');
 const [country,setCountry]=useState<string|null>(null);
 const [automatic,setAutomatic]=useState(true);
 const [dictionary,setDictionary]=useState<Record<string,string>>({});
 const path=usePathname();
 const request=useRef(0);
 const originals=useRef(new WeakMap<Text,{source:string;output:string}>());
 const attributes=useRef(new WeakMap<Element,Map<string,{source:string;output:string}>>());
 function choose(value:SiteLanguage|'auto') {
  setAutomatic(value==='auto');
  try{if(value==='auto')localStorage.removeItem('wazap_site_language');else localStorage.setItem('wazap_site_language',JSON.stringify({language:value,expiresAt:Date.now()+31536000000}));}catch{/* Cookie preference still works when browser storage is unavailable. */}
  document.cookie=`wazap_site_language=${value==='auto'?'':value}; Path=/; Max-Age=${value==='auto'?0:31536000}; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;
  if(value!=='auto')setLanguage(value);
  const id=++request.current;
  fetch(`/api/site-locale${value==='auto'?'':`?language=${value}`}`,{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(id!==request.current||!data)return;const chosen=normalizeSiteLanguage(data.language);if(chosen)setLanguage(chosen);setCountry(data.country||null);}).catch(()=>{});
 }
 useEffect(()=>{
  const id=++request.current;
  let saved:SiteLanguage|null=null;
  try{const preference=JSON.parse(localStorage.getItem('wazap_site_language')||'null');if(preference?.expiresAt>Date.now())saved=normalizeSiteLanguage(preference.language);else if(preference)localStorage.removeItem('wazap_site_language');}catch{}
  if(saved){setLanguage(saved);setAutomatic(false);}
  fetch(`/api/site-locale${saved?`?language=${saved}`:''}`,{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(id!==request.current||!data)return;setLanguage(normalizeSiteLanguage(data.language)||'en');setCountry(data.country||null);setAutomatic(data.source!=='preference');}).catch(()=>setLanguage(normalizeSiteLanguage(navigator.language)||'en'));
 },[]);
 useEffect(()=>{
  let cancelled=false;
  setDictionary({});
  if(language==='en')return;
  fetch(`/locales/${SITE_LOCALE_VERSION}/${language}.json`).then(r=>r.ok?r.json():null).then(data=>{if(!cancelled&&data?.version===SITE_LOCALE_VERSION&&data?.language===language&&data?.translations)setDictionary(Object.fromEntries(Object.entries(data.translations as Record<string,string>).map(([key,value])=>[normalize(key),decodeEntities(value)])));}).catch(()=>{});
  return()=>{cancelled=true;};
 },[language]);
 useEffect(()=>{
  const useEnglish=!publicRoutes.has(path);
  const locale=useEnglish?'en':language;
  document.documentElement.lang=locale;
  document.documentElement.dir=siteDirection(locale);
  const translate=(value:string)=>{if(useEnglish)return value;const key=normalize(value);if(dictionary[key])return dictionary[key];if(key.includes('. ')){const pieces=key.split('. ');const values=pieces.map(part=>dictionary[part]||part);if(values.some((part,index)=>part!==pieces[index]))return values.join('. ');}return value;};
  const text=(node:Text)=>{
   if(node.parentElement?.closest(skip))return;
   const previous=originals.current.get(node);
   const source=previous&&node.nodeValue===previous.output?previous.source:node.nodeValue||'';
   const target=translate(source);
   const output=target===source?source:source.replace(/\S[\s\S]*\S|\S/,target);
   originals.current.set(node,{source,output});
   if(node.nodeValue!==output)node.nodeValue=output;
  };
  const element=(node:Element)=>{
   if(node.closest('script,style,pre,code,select,[contenteditable],[translate="no"],[data-no-localize],[aria-live],.wp-profile'))return;
   for(const name of ['placeholder','aria-label','title','alt']){
    if(!node.hasAttribute(name))continue;
    const records=attributes.current.get(node)||new Map();
    const previous=records.get(name),current=node.getAttribute(name)||'';
    const source=previous&&current===previous.output?previous.source:current;
    const output=translate(source);records.set(name,{source,output});attributes.current.set(node,records);
    if(current!==output)node.setAttribute(name,output);
   }
  };
  const scan=(root:Node)=>{
   if(root.nodeType===Node.TEXT_NODE){text(root as Text);return;}
   if(root.nodeType!==Node.ELEMENT_NODE)return;
   element(root as Element);
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
   let node;while((node=walker.nextNode())){if(node.nodeType===Node.TEXT_NODE)text(node as Text);else element(node as Element);}
  };
  scan(document.body);
  const observer=new MutationObserver(records=>{
   for(const record of records){if(record.type==='characterData')text(record.target as Text);else if(record.type==='attributes')element(record.target as Element);else record.addedNodes.forEach(scan);}
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title','alt']});
  return()=>observer.disconnect();
 },[language,dictionary,path]);
 return <Context.Provider value={{language,country,choose,automatic,t:text=>dictionary[normalize(text)]||text}}>{children}{language!=='en'&&!accountRoute.test(path)&&<p className="wazap-translation-note">Translations are provided for convenience. Legal policies and private account pages are available in English.</p>}</Context.Provider>;
}

export function LanguageSelector(){
 const {language,choose,automatic}=useSiteLocale();
 return <label className="wp-language-control" translate="no" title="Choose language"><Globe size={15} aria-hidden="true"/><span aria-hidden="true">{language.toUpperCase()}</span><ChevronDown size={12} aria-hidden="true"/><select aria-label="Choose language" value={automatic?'auto':language} onChange={event=>choose(event.target.value as SiteLanguage|'auto')}><option value="auto">Automatic</option>{SITE_LANGUAGES.map(code=><option key={code} value={code} lang={code}>{NATIVE_LANGUAGE_NAMES[code]}</option>)}</select></label>;
}
