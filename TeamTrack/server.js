// SERVER: serves the website (public folder) and a small JSON API the website calls.
const express=require("express"), path=require("path");
const projects=require("./data"), {calc,history,buildAlerts}=require("./scoring");
const app=express();
app.use(express.json());

let settings={low:70,med:40};   // risk thresholds (kept in memory; a database would store these)
const rows=()=>projects.map(p=>({p,r:calc(p,settings)}));

// POST /api/login  (demo check only: valid email + 8+ character password)
app.post("/api/login",(req,res)=>{
 const {email="",password=""}=req.body||{};
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return res.status(400).json({error:"Enter a valid work email, such as name@company.com."});
 if(password.length<8)return res.status(401).json({error:"Invalid email or password."});
 res.json({ok:true});
});

// GET /api/projects  -> every project with its calculated score, risk and explanation
app.get("/api/projects",(req,res)=>res.json(rows().map(({p,r})=>({...p,r,history:r.status==="OK"?history(p,r.score):[]}))));

// GET /api/projects/:id  -> one project
app.get("/api/projects/:id",(req,res)=>{
 const row=rows().find(x=>x.p.id===Number(req.params.id));
 if(!row)return res.status(404).json({error:"Project not found."});
 res.json({...row.p,r:row.r,history:row.r.status==="OK"?history(row.p,row.r.score):[]});
});

// GET /api/alerts  -> alerts created by the alert rules
app.get("/api/alerts",(req,res)=>res.json(buildAlerts(rows())));

// GET/PUT /api/settings  -> risk thresholds
app.get("/api/settings",(req,res)=>res.json(settings));
app.put("/api/settings",(req,res)=>{
 const low=Number(req.body.low),med=Number(req.body.med);
 if(!(low>=1&&low<=100&&med>=1&&med<low))return res.status(400).json({error:"The Medium threshold must be lower than the Low threshold."});
 settings={low,med};res.json(settings);
});

app.use(express.static(path.join(__dirname,"public")));
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`Pulse running at http://localhost:${PORT}`));
