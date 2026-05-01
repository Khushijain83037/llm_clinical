"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type RunSummary = {
  id: string; strategy: string; model: string; status: string;
  completed_cases: number; total_cases: number; prompt_hash: string;
  aggregate_scores?: { overall?: number; medications?: { f1?: number }; diagnoses?: { f1?: number }; plan?: { f1?: number } } | null;
  cost_usd?: number; tokens?: { cost_usd?: number }; wall_ms: number; created_at: string;
};

const SERVER = "http://70.38.97.86:8800";
const COLORS: Record<string, string> = { zero_shot: "#3b82f6", few_shot: "#8b5cf6", cot: "#06b6d4" };
const LABELS: Record<string, string> = { zero_shot: "ZERO SHOT", few_shot: "FEW SHOT", cot: "CHAIN OF THOUGHT" };

function pct(n: number | null | undefined) { if (n == null) return "—"; return `${(n * 100).toFixed(1)}%`; }
function f1Bar(n: number | null | undefined) {
  if (n == null) return <span style={{color:"#334155"}}>—</span>;
  const c = n >= 0.8 ? "#22c55e" : n >= 0.6 ? "#f59e0b" : "#ef4444";
  return <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:60,height:4,background:"#1e293b",borderRadius:2}}><div style={{width:`${Math.round(n*100)}%`,height:"100%",background:c,borderRadius:2}}/></div><span style={{color:c,fontFamily:"monospace",fontSize:13,fontWeight:600}}>{pct(n)}</span></div>;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [strategy, setStrategy] = useState<"zero_shot"|"few_shot"|"cot">("zero_shot");
  const [selected, setSelected] = useState<string[]>([]);
  const load = () => fetch(`${SERVER}/api/v1/runs`).then(r=>r.json()).then(setRuns).finally(()=>setLoading(false));
  useEffect(()=>{load();},[]);
  const startRun = async () => { setStarting(true); await fetch(`${SERVER}/api/v1/runs`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({strategy})}); await load(); setStarting(false); };
  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s.slice(-1),id]);
  const getCost = (r: RunSummary) => r.tokens?.cost_usd ?? r.cost_usd ?? 0;
  const done = runs.filter(r=>r.status==="completed");
  const bestF1 = done.length>0 ? Math.max(...done.map(r=>r.aggregate_scores?.overall??0)) : 0;
  const totalCost = done.reduce((a,r)=>a+getCost(r),0);

  return (
    <div style={{minHeight:"100vh",background:"#020817",color:"#e2e8f0",fontFamily:"'DM Mono','Fira Code',monospace"}}>
      <div style={{borderBottom:"1px solid #0f172a",padding:"20px 32px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#22c55e",boxShadow:"0 0 8px #22c55e"}}/>
          <span style={{fontSize:11,letterSpacing:3,color:"#64748b",textTransform:"uppercase"}}>HEALOSBENCH</span>
          <span style={{color:"#1e293b"}}>|</span>
          <span style={{fontSize:11,letterSpacing:2,color:"#334155",textTransform:"uppercase"}}>Clinical Extraction Eval Harness</span>
        </div>
        <div style={{display:"flex",gap:24,fontSize:11,color:"#475569"}}>
          <span>Model: <span style={{color:"#94a3b8"}}>claude-haiku-4-5</span></span>
          <span>Cases: <span style={{color:"#94a3b8"}}>50</span></span>
        </div>
      </div>
      <div style={{padding:"32px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:32}}>
          {[{label:"TOTAL RUNS",value:runs.length.toString(),sub:`${done.length} completed`},{label:"BEST F1",value:bestF1>0?pct(bestF1):"—",sub:"across all strategies",accent:"#22c55e"},{label:"TOTAL SPEND",value:totalCost>0?`$${totalCost.toFixed(3)}`:"$0.00",sub:"all strategies",accent:"#f59e0b"},{label:"STRATEGIES",value:"3",sub:"zero_shot · few_shot · cot"}].map(card=>(
            <div key={card.label} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,padding:"20px 24px"}}>
              <div style={{fontSize:10,letterSpacing:2,color:"#475569",marginBottom:8}}>{card.label}</div>
              <div style={{fontSize:28,fontWeight:700,color:card.accent??"#e2e8f0",letterSpacing:-1}}>{card.value}</div>
              <div style={{fontSize:11,color:"#334155",marginTop:4}}>{card.sub}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
          <div style={{display:"flex",background:"#0f172a",border:"1px solid #1e293b",borderRadius:6,overflow:"hidden"}}>
            {(["zero_shot","few_shot","cot"] as const).map(s=>(
              <button key={s} onClick={()=>setStrategy(s)} style={{padding:"8px 16px",background:strategy===s?COLORS[s]+"20":"transparent",color:strategy===s?COLORS[s]:"#475569",fontSize:11,fontFamily:"inherit",fontWeight:strategy===s?700:400,letterSpacing:1,cursor:"pointer",border:"none",borderRight:"1px solid #1e293b",transition:"all 0.15s"}}>{LABELS[s]}</button>
            ))}
          </div>
          <button onClick={startRun} disabled={starting} style={{padding:"8px 20px",background:starting?"#1e293b":"#3b82f6",color:starting?"#475569":"#fff",border:"none",borderRadius:6,fontSize:11,fontFamily:"inherit",fontWeight:700,letterSpacing:1,cursor:starting?"not-allowed":"pointer"}}>{starting?"STARTING...":"▶ START RUN"}</button>
          {selected.length===2&&<Link href={`/compare?a=${selected[0]}&b=${selected[1]}`} style={{padding:"8px 20px",background:"#7c3aed20",color:"#8b5cf6",border:"1px solid #7c3aed40",borderRadius:6,fontSize:11,fontFamily:"inherit",fontWeight:700,letterSpacing:1,textDecoration:"none"}}>⚡ COMPARE</Link>}
          <span style={{fontSize:11,color:"#334155",marginLeft:"auto"}}>{selected.length>0?`${selected.length}/2 selected`:"Select 2 runs to compare"}</span>
        </div>
        <div style={{background:"#0a0f1a",border:"1px solid #1e293b",borderRadius:8,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{borderBottom:"1px solid #1e293b"}}>{["","STRATEGY","STATUS","PROGRESS","OVERALL F1","MEDS F1","DX F1","PLAN F1","COST","TIME","HASH"].map(h=><th key={h} style={{padding:"12px 16px",textAlign:"left",fontSize:10,letterSpacing:2,color:"#334155",fontWeight:600}}>{h}</th>)}</tr></thead>
            <tbody>
              {loading?<tr><td colSpan={11} style={{padding:40,textAlign:"center",color:"#334155",fontSize:12}}>Loading...</td></tr>:
               runs.length===0?<tr><td colSpan={11} style={{padding:40,textAlign:"center",color:"#334155",fontSize:12}}>No runs yet. Start your first evaluation above.</td></tr>:
               runs.map((r,i)=>{
                const c=COLORS[r.strategy]??"#64748b";
                const isSel=selected.includes(r.id);
                const statusC=r.status==="completed"?"#22c55e":r.status==="running"?"#3b82f6":r.status==="failed"?"#ef4444":"#f59e0b";
                return <tr key={r.id} style={{borderBottom:"1px solid #0f172a",background:isSel?"#1e293b40":i%2===0?"transparent":"#0f172a20"}}>
                  <td style={{padding:"14px 16px"}}><input type="checkbox" checked={isSel} onChange={()=>toggle(r.id)} style={{accentColor:"#3b82f6",cursor:"pointer"}}/></td>
                  <td style={{padding:"14px 16px"}}><Link href={`/runs/${r.id}`} style={{textDecoration:"none"}}><span style={{fontSize:11,fontWeight:700,letterSpacing:1,color:c,background:c+"15",padding:"3px 8px",borderRadius:4,border:`1px solid ${c}30`}}>{LABELS[r.strategy]??r.strategy.toUpperCase()}</span></Link></td>
                  <td style={{padding:"14px 16px"}}><span style={{fontSize:10,fontWeight:700,letterSpacing:1,padding:"2px 8px",borderRadius:4,background:statusC+"15",color:statusC,border:`1px solid ${statusC}30`}}>{r.status.toUpperCase()}</span></td>
                  <td style={{padding:"14px 16px"}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:48,height:3,background:"#1e293b",borderRadius:2}}><div style={{width:`${(r.completed_cases/(r.total_cases||50))*100}%`,height:"100%",background:c,borderRadius:2}}/></div><span style={{fontSize:11,color:"#64748b"}}>{r.completed_cases}/{r.total_cases}</span></div></td>
                  <td style={{padding:"14px 16px"}}>{f1Bar(r.aggregate_scores?.overall)}</td>
                  <td style={{padding:"14px 16px"}}>{f1Bar(r.aggregate_scores?.medications?.f1)}</td>
                  <td style={{padding:"14px 16px"}}>{f1Bar(r.aggregate_scores?.diagnoses?.f1)}</td>
                  <td style={{padding:"14px 16px"}}>{f1Bar(r.aggregate_scores?.plan?.f1)}</td>
                  <td style={{padding:"14px 16px",fontFamily:"monospace",fontSize:12,color:"#f59e0b"}}>${getCost(r).toFixed(4)}</td>
                  <td style={{padding:"14px 16px",fontFamily:"monospace",fontSize:12,color:"#64748b"}}>{(r.wall_ms/1000).toFixed(1)}s</td>
                  <td style={{padding:"14px 16px",fontFamily:"monospace",fontSize:10,color:"#1e3a5f"}}>{r.prompt_hash}</td>
                </tr>;
               })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
