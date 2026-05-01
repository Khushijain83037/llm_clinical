export default function Header() {
  return (
    <div style={{borderBottom:"1px solid #0f172a",padding:"12px 32px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#020817"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:6,height:6,borderRadius:"50%",background:"#22c55e",boxShadow:"0 0 6px #22c55e"}}/>
        <span style={{fontSize:10,letterSpacing:3,color:"#334155",fontFamily:"monospace"}}>HEALOSBENCH · CLINICAL EVAL HARNESS</span>
      </div>
      <span style={{fontSize:11,fontFamily:"monospace",background:"#7c3aed20",color:"#a78bfa",border:"1px solid #7c3aed40",padding:"3px 12px",borderRadius:4,letterSpacing:1}}>Khushi Jain</span>
    </div>
  );
}
