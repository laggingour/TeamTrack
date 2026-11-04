// JAVASCRIPT: all the logic. Read it top to bottom: helpers > state > sample data > scoring > screens > router.
const $=s=>document.querySelector(s),avg=a=>a.reduce((x,y)=>x+y,0)/a.length,pl=(n,w)=>n+" "+w+(n===1?"":"s");
// STATE: everything the app remembers while it is open (logged-in user, thresholds, filters, read alerts, settings).
// th = risk thresholds (Low >= 70, Medium >= 40). Resets when you refresh the page.
const S={user:null,th:{low:70,med:40},read:new Set(),reviewed:new Set(),filter:"All",sort:"score",q:"",range:30,afil:"All",prefs:{email:true,inapp:true,levels:{High:true,Medium:true,Low:false},qs:"18:00",qe:"20:00"}};
// SAMPLE DATA: the 6 demo projects. Replace this with real Asana data from your backend later.
// done/total = tasks completed/total, od = days late for each overdue task, m = [member, days since last action, tasks they completed],
// cpd = comments per day, drift = whether the score trend is rising (+) or falling (-).
const P=[
{id:1,name:"Acme Corp – Website Redesign",dept:"Digital",done:34,total:40,od:[1],m:[["Priya S.",0,12],["Tom W.",1,11],["Lena K.",2,11]],cpd:3.2,last:"2 hours ago",drift:1},
{id:2,name:"Nimbus Health – Patient Portal",dept:"Healthcare",done:18,total:36,od:[3,6],m:[["J. Smith",7,3],["Ana R.",1,11],["Dev P.",3,4]],cpd:1.4,last:"1 day ago",drift:-1},
{id:3,name:"Orion Logistics – Fleet Tracker",dept:"Logistics",done:6,total:30,od:[5,9,12,4],m:[["Marco B.",9,3],["Chen L.",6,2],["Sam O.",8,1]],cpd:.2,last:"6 days ago",drift:-2},
{id:4,name:"Helix Bank – Onboarding Flow",dept:"Finance",done:22,total:28,od:[],m:[["Rhea M.",0,8],["Oscar T.",1,7],["Mei L.",1,7]],cpd:2.6,last:"3 hours ago",drift:1},
{id:5,name:"Kestrel Energy – Data Migration",dept:"Energy",done:15,total:30,od:[2,2],m:[["Ivan G.",1,9],["Zoe H.",4,4],["Raj K.",3,2]],cpd:1.8,last:"1 day ago",drift:-1},
{id:6,name:"Lumen Retail – Mobile App",dept:"Retail",done:0,total:0,od:[],m:[["Kai N.",0,0]],cpd:0,last:"Awaiting first sync",drift:0}];
// RISK CLASSIFICATION: turns a score into Low / Medium / High using the thresholds.
function risk(s){return s>=S.th.low?"Low":s>=S.th.med?"Medium":"High"}
// HEALTH SCORE ENGINE: the pseudocode from your proposal. Computes the 5 factor scores (completion, overdue, activity,
// workload equity, communication), combines them with weights 30/25/20/15/10, picks the weakest factors for the explanation
// and attaches a recommended action to each. Returns INSUFFICIENT if the project has no tasks.
function calc(p){
 if(!p.total)return{status:"INSUFFICIENT"};
 const tc=p.done/p.total*100,pen=p.od.reduce((a,d)=>a+Math.min(d*4,40),0),od=Math.max(0,100-pen),
 ma=avg(p.m.map(x=>x[1]<=2?100:x[1]<=5?60:20)),ideal=1/p.m.length,
 dev=p.done?Math.max(...p.m.map(x=>Math.abs(x[2]/p.done-ideal))):0,we=Math.max(0,100-dev*200),cm=Math.min(100,p.cpd*25);
 const top=[...p.m].sort((a,b)=>b[2]-a[2])[0],idle=p.m.filter(x=>x[1]>5),late=Math.max(0,...p.od);
 const F=[
 {k:"Task completion",w:.30,v:tc,rec:"Re-plan remaining tasks and agree a catch-up target",why:`${p.done} of ${p.total} tasks are complete (${Math.round(tc)}%)`},
 {k:"Overdue tasks",w:.25,v:od,rec:"Review task allocation with the team",why:`${pl(p.od.length,"task")} overdue, the longest ${pl(late,"day")} late`},
 {k:"Member activity",w:.20,v:ma,rec:"Contact the inactive team member",why:idle.length?idle.map(x=>`${x[0]} has had no Asana activity for ${pl(x[1],"day")}`).join("; "):"Several members have been quiet for 3 or more days"},
 {k:"Workload equity",w:.15,v:we,rec:"Schedule a workload rebalancing discussion",why:`${top[0]} completed ${Math.round(top[2]/Math.max(p.done,1)*100)}% of finished tasks`},
 {k:"Communication",w:.10,v:cm,rec:"Schedule a stand-up with the team",why:`Only ${p.cpd} comments per day over the last 14 days`}];
 const s=Math.round(F.reduce((a,f)=>a+f.v*f.w,0)),weak=[...F].sort((a,b)=>a.v-b.v).filter(f=>f.v<60).slice(0,3);
 return{status:"OK",score:s,risk:risk(s),F,weak,idle,late};
}
// TREND HISTORY: fakes 30 days of past scores ending at today's real score (demo only; real data would come from the ProjectHealth table).
function hist(p,r){const c=r.score,o=[];for(let k=0;k<30;k++)o.push(Math.max(0,Math.min(100,Math.round(c-p.drift*(29-k)*.55+Math.sin(k*1.7+p.id)*3))));o[29]=c;return o}
const R=()=>P.map(p=>({p,r:calc(p)}));
// ALERT RULES: creates alerts from the proposal's trigger conditions (new High risk, persistent Medium, task 5+ days overdue,
// member inactive 5+ days), then filters by the risk levels chosen in Settings.
function alerts(){const a=[];R().forEach(({p,r})=>{if(r.status!=="OK")return;
 const add=(reason,text,h)=>a.push({id:p.id+reason,p,level:r.risk,reason,text,score:r.score,t:h});
 if(r.risk==="High")add("NEW_HIGH_RISK","Newly classified as High Risk",2);
 else if(r.risk==="Medium")add("PERSISTENT_MEDIUM","Medium risk for 3 assessments in a row",20);
 if(r.late>=5)add("CRITICAL_OVERDUE",`A task is ${pl(r.late,"day")} overdue`,5);
 if(r.idle.length)add("MEMBER_INACTIVE",`${r.idle[0][0]} inactive for ${pl(r.idle[0][1],"day")}`,9)});
 return a.filter(x=>S.prefs.levels[x.level]).sort((a,b)=>a.t-b.t)}
