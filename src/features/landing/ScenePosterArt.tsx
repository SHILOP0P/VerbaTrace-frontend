import { useLayoutEffect, useMemo, useRef, useState } from "react";

type Point = [number, number, number];
type Face = { points: Point[]; color: string; depth: number; ring?: boolean };
const camera: Point = [5.8, 5.2, 8.4];
const horizontal = Math.hypot(camera[0], camera[2]);
const distance = Math.hypot(...camera);
const dot = (a: Point, b: Point) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const rotate = ([x,y,z]: Point, angle: number): Point => [x*Math.cos(angle)+z*Math.sin(angle), y, -x*Math.sin(angle)+z*Math.cos(angle)];
const shade = (hex: string, amount: number) => "#" + hex.slice(1).match(/../g)!.map(value => Math.round(parseInt(value,16)*amount).toString(16).padStart(2,"0")).join("");

// Lightweight vector projection of the procedural scene. It shares its camera,
// dimensions and initial selection, but needs neither WebGL nor image requests.
function sculpture(variant: "ribbon" | "layers", dark: boolean): Face[] {
  const faces: Face[] = [];
  const rotation = variant === "ribbon" ? .28 : -.15;
  const box = (center: Point, scale: Point, color: string, angle = 0) => {
    const vertices = Array.from({length:8},(_,index):Point => {
      const local = rotate([(index&1 ? .5 : -.5)*scale[0], (index&2 ? .5 : -.5)*scale[1], (index&4 ? .5 : -.5)*scale[2]], angle);
      const world = rotate([local[0]+center[0],local[1]+center[1],local[2]+center[2]], rotation);
      return [world[0],world[1]+.02,world[2]];
    });
    const surfaces: {indices:number[]; normal:Point}[] = [
      {indices:[0,4,6,2],normal:[-1,0,0]}, {indices:[1,3,7,5],normal:[1,0,0]},
      {indices:[0,1,5,4],normal:[0,-1,0]}, {indices:[2,6,7,3],normal:[0,1,0]},
      {indices:[0,2,3,1],normal:[0,0,-1]}, {indices:[4,5,7,6],normal:[0,0,1]},
    ];
    for (const face of surfaces) {
      const normal=rotate(face.normal,angle+rotation);
      if(dot(normal,camera)<=0) continue;
      const points=face.indices.map(index=>vertices[index]);
      faces.push({points,color:shade(color,normal[1]>.5?1:normal[0]>.5?.78:.65),depth:points.reduce((sum,point)=>sum+dot(point,camera),0)/4});
    }
  };
  if (variant === "ribbon") {
    const paper=dark?"#cbbdab":"#fff7ed";
    box([0,-.9,.05],[5.45,.2,3.25],dark?"#40372e":"#e4d7c7");
    box([0,-.72,.05],[5.15,.08,3],"#fb653a");
    box([0,-.59,.05],[5.12,.15,3],dark?"#584c3e":"#fcf1e4");
    const ring = Array.from({length:73},(_,index):Point=>rotate([Math.cos(index/72*Math.PI*2)*1.02,-.478,.05+Math.sin(index/72*Math.PI*2)*1.02],rotation));
    faces.push({points:ring,color:"#cda58b",depth:dot(rotate([0,-.478,.05],rotation),camera),ring:true});
    for(let index=0;index<49;index++) {
      const region=index<16?0:index<33?1:2, t=index/48;
      const x=(t-.5)*6.45+(region-1)*.17, z=Math.sin(t*Math.PI*2-.8)*.94;
      const y=.14+Math.sin(t*Math.PI)*.25+(region===1?.42+.38*Math.exp(-Math.pow((index-24)/7,2)):0);
      const angle=-Math.atan(Math.cos(t*Math.PI*2-.8)*.94*Math.PI*2/6.45);
      box([x,y,z-.35],[.105,.43,.51],"#ff6935",angle);
      box([x,y,z+.35],[.105,.31,.51],paper,angle);
    }
    for(let region=0;region<3;region++) {
      const x=(region-1)*1.65, y=region===1?-.05:-.37, z=region===1?1.14:.82;
      box([x,y,z],[.8,.16,.63],paper);
      for(const [offsetX,offsetZ] of [[-.2,-.12],[.12,-.12],[-.2,.15],[.12,.15]])
        box([x+offsetX,y+.15,z+offsetZ],[.23,.16,.23],region===1&&offsetX>0?"#ff7542":paper);
    }
  } else {
    box([0,-1.04,.05],[4.8,.18,3.2],dark?"#42382e":"#e6dacc");
    faces.sort((a,b)=>a.depth-b.depth);
    for(let index=2;index>=0;index--) {
      const start=faces.length;
      const active=index===0, x=-.34+index*.17+(active?-.18:0), y=[.95,.15,-.65][index]+(active?.24:0), z=-.25+index*.23+(active?.47:0);
      box([x,y,z],[3.95,.16,2.5],dark?(active?"#d6cabb":"#80715f"):(active?"#fffaf3":"#e8ddd0"));
      box([x-1.34,y+.13,z-.79],[.43,.11,.43],"#ff6737");
      if(index===0) for(let row=0;row<5;row++) box([x+.1-(row%2)*.18,y+.12,z-.7+row*.34],[2.03-(row%2)*.36,.035,.09],row===2?"#ef7445":dark?"#b3a493":"#c9b9a6");
      if(index===1) for(let row=0;row<7;row++) {const height=.14+(Math.sin(row*1.35)+1)*.15;box([x-1.08+row*.36,y+.1+height/2,z+.17],[.19,height,.28],row<4?"#ff6737":"#8dae8e");}
      if(index===2) {box([x+.12,y+.12,z-.35],[2.13,.04,.09],"#b6a28d");box([x+.4,y+.12,z+.04],[1.56,.04,.09],"#b6a28d");box([x-.98,y+.19,z+.51],[.37,.2,.37],"#75a480");box([x+.31,y+.16,z+.55],[1.78,.12,.34],"#ff6737");}
      const group=faces.splice(start);
      const plate=group.splice(0,3);
      faces.push(...plate.sort((a,b)=>a.depth-b.depth),...group.sort((a,b)=>a.depth-b.depth));
    }
  }
  return variant === "layers" ? faces : faces.sort((a,b)=>a.depth-b.depth);
}

