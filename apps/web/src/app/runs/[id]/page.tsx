"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
export const dynamic = "force-dynamic";
const SERVER = "https://modelapi.devchauhan.com";
type CaseRow = { transcript_id: string; schema_valid: boolean; attempt_count: number; scores?: { overall?: number; chief_complaint?: number; vitals?: { avg?: number }; medications?: { f1?: number }; diagnoses?: { f1?: number }; plan?: { f1?: number } } | null };
type RunData = { id: string; strategy: string; status: string; prompt_hash: string; completed_cases: number; total_cases: number; cost_usd?: number; tokens?: { cost_usd?: number; cache_read?: number }; wall_ms: number; aggregate_scores?: { overall?: number; chief_complaint?: number; vitals?: { avg?: number }; medications?: { f1?: number; precision?: number; recall?: number }; diagnoses?: { f1?: number; precision?: number; recall?: number }; plan?: { f1?: number; precision?: number; recall?: number }; follow_up_interval?: number; follow_up_reason?: number } | null; cases?: CaseRow[] };
const COLORS: Record<string,string> = { zero_shot:"#3b82f6", few_shot:"#8b5cf6", cot:"#06b6d4" };
function pct(n: number|null|undefined) { if(n==null)return"—"; return`${(n*100).toFixed(1)}%`; }
function sc(n: number|null|undefined): string { if(n==null)return"#475569"; if(n>=0.8)return"#22c55e"; if(n>=0.6)return"#f59e0b"; if(n>=0.4)return"#f97316"; return"#ef4444"; }
function Bar({value}:{value:number|null|undefined}) {
  if(value==null)return<span style={{color:"#334155"}}>—</span>;
  const c=sc(value);
  return <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:40,height:3,background:"#1e293b",borderRadius:2}}><div style={{width:`${Math.round(value*100)}%`,height:"100%",background:c,borderRadius:2}}/></div><span style={{color:c,fontFamily:"monospace",fontSize:12,fontWeight:600,minWidth:42}}>{pct(value)}</span></div>;
}
export default function RunDetailPage({params}:{params:Promise<{id:string}>}) {
  const {id}=use(params);
  const [run,setRun]=useState<RunData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [sel,setSel]=useState<string|null>(null);
  const [gold,setGold]=useState("");
  const [pred,setPred]=useState("");
  useEffect(()=>{
    fetch(`${SERVER}/api/v1/runs/${id}`).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}).then((d:RunData)=>setRun({...d,cases:(d.cases??[]).map(c=>({transcript_id:c.transcript_id,schema_valid:c.schema_valid,attempt_count:c.attempt_count,scores:c.scores}))})).catch((e:Error)=>setError(e.message)).finally(()=>setLoading(false));
  },[id]);
  useEffect(()=>{
    if(!sel)return;
    fetch(`${SERVER}/api/v1/runs/${id}/cases/${sel}`).then(r=>r.json()).then((d:{gold?:unknown;prediction?:unknown})=>{setGold(JSON.stringify(d.gold,null,2));setPred(JSON.stringify(d.prediction,null,2));}).catch(console.error);
  },[sel,id]);
  if(loading)return<div style={{minHeight:"100vh",background:"#020817",display:"flex",alignItems:"center",justifyContent:"center",color:"#475569",fontFamily:"monospace",letterSpacing:2,fontSize:12}}>LOADING...</div>;
  if(error)return<div style={{minHeight:"100vh",background:"#020817",display:"flex",alignItems:"center",justifyContent:"center",color:"#ef4444",fontFamily:"monospace"}}>{error}</div>;
  if(!run)return null;
  const cases=[...(run.cases??[])].sort((a,b)=>a.transcript_id.localeCompare(b.transcript_id));
  const color=COLORS[run.strategy]??"#64748b";
  const cost=run.tokens?.cost_usd??run.cost_usd??0;
  const agg=run.aggregate_scores;
  const fieldRows=[{label:"Chief Complaint",v:agg?.chief_complaint},{label:"Vitals avg",v:agg?.vitals?.avg},{label:"Medications F1",v:agg?.medications?.f1,p:agg?.medications?.precision,r:agg?.medications?.recall},{label:"Diagnoses F1",v:agg?.diagnoses?.f1,p:agg?.diagnoses?.precision,r:agg?.diagnoses?.recall},{label:"Plan F1",v:agg?.plan?.f1,p:agg?.plan?.precision,r:agg?.plan?.recall},{label:"Follow-up Days",v:agg?.follow_up_interval},{label:"Follow-up Reason",v:agg?.follow_up_reason}];
  return(
    <div style={{minHeight:"100vh",background:"#020817",color:"#e2e8f0",fontFamily:"'DM Mono','Fira Code',monospace"}}>
      <div style={{borderBottom:"1px solid #0f172a",padding:"16px 32px",display:"flex",alignItems:"center",gap:12}}>
        <Link href="/runs" style={{color:"#475569",textDecoration:"none",fontSize:11,letterSpacing:1}}>← RUNS</Link>
        <span style={{color:"#1e293b"}}>/</span>
        <span style={{fontSize:11,letterSpacing:2,color,textTransform:"uppercase",fontWeight:700,background:color+"15",padding:"3px 10px",borderRadius:4,border:`1px solid ${color}30`}}>{run.strategy.replace("_"," ")}</span>
        <span style={{fontFamily:"monospace",fontSize:10,color:"#1e3a5f",background:"#0f172a",padding:"3px 8px",borderRadius:4}}>{run.prompt_hash}</span>
        <span style={{fontSize:10,fontWeight:700,letterSpacing:1,padding:"2px 8px",borderRadius:4,background:run.status==="completed"?"#22c55e15":"#3b82f615",color:run.status==="completed"?"#22c55e":"#3b82f6",border:`1px solid ${run.status==="completed"?"#22c55e30":"#3b82f630"}`}}>{run.status.toUpperCase()}</span>
        <span style={{marginLeft:"auto",fontSize:11,color:"#334155"}}>{run.completed_cases}/{run.total_cases} cases · {(run.wall_ms/1000).toFixed(1)}s · ${cost.toFixed(4)}</span>
      </div>
      <div style={{padding:"24px 32px"}}>
        <div style={{display:"grid",gridTemplateColumns:"240px 1fr",gap:16,marginBottom:20}}>
          <div style={{background:"#0f172a",border:`1px solid ${color}30`,borderRadius:8,padding:24,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <div style={{fontSize:10,letterSpacing:3,color:"#475569",marginBottom:8}}>OVERALL F1</div>
            <div style={{fontSize:52,fontWeight:700,color,letterSpacing:-2,lineHeight:1}}>{agg?.overall!=null?`${(agg.overall*100).toFixed(1)}`:"—"}</div>
            {agg?.overall!=null&&<div style={{fontSize:16,color:"#475569",marginTop:2}}>%</div>}
            <div style={{width:"100%",height:4,background:"#1e293b",borderRadius:2,marginTop:16}}><div style={{width:`${(agg?.overall??0)*100}%`,height:"100%",background:color,borderRadius:2}}/></div>
          </div>
          <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,padding:24}}>
            <div style={{fontSize:10,letterSpacing:3,color:"#475569",marginBottom:16}}>FIELD BREAKDOWN</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 24px"}}>
              {fieldRows.map(row=>(
                <div key={row.label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                  <span style={{fontSize:11,color:"#64748b",whiteSpace:"nowrap"}}>{row.label}</span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    {"p" in row && row.p!=null&&<span style={{fontSize:10,color:"#334155"}}>P:{pct(row.p)} R:{pct(row.r)}</span>}
                    <Bar value={row.v}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{background:"#0a0f1a",border:"1px solid #1e293b",borderRadius:8,overflow:"hidden",marginBottom:sel?2:0}}>
          <div style={{padding:"14px 20px",borderBottom:"1px solid #1e293b",display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:10,letterSpacing:2,color:"#475569",fontWeight:600}}>CASE RESULTS</span>
            <span style={{fontSize:10,color:"#334155"}}>{cases.length} cases · click to inspect gold vs prediction</span>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{borderBottom:"1px solid #1e293b"}}>{["CASE","OVERALL","CHIEF CC","VITALS","MEDS","DX","PLAN","✓"].map(h=><th key={h} style={{padding:"10px 16px",textAlign:"left",fontSize:10,letterSpacing:1,color:"#334155",fontWeight:600}}>{h}</th>)}</tr></thead>
              <tbody>
                {cases.map((c,i)=>{
                  const s=c.scores; const isSel=sel===c.transcript_id;
                  return<tr key={c.transcript_id} onClick={()=>setSel(isSel?null:c.transcript_id)} style={{borderBottom:"1px solid #0f172a",background:isSel?color+"10":i%2===0?"transparent":"#0f172a30",cursor:"pointer",borderLeft:isSel?`3px solid ${color}`:"3px solid transparent",transition:"all 0.1s"}}>
                    <td style={{padding:"10px 16px",fontFamily:"monospace",fontSize:12,color:isSel?color:"#64748b"}}>{c.transcript_id}</td>
                    <td style={{padding:"10px 16px"}}><Bar value={s?.overall}/></td>
                    <td style={{padding:"10px 16px"}}><Bar value={s?.chief_complaint}/></td>
                    <td style={{padding:"10px 16px"}}><Bar value={s?.vitals?.avg}/></td>
                    <td style={{padding:"10px 16px"}}><Bar value={s?.medications?.f1}/></td>
                    <td style={{padding:"10px 16px"}}><Bar value={s?.diagnoses?.f1}/></td>
                    <td style={{padding:"10px 16px"}}><Bar value={s?.plan?.f1}/></td>
                    <td style={{padding:"10px 16px",color:c.schema_valid?"#22c55e":"#ef4444",fontSize:13}}>{c.schema_valid?"✓":"✗"}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
        {sel&&(
          <div style={{marginTop:2,background:"#0a0f1a",border:`1px solid ${color}30`,borderRadius:8,overflow:"hidden"}}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid #1e293b",display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:10,letterSpacing:2,color,fontWeight:700}}>CASE DETAIL</span>
              <span style={{fontFamily:"monospace",fontSize:11,color:"#64748b"}}>{sel}</span>
              <button onClick={()=>setSel(null)} style={{marginLeft:"auto",background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>×</button>
            </div>
            {gold||pred?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
              <div style={{borderRight:"1px solid #1e293b",padding:20}}><div style={{fontSize:10,letterSpacing:2,color:"#22c55e",marginBottom:12,fontWeight:600}}>GOLD STANDARD</div><pre style={{fontSize:11,color:"#94a3b8",overflowX:"auto",maxHeight:320,margin:0,lineHeight:1.6}}>{gold}</pre></div>
              <div style={{padding:20}}><div style={{fontSize:10,letterSpacing:2,color,marginBottom:12,fontWeight:600}}>PREDICTION</div><pre style={{fontSize:11,color:"#94a3b8",overflowX:"auto",maxHeight:320,margin:0,lineHeight:1.6}}>{pred}</pre></div>
            </div>:<div style={{padding:40,textAlign:"center",color:"#334155",fontSize:12}}>Loading...</div>}
          </div>
        )}
      </div>
    </div>
  );
}
