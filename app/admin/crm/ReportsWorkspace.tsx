'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {planDisplayName} from '@/lib/billing';
import {formatIncomeByCurrency} from '@/lib/admin-dashboard';
import {sliceMonths,incomeTotals,currencyWithMostIncome,incomeSeries,plansSoldSummary,refundsSummary,newPaidSummary,buildMonthRows,splitActiveRows,periodHasActivity,REPORTS_PERIODS,type ReportsPeriod,type AdminReportsData,type IncomeSeriesPoint} from '@/lib/admin-reports';
type Reports=AdminReportsData;
const emptyReports:Reports={months:[],income:{},plansSold:{},refunds:{},refundCount:{},newPaidByMonth:{},expiredByMonth:{}};
async function call(path:string,options?:RequestInit){const r=await fetch(path,options);const result=await r.json();if(!r.ok)throw new Error(result.error||'Could not complete the request.');return result;}
const money=(n:number,currency:string)=>new Intl.NumberFormat(undefined,{style:'currency',currency}).format(n);
function planBreakdownText(byPlan:Record<string,number>){const entries=Object.entries(byPlan).filter(([,n])=>n>0);return entries.length?entries.map(([plan,n])=>`${planDisplayName(plan)} ${n}`).join(' · '):'—';}

function StatCard({label,value,hint}:{label:string;value:string;hint?:string}){return <div className="wp-crm-stat"><span>{label}</span><strong>{value}</strong>{hint&&<small>{hint}</small>}</div>;}

function IncomeChart({series,currency}:{series:IncomeSeriesPoint[];currency:string}){
 const max=Math.max(1,...series.map(p=>p.value));
 const topIndex=series.reduce((best,p,i)=>p.value>series[best].value?i:best,0);
 const summary=`Income chart in ${currency} for ${series.map(p=>p.label).join(', ')}, from ${money(series[0]?.value||0,currency)} to ${money(series[series.length-1]?.value||0,currency)}.`;
 return <div className="wp-reports-chart-wrap"><div className="wp-reports-chart" role="img" aria-label={summary}>
  {series.map((p,i)=><div key={p.month} className={`wp-reports-bar${i===series.length-1?' is-current':''}`} title={`${p.label}: ${money(p.value,currency)}`}>
   {i===topIndex&&p.value>0&&<span className="wp-reports-bar-value">{money(p.value,currency)}</span>}
   <span className="wp-reports-bar-fill" data-empty={p.value?undefined:'true'} style={{height:`${p.value?Math.max(8,Math.round(p.value/max*100)):6}%`}}/>
   <small>{p.label}</small>
  </div>)}
 </div></div>;
}

