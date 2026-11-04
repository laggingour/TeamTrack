// SCORING ENGINE (runs on the server). Same algorithm as the proposal's pseudocode.
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
const pl=(n,w)=>n+" "+w+(n===1?"":"s");
const riskOf=(s,th)=>s>=th.low?"Low":s>=th.med?"Medium":"High";

// Calculates the 0-100 health score, risk level, factor breakdown and explanations for one project.
function calc(p,th){
 if(!p.total)return{status:"INSUFFICIENT"};
 const tc=p.done/p.total*100;
 const pen=p.od.reduce((a,d)=>a+Math.min(d*4,40),0), od=Math.max(0,100-pen);
 const ma=avg(p.m.map(x=>x[1]<=2?100:x[1]<=5?60:20));
 const ideal=1/p.m.length;
 const dev=p.done?Math.max(...p.m.map(x=>Math.abs(x[2]/p.done-ideal))):0, we=Math.max(0,100-dev*200);
 const cm=Math.min(100,p.cpd*25);
 const top=[...p.m].sort((a,b)=>b[2]-a[2])[0], idle=p.m.filter(x=>x[1]>5), late=Math.max(0,...p.od);
 const F=[
  {k:"Task completion",w:.30,v:tc,rec:"Re-plan remaining tasks and agree a catch-up target",why:`${p.done} of ${p.total} tasks are complete (${Math.round(tc)}%)`},
  {k:"Overdue tasks",w:.25,v:od,rec:"Review task allocation with the team",why:`${pl(p.od.length,"task")} overdue, the longest ${pl(late,"day")} late`},
  {k:"Member activity",w:.20,v:ma,rec:"Contact the inactive team member",why:idle.length?idle.map(x=>`${x[0]} has had no Asana activity for ${pl(x[1],"day")}`).join("; "):"Several members have been quiet for 3 or more days"},
  {k:"Workload equity",w:.15,v:we,rec:"Schedule a workload rebalancing discussion",why:`${top[0]} completed ${Math.round(top[2]/Math.max(p.done,1)*100)}% of finished tasks`},
  {k:"Communication",w:.10,v:cm,rec:"Schedule a stand-up with the team",why:`Only ${p.cpd} comments per day over the last 14 days`}];
 const score=Math.round(F.reduce((a,f)=>a+f.v*f.w,0));
 const weak=[...F].sort((a,b)=>a.v-b.v).filter(f=>f.v<60).slice(0,3);
 return{status:"OK",score,risk:riskOf(score,th),F,weak,idle,late};
}

// Demo trend history (30 days ending at today's score). Real version: read from a health_scores table.
function history(p,score){
 const o=[];
 for(let k=0;k<30;k++)o.push(Math.max(0,Math.min(100,Math.round(score-p.drift*(29-k)*.55+Math.sin(k*1.7+p.id)*3))));
 o[29]=score;return o;
}

// Alert rules from the proposal: new High risk, persistent Medium, task 5+ days overdue, member inactive 5+ days.
function buildAlerts(rows){
 const a=[];
 rows.forEach(({p,r})=>{
  if(r.status!=="OK")return;
  const add=(reason,text,t)=>a.push({id:p.id+reason,projectId:p.id,level:r.risk,reason,text,score:r.score,t});
  if(r.risk==="High")add("NEW_HIGH_RISK","Newly classified as High Risk",2);
  else if(r.risk==="Medium")add("PERSISTENT_MEDIUM","Medium risk for 3 assessments in a row",20);
  if(r.late>=5)add("CRITICAL_OVERDUE",`A task is ${pl(r.late,"day")} overdue`,5);
  if(r.idle.length)add("MEMBER_INACTIVE",`${r.idle[0][0]} inactive for ${pl(r.idle[0][1],"day")}`,9);
 });
 return a.sort((x,y)=>x.t-y.t);
}
module.exports={calc,history,buildAlerts,riskOf};
