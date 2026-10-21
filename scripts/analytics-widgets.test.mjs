import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = async path => {
  const code=ts.transpileModule(await readFile(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
};
const { loadAnalyticsWidgets,analyticsWidgetAvailable,coveragePercent,comparableDelta,matrixPageSize,speechMetrics }=await source("../src/features/overview/analytics-widget-data.ts");
const { newWidget,defaultWidgets,widgetCompositions,nextComposition }=await source("../src/features/overview/layout.ts");
const caps={scope:"company",role:"company_manager",team_analytics_enabled:true,can_view_employees:true,own_profile_only:false};
const filters={company_uuid:"company",from:"2026-10-01T00:00:00Z",to:"2026-10-21T00:00:00Z"};
const widget=(kind,id=kind,patch={})=>({...newWidget(kind),id,...patch});

test("composition controls skip arrangements without a visual, room or supported presentation",()=>{
  const small=widgetCompositions("total",417,219,true,true);
  assert.deepEqual(small,["standard","leading","centered"]);
  assert.equal(nextComposition("centered",small),"standard");
  assert.equal(nextComposition("horizontal",small),"standard");
  assert.deepEqual(widgetCompositions("processing",600,219,false,true),["standard","leading","centered","inline"]);
  assert.deepEqual(widgetCompositions("distribution",600,300,false,false),["standard","leading","centered"]);
  assert.deepEqual(widgetCompositions("total",600,88,true,true),["standard"]);
  assert.equal(widgetCompositions("total",600,300,true,true).length,6);
  assert.ok(widgetCompositions("average",600,300,true,false).includes("horizontal"));
  assert.ok(!widgetCompositions("speech",600,380,false,false).includes("inline"));
});

test("catalog extensions never enter the current default layout",()=>{
  assert.deepEqual(defaultWidgets().map(w=>w.kind),["total","new","processing","analyzed","duration","average","distribution","criteria","trend","listening"]);
  for(const w of defaultWidgets()) assert.equal(w.frame_height,undefined);
  for(const kind of ["coverage","critical_missed","criterion","quality_delta","matrix","speech"]) {
    const w=newWidget(kind);
    assert.equal(w.period.mode,"rolling"); assert.equal(w.period.days,30);
    assert.ok(w.frame_height>=88&&w.frame_height<=1200);
  }
});
test("sources share period-scoped requests without conflating selected criteria, employees or instructions",async()=>{
  const calls={criteria:0,matrix:0,profile:0,summary:0};
  const client={
    getAnalyticsCriteria:async f=>{assert.deepEqual(f,filters);calls.criteria++;return {criteria:[{criterion_key:"c1"},{criterion_key:"c2"}]};},
    getAnalyticsMatrix:async f=>{calls.matrix++;return {instruction:{uuid:f.instruction_uuid}};},
    getAnalyticsProfile:async(id,f)=>{assert.deepEqual(f,filters);calls.profile++;return {employee:{user_uuid:id}};},
    getAnalyticsSummary:async()=>{calls.summary++;return {critical_missed:7};},
  };
  const result=await loadAnalyticsWidgets([
    widget("criterion","c1a",{criterion_key:"c1"}),widget("criterion","c1b",{criterion_key:"c1"}),widget("criterion","c2",{criterion_key:"c2"}),
    widget("matrix","m1",{instruction_uuid:"i1"}),widget("matrix","m2",{instruction_uuid:"i1"}),widget("matrix","m3",{instruction_uuid:"i2"}),
    widget("speech","s1",{employee_uuid:"e1"}),widget("speech","s2",{employee_uuid:"e1"}),widget("speech","s3"),
    widget("critical_missed"),widget("quality_delta"),widget("coverage"),
  ],filters,caps,client);
  assert.deepEqual(calls,{criteria:1,matrix:2,profile:2,summary:1});
  assert.equal(result.c2.criterion.criterion_key,"c2");
  assert.equal(result.m3.matrix.instruction.uuid,"i2");
  assert.equal(result.s3.profile.employee.user_uuid,"me");
});
test("unconfigured, forbidden and unavailable sources do not select unrelated data",async()=>{
  let requests=0;
  const fail=async()=>{requests++;throw Error("unexpected request");};
  const client={getAnalyticsCriteria:fail,getAnalyticsMatrix:fail,getAnalyticsProfile:fail,getAnalyticsSummary:fail};
  const missing=await loadAnalyticsWidgets([widget("criterion"),widget("matrix")],filters,caps,client);
  assert.equal(missing.criterion.needsSource,true);assert.equal(missing.matrix.needsSource,true);
  const own={...caps,role:"employee",can_view_employees:false,own_profile_only:true};
  const denied=await loadAnalyticsWidgets([widget("matrix", "matrix",{instruction_uuid:"i1"}),widget("speech","speech",{employee_uuid:"other"})],filters,own,client);
  assert.ok(denied.matrix.unavailable);assert.ok(denied.speech.unavailable);
  assert.equal(requests,0);
  assert.equal(analyticsWidgetAvailable("matrix",{...caps,scope:"personal",personal_progress_enabled:true}),false);
  assert.equal(analyticsWidgetAvailable("speech",{...caps,scope:"personal",personal_progress_enabled:false}),false);
  assert.equal(analyticsWidgetAvailable("coverage"),true);
});
test("a failed widget does not clear another widget or turn missing values into zero",async()=>{
  const result=await loadAnalyticsWidgets([widget("matrix","m",{instruction_uuid:"i"}),widget("criterion","c",{criterion_key:"gone"}),widget("critical_missed")],filters,caps,{
    getAnalyticsCriteria:async()=>({criteria:[{criterion_key:"other"}]}),getAnalyticsMatrix:async()=>{throw Error("Access denied");},getAnalyticsSummary:async()=>({critical_missed:0}),
  });
  assert.equal(result.m.error,"Access denied");assert.ok(result.c.unavailable);assert.equal(result.critical_missed.summary.critical_missed,0);
  assert.equal(coveragePercent(0,0),null);assert.equal(coveragePercent(undefined,10),null);assert.equal(coveragePercent(20,10),null);
  assert.equal(coveragePercent(0,10),0);assert.equal(coveragePercent(3,12),25);
  const base={sample:"ok",delta:{value:0,comparable:true,criteria_changed:false}};
  assert.equal(comparableDelta(base),0);
  assert.equal(comparableDelta({...base,sample:"low"}),null);
  assert.equal(comparableDelta({...base,delta:{...base.delta,criteria_changed:true}}),null);
});
test("two-axis paging reaches every matrix cell at all supported frame sizes",()=>{
  for(const width of [80,160,240,300,440,900,1800]) for(const height of [88,115,150,190,240,360,800,1200]) {
    const size=matrixPageSize(width,height), seen=new Set();
    assert.ok(size.rows>=1&&size.columns>=1&&size.columns<=8);
    const rowCount=43,columnCount=27, rp=Math.ceil(rowCount/size.rows), cp=Math.ceil(columnCount/size.columns);
    for(let page=0;page<rp*cp;page++) {
      const startRow=Math.floor(page/cp)*size.rows,startColumn=page%cp*size.columns;
      for(let row=startRow;row<Math.min(startRow+size.rows,rowCount);row++) for(let column=startColumn;column<Math.min(startColumn+size.columns,columnCount);column++) seen.add(`${row}:${column}`);
    }
    assert.equal(seen.size,rowCount*columnCount);
  }
});
test("speech values preserve missing metrics and convert API fractions and milliseconds correctly",()=>{
  assert.ok(speechMetrics(null).every(m=>m.value==="—"));
  const rows=speechMetrics({talk_share:.375,response_pause_median_ms:1450,words_per_minute:0,longest_monologue_seconds:null,questions_per_hour:null});
  assert.equal(rows[0].value,"37,5%");assert.equal(rows[1].value,"0 слов/мин");assert.equal(rows[2].value,"1,5 с");assert.equal(rows[3].value,"—");
});
