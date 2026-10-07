import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Group, MathUtils, OrthographicCamera, type BufferGeometry } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import { ScenePoster } from "./ScenePoster";

type Props = { selected: number; onSelect: (index: number) => void; reducedMotion: boolean; theme: "light" | "dark"; variant?: "ribbon" | "layers"; priority?: boolean };
type Position = [number, number, number];

function FitSculpture() {
  const { camera, size, invalidate } = useThree();
  useLayoutEffect(() => {
    if (camera instanceof OrthographicCamera) {
      camera.zoom = Math.min(82, size.width / 8.6);
      camera.updateProjectionMatrix();
      invalidate();
    }
  }, [camera, size.width, invalidate]);
  return null;
}

function FirstPaint({ onReady, onPending }: { onReady: () => void; onPending: () => void }) {
  const rendered = useRef(0);
  const frame = useRef<number | null>(null);
  const { gl, invalidate } = useThree();
  // Positive priority renders after the animated meshes. Readiness follows
  // completed draws at the fitted camera size, never the pre-render callback.
  useFrame(({ scene, camera, size }) => {
    if (!size.width || !size.height || gl.getContext().isContextLost()) return;
    gl.render(scene, camera);
    if (rendered.current >= 2) return;
    if (gl.info.render.calls === 0) { invalidate(); return; }
    rendered.current++;
    if (rendered.current === 2) {
      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(onReady);
      });
    } else invalidate();
  }, 1);
  useEffect(() => {
    const lost = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      rendered.current = 0;
      onPending();
    };
    const restored = () => { rendered.current = 0; invalidate(); };
    gl.domElement.addEventListener("webglcontextlost", lost);
    gl.domElement.addEventListener("webglcontextrestored", restored);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      gl.domElement.removeEventListener("webglcontextlost", lost);
      gl.domElement.removeEventListener("webglcontextrestored", restored);
    };
  }, [gl, invalidate, onPending]);
  return null;
}

function MovingGroup({ target, initial, reduced, children }: { target: Position; initial: Position; reduced: boolean; children: React.ReactNode }) {
  const group = useRef<Group>(null);
  const invalidate = useThree(state => state.invalidate);
  const [x, y, z] = target;
  useEffect(() => { invalidate(); }, [x, y, z, reduced, invalidate]);
  useFrame((_, delta) => {
    if (!group.current) return;
    let unsettled = false;
    const current = group.current.position;
    for (const [axis, value] of [["x", x], ["y", y], ["z", z]] as const) {
      const next = reduced ? value : MathUtils.damp(current[axis], value, 8, Math.min(delta, .05));
      current[axis] = Math.abs(next - value) < .001 ? value : next;
      if (current[axis] !== value) unsettled = true;
    }
    if (unsettled) invalidate();
  });
  return <group ref={group} position={initial}>{children}</group>;
}

function Tile({ geometry, position, scale, color, metal = .06, opacity = 1 }: { geometry: BufferGeometry; position: Position; scale: Position; color: string; metal?: number; opacity?: number }) {
  return <mesh geometry={geometry} position={position} scale={scale} castShadow receiveShadow><meshStandardMaterial color={color} roughness={.32} metalness={metal} transparent={opacity < 1} opacity={opacity} /></mesh>;
}

const segmentBounds = [[0,15],[16,32],[33,48]] as const;
type RibbonField = { centers: number[]; targets: number[]; amounts: number[]; hovered: number };

