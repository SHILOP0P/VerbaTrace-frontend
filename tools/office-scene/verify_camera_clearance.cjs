const fs=require('node:fs');
const {chromium}=require('C:/Users/muxa4/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {CatmullRomCurve3,Vector3}=require('three');
const origin=process.env.OFFICE_QA_ORIGIN||'http://127.0.0.1:5173';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(origin+'/?sceneQA=1');await page.waitForFunction(()=>window.__officeDiagnostics?.ready,null,{timeout:60000});
 const collections=[];
 for(const viewport of [{width:1440,height:900},{width:1180,height:800},{width:390,height:844},{width:360,height:780}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(800);
  await page.getByRole('button',{name:'Рабочее место сотрудника',exact:true}).click();
  await page.waitForFunction(()=>window.__officeDiagnostics.frames.at(-1)?.shot==='employee'&&window.__officeDiagnostics.frames.at(-1)?.progress>=1,null,{timeout:10000});
  const audit=await page.evaluate(()=>window.__officeDiagnostics.navigation);
  collections.push({viewport,routes:audit.routes,seats:audit.occupiedSeats});
  await page.getByRole('button',{name:'Офис',exact:true}).click();
  await page.waitForFunction(()=>window.__officeDiagnostics.frames.at(-1)?.shot==='hero'&&window.__officeDiagnostics.frames.at(-1)?.progress>=1,null,{timeout:10000});
 }await browser.close();
 const nav=JSON.parse(fs.readFileSync('public/assets/scene/office-navigation.json','utf8'));const bins=new Map();const radius=.10;
 nav.boxes.forEach((b,i)=>{for(let x=Math.floor(b[0]-.2);x<=Math.floor(b[3]+.2);x++)for(let z=Math.floor(b[2]-.2);z<=Math.floor(b[5]+.2);z++){const key=x+','+z;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i)}});
 const result=[];let samples=0;
 for(const {viewport,routes,seats} of collections)for(let index=0;index<routes.length;index++){
  if(!Array.isArray(seats)||seats.length!==17)throw Error('Missing actual occupied seats');
  if(!Number.isFinite(routes[index].fromFov)||!Number.isFinite(routes[index].toFov))throw Error('Missing actual route optics');
  const curve=new CatmullRomCurve3(routes[index].points.map(p=>new Vector3(...p)),false,'centripetal');curve.arcLengthDivisions=800;curve.updateArcLengths();const count=Math.ceil(curve.getLength()/.02);const hits=new Map(),floorSupportFindings=[],personFindings=new Map();
  let maximumNearRadius=0;
  for(let i=0;i<=count;i++){const t=i/count,p=curve.getPointAt(t);samples++;
   let low=0,high=1;for(let n=0;n<30;n++){const m=(low+high)/2,e=m*m*m*(m*(m*6-15)+10);if(e<t)low=m;else high=m;}
   const phase=(low+high)/2,fov=routes[index].fromFov+(routes[index].toFov-routes[index].fromFov)*t+8*Math.sin(Math.PI*phase);
   // Bound the actual lens origin and all four near-plane corners. Static
   // props retain the extra 10cm guard; the already conservative person
   // cylinder uses the optical envelope, preserving the original parked pose.
   const nearRadius=.05*Math.sqrt(1+Math.tan(fov*Math.PI/360)**2*(1+(viewport.width/viewport.height)**2));maximumNearRadius=Math.max(maximumNearRadius,nearRadius);
   // Canonical pair 9 is deputy -> owner. Its S route must stay on the
   // upper slab, at head height during transit; only endpoint screen poses
   // descend to the seated monitor height. The inter-floor pair may fly.
   if(routes[index].fromKey==='deputy'&&routes[index].toKey==='owner'){if(p.x<6&&p.z>-10&&p.z< -4)floorSupportFindings.push({t,point:p.toArray(),reason:'over atrium void'});if(p.y<4.38||p.y>5.25)floorSupportFindings.push({t,point:p.toArray(),reason:'upper floor eye height'});}
   seats.forEach((seat,j)=>{const distance=Math.hypot(Math.max(0,Math.hypot(p.x-seat[0],p.z-seat[2])-.45),Math.max(seat[1]+.35-p.y,0,p.y-seat[1]-1.55));if(distance<nearRadius&&(!personFindings.has(j)||distance<personFindings.get(j).minimumDistance))personFindings.set(j,{seat:j,minimumDistance:distance,nearRadius,t,point:p.toArray()});});
   for(const j of bins.get(Math.floor(p.x)+','+Math.floor(p.z))||[]){const b=nav.boxes[j];const d=[p.x,p.y,p.z].map((v,a)=>Math.max(b[a]-v,0,v-b[a+3]));const distance=Math.hypot(...d);if(distance<Math.max(radius,nearRadius)){const name=nav.names[b[6]];if(!hits.has(name))hits.set(name,{name,minimumDistance:distance,t,point:p.toArray(),bounds:b});else if(distance<hits.get(name).minimumDistance)Object.assign(hits.get(name),{minimumDistance:distance,t,point:p.toArray(),bounds:b})}}}
  result.push({viewport,index,from:routes[index].fromKey,to:routes[index].toKey,seconds:routes[index].seconds,fromFov:routes[index].fromFov,toFov:routes[index].toFov,maximumNearRadius,points:routes[index].points,hits:[...hits.values()],floorSupportFindings,personFindings:[...personFindings.values()]});
 }
 const report={passed:result.every(r=>r.hits.length===0&&r.floorSupportFindings.length===0&&r.personFindings.length===0),origin,method:'Sphere / conservative connected-component AABB sampling, 2cm spacing; upper-floor deputy/owner route checked against atrium void and eye-height envelope. Actual 17 character seats checked with torso/head cylinder radius .45m, floor+.35..1.55m against the actual near-plane corner sphere (near=.05m, recorded FOV and viewport); static props keep at least .10m.',radius,samples,components:nav.boxes.length,routes:result,
  limits:'Static bounds and coarse character envelopes, not exhaustive animated mesh intersection proof; findings need visual confirmation and physical device performance is separate.',
  assetHashes:Object.fromEntries(['office.glb','office-navigation.json'].map(name=>[name,require('node:crypto').createHash('sha256').update(fs.readFileSync('public/assets/scene/'+name)).digest('hex')]))};
 fs.writeFileSync('docs/scene-upgrade/generated/qa/camera-clearance-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,samples,components:nav.boxes.length,findings:result.filter(r=>r.hits.length||r.floorSupportFindings.length||r.personFindings.length).map(r=>({viewport:r.viewport,index:r.index,hits:r.hits,floorSupportFindings:r.floorSupportFindings,personFindings:r.personFindings}))}));if(!report.passed)process.exitCode=1;
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