const unread=()=>alerts().filter(a=>!S.read.has(a.id)).length;
const bdg=(l)=>`<span class="badge ${l}">${l==="None"?"Insufficient data":l+" Risk"}</span>`;
const col=l=>({Low:"var(--lc)",Medium:"var(--mc)",High:"var(--hc)"})[l];
// SMALL HELPERS: toast() shows the temporary message at the bottom; shell() wraps every screen with the navigation bar.
function toast(t){const e=document.createElement("div");e.className="toast";e.setAttribute("role","status");e.textContent=t;document.body.append(e);setTimeout(()=>e.remove(),2600)}
function shell(h,cur){const n=unread();return`<header><div class="bar"><a class="brand" href="#dashboard">Pulse</a><nav aria-label="Main" style="display:flex;flex-wrap:wrap">
<a href="#dashboard" ${cur==="d"?'aria-current="page"':""}>Dashboard</a><a href="#alerts" ${cur==="a"?'aria-current="page"':""}>Alerts ${n?`<span class="cnt">${n}</span>`:""}</a><a href="#settings" ${cur==="s"?'aria-current="page"':""}>Settings</a><a href="#login" id="out">Sign out</a></nav></div></header><main>${h}</main>`}
// SCREEN 1 - LOGIN (FR-01): validates email format and password length, then goes to the dashboard.
function login(){$("#app").innerHTML=`<main><form class="card login" id="lf" novalidate><h1>Pulse</h1><p class="mu">Sign in to see which projects need attention before they slip.</p>
<label for="em">Work email</label><input id="em" type="email" value="ali@agency.com.au" autocomplete="username"><label for="pw">Password</label><input id="pw" type="password" value="demo-password" autocomplete="current-password">
<div class="err" id="le" role="alert"></div><button class="btn" style="width:100%">Sign in</button><p class="mu">Demo mode: any valid email and an 8+ character password works. Data shown is sample Asana data.</p></form></main>`;
 $("#lf").onsubmit=e=>{e.preventDefault();const em=$("#em").value,pw=$("#pw").value;
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em))return $("#le").textContent="Enter a valid work email, such as name@company.com.";
  if(pw.length<8)return $("#le").textContent="Invalid email or password.";
  S.user=em;location.hash="dashboard"}}