export function ScenePosterArt({ theme, variant }: { theme:"light"|"dark"; variant:"ribbon"|"layers" }) {
  const svg=useRef<SVGSVGElement>(null);
  const [size,setSize]=useState({width:variant==="ribbon"?761:654,height:variant==="ribbon"?390:540});
  useLayoutEffect(()=>{
    const node=svg.current;
    if(!node) return;
    const measure=()=>{const rect=node.getBoundingClientRect();if(rect.width&&rect.height)setSize(old=>old.width===rect.width&&old.height===rect.height?old:{width:rect.width,height:rect.height});};
    measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
  },[]);
  const faces=useMemo(()=>sculpture(variant,theme==="dark"),[variant,theme]);
  const zoom=Math.min(82,size.width/8.6);
  const project=([x,y,z]:Point)=>[size.width/2+(x*camera[2]-z*camera[0])/horizontal*zoom,size.height/2-(-x*camera[0]*camera[1]/horizontal+y*horizontal-z*camera[2]*camera[1]/horizontal)/distance*zoom];
  return <svg ref={svg} className="c-scene-preview" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true"><ellipse cx={size.width/2} cy={size.height/2+zoom} rx={zoom*2.65} ry={zoom*.35} fill={theme==="dark"?"#000":"#80634b"} opacity={theme==="dark"?.18:.08}/>{faces.map((face,index)=><path key={index} d={face.points.map((point,i)=>{const [x,y]=project(point);return `${i?"L":"M"}${x.toFixed(2)} ${y.toFixed(2)}`}).join(" ")+"Z"} fill={face.ring?"none":face.color} stroke={face.color} strokeWidth={face.ring?zoom*.056:.55} strokeLinejoin="round"/>)}</svg>;
}