function WaveBone({ geometry, position, angle, lane, index, region, field, reduced, paper }: { geometry: BufferGeometry; position: Position; angle: number; lane: number; index: number; region: number; field: MutableRefObject<RibbonField>; reduced: boolean; paper: string }) {
  const mesh = useRef<Group>(null);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => { invalidate(); }, [reduced, paper, invalidate]);
  useFrame((_, delta) => {
    if (!mesh.current) return;
    const [start,end] = segmentBounds[region];
    const center = field.current.centers[region];
    const amount = field.current.amounts[region];
    const distance = Math.abs(index-center)/(end-start);
    // A continuous lifting field; no per-bone timers or restart on pointer exit.
    const profile = (point:number) => amount * (.42 + .38 * Math.exp(-Math.pow((point-center)/7,2)));
    const target = position[1] + profile(index);
    const dt = Math.min(delta,.05);
    const next = reduced ? target : MathUtils.damp(mesh.current.position.y,target,8-distance*3,dt);
    mesh.current.position.y = Math.abs(next-target)<.0008 ? target : next;
    const slope = reduced ? 0 : Math.atan((profile(Math.min(end,index+.5))-profile(Math.max(start,index-.5)))/.135)*.32;
    const nextAngle = reduced ? 0 : MathUtils.damp(mesh.current.rotation.z,slope,6,dt);
    mesh.current.rotation.z = Math.abs(nextAngle-slope)<.0008 ? slope : nextAngle;
    if (mesh.current.position.y!==target || mesh.current.rotation.z!==slope) invalidate();
  });
  const initialPosition=useRef<Position>([position[0],position[1]+field.current.amounts[region]*(.42+.38*Math.exp(-Math.pow((index-field.current.centers[region])/7,2))),position[2]]);
  return <group ref={mesh} position={initialPosition.current}><mesh raycast={() => {}} geometry={geometry} scale={[.105,lane===0?.43:.31,.51]} rotation={[0,angle,0]} castShadow receiveShadow><meshStandardMaterial color={lane===0?"#ff6935":paper} metalness={.05} roughness={.3}/></mesh></group>;
}