// SCREEN 2 - DASHBOARD (FR-02): project cards with score + badge, plus search, risk filter chips and sorting.
function dash(){
 let rows=R().filter(({p,r})=>(S.filter==="All"||(S.filter==="Insufficient"?r.status!=="OK":r.risk===S.filter))&&p.name.toLowerCase().includes(S.q.toLowerCase()));
 rows.sort((a,b)=>S.sort==="name"?a.p.name.localeCompare(b.p.name):(a.r.score??101)-(b.r.score??101));
 const cards=rows.map(({p,r})=>{const ok=r.status==="OK",l=ok?r.risk:"None";
 return`<a class="card pc" href="#project-${p.id}" title="${ok&&r.weak.length?"Top factors: "+r.weak.map(f=>f.k).join(", "):""}"><div class="row"><h3>${p.name}</h3></div><div class="mu">${p.dept} · ${pl(p.m.length,"member")}</div>
 <div class="row" style="margin:.8rem 0"><span class="big">${ok?r.score:"–"}</span>${bdg(l)}</div><div class="bd" aria-hidden="true"><i style="width:${ok?r.score:0}%;background:${col(l)}"></i></div><div class="mu" style="margin-top:.5rem">Last Asana activity: ${p.last}</div></a>`}).join("");
 const cnt=k=>R().filter(({r})=>k==="All"||(k==="Insufficient"?r.status!=="OK":r.risk===k)).length;
 $("#app").innerHTML=shell(`<h1>Project portfolio</h1><p class="mu">Health scores refresh after every 15-minute Asana sync.</p>
 <div class="tools"><input type="search" id="q" placeholder="Search projects" aria-label="Search projects" value="${S.q}">
 ${["All","High","Medium","Low","Insufficient"].map(k=>`<button class="chip" data-f="${k}" aria-pressed="${S.filter===k}">${k==="Insufficient"?"No data":k} (${cnt(k)})</button>`).join("")}
 <select id="so" aria-label="Sort projects"><option value="score" ${S.sort==="score"?"selected":""}>Sort: lowest score first</option><option value="name" ${S.sort==="name"?"selected":""}>Sort: name</option></select></div>
 ${cards?`<div class="grid">${cards}</div>`:`<div class="card">No projects match. Clear the search or choose another risk filter.</div>`}`,"d");
 $("#q").oninput=e=>{S.q=e.target.value;dash();$("#q").focus();$("#q").setSelectionRange(S.q.length,S.q.length)};
 document.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{S.filter=b.dataset.f;dash()});$("#so").onchange=e=>{S.sort=e.target.value;dash()}}
