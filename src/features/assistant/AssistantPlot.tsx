import { cssClass } from "../../shared/lib/css-styles";

export type AssistantPlotData = { kind:string;title:string;description:string;unit:string;points:{label:string;x:number;y:number;count:number}[] };

// The web view uses the same computed points as exports, with readable layout
// at sidebar widths rather than scaling a publication image to a thumbnail.
export function AssistantPlot({plot,compact=false,color}:{plot:AssistantPlotData;compact?:boolean;color?:string}){
  const points=plot.points.filter(point=>Number.isFinite(point.y));
  const shown=compact?points.slice(0,6):points;
  const maximum=plot.unit.startsWith("%")?100:Math.max(1,...points.map(point=>point.y));
  const number=(value:number)=>value.toLocaleString("ru-RU",{maximumFractionDigits:2});
  const customColor=color&&/^#[a-f0-9]{6}$/i.test(color)?color:undefined;
  const colors=[customColor||"var(--assistant-plot-1)",...Array.from({length:5},(_,index)=>`var(--assistant-plot-${index+2})`)];
  const total=points.reduce((sum,point)=>sum+Math.max(0,point.y),0);
  let offset=0;
  if(!points.length)return <p className="assistant-notice">Недостаточно данных для изображения.</p>;
  return <div className={"assistant-native-plot "+(compact?"is-compact":"")} role="img" aria-label={plot.title+": "+points.map(point=>point.label+" — "+number(point.y)+" "+plot.unit).join("; ")}>
    <div className="assistant-plot-unit">{plot.unit}</div>
    {plot.kind==="pie"&&total>0&&<svg className="assistant-plot-donut" viewBox="0 0 180 180" aria-hidden="true"><circle cx="90" cy="90" r="62" className="assistant-plot-donut-track"/>{points.map((point,index)=>{const length=Math.max(0,point.y)/total*389.56,start=offset;offset+=length;return <circle key={index} cx="90" cy="90" r="62" fill="none" stroke={colors[index%colors.length]} strokeWidth="22" strokeDasharray={`${length} ${389.56-length}`} strokeDashoffset={-start} transform="rotate(-90 90 90)"/>;})}<text x="90" y="89" textAnchor="middle" className="assistant-plot-total">{number(total)}</text><text x="90" y="110" textAnchor="middle" className="assistant-plot-total-caption">{plot.unit}</text></svg>}
    <div className="assistant-plot-rows">{shown.map((point,index)=><div className="assistant-plot-row" key={point.label+index} title={`${point.label}: ${number(point.y)} ${plot.unit}`}>
      <div className="assistant-plot-row-caption"><span>{point.label}</span><strong>{number(point.y)}</strong></div>
      {plot.kind!=="table"&&<div className="assistant-plot-track"><span className={cssClass({width:Math.min(100,Math.max(0,point.y)/maximum*100)+"%",background:colors[index%colors.length]})}/></div>}
      {plot.unit.startsWith("%")&&<small className="assistant-plot-unit">Определённых оценок: {point.count}</small>}
    </div>)}</div>
    {compact&&points.length>shown.length&&<div className="assistant-plot-more">Ещё {points.length-shown.length} — в раскрытой диаграмме</div>}
    {plot.kind!=="pie"&&plot.kind!=="table"&&<div className="assistant-plot-scale"><span>0</span><span>{number(maximum)}</span></div>}
  </div>;
}