function Ribbon({ geometry, props }: { geometry: BufferGeometry; props: Props }) {
  const dark = props.theme === "dark";
  const paper = dark ? "#cbbdab" : "#fff7ed";
  const base = dark ? "#40372e" : "#e4d7c7";
  const indices = useMemo(() => Array.from({ length: 49 }, (_, index) => index), []);
  const field = useRef<RibbonField>({centers:[7.5,24,40.5],targets:[7.5,24,40.5],amounts:segmentBounds.map((_,index)=>props.selected===index?1:0),hovered:-1});
  const ribbon = useRef<Group>(null);
  const invalidate = useThree(state=>state.invalidate);
  useEffect(() => {
    if(field.current.hovered!==props.selected) {
      const [start,end]=segmentBounds[props.selected];
      field.current.targets[props.selected]=(start+end)/2;
    }
    invalidate();
  }, [props.selected,props.reducedMotion,invalidate]);
  useFrame((_,delta)=>{
    let moving=false;
    const dt=Math.min(delta,.05);
    for(let region=0;region<3;region++) {
      const centerTarget=field.current.targets[region];
      const amountTarget=region===props.selected?1:0;
      const center=props.reducedMotion?centerTarget:MathUtils.damp(field.current.centers[region],centerTarget,5,dt);
      const amount=props.reducedMotion?amountTarget:MathUtils.damp(field.current.amounts[region],amountTarget,6,dt);
      field.current.centers[region]=Math.abs(center-centerTarget)<.002?centerTarget:center;
      field.current.amounts[region]=Math.abs(amount-amountTarget)<.0005?amountTarget:amount;
      if(field.current.centers[region]!==centerTarget || field.current.amounts[region]!==amountTarget) moving=true;
    }
    if(moving) invalidate();
  });
  const followPointer=(event:ThreeEvent<PointerEvent>,segment:number)=> {
    if(event.pointerType!=="mouse" || !ribbon.current) return;
    event.stopPropagation();
    const point=ribbon.current.worldToLocal(event.point.clone());
    const [start,end]=segmentBounds[segment];
    field.current.hovered=segment;
    field.current.targets[segment]=MathUtils.clamp(((point.x-(segment-1)*.17)/6.45+.5)*48,start,end);
    props.onSelect(segment);
    invalidate();
  };
  return <group ref={ribbon} rotation={[0, .28, 0]}>
    <Tile geometry={geometry} position={[0, -.9, .05]} scale={[5.45, .2, 3.25]} color={base} />
    <Tile geometry={geometry} position={[0, -.72, .05]} scale={[5.15, .08, 3]} color="#fb653a" />
    <Tile geometry={geometry} position={[0, -.59, .05]} scale={[5.12, .15, 3]} color={dark ? "#584c3e" : "#fcf1e4"} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.498, .05]}><torusGeometry args={[1.02, .028, 8, 72]} /><meshStandardMaterial color="#cda58b" metalness={.3} roughness={.45} /></mesh>
    {[0,1,2].map(segment => <group key={segment} onPointerOver={event=>followPointer(event,segment)} onPointerMove={event=>followPointer(event,segment)} onPointerOut={event => {
      if(event.intersections.some(hit=>hit.object.userData.region===segment)) return;
      if(field.current.hovered===segment) {
        field.current.hovered=-1;
        const [start,end]=segmentBounds[segment];
        field.current.targets[segment]=(start+end)/2;
        invalidate();
      }
      // Selection stays raised; its crest returns smoothly to the centre.
    }} onClick={event=>{event.stopPropagation();props.onSelect(segment);}}>
      {indices.filter(index=>(index<16?0:index<33?1:2)===segment).map(index=>{
        const t=index/48;
        const x=(t-.5)*6.45+(segment-1)*.17;
        const z=Math.sin(t*Math.PI*2-.8)*.94;
        const y=.14+Math.sin(t*Math.PI)*.25;
        const angle=-Math.atan(Math.cos(t*Math.PI*2-.8)*.94*Math.PI*2/6.45);
        return <group key={index}>
          {/* Static transparent hit volumes prevent the animated surface from leaving the pointer. */}
          <mesh userData={{region:segment,index}} geometry={geometry} position={[x,.75,z]} rotation={[0,angle,0]} scale={[.17,1.9,1.3]}>
            <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false}/>
          </mesh>
          {[0,1].map(lane=><WaveBone key={lane} geometry={geometry} position={[x,y,z+(lane===0?-.35:.35)]} angle={angle} lane={lane} index={index} region={segment} field={field} reduced={props.reducedMotion} paper={paper}/>)}
        </group>;
      })}
    </group>)}
    {[0, 1, 2].map(region => {
      const x = (region - 1) * 1.65;
      const active = props.selected === region;
      return <MovingGroup key={region} initial={[x, -.37, .82]} target={[x, active ? -.05 : -.37, active ? 1.14 : .82]} reduced={props.reducedMotion}>
        <group onPointerOver={event => { if (event.pointerType === "mouse") { event.stopPropagation(); props.onSelect(region); } }} onClick={event => { event.stopPropagation(); props.onSelect(region); }}>
          <Tile geometry={geometry} position={[0, 0, 0]} scale={[.8, .16, .63]} color={paper} />
          <Tile geometry={geometry} position={[-.2, .15, -.12]} scale={[.23, .16, .23]} color={active ? "#ff7542" : "#b8a591"} />
          <Tile geometry={geometry} position={[.12, .15, -.12]} scale={[.23, .16, .23]} color={active ? "#ff7542" : "#b8a591"} />
          <Tile geometry={geometry} position={[-.2, .15, .15]} scale={[.23, .16, .23]} color={paper} />
          <Tile geometry={geometry} position={[.12, .15, .15]} scale={[.23, .16, .23]} color={active ? "#ff7542" : "#b8a591"} />
        </group>
      </MovingGroup>;
    })}
  </group>;
}