// TREND CHART: draws the score line as an SVG, with dashed lines at the Low and Medium thresholds.
function chart(h,n){const d=h.slice(-n),W=600,H=200,x=i=>20+i*(W-30)/(d.length-1),y=v=>H-15-v*(H-30)/100;
 return`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Health score over the last ${n} days, from ${d[0]} to ${d[d.length-1]}">
 ${[[S.th.low,"var(--lc)"],[S.th.med,"var(--hc)"]].map(([v,c])=>`<line x1="20" x2="${W-10}" y1="${y(v)}" y2="${y(v)}" stroke="${c}" stroke-dasharray="5 4"/><text x="${W-10}" y="${y(v)-4}" text-anchor="end" font-size="11" fill="var(--mu)">${v}</text>`).join("")}
 <polyline fill="none" stroke="var(--nv)" stroke-width="3" stroke-linejoin="round" points="${d.map((v,i)=>x(i)+","+y(v)).join(" ")}"/><circle cx="${x(d.length-1)}" cy="${y(d[d.length-1])}" r="5" fill="var(--nv)"/></svg>`}
// SCREEN 3 - PROJECT DETAIL (FR-03, 09, 10, 12, 14): explanation, recommendations, trend chart, factor breakdown,
// task progress, team activity, alert history and the action buttons (message team, stand-up, mark reviewed, sync).
function detail(id){
 const p=P.find(x=>x.id==id),r=calc(p);if(!p){location.hash="dashboard";return}
 if(r.status!=="OK"){$("#app").innerHTML=shell(`<a href="#dashboard">Back to portfolio</a><h1 style="margin-top:.5rem">${p.name}</h1><div class="card" style="margin-top:1rem">${bdg("None")}<p>Insufficient data: awaiting first Asana sync. Scores appear once the project has tasks and activity from the past 7 days.</p><button class="btn" id="sy">Sync now</button></div>`,"d");$("#sy").onclick=()=>toast("Sync requested. Check back in a few minutes.");return}
 const h=hist(p,r),top=r.weak[0],rv=S.reviewed.has(p.id),al=alerts().filter(a=>a.p.id===p.id);
 $("#app").innerHTML=shell(`<a href="#dashboard">Back to portfolio</a>
 <div class="row" style="margin:.5rem 0 1rem;flex-wrap:wrap"><div><h1>${p.name}</h1><span class="mu">${p.dept} · ${pl(p.m.length,"member")} · Last Asana activity ${p.last}</span></div><div class="row"><span class="big">${r.score}</span>${bdg(r.risk)}</div></div>
 <div class="two"><section class="card"><h2>Why this score</h2>${r.weak.length?`<ul style="padding-left:1.1rem;margin:0">${r.weak.map(f=>`<li><strong>${f.k}</strong> (${Math.round(f.v)}/100): ${f.why}</li>`).join("")}</ul>`:"<p>No factor is below the warning level. This project is healthy.</p>"}
 <h2 style="margin-top:1rem">Recommended actions</h2><ul style="padding-left:1.1rem;margin:0">${(r.weak.length?r.weak:[{rec:"Keep the current cadence and review again next week"}]).map(f=>`<li>${f.rec}</li>`).join("")}</ul>
 <div class="tools"><button class="btn" id="mt">Message team</button><button class="btn alt" id="sa">Request stand-up</button><button class="btn alt" id="rv">${rv?"Reviewed ✓":"Mark reviewed"}</button><button class="btn alt" id="sy">Sync now</button></div><div id="mb"></div></section>
 <section class="card"><div class="row"><h2>Score trend</h2><span>${[7,14,30].map(n=>`<button class="chip" data-r="${n}" aria-pressed="${S.range===n}">${n} days</button>`).join(" ")}</span></div>${chart(h,S.range)}<p class="mu">Dashed lines show the Low (≥${S.th.low}) and Medium (≥${S.th.med}) thresholds.</p></section></div>
 <section class="card" style="margin-top:1rem"><h2>Score breakdown</h2><div class="stack">${r.F.map(f=>`<div><div class="row"><span>${f.k} <span class="mu">(weight ${Math.round(f.w*100)}%)</span></span><strong>${Math.round(f.v)}</strong></div><div class="bd" aria-hidden="true"><i style="width:${f.v}%;background:${f.v<40?"var(--hc)":f.v<60?"var(--mc)":"var(--lc)"}"></i></div></div>`).join("")}</div>
 <p class="formula">Health score = Task completion × 0.30 + Overdue tasks × 0.25 + Member activity × 0.20 + Workload equity × 0.15 + Communication × 0.10</p></section>
 <div class="two" style="margin-top:1rem"><section class="card"><h2>Task completion</h2><div class="row"><span>${p.done} of ${p.total} done</span><span>${Math.round(p.done/p.total*100)}%</span></div><div class="bd" aria-hidden="true"><i style="width:${p.done/p.total*100}%;background:var(--nv)"></i></div><p class="mu">Overdue: ${p.od.length?p.od.map(d=>pl(d,"day")+" late").join(", "):"none"}</p></section>
 <section class="card"><h2>Team activity</h2><div class="scroll"><table><tr><th>Member</th><th>Last action</th><th>Share of work</th></tr>${p.m.map(x=>`<tr><td>${x[0]}</td><td>${x[1]===0?"Today":pl(x[1],"day")+" ago"}${x[1]>5?" ⚠":""}</td><td>${p.done?Math.round(x[2]/p.done*100):0}%</td></tr>`).join("")}</table></div></section></div>
 <section class="card" style="margin-top:1rem"><h2>Alert history</h2>${al.length?al.map(a=>`<p style="margin:.3rem 0">${bdg(a.level)} ${a.text} <span class="mu">${a.t} h ago</span></p>`).join(""):"<p>No alerts for this project.</p>"}</section>`,"d");
 document.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{S.range=+b.dataset.r;detail(id)});
 $("#rv").onclick=()=>{S.reviewed.add(p.id);detail(id);toast("Project marked as reviewed")};$("#sy").onclick=()=>toast("Sync requested. Scores update when it finishes.");
 const msg=(t,s)=>{$("#mb").innerHTML=`<label for="mx">${t}</label><textarea id="mx" rows="4" style="width:100%">${s}</textarea><button class="btn" id="sd" style="margin-top:.5rem">Send message</button>`;$("#sd").onclick=()=>{$("#mb").innerHTML="";toast("Message sent to "+pl(p.m.length,"team member"))}};
 $("#mt").onclick=()=>msg("Message to team",`Hi team, ${top?top.why.toLowerCase()+". Can we sync today on what's blocking progress?":"great progress so far. Keep it up."}`);
 $("#sa").onclick=()=>msg("Stand-up request","Hi team, let's hold a 15-minute stand-up tomorrow to review blockers and overdue tasks.")}
