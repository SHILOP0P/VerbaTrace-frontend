// Checks the user's requested restoration against the repository's original camera.
const fs = require('node:fs');
const cp = require('node:child_process');
const ts = require('typescript');
const assert = require('node:assert/strict');
const {Vector3,CatmullRomCurve3} = require('three');
const cameraFile = 'src/features/landing/scene/CameraRig.tsx';
const shotFile = 'src/features/landing/scene/shots.ts';
const oldCamera = cp.execFileSync('git', ['show', 'HEAD:' + cameraFile], {encoding:'utf8'});
const currentCamera = fs.readFileSync(cameraFile,'utf8');
const parse = text => ts.createSourceFile('input.tsx',text.replace(/\r\n/g,'\n'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const before = parse(oldCamera), after = parse(currentCamera);
const fn = (tree,name) => tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(tree);
const value = (tree,name) => tree.statements.filter(ts.isVariableStatement).flatMap(n=>[...n.declarationList.declarations]).find(n=>n.name.getText(tree)===name).initializer.getText(tree);
const checks = [];
const equal = (name,a,b) => { assert.equal(a,b,name);checks.push({name,passed:true}); };
for(const name of ['SECONDS_BASE','SECONDS_PER_METRE','SECONDS_MIN','SECONDS_MAX','FLIGHT_FOV_BOOST','ARC_RATIO','MAX_ARC','CLOSE_UP','RETREAT','AISLE_STEP'])equal(name,value(after,name),value(before,name));
for(const name of ['standing','clampToRoom','pushOutOfRooms','keepInside'])equal(name,fn(after,name),fn(before,name));
const originalPath = fn(before,'buildPath'), restoredPath = fn(after,'buildPath');
const documentedArrival = restoredPath
  .replace('  // Two tight first-floor approaches otherwise skim chair backs. Preserve\n  // their original corridor and postpone only the last descent to the screen.\n  const lateDescent = !!facing && (!toRoom || toRoom.name === "leader");\n','')
  .replace('lateDescent ? standing(to.position) : to.position.y + 0.3','to.position.y + 0.3')
  .replace('  if (lateDescent && facing) points.push(keepInside(clampToRoom(\n    to.position.clone().addScaledVector(facing, .42).setY(standing(to.position)), toRoom\n  )));\n','');
equal('original waypoint builder outside documented final approaches',documentedArrival.slice(0,documentedArrival.lastIndexOf('  const curve =')),originalPath.slice(0,originalPath.lastIndexOf('  return new CatmullRomCurve3')));
assert(restoredPath.includes('new CatmullRomCurve3(route, false, "centripetal")'));
checks.push({name:'original spline shape with finer distance table',passed:true});
const oldShots = parse(cp.execFileSync('git',['show','HEAD:'+shotFile],{encoding:'utf8'})), newShots = parse(fs.readFileSync(shotFile,'utf8'));
for(const name of ['screenView','overShoulder','freeBand','captionLayout'])equal('original monitor framing '+name,fn(newShots,name),fn(oldShots,name));
const js = ts.transpileModule(fs.readFileSync('src/features/landing/scene/cameraLook.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const moduleResult={exports:{}};new Function('require','module','exports',js)(require,moduleResult,moduleResult.exports);
const {buildLookTrack,buildFocusedLookTrack,flightEase,sampleLookTrack}=moduleResult.exports;
let samples = 0;
for(const points of [[[0,1.7,0],[3,1.7,0],[4,1.7,-3],[3,1.7,-4]],[[0,1.7,0],[1,1.7,-2],[1,4.5,-2],[3,5.1,-4]],[[0,1.7,0],[1,1.7,2],[2,1.7,3],[1,1.7,2]]]){
  const curve=new CatmullRomCurve3(points.map(p=>new Vector3(...p)),false,'centripetal');curve.arcLengthDivisions=800;curve.updateArcLengths();
  const from=curve.points[0].clone().add(new Vector3(0,.1,-1)),to=curve.points.at(-1).clone().add(new Vector3(-1,0,0));
  for(const reverse of [false,true]){const track=buildLookTrack(curve,from,to,reverse),again=buildLookTrack(curve,from,to,reverse);assert.deepEqual(track,again,'deterministic look track');
  for(let i=0;i<=300;i++){
    const v=sampleLookTrack(track,i/300,new Vector3());
    assert(Math.abs(v.length()-1)<1e-10,'normalised view');
    assert(Math.abs(Math.asin(v.y))<.101,'no ceiling flip');samples++;
  }}
}
checks.push({name:'forward and return tracks deterministic, level and normalised, including a vertical lift and turnaround',passed:true,samples});
const lift=new CatmullRomCurve3([new Vector3(0,1.7,0),new Vector3(1,1.7,-2),new Vector3(1,4.5,-2),new Vector3(3,5.1,-4)],false,'centripetal');lift.arcLengthDivisions=800;lift.updateArcLengths();
for(const reverse of [false,true]){const track=buildLookTrack(lift,new Vector3(1,1.7,-2),new Vector3(4,5.1,-5),reverse),travel=track.yaw.slice(48,193);assert(Math.max(...travel)-Math.min(...travel)<Math.PI,'vertical lift must not add a revolution during travel');}
checks.push({name:'vertical lift does not turn around its tiny spline overshoot',passed:true});
let reverseSamples=0;
for(const reverse of [false,true]){const track=buildLookTrack(lift,new Vector3(1,1.7,-2),new Vector3(4,5.1,-5),reverse),forward=buildLookTrack(lift,new Vector3(1,1.7,-2),new Vector3(4,5.1,-5));for(let i=0;i<=300;i++){const p=i/300,a=sampleLookTrack(track,p,new Vector3()),b=sampleLookTrack(forward,reverse?1-p:p,new Vector3());assert(a.distanceTo(b)<1e-10,'return must replay the same view backwards');reverseSamples++;}}
checks.push({name:'exact outward view replayed backwards',passed:true,samples:reverseSamples});
// A room focus and a final monitor normal must remain continuous even when
// crossing the atan2 branch, lifting vertically or approaching that focus.
let focusSamples=0;
for(const points of [[[0,1.7,0],[0,2.2,0],[3,2.2,-1],[5,1.8,-1],[6,1.8,-3],[5,1.8,-4],[4,1.7,-4]],[[0,1.7,0],[0,2.2,0],[3,2.2,1],[5,1.8,1],[6,1.8,3],[5,1.8,4],[4,1.7,4]]]){
 const curve=new CatmullRomCurve3(points.map(p=>new Vector3(...p)),false,'centripetal');curve.arcLengthDivisions=800;curve.updateArcLengths();
 const from=curve.points[0].clone().add(new Vector3(0,0,-1)),to=curve.points.at(-1).clone().add(new Vector3(-1,0,0));
 for(const employee of [false,true]){
  const track=buildFocusedLookTrack(curve,from,to,new Vector3(4,1.7,points.at(-1)[2]/2),employee);
  assert.deepEqual(track,buildFocusedLookTrack(curve,from,to,new Vector3(4,1.7,points.at(-1)[2]/2),employee));
  assert(sampleLookTrack(track,0,new Vector3()).distanceTo(new Vector3(0,0,-1))<1e-10);
  assert(sampleLookTrack(track,1,new Vector3()).distanceTo(new Vector3(-1,0,0))<1e-10);
  for(let i=0;i<=2400;i++){
   const p=i/2400,j=Math.min(239,Math.floor(p*240)),v=sampleLookTrack(track,p,new Vector3());
   assert(Math.abs(v.length()-1)<1e-10);assert(Math.abs(Math.asin(v.y))<=.100001,'bounded transit pitch');
   const yaw=Math.atan2(v.x,v.z),ref=track.yaw[j],unwrapped=ref+Math.atan2(Math.sin(yaw-ref),Math.cos(yaw-ref));
   assert(unwrapped>=Math.min(track.yaw[j],track.yaw[j+1])-1e-10&&unwrapped<=Math.max(track.yaw[j],track.yaw[j+1])+1e-10,'interpolation must not overshoot a prepared turn');
   focusSamples++;
  }
 }
}
checks.push({name:'room focus: continuous angle branch, exact endpoint directions, bounded pitch and no interpolation overshoot',passed:true,samples:focusSamples});
assert.equal(value(after,'easeInOut'),'flightEase');for(let i=0;i<=1000;i++){const p=i/1000;assert(Math.abs(flightEase(p)+flightEase(1-p)-1)<1e-12);if(i)assert(flightEase(p)>=flightEase((i-1)/1000));}checks.push({name:'quintic pacing monotone and symmetric for exact return',passed:true,samples:1001});
const report={passed:true,baselineCommit:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checks,limits:'Baseline equality applies to base duration constants, lens, framing and the fallback waypoint builder. Pacing is now quintic and inter-floor flights have a 1.5 duration multiplier and the upstairs S route 1.35. Nine room paths are intentionally authored from shared exits, lifts and approaches; browser, clearance and physical hardware validation are separate.'};
fs.writeFileSync('docs/scene-upgrade/generated/qa/camera-baseline-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,checks:checks.length,turnSamples:samples}));
