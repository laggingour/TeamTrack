// SAMPLE DATA (temporary). Later, replace this file with a database or live Asana data.
// done/total = tasks completed/total, od = days late for each overdue task,
// m = [member, days since last action, tasks they completed], cpd = comments per day.
module.exports = [
{id:1,name:"Acme Corp – Website Redesign",dept:"Digital",done:34,total:40,od:[1],m:[["Priya S.",0,12],["Tom W.",1,11],["Lena K.",2,11]],cpd:3.2,last:"2 hours ago",drift:1},
{id:2,name:"Nimbus Health – Patient Portal",dept:"Healthcare",done:18,total:36,od:[3,6],m:[["J. Smith",7,3],["Ana R.",1,11],["Dev P.",3,4]],cpd:1.4,last:"1 day ago",drift:-1},
{id:3,name:"Orion Logistics – Fleet Tracker",dept:"Logistics",done:6,total:30,od:[5,9,12,4],m:[["Marco B.",9,3],["Chen L.",6,2],["Sam O.",8,1]],cpd:.2,last:"6 days ago",drift:-2},
{id:4,name:"Helix Bank – Onboarding Flow",dept:"Finance",done:22,total:28,od:[],m:[["Rhea M.",0,8],["Oscar T.",1,7],["Mei L.",1,7]],cpd:2.6,last:"3 hours ago",drift:1},
{id:5,name:"Kestrel Energy – Data Migration",dept:"Energy",done:15,total:30,od:[2,2],m:[["Ivan G.",1,9],["Zoe H.",4,4],["Raj K.",3,2]],cpd:1.8,last:"1 day ago",drift:-1},
{id:6,name:"Lumen Retail – Mobile App",dept:"Retail",done:0,total:0,od:[],m:[["Kai N.",0,0]],cpd:0,last:"Awaiting first sync",drift:0}
];
