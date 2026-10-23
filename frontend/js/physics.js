(function () {
  "use strict";
  const invoke=window.__TAURI__?.core?.invoke, event=window.__TAURI__?.event;
  const bodies=[]; let pet=null, grab=null, raf=0, previous=0, accumulator=0, ignore=true, cursorBusy=false;
  const STEP=1/120, GRAVITY=1550, MAX=12, STACK_GAP=2/3;
  let attachment=0;
  const layer=document.getElementById('tablewareLayer'),shieldContext=document.createElement('canvas').getContext('2d');
  let shieldPaths=[],maskKey='';
  function syncShields(){
    const shields=pet?.shields||[],key=JSON.stringify([innerWidth,innerHeight,shields]);if(key===maskKey)return;maskKey=key;
    shieldPaths=shields.map(s=>({path:new Path2D(s.d),matrix:new DOMMatrix(s.matrix),stroke:s.stroke}));
    if(!shields.length){layer.style.maskImage='none';return;}
    const xml=document.createElementNS('http://www.w3.org/2000/svg','svg');xml.setAttribute('width',innerWidth);xml.setAttribute('height',innerHeight);
    const ns=xml.namespaceURI,mask=document.createElementNS(ns,'mask');mask.id='bubble';mask.setAttribute('maskUnits','userSpaceOnUse');
    const rect=()=>{const r=document.createElementNS(ns,'rect');r.setAttribute('width','100%');r.setAttribute('height','100%');r.setAttribute('fill','white');return r;};mask.append(rect());
    for(const s of shields){const p=document.createElementNS(ns,'path');p.setAttribute('d',s.d);p.setAttribute('transform',`matrix(${s.matrix.join(' ')})`);p.setAttribute('fill','black');p.setAttribute('stroke','black');p.setAttribute('stroke-width',s.stroke);mask.append(p);}
    xml.append(mask);const fill=rect();fill.setAttribute('mask','url(#bubble)');xml.append(fill);
    layer.style.maskImage=`url("data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(xml))}")`;
  }
  function shielded(x,y){return shieldPaths.some(s=>{const p=new DOMPoint(x,y).matrixTransform(s.matrix.inverse());shieldContext.lineWidth=s.stroke;return shieldContext.isPointInPath(s.path,p.x,p.y)||shieldContext.isPointInStroke(s.path,p.x,p.y);});}
  const stack=()=>bodies.filter(p=>p.onHead).sort((a,b)=>a.attachment-b.attachment);
  function anchorStack() {
    const h=head();
    stack().forEach((p,i)=>{p.x=h.x-p.w/2;p.y=h.y-p.h-i*p.h*STACK_GAP;p.vx=p.vy=0;p.support="head";render(p);});
  }
  function sound(name) {
    if(name==="feed"&&pet?.characterSound)return;
    if(!pet?.sound)return;
    window.WhaleComponentAudio?.play(name,pet.volume||0).catch(e=>console.warn("组件音效播放失败",String(e)));
  }
  function feedback(message,cue) {invoke?.("physics_feedback",{count:bodies.length,feeding:bodies.some(p=>p.eating>0),message:message||null,cue:cue||null}).catch(()=>{});}
  function dimensions(p) {p.w=pet.width*(p.kind==="pot"?.94:.70);p.h=p.w*(p.kind==="pot"?.36:.72);}
  function head() {return {x:pet.x+pet.width*(pet.left?.40:.60),y:pet.y+pet.height*.34};}
  const mouths={'Claude-Chibi':[.458,.68],'GLM-Chibi':[.49,.735],'GPT-Chibi':[.46,.735],'Grok-Chibi':[.507,.708],'Qwen-Chibi':[.537,.666],'Gemini-Chibi':[.48,.735],'Kimi-Chibi':[.48,.695]};
  function face() {const m=mouths[pet.group];return m?{x:pet.x+pet.width*(pet.left?1-m[0]:m[0]),y:pet.y+pet.height*m[1],rx:pet.width*.14,ry:pet.height*.10}:{x:head().x,y:pet.y+pet.height*.64,rx:pet.width*.20,ry:pet.height*.13};}
  function atFace(p) {
    const f=face(),x=p.x+p.w*.5,y=p.y+p.h*.22;
    // Contact of the rice mound (not the plate's centre) with the mouth area is sufficient.
    return y>pet.y+pet.height*(mouths[pet.group] ? .50 : .43) && ((x-f.x)/(f.rx+p.w*.38))**2+((y-f.y)/(f.ry+p.h*.18))**2<=1;
  }
  function canAutoEat(p){return pet?.riceAutoEat!==false&&p.kind==='rice'&&atFace(p);}
  function riceTitle(){return pet?.riceAutoEat===false?"点击白饭才开饭；已关闭送到嘴边自动吃（可在桌宠外观中开启）":"点击白饭，或送到角色嘴边立即开饭；不必松手，碰头、落地和等待不会自动吃";}
  function render(p) {
    p.el.style.width=p.w+"px";p.el.style.height=p.h+"px";
    p.el.style.transform=`translate(${p.x}px,${p.y}px) rotate(${p.angle}rad)`;
    p.el.style.zIndex=String(grab?.p===p?1000:p.onHead?200+stack().indexOf(p):500);
  }
  function create(kind,quiet=false) {
    if(!pet||bodies.length>=MAX){if(!quiet)feedback("餐具已经堆了十二个，先收拾一下吧。");return;}
    const p={kind,x:0,y:0,vx:0,vy:0,angle:0,spin:0,support:null,onHead:false,attachment:0,eating:0,el:document.createElement("button")};
    dimensions(p);const h=head();
    // Rice lands beside the pet, toward screen centre, never on its crown by default.
    const front=pet.x+pet.width/2<innerWidth/2?pet.x+pet.width+p.w*.60:pet.x-p.w*.60;
    p.x=Math.max(8,Math.min(innerWidth-p.w-8,(kind==="rice"?front:h.x)-p.w/2));p.y=-p.h;
    p.el.className="tableware "+kind;p.el.type="button";
    p.el.title=kind==="pot"?"拖动或抛掷铁盆；点击敲盆；双击摘下":riceTitle();
    p.el.innerHTML=kind==="rice"?'<span class="crop"><span class="rice-dish"></span><span class="rice-food"><img class="rice-grains" draggable="false" alt=""></span><img class="rice-basin" draggable="false" alt=""></span>':'<span class="crop"><img draggable="false" alt=""></span>';
    p.img=p.el.querySelector("img");
    p.el.querySelectorAll("img").forEach(img=>img.src="../assets/feeding/"+(kind==="pot"?"iron_bowl.png":"rice.png"));
    layer.appendChild(p.el);bodies.push(p);render(p);wake();feedback();
    p.el.onpointerdown=e=>{
      if(e.button!==0||p.eating)return;e.preventDefault();
      grab={p,id:e.pointerId,dx:e.clientX-p.x,dy:e.clientY-p.y,sx:e.clientX,sy:e.clientY,px:e.clientX,py:e.clientY,time:performance.now(),moved:false};
      p.vx=p.vy=0;p.el.setPointerCapture(e.pointerId);
      invoke?.("set_ignore_cursor_events",{ignore:false});ignore=false;
    };
    p.el.onpointermove=e=>{
      if(grab?.p===p)moveGrab(e.clientX,e.clientY);
    };
    p.el.onpointerup=e=>{
      if(grab?.p===p)releaseGrab();
    };
    // Native polling keeps a held drag alive across WebView2 click-through/capture changes.
    p.el.onpointercancel=()=>{if(grab?.p===p){grab=null;p.vx=p.vy=0;wake();}};
    p.el.ondblclick=()=>{if(p.kind==="pot"){p.onHead=false;p.support=null;p.vx=pet.left?220:-220;p.vy=-180;sound("pot_off");anchorStack();wake();}};
    p.el.onkeydown=e=>{if(e.key==="Delete"){remove(p);feedback();}else if((e.key==="Enter"||e.key===" ")&&!e.repeat){e.preventDefault();activate(p);wake();}};
  }
  function moveGrab(x,y){
    if(!grab)return;const p=grab.p,now=performance.now(),dt=Math.max(.008,(now-grab.time)/1000);
    grab.moved ||= Math.hypot(x-grab.sx,y-grab.sy)>3;if(!grab.moved)return;
    p.offered=true;p.onHead=false;p.support=null;anchorStack();
    p.vx=Math.max(-1600,Math.min(1600,(x-grab.px)/dt));p.vy=Math.max(-1200,Math.min(1200,(y-grab.py)/dt));
    p.x=Math.max(-p.w*.2,Math.min(innerWidth-p.w*.8,x-grab.dx));p.y=y-grab.dy;
    grab.px=x;grab.py=y;grab.time=now;render(p);
    if(canAutoEat(p))beginEat(p);
  }
  function releaseGrab(){
    if(!grab)return;const {p,moved,id}=grab;grab=null;
    if(p.el.hasPointerCapture(id))p.el.releasePointerCapture(id);
    if(!moved)activate(p);else if(canAutoEat(p))beginEat(p);wake();
  }
  function nativePointer(xy){if(grab&&typeof xy[2]==='boolean'){if(xy[2])moveGrab(xy[0],xy[1]);else releaseGrab();}}
  function remove(p){p.el.remove();const i=bodies.indexOf(p);if(i>=0)bodies.splice(i,1);anchorStack();}
  function activate(p){if(p.kind==="rice"){if(!p.eating)beginEat(p);}else{p.spin=1.4;sound("pot_tap");}}
  function beginEat(p) {
    if(p.eating)return;
    if(grab?.p===p){const id=grab.id;grab=null;if(p.el.hasPointerCapture(id))p.el.releasePointerCapture(id);}
    p.onHead=false;p.support=null;anchorStack();
    p.eating=1.6;p.bite=0;p.vx=p.vy=0;p.el.classList.add("eating");sound("feed");feedback("饭送到啦，啊呜一大口白饭！","feed");wake();
  }
  function bite(p,n) {
    p.bite=n;
    // Only the food layer is masked; the metal rim and basin never shrink or disappear.
    p.el.querySelector(".rice-food").style.clipPath=`inset(${n*17}% 0 0 0)`;
    for(let i=0;i<3;i++){
      const grain=document.createElement("span");grain.className="flying-grain";p.el.appendChild(grain);
      const f=face(),dx=f.x-(p.x+p.w*.5),dy=f.y-(p.y+p.h*.25);
      const animation=grain.animate([{transform:`translate(${i*5-5}px,0) rotate(${i*35}deg)`,opacity:1},{transform:`translate(${dx*.4}px,${Math.min(-35,dy*.4-25)}px) rotate(90deg)`,opacity:1,offset:.45},{transform:`translate(${dx}px,${dy}px) rotate(180deg)`,opacity:0}],{duration:300+i*25,easing:"ease-in"});
      animation.onfinish=()=>grain.remove();
    }
  }
  function finishEat(p) {
    const bottom=p.y+p.h,center=p.x+p.w/2;p.kind="pot";p.eating=0;p.support=null;p.onHead=false;
    dimensions(p);p.x=center-p.w/2;p.y=bottom-p.h;p.el.className="tableware pot";
    p.el.innerHTML='<span class="crop"><img draggable="false" alt=""></span>';p.img=p.el.querySelector("img");
    p.img.src="../assets/feeding/iron_bowl.png";p.spin=.65;
    p.el.querySelector(".crop").animate([{transform:"scaleY(.15)"},{transform:"scaleY(1)"}],{duration:180,easing:"ease-out"});
    p.el.title="吃空的铁盆：拖动、堆叠、点击敲盆；双击摘下";feedback("吃光啦！空铁盆可以拖到头顶叠起来，铛！","fed");
  }
  function simulate(dt) {
    if(!pet)return;
    anchorStack();const h=head(), floor=pet.floor||innerHeight;
    // Bottom-up order resolves supporting bodies before the nested bowl resting on them.
    const ordered=[...bodies].sort((a,b)=>b.y+b.h-a.y-a.h);
    for(const p of ordered){
      if(p.offered&&!p.eating&&canAutoEat(p))beginEat(p);
      if(grab?.p===p)continue;
      if(p.onHead){p.angle+=p.spin*dt;p.spin+=(-p.angle*35-p.spin*9)*dt;render(p);continue;}
      if(p.eating){
        p.eating-=dt;const n=Math.min(4,Math.floor((1.6-p.eating)/.30));if(n>p.bite)bite(p,n);
        if(p.eating<=0)finishEat(p);else continue;
      }
      const oldBottom=p.y+p.h;
      p.vy+=GRAVITY*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
      p.angle+=p.spin*dt;p.spin+=(-p.angle*35-p.spin*9)*dt;
      if(p.x<0){p.x=0;p.vx=Math.abs(p.vx)*.3;}if(p.x+p.w>innerWidth){p.x=innerWidth-p.w;p.vx=-Math.abs(p.vx)*.3;}
      let level=floor,support="floor",center=p.x+p.w/2;
      const headLevel=h.y-stack().length*p.h*STACK_GAP;
      if(p.kind==="pot"&&Math.abs(center-h.x)<pet.width*.28&&p.vy>=0&&oldBottom<=headLevel+8&&p.y+p.h>=headLevel){
        p.onHead=true;p.attachment=++attachment;p.spin=.45;sound("pot_land");anchorStack();continue;
      }
      if(Math.abs(center-h.x)<pet.width*.28 && oldBottom<=h.y+8 && h.y<level){level=h.y;support="head";}
      for(const other of bodies){
        if(other===p||other.onHead||other.eating||grab?.p===other||other.y+other.h<=oldBottom+1)continue;
        // Inverted basins nest at the rim; they do not balance on a rectangular sprite box.
        const surface=other.y+(p.kind==="pot"&&other.kind==="pot"?other.h*(1-STACK_GAP):other.h*.12);
        if(Math.abs(center-(other.x+other.w/2))<(p.w+other.w)*.30 && oldBottom<=surface+8 && surface<level){level=surface;support=other;}
      }
      p.support=null;
      if(p.vy>=0&&p.y+p.h>=level&&oldBottom<=level+10){
        const impact=p.vy;p.y=level-p.h;p.vy=impact>100?-impact*.17:0;
        p.vx*=.70;p.support=support;if(support==='head')p.offered=false;
        if(impact>170){p.spin=(p.x+p.w/2-h.x)*.012+.45;sound(p.kind==="rice"?"rice_land":"pot_land");}
      }
      // A thrown object can pass the head; the desktop remains the final collision plane.
      if(p.y+p.h>floor){p.y=floor-p.h;p.vy=0;p.vx*=.8;p.support="floor";}
      if(Math.abs(p.vx)<1)p.vx=0;render(p);
    }
  }
  function frame(now) {
    raf=0;accumulator+=Math.min(.05,(now-(previous||now))/1000);previous=now;
    while(accumulator>=STEP){simulate(STEP);accumulator-=STEP;}
    if(bodies.length)raf=requestAnimationFrame(frame);else previous=0;
  }
  function wake(){if(!raf)raf=requestAnimationFrame(frame);}
  function clear(silent=false){grab=null;ignore=true;bodies.splice(0).forEach(p=>p.el.remove());cancelAnimationFrame(raf);raf=0;previous=0;accumulator=0;if(!silent)feedback();}
  function sync(next) {
    const old=pet;pet=next;
    for(const p of bodies)if(p.kind==='rice'){
      p.el.title=riceTitle();
      // Changing the switch must not turn an old throw into a new feeding gesture.
      if(next.riceAutoEat===false)p.offered=false;
    }
    syncShields();
    if(old&&old.monitor!==next.monitor)clear(!!next.action&&next.action!=="clear");
    else if(old){
      for(const p of bodies){
        if(grab?.p===p)continue;
        const bottom=p.y+p.h,center=p.x+p.w/2;dimensions(p);
        if(!p.onHead){p.x=center-p.w/2;p.y=bottom-p.h;}
      }
      anchorStack();
    }
    if(next.action==="clear")clear();else if(next.action==="feed")create("rice");else if(next.action==="reward")create("rice",true);else if(next.action==="pot")create("pot");
    wake();
  }
  setInterval(async()=>{
    if(!invoke||cursorBusy||!bodies.length)return;cursorBusy=true;
    try{const xy=await invoke("physics_cursor");if(!xy)return;
      nativePointer(xy);
      const el=document.elementFromPoint(xy[0],xy[1]);const value=!grab&&(shielded(xy[0],xy[1])||!el?.closest(".tableware"));
      if(value!==ignore){await invoke("set_ignore_cursor_events",{ignore:value});ignore=value;}
    }catch{}finally{cursorBusy=false;}
  },40);
  event?.listen("physics-sync",e=>sync(e.payload));
  event?.listen("widget-visibility",e=>{if(!e.payload)clear();});event?.listen("app-quit",()=>clear());
  window.addEventListener("beforeunload",()=>clear());
  window.WhalePhysics={sync,clear,bodies,simulate,head,face,atFace,shielded,layer,nativePointer};
})();