// SCREEN 4 - ALERTS (FR-04): list with risk filter, unread highlighting, mark all as read, click to open the project.
function alertsPage(){
 const all=alerts(),sh=all.filter(a=>S.afil==="All"||a.level===S.afil);
 $("#app").innerHTML=shell(`<div class="row"><h1>Alerts</h1><button class="btn alt" id="ma">Mark all as read</button></div>
 <div class="tools">${["All","High","Medium","Low"].map(k=>`<button class="chip" data-a="${k}" aria-pressed="${S.afil===k}">${k}</button>`).join("")}</div>
 <div class="stack">${sh.length?sh.map(a=>`<div class="card al ${S.read.has(a.id)?"":"unread"}" style="border-left-color:${col(a.level)}" tabindex="0" role="link" data-id="${a.id}" data-p="${a.p.id}"><div><div class="row" style="gap:.8rem;justify-content:flex-start">${bdg(a.level)}<strong>${a.p.name}</strong>${S.read.has(a.id)?"":'<span class="cnt" style="background:var(--nv);color:var(--nvt)">New</span>'}</div><div>${a.text} · score ${a.score}</div><div class="mu">${a.t} hours ago</div></div></div>`).join(""):`<div class="card">No alerts yet. You're all caught up.</div>`}</div>`,"a");
 document.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>{S.afil=b.dataset.a;alertsPage()});
 $("#ma").onclick=()=>{all.forEach(a=>S.read.add(a.id));alertsPage();toast("All alerts marked as read")};
 document.querySelectorAll(".al").forEach(e=>{const go=()=>{S.read.add(e.dataset.id);location.hash="project-"+e.dataset.p};e.onclick=go;e.onkeydown=k=>{if(k.key==="Enter")go()}})}