function Layers({ geometry, props }: { geometry: BufferGeometry; props: Props }) {
  const dark = props.theme === "dark";
  const ys = [.95, .15, -.65];
  return <group rotation={[0, -.15, 0]}>
    <Tile geometry={geometry} position={[0, -1.04, .05]} scale={[4.8, .18, 3.2]} color={dark ? "#42382e" : "#e6dacc"} />
    {[0, 1, 2].map(index => {
      const active = props.selected === index;
      const x = -.34 + index * .17;
      const z = -.25 + index * .23;
      return <MovingGroup key={index} initial={[x, ys[index], z]} target={[x + (active ? -.18 : 0), ys[index] + (active ? .24 : 0), z + (active ? .47 : 0)]} reduced={props.reducedMotion}>
        <group onPointerOver={event => { if (event.pointerType === "mouse") { event.stopPropagation(); props.onSelect(index); } }} onClick={event => { event.stopPropagation(); props.onSelect(index); }}>
          <Tile geometry={geometry} position={[0, 0, 0]} scale={[3.95, .16, 2.5]} color={dark ? active ? "#d6cabb" : "#80715f" : active ? "#fffaf3" : "#e8ddd0"} />
          <Tile geometry={geometry} position={[-1.34, .13, -.79]} scale={[.43, .11, .43]} color="#ff6737" />
          {index === 0 ? Array.from({length:5}, (_, row) => <Tile key={row} geometry={geometry} position={[.1 - (row % 2) * .18, .12, -.7 + row * .34]} scale={[2.03 - (row % 2) * .36, .035, .09]} color={row === 2 ? "#ef7445" : dark ? "#b3a493" : "#c9b9a6"} />)
          : index === 1 ? Array.from({length:7}, (_, row) => {
            const height = .14 + (Math.sin(row * 1.35) + 1) * .15;
            return <Tile key={row} geometry={geometry} position={[-1.08 + row * .36, .1 + height / 2, .17]} scale={[.19, height, .28]} color={row < 4 ? "#ff6737" : "#8dae8e"} />;
          })
          : <><Tile geometry={geometry} position={[.12, .12, -.35]} scale={[2.13, .04, .09]} color="#b6a28d" /><Tile geometry={geometry} position={[.4, .12, .04]} scale={[1.56, .04, .09]} color="#b6a28d" /><Tile geometry={geometry} position={[-.98, .19, .51]} scale={[.37, .2, .37]} color="#75a480" /><Tile geometry={geometry} position={[.31, .16, .55]} scale={[1.78, .12, .34]} color="#ff6737" /></>}
        </group>
      </MovingGroup>;
    })}
  </group>;
}

function Exhibit(props: Props) {
  const geometry = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 3, .12), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <group position={[0, .02, 0]}>
    {props.variant === "layers" ? <Layers geometry={geometry} props={props} /> : <Ribbon geometry={geometry} props={props} />}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.16, 0]} receiveShadow><planeGeometry args={[30, 30]} /><shadowMaterial opacity={props.theme === "dark" ? .27 : .12} transparent /></mesh>
  </group>;
}

function SceneRepaint() {
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    const refresh = () => invalidate();
    window.addEventListener("landing-theme-ready", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("landing-theme-ready", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [invalidate]);
  return null;
}

function Conversation(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(Boolean(props.priority));
  const [activated, setActivated] = useState(Boolean(props.priority));
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const onPending = useCallback(() => setReady(false), []);
  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setActivated(true);
    }, {rootMargin: "700px"});
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={container} className={"c-canvas-container" + (ready ? " is-ready" : "")}>
    <ScenePoster theme={props.theme} variant={props.variant ?? "ribbon"} hidden={ready}/>
    {activated && <Canvas orthographic camera={{ position: [5.8, 5.2, 8.4], zoom: 68, near: .1, far: 60 }} dpr={[1, 1.5]} shadows="percentage" frameloop={visible || !ready ? "demand" : "never"} gl={{ alpha: true, antialias: true, powerPreference: "low-power", preserveDrawingBuffer: true }} onCreated={({gl}) => gl.setClearColor(0x000000, 0)} style={{touchAction: "pan-y", background: "transparent"}}>
      <FirstPaint onReady={onReady} onPending={onPending} />
      <SceneRepaint />
      <FitSculpture />
      <ambientLight intensity={1.25} />
      <directionalLight position={[-4, 7, 5]} intensity={3.2} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-normalBias={.04} />
      <directionalLight position={[4, 2, -3]} intensity={1.6} color="#ffdcbb" />
      <Exhibit {...props} />
    </Canvas>}
  </div>;
}
export default memo(Conversation);
