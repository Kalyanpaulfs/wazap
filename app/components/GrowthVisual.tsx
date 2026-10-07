export default function GrowthVisual({kind='routing',label='Illustration of a shared link routing to a team'}:{kind?:string;label?:string}) {
 const property=kind==='property', tracking=kind==='tracking'||kind==='campaign', compare=kind==='compare'||kind==='inbox';
 return <svg className={`gv-art gv-${kind}`} viewBox="0 0 640 340" role="img" aria-label={label}>
 <defs><linearGradient id={`bg-${kind}`} x2="1" y2="1"><stop stopColor="#143828"/><stop offset="1" stopColor="#07140e"/></linearGradient><linearGradient id={`node-${kind}`} x2="0" y2="1"><stop stopColor="#214934"/><stop offset="1" stopColor="#10251a"/></linearGradient></defs>
 <rect width="640" height="340" rx="24" fill={`url(#bg-${kind})`}/>
 {[100,180,260,340,420,500,580].map(x=><path key={x} d={`M${x} 0v340`} stroke="#70d497" opacity=".045"/>)}
 {[60,140,220,300].map(y=><path key={y} d={`M0 ${y}h640`} stroke="#70d497" opacity=".045"/>)}
 <circle cx="320" cy="170" r="120" fill="none" stroke="#5fbc80" opacity=".12"/><circle cx="320" cy="170" r="91" fill="none" stroke="#5fbc80" opacity=".08"/>
 <g stroke="#64d892" strokeWidth="2" fill="none" opacity=".55"><path d="M179 170H280M360 170H415Q440 170 440 95H478M360 170H478M360 170H415Q440 170 440 245H478"/></g>
 <g className="gv-travel"><circle cx="216" cy="170" r="5" fill="#a6ffc7"/><circle cx="415" cy="170" r="5" fill="#a6ffc7"/></g>
 <g className="gv-source"><rect x="69" y="96" width="110" height="148" rx="18" fill="#07140e" stroke="#588969"/><rect x="80" y="108" width="88" height="123" rx="10" fill={`url(#node-${kind})`}/><path d="M110 117h28" stroke="#83b89a" strokeWidth="3" strokeLinecap="round"/>
 {property?<g fill="none" stroke="#c4f0d5" strokeWidth="2"><path d="M99 170l25-22 25 22v32H99zM118 202v-20h13v20"/><path d="M105 172h8m22 0h8"/></g>:<g fill="none" stroke="#c4f0d5" strokeWidth="3"><rect x="101" y="151" width="31" height="16" rx="8" transform="rotate(-35 116 159)"/><rect x="117" y="168" width="31" height="16" rx="8" transform="rotate(-35 132 176)"/><path d="M117 173l16-12"/></g>}
 <rect x="97" y="214" width="55" height="4" rx="2" fill="#25d366" opacity=".5"/></g>
 <g className="gv-hub"><rect x="276" y="126" width="88" height="88" rx="24" fill="#25d366"/><path d="M303 168h33m-13-12 13 12-13 12m-20 0v-24" stroke="#062b15" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>
 {[95,170,245].map((y,i)=><g key={y} className={`gv-destination gv-destination-${i}`}><rect x="478" y={y-26} width="96" height="52" rx="14" fill={`url(#node-${kind})`} stroke="#477c59"/>{tracking?<g fill="#88e3aa"><rect x="495" y={y+3} width="8" height="9" rx="2"/><rect x="508" y={y-4} width="8" height="16" rx="2"/><rect x="521" y={y-12} width="8" height="24" rx="2"/></g>:compare?<g fill="none" stroke="#c4f0d5" strokeWidth="2"><rect x="496" y={y-10} width="29" height="20" rx="5"/><path d={`M502 ${y-3}h17m-17 6h12`}/></g>:<g fill="#a7dbba"><circle cx="510" cy={y-7} r="7"/><path d={`M498 ${y+14}q0-15 12-15t12 15z`}/></g>}<path d={`M541 ${y-4}h19m-19 8h12`} stroke="#84ab91" strokeWidth="3" strokeLinecap="round"/></g>)}
 <text x="124" y="272" textAnchor="middle" fill="#a5c8b2" fontSize="12" fontFamily="sans-serif">{property?'Property campaign':tracking?'Campaign link':'One public link'}</text><text x="320" y="244" textAnchor="middle" fill="#a5c8b2" fontSize="12" fontFamily="sans-serif">{compare?'Choose your workflow':'Wazap'}</text><text x="526" y="298" textAnchor="middle" fill="#a5c8b2" fontSize="12" fontFamily="sans-serif">{tracking?'Measure each stage':compare?'Team workflows':'Destination team'}</text>
 </svg>;
}