export default function ReportsWorkspace(){
 const [reports,setReports]=useState<Reports>(emptyReports),[loading,setLoading]=useState(true),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [period,setPeriod]=useState<ReportsPeriod>(6),[currency,setCurrency]=useState<string|null>(null),[showAllMonths,setShowAllMonths]=useState(false);
 const load=useCallback(async(signal?:AbortSignal)=>{setReports(await call('/api/admin/crm/marketing?view=reports',{signal}));},[]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);load(controller.signal).catch(e=>{if(!controller.signal.aborted)setNotice(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[load]);
 async function refresh(){setBusy(true);setNotice('');try{await load();}catch(e){setNotice(e instanceof Error?e.message:'Could not refresh the report.');}finally{setBusy(false);}}

 const months=useMemo(()=>sliceMonths(reports.months,period),[reports,period]);
 const income=useMemo(()=>incomeTotals(reports,months),[reports,months]);
 const plans=useMemo(()=>plansSoldSummary(reports,months),[reports,months]);
 const refunds=useMemo(()=>refundsSummary(reports,months),[reports,months]);
 const newPaid=useMemo(()=>newPaidSummary(reports,months),[reports,months]);
 const hasActivity=useMemo(()=>periodHasActivity(reports,months),[reports,months]);
 const currencies=useMemo(()=>Object.keys(income).filter(c=>income[c]>0),[income]);
 const defaultCurrency=useMemo(()=>currencyWithMostIncome(reports,months),[reports,months]);
 const activeCurrency=currency&&currencies.includes(currency)?currency:(defaultCurrency||currencies[0]||'USD');
 const series=useMemo(()=>incomeSeries(reports,months,activeCurrency),[reports,months,activeCurrency]);
 const rows=useMemo(()=>buildMonthRows(reports,months),[reports,months]);
 const {active,inactiveCount}=useMemo(()=>splitActiveRows(rows),[rows]);
 const visibleRows=showAllMonths?rows:active;

 return <main className="wp-growth">
  <div className="wp-admin-heading">
   <div><p className="wp-eyebrow">WAZAP · ADMIN</p><h1>Reports</h1><p>Money and customers, month by month.</p></div>
   <div className="flex items-center gap-2">
    <div className="wp-admin-tabs" role="group" aria-label="Period">
     {REPORTS_PERIODS.map(p=><button key={p} aria-pressed={period===p} onClick={()=>setPeriod(p)}>{p} months</button>)}
    </div>
    <button className="wp-crm-secondary" aria-label="Refresh reports" disabled={busy} onClick={refresh}><RefreshCw size={15}/></button>
   </div>
  </div>
  {notice&&<p role="status" className="wp-admin-context my-5">{notice}</p>}
  {loading?<p role="status" className="wp-growth-panel mt-6 text-sm text-muted">Loading your workspace…</p>:!hasActivity?
  <div className="wp-growth-empty mt-6"><h3>No activity yet</h3><p>Nothing to report in the last {period} months. Come back once there have been some payments.</p></div>:<>

  <div className="wp-growth-stats mt-6">
   <StatCard label="Income" value={formatIncomeByCurrency(income)}/>
   <StatCard label="Plans sold" value={String(plans.total)} hint={planBreakdownText(plans.byPlan)}/>
   <StatCard label="Refunds" value={String(refunds.count)} hint={formatIncomeByCurrency(refunds.byCurrency)}/>
   <StatCard label="New paying customers" value={String(newPaid.newPaid)} hint={`Expired ${newPaid.expired}`}/>
  </div>

  <section className="wp-growth-panel mt-5">
   <div className="flex justify-between items-center gap-4 mb-4"><h2>Income</h2></div>
   {currencies.length>1&&<div className="wp-reports-currencies" role="group" aria-label="Currency">
    {currencies.map(c=><button key={c} aria-pressed={activeCurrency===c} onClick={()=>setCurrency(c)}>{c}</button>)}
   </div>}
   <IncomeChart series={series} currency={activeCurrency}/>
  </section>

  <section className="wp-growth-panel mt-5">
   <div className="flex justify-between items-center gap-4 mb-4"><h2>Month by month</h2></div>
   <div className="wp-growth-table-wrap"><table className="wp-growth-table"><thead><tr><th>Month</th><th>Income</th><th>Plans sold</th><th>Refunds</th><th>New paid</th><th>Expired</th></tr></thead><tbody>
    {visibleRows.map(row=><tr key={row.month}>
     <td>{row.label}</td>
     <td>{formatIncomeByCurrency(row.income)}</td>
     <td title={planBreakdownText(buildPlanBreakdownForRow(reports,row.month))}>{row.plansSold||(row.hasActivity?'—':0)}</td>
     <td>{row.refundCount||(row.hasActivity?'—':0)}</td>
     <td>{row.newPaid||(row.hasActivity?'—':0)}</td>
     <td>{row.expired||(row.hasActivity?'—':0)}</td>
    </tr>)}
   </tbody></table></div>
   {!showAllMonths&&inactiveCount>0&&<div className="wp-reports-collapsed">No activity in {inactiveCount} earlier month{inactiveCount===1?'':'s'}.<button onClick={()=>setShowAllMonths(true)}>Show all months</button></div>}
   {showAllMonths&&inactiveCount>0&&<div className="wp-reports-collapsed"><button onClick={()=>setShowAllMonths(false)}>Hide months with no activity</button></div>}
  </section>
  </>}
 </main>;
}

function buildPlanBreakdownForRow(reports:Reports,month:string){return reports.plansSold[month]||{};}