// SCREEN 5 - SETTINGS (FR-05): notification preferences, quiet hours, risk thresholds (changing them re-scores everything),
// and the Asana connection panel (the Reconnect button is a placeholder for OAuth 2.0).
function settings(){
 const pf=S.prefs;
 $("#app").innerHTML=shell(`<h1>Settings</h1><form id="sf" class="stack" style="margin-top:1rem" novalidate>
 <section class="card"><h2>Notifications</h2><label><input type="checkbox" id="e1" ${pf.email?"checked":""}> Email alerts</label><label><input type="checkbox" id="e2" ${pf.inapp?"checked":""}> In-app alerts</label>
 <p class="mu" style="margin-bottom:0">Alert me for these risk levels</p>${["High","Medium","Low"].map(l=>`<label><input type="checkbox" data-l="${l}" ${pf.levels[l]?"checked":""}> ${l} risk</label>`).join("")}
 <div class="two"><div><label for="qs">Quiet hours start</label><input type="time" id="qs" value="${pf.qs}"></div><div><label for="qe">Quiet hours end</label><input type="time" id="qe" value="${pf.qe}"></div></div></section>
 <section class="card"><h2>Risk thresholds</h2><div class="two"><div><label for="tl">Low risk at or above</label><input type="number" id="tl" min="1" max="100" value="${S.th.low}"></div><div><label for="tm">Medium risk at or above</label><input type="number" id="tm" min="1" max="99" value="${S.th.med}"></div></div><p class="mu">Scores on every screen re-evaluate against these thresholds.</p></section>
 <section class="card"><h2>Asana connection</h2><p>Connected workspace: <strong>Agency Delivery</strong> · ${pl(P.length,"project")} monitored · syncing every 15 minutes</p><button type="button" class="btn alt" id="rc">Reconnect Asana</button></section>
 <div class="err" id="se" role="alert"></div><button class="btn">Save changes</button></form>`,"s");
 $("#rc").onclick=()=>toast("Asana authorisation would open here (OAuth 2.0)");
 $("#sf").onsubmit=e=>{e.preventDefault();const lo=+$("#tl").value,md=+$("#tm").value;
  if($("#qe").value<=$("#qs").value)return $("#se").textContent="Quiet hours must end after they start.";
  if(!(md<lo))return $("#se").textContent="The Medium threshold must be lower than the Low threshold.";
  S.th={low:lo,med:md};pf.email=$("#e1").checked;pf.inapp=$("#e2").checked;pf.qs=$("#qs").value;pf.qe=$("#qe").value;
  document.querySelectorAll("[data-l]").forEach(c=>pf.levels[c.dataset.l]=c.checked);$("#se").textContent="";toast("Settings saved");settings()}}
// ROUTER: reads the # part of the URL (#dashboard, #project-3, #alerts ...) and shows the matching screen.
// Not logged in? You are sent back to the login page.
function route(){
 const h=location.hash.slice(1)||"login";
 if(!S.user&&h!=="login"){location.hash="login";return}
 if(h==="login"){S.user=null;login()}else if(h==="dashboard")dash();else if(h==="alerts")alertsPage();else if(h==="settings")settings();else if(h.startsWith("project-"))detail(h.slice(8));else location.hash="dashboard";
 window.scrollTo(0,0)}
addEventListener("hashchange",route);route();
