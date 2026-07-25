/* ============================================================
   EL POSO — el fondo del archivo
   Cada palabra de cada transmisión cae como un grano de sedimento.
   La arena reciente aún se mueve; con las noches petrifica en la
   roca de la torre. Determinista: PRNG sembrado por signatura,
   reconstruible desde registro.json. Sin dependencias.
   ============================================================ */
(function(){
"use strict";

/* ---------- parámetros (paleta v4.4 cerrada, 25 jul 2026) ---------- */
var W = 220;                 // ancho del mundo en celdas (FIJO: determinismo)
var MAXH = 9000;             // profundidad (~25 años de noches)
var PETRIFY = 60;            // noches hasta piedra
var STICK = 0.02;            // reposo irregular
var HUE = {A:222, B:200, C:245, D:265, X:190, T:213};
var PALABRAS_FALLBACK = 160; // por si una entrada vieja no trae "palabras"

/* ---------- PRNG determinista ---------- */
function hashStr(s){var h=1779033703^s.length;for(var i=0;i<s.length;i++){
  h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19;}return h>>>0;}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;
  var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;
  return((t^t>>>14)>>>0)/4294967296;};}
function hash2(x,y){var h=Math.imul(x,374761393)+Math.imul(y,668265263);
  h=Math.imul(h^h>>>13,1274126177);return((h^h>>>16)>>>0)/4294967296;}
function vnoise(x,y,sx,sy,seed){
  var gx=x/sx, gy=y/sy, x0=Math.floor(gx), y0=Math.floor(gy);
  var fx=gx-x0, fy=gy-y0, u=fx*fx*(3-2*fx), v=fy*fy*(3-2*fy);
  function n(a,b){return hash2(a*7+seed,b*13-seed);}
  return n(x0,y0)*(1-u)*(1-v)+n(x0+1,y0)*u*(1-v)
        +n(x0,y0+1)*(1-u)*v+n(x0+1,y0+1)*u*v;
}
function stoneField(x,y){
  return 0.62*vnoise(x,y,7.3,4.7,11)+0.38*vnoise(x,y,3.1,2.6,29);
}
var BAYER=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
function quant(v,st){return Math.round(v/st)*st;}
function hsl2rgb(h,s,l){
  s/=100;l/=100;
  var a=s*Math.min(l,1-l);
  function f(n){var k=(n+h/30)%12;
    return l-a*Math.max(-1,Math.min(k-3,Math.min(9-k,1)));}
  return [f(0)*255,f(8)*255,f(4)*255];
}

/* ---------- estado ---------- */
var grid, stained, tops, surfaceY, nights, lucidCells, hidden;
var dyn, active, dirtyCols, lastPtr;
var camY, simCount, flying, revelado=false, visible=false;
var cv, ctx, img, VISH=120, cellPx=3, tPulse=0;
var infoEl;

function idx(x,y){return y*W+x;}

function resetWorld(){
  grid=new Uint16Array(W*MAXH);
  stained=new Uint8Array(W*MAXH);
  tops=new Int32Array(W).fill(MAXH);
  surfaceY=MAXH; simCount=0;
  nights=[]; lucidCells=[]; hidden={};
  dyn=[]; active=new Set(); dirtyCols=new Set(); lastPtr=null;
  flying=[];
}

/* ---------- física ---------- */
function settleGrain(x0,rng){
  var x=Math.max(0,Math.min(W-1,x0));
  var y=tops[x]-1;
  if(y<0) return null;
  var guard=0;
  while(guard++<4000){
    while(y+1<MAXH && grid[idx(x,y+1)]===0) y++;
    if(rng()<STICK) break;
    var d1=rng()<0.5?-1:1, moved=false, d, nx, k;
    for(k=0;k<2;k++){
      d=k===0?d1:-d1; nx=x+d;
      if(nx<0||nx>=W) continue;
      if(y+1<MAXH && grid[idx(nx,y+1)]===0){x=nx;y=y+1;moved=true;break;}
    }
    if(!moved) break;
  }
  var guard2=0;
  while(guard2++<400){
    var e1=rng()<0.5?-1:1, m2=false, dd, tx, j;
    for(j=0;j<2;j++){
      dd=j===0?e1:-e1; tx=x+dd;
      if(tx<0||tx>=W) continue;
      var drop=(tops[tx]-1)-y;
      if(drop>=2 || (drop>=1 && rng()<0.5)){x=tx;y=tops[tx]-1;m2=true;break;}
    }
    if(!m2) break;
  }
  return {x:x,y:y};
}
function commitGrain(x,y,ni){
  grid[idx(x,y)]=ni+1;
  if(y<tops[x]) tops[x]=y;
  if(y<surfaceY) surfaceY=y;
}

/* ---------- depósito de una noche ---------- */
function depositNight(night, animar){
  var ni=nights.length;
  nights.push(night); simCount++;
  if(night.torre){ mancharTorre(ni); return; }
  var rng=mulberry32(hashStr(night.sig+"·poso"));
  var nFocos=2+Math.floor(rng()*2), focos=[], i;
  for(i=0;i<nFocos;i++) focos.push(8+rng()*(W-16));
  var placed=[];
  for(var g=0; g<night.words; g++){
    var foco=focos[g%nFocos];
    var spread=(rng()+rng()+rng()+rng()-2)*20;
    var p=settleGrain(Math.round(foco+spread), rng);
    if(!p) break;
    commitGrain(p.x,p.y,ni);
    placed.push(p);
    if(night.lucid && g===Math.floor(night.words/2))
      lucidCells.push({x:p.x,y:p.y,ni:ni});
  }
  if(animar) animateFall(placed, ni);
}

/* ---------- la mancha de la torre ---------- */
function mancharTorre(ni){
  var cx=0, x;
  for(x=0;x<W;x++) if(tops[x]<tops[cx]) cx=x;
  if(tops[cx]>=MAXH) return;
  var cy=tops[cx], DMAX=110, WTOP=9;
  for(var d=0;d<DMAX;d++){
    var t=d/DMAX, yy=cy+d;
    if(yy>=MAXH) break;
    var w=Math.max(1, WTOP*(1-t)*(0.7+0.6*vnoise(cx,d,9,5,ni)));
    var wob=Math.round((vnoise(d,ni,6,6,7)-0.5)*8*t);
    for(var dx=-Math.ceil(w);dx<=Math.ceil(w);dx++){
      var xx=cx+wob+dx;
      if(xx<0||xx>=W) continue;
      var k=idx(xx,yy);
      if(grid[k]===0) continue;
      var edge=Math.abs(dx)/(w+0.001);
      if(edge>0.6 && hash2(xx,yy)<(edge-0.6)*2) continue;
      var inten = edge<0.45?3 : edge<0.8?2:1;
      if(inten>stained[k]) stained[k]=inten;
    }
  }
}

/* ---------- render (paleta v4.4: la señal es la luz) ---------- */
function draw(){
  if(!ctx) return;
  var data=img.data;
  for(var ry=0; ry<VISH; ry++){
    var y=camY+ry;
    for(var x=0; x<W; x++){
      var k=idx(x,y), o=(ry*W+x)*4;
      var v=(y<MAXH)?grid[k]:0;
      if(v===0 || hidden[k]){
        data[o+3]=0;                                    // el fondo de la página respira detrás
        continue;
      }
      var ni=v-1, n=nights[ni];
      var age=simCount-1-ni;
      var hue=HUE[n.palo]||213;
      var j=hash2(x,y), j2=hash2(y+7,x+3);
      var s,l;
      if(n.senal==='clara'){ s=24+(j2-0.5)*8; l=48+(j-0.5)*8; }
      else if(n.senal==='turbia'){ s=18+(j2-0.5)*6; l=18+(j-0.5)*6; }
      else { s=22+(j2-0.5)*6; l=9+(j-0.5)*4; }
      l+=(hash2(ni*13+7,ni*29+3)-0.5)*6;               // cada noche, su gris
      l+=(vnoise(x,y,13.4,8.7,71)-0.5)*4;              // masas nubosas
      var esPiedra=age>PETRIFY;
      if(esPiedra){
        var f1=stoneField(x,y);
        l=l*0.45+13*0.55+(f1-0.5)*9;
        s*=0.35;
        l+=((x+y)%4===0)?4.2:-1.2;                     // rayado de muro
      }else{
        l+=Math.max(0,6-age)*0.8;                      // lo recién caído respira
      }
      if(y<=tops[x]+1) l+=13;                          // filo de luna
      l=esPiedra?quant(l+(BAYER[y&3][x&3]/15-0.5)*6,6)
                :quant(l+(BAYER[y&3][x&3]/15-0.5)*5,5);
      var c=hsl2rgb(hue,Math.max(4,s),Math.max(3,Math.min(92,l)));
      var st=stained[k];
      if(st>0){                                         // la mancha devora la luz
        var m=hsl2rgb(214,40,3.5), tt=st/3*0.88;
        c=[c[0]*(1-tt)+m[0]*tt, c[1]*(1-tt)+m[1]*tt, c[2]*(1-tt)+m[2]*tt];
      }
      data[o]=c[0];data[o+1]=c[1];data[o+2]=c[2];data[o+3]=255;
    }
  }
  // lucidez: el grano que recuerda irradia a los que lo rodean
  for(var li=0; li<lucidCells.length; li++){
    var lc=lucidCells[li];
    if(grid[idx(lc.x,lc.y)]===0) continue;
    var p=0.55+0.45*Math.sin(tPulse/34+lc.x);
    for(var dy2=-5;dy2<=5;dy2++)for(var dx2=-5;dx2<=5;dx2++){
      var d2=dx2*dx2+dy2*dy2;
      if(d2>25) continue;
      var gx=lc.x+dx2, gy=lc.y+dy2, gry=gy-camY;
      if(gx<0||gx>=W||gry<0||gry>=VISH) continue;
      var kk=idx(gx,gy);
      if(grid[kk]===0||hidden[kk]) continue;
      var oo=(gry*W+gx)*4;
      if(d2===0){
        var g=hsl2rgb(46,70,56+p*26);
        data[oo]=g[0];data[oo+1]=g[1];data[oo+2]=g[2];
      }else{
        var f=(1-Math.sqrt(d2)/5.2)*p*0.5;
        data[oo]=Math.min(255,data[oo]+150*f);
        data[oo+1]=Math.min(255,data[oo+1]+118*f);
        data[oo+2]=Math.min(255,data[oo+2]+58*f);
      }
    }
  }
  ctx.putImageData(img,0,0);
  var fi;
  for(fi=0;fi<flying.length;fi++){
    var fg=flying[fi];
    ctx.fillStyle=fg.color;
    ctx.fillRect(fg.x, Math.round(fg.cy)-camY, 1, 1);
  }
  for(fi=0;fi<dyn.length;fi++){
    var dp=dyn[fi];
    ctx.fillStyle=grainColor(nights[dp.ni]);
    ctx.fillRect(Math.round(dp.px), Math.round(dp.py)-camY, 1, 1);
  }
}
function grainColor(n){
  if(n.senal==='clara') return "hsl("+(HUE[n.palo]||213)+",24%,50%)";
  var l=n.senal==='turbia'?16:10;
  return "hsl("+(HUE[n.palo]||213)+",18%,"+l+"%)";
}

/* ---------- el ritual: la última noche cae ante el visitante ---------- */
function animateFall(placed, ni){
  var n=nights[ni], col=grainColor(n);
  for(var i=0;i<placed.length;i++){
    var p=placed[i], k=idx(p.x,p.y);
    hidden[k]=true;
    flying.push({x:p.x, cy:camY-4-(i*0.55)%30, ty:p.y,
                 vy:0.6+hash2(i,p.x)*0.5, k:k, color:col, delay:i*1.1});
  }
}

/* ---------- perturbación: solo la piel, a ritmo de sueño ---------- */
var rngP=mulberry32(hashStr('dedo'));
function activate(x,y){
  if(x<0||x>=W||y<0||y>=MAXH) return;
  if(grid[idx(x,y)]!==0) active.add(idx(x,y));
}
function takeLucid(x,y){
  for(var i=0;i<lucidCells.length;i++)
    if(lucidCells[i].x===x&&lucidCells[i].y===y){lucidCells.splice(i,1);return true;}
  return false;
}
function perturb(cx,cy,vx,vy,R,lift){
  R=R||4; lift=lift||0;                            // lift: lanzamiento hacia arriba (táctil)
  for(var dy=-R;dy<=R;dy++)for(var dx=-R;dx<=R;dx++){
    if(dx*dx+dy*dy>R*R) continue;
    var x=cx+dx,y=cy+dy;
    if(x<0||x>=W||y<0||y>=MAXH) continue;
    var k=idx(x,y), v=grid[k];
    if(v===0) continue;
    if(simCount-1-(v-1)>PETRIFY) continue;         // la piedra no se toca
    if(y-tops[x]>6) continue;                      // solo la piel
    if(dyn.length>420) break;
    grid[k]=0;
    dyn.push({px:x, py:y, ni:v-1, st:stained[k], lucid:takeLucid(x,y),
      vx:vx*0.8+(rngP()-0.5)*0.9+dx*(lift?0.22:0.08),
      vy:Math.max(-0.4,vy*0.6)+(rngP()-0.5)*0.3-lift*(0.7+rngP()*0.6)});
    stained[k]=0;
    activate(x,y-1); activate(x-1,y-1); activate(x+1,y-1);
    dirtyCols.add(x);
  }
}
function landDyn(p,x,y){
  x=Math.max(0,Math.min(W-1,x));
  y=Math.max(0,Math.min(MAXH-1,y));
  while(y>0 && grid[idx(x,y)]!==0) y--;
  var k=idx(x,y);
  grid[k]=p.ni+1; stained[k]=p.st;
  if(p.lucid) lucidCells.push({x:x,y:y,ni:p.ni});
  active.add(k); dirtyCols.add(x);
}
function tickDyn(){
  if(!dyn.length) return;
  for(var i=0;i<dyn.length;i++){
    var p=dyn[i];
    p.vy=Math.min(p.vy+0.045,1.1);
    p.vx=p.vx*0.96+(rngP()-0.5)*0.07;
    var steps=Math.max(1,Math.ceil(Math.max(Math.abs(p.vx),Math.abs(p.vy))));
    for(var s=0;s<steps;s++){
      var nx=p.px+p.vx/steps, ny=p.py+p.vy/steps;
      var gx=Math.max(0,Math.min(W-1,Math.round(nx)));
      var gy=Math.round(ny);
      if(gy>=MAXH || (gy>=0 && grid[idx(gx,gy)]!==0)){
        landDyn(p,Math.round(p.px),Math.round(p.py));
        p.done=true; break;
      }
      p.px=nx; p.py=ny;
    }
  }
  dyn=dyn.filter(function(p){return !p.done;});
}
function caStep(){
  if(!active.size) return;
  var cells=Array.from(active).sort(function(a,b){return b-a;});
  for(var i=0;i<cells.length;i++){
    var k=cells[i];
    if(rngP()<0.5) continue;                       // colapso perezoso
    active.delete(k);
    var v=grid[k];
    if(!v) continue;
    var x=k%W, y=(k-x)/W;
    if(simCount-1-(v-1)>PETRIFY) continue;
    var nx=x, ny=y, moved=false;
    if(y+1<MAXH && grid[idx(x,y+1)]===0){ ny=y+1; moved=true; }
    else{
      var d1=rngP()<0.5?-1:1;
      for(var j=0;j<2;j++){
        var tx=x+(j===0?d1:-d1);
        if(tx<0||tx>=W) continue;
        if(y+1<MAXH && grid[idx(tx,y+1)]===0){ nx=tx; ny=y+1; moved=true; break; }
      }
    }
    if(moved){
      var k2=idx(nx,ny);
      grid[k2]=v; grid[k]=0;
      stained[k2]=stained[k]; stained[k]=0;
      for(var li=0;li<lucidCells.length;li++)
        if(lucidCells[li].x===x&&lucidCells[li].y===y){lucidCells[li].x=nx;lucidCells[li].y=ny;break;}
      active.add(k2);
      activate(x,y-1); activate(x-1,y-1); activate(x+1,y-1);
      activate(x-1,y); activate(x+1,y);
      dirtyCols.add(x); dirtyCols.add(nx);
    }
  }
}
function refreshCols(){
  if(!dirtyCols.size) return;
  var from=Math.max(0,surfaceY-40);
  dirtyCols.forEach(function(x){
    var y=from;
    while(y<MAXH && grid[idx(x,y)]===0) y++;
    tops[x]=y;
  });
  dirtyCols.clear();
  var s=MAXH;
  for(var x=0;x<W;x++) if(tops[x]<s) s=tops[x];
  surfaceY=s;
}

/* ---------- cámara y lienzo ---------- */
function camMin(){ return Math.max(0, surfaceY-Math.floor(VISH*0.22)); }
function camMax(){ return MAXH-VISH; }
function medir(){
  // grano de tamaño fijo (4px), lecho acotado y centrado; en pantallas
  // estrechas el grano se comprime para caber
  var contW=cv.parentNode.clientWidth;
  cellPx=Math.min(4, contW/W);
  var targetH=Math.min(window.innerHeight*0.52, 560);
  VISH=Math.max(60,Math.min(400,Math.round(targetH/cellPx)));
  cv.width=W; cv.height=VISH;
  cv.style.width=(W*cellPx)+"px";
  cv.style.height=(VISH*cellPx)+"px";
  img=ctx.createImageData(W,VISH);
  if(camY===undefined||camY===null) camY=camMin();
  camY=Math.max(0,Math.min(camMax(),Math.max(camY,Math.min(camMin(),camMax()))));
  draw();
}

/* ---------- reconstrucción desde el registro ---------- */
function nochesDesdeRegistro(reg){
  var out=[];
  for(var i=0;i<reg.length;i++){
    var e=reg[i];
    if(e.carta==="TORRE"){
      out.push({sig:"la torre", torre:true, fecha:e.noche});
      continue;
    }
    if(!e.signatura) continue;                     // noche rota: no hay cuerpo que moler
    out.push({
      sig:e.signatura, palo:e.palo||"A", senal:e.senal||"abisal",
      words:e.palabras||PALABRAS_FALLBACK,
      fecha:e.noche, lucid:!!e.lucidez
    });
  }
  return out;
}
function construir(reg){
  resetWorld();
  var ns=nochesDesdeRegistro(reg);
  if(!ns.length) return false;
  for(var i=0;i<ns.length-1;i++) depositNight(ns[i], false);
  ultima=ns[ns.length-1];
  camY=camMin();
  return true;
}
var ultima=null;

/* ---------- info al pasar el dedo por el estrato ---------- */
function fechaBonita(iso){
  if(!iso) return "";
  var p=iso.split("-");
  return p.length===3 ? p[2]+"."+p[1]+"."+p[0] : iso;
}
function hoverInfo(cx,cy){
  if(cx<0||cx>=W||cy<0||cy>=MAXH){ infoEl.innerHTML="&nbsp;"; return; }
  var v=grid[idx(cx,cy)];
  if(v===0){ infoEl.innerHTML="&nbsp;"; return; }
  var n=nights[v-1];
  var age=simCount-1-(v-1);
  var mat=age>PETRIFY?"piedra":"arena";
  var st=stained[idx(cx,cy)]>0?" · manchado por la torre":"";
  infoEl.textContent=n.sig+" · palo "+n.palo+" · "+n.senal+" · "
    +fechaBonita(n.fecha)+" · "+n.words+" palabras · "+mat+st;
}

/* ---------- bucle ---------- */
var frame=0;
function tick(){
  requestAnimationFrame(tick);
  if(!visible) return;
  frame++; tPulse++;
  if(flying.length){
    for(var i=0;i<flying.length;i++){
      var f=flying[i];
      if(f.delay>0){f.delay-=1;continue;}
      f.vy=Math.min(f.vy+0.13,2.6);
      f.cy+=f.vy;
      if(f.cy>=f.ty){f.done=true;delete hidden[f.k];}
    }
    flying=flying.filter(function(f){return !f.done;});
  }
  tickDyn(); caStep(); refreshCols();
  if(flying.length||dyn.length||active.size) draw();
  else if(lucidCells.length && frame%3===0) draw();
}

/* ---------- interacción ---------- */
function celdaDe(ev){
  var r=cv.getBoundingClientRect();
  return {x:Math.floor((ev.clientX-r.left)/r.width*W),
          y:camY+Math.floor((ev.clientY-r.top)/r.height*VISH)};
}
function montarInteraccion(){
  var down=false;
  /* ---- táctil: tap = impacto · arrastre horizontal = remover ·
          mantener pulsado = leer el estrato (y deslizar para recorrerlo) ---- */
  var toque={activo:false,modo:null,cx:0,cy:0,px0:0,py0:0,timer:null};
  function finToque(ev,cancelado){
    if(!toque.activo) return;
    clearTimeout(toque.timer);
    // impacto solo si fue un tap real: corto, quieto y no robado por el scroll
    if(!cancelado && toque.modo==="pendiente"){
      var lejos = ev && ev.clientX!==undefined
        ? Math.abs(ev.clientX-toque.px0)+Math.abs(ev.clientY-toque.py0) : 0;
      if(lejos<14) perturb(toque.cx,toque.cy,0,0,7,1.15);
    }
    toque.activo=false; toque.modo=null;
  }
  cv.addEventListener("pointerdown",function(ev){
    if(ev.pointerType==="mouse"){
      if(ev.button!==0) return;
      down=true; lastPtr=null;
      var c=celdaDe(ev);
      perturb(c.x,c.y,0,0);
      lastPtr=c;
      return;
    }
    var ct=celdaDe(ev);
    toque.activo=true; toque.modo="pendiente";
    toque.cx=ct.x; toque.cy=ct.y;
    toque.px0=ev.clientX; toque.py0=ev.clientY;
    clearTimeout(toque.timer);
    toque.timer=setTimeout(function(){
      if(toque.activo && toque.modo==="pendiente"){
        toque.modo="leer";
        hoverInfo(toque.cx,toque.cy);
      }
    },400);
  });
  window.addEventListener("pointerup",function(ev){
    down=false; lastPtr=null;
    finToque(ev,false);
  });
  cv.addEventListener("pointercancel",function(){ finToque(null,true); });
  cv.addEventListener("pointermove",function(ev){
    var c=celdaDe(ev);
    if(ev.pointerType!=="mouse"){
      if(!toque.activo) return;
      var dxp=ev.clientX-toque.px0, dyp=ev.clientY-toque.py0;
      if(toque.modo==="pendiente" && Math.abs(dxp)>14 && Math.abs(dxp)>Math.abs(dyp)*1.2){
        toque.modo="remover"; clearTimeout(toque.timer);
      }
      if(toque.modo==="remover"){
        var tvx=Math.max(-3.5,Math.min(3.5,(c.x-toque.cx)*0.6));
        var tvy=Math.max(-2,Math.min(2,(c.y-toque.cy)*0.5));
        perturb(c.x,c.y,tvx,tvy,5,0.35);
      }else if(toque.modo==="leer"){
        hoverInfo(c.x,c.y);            // la aguja: deslizar leyendo capa a capa
      }
      toque.cx=c.x; toque.cy=c.y;
      return;
    }
    hoverInfo(c.x,c.y);
    if(!down) return;
    var vx=0,vy=0;
    if(lastPtr){
      vx=Math.max(-3,Math.min(3,(c.x-lastPtr.x)*0.45));
      vy=Math.max(-2,Math.min(3,(c.y-lastPtr.y)*0.45));
    }
    perturb(c.x,c.y,vx,vy);
    lastPtr=c;
  });
  cv.addEventListener("pointerleave",function(ev){
    if(ev.pointerType==="mouse") infoEl.innerHTML="&nbsp;";
  });
  // la rueda desciende por el corte; al tocar techo, devuelve el scroll a la página
  cv.addEventListener("wheel",function(ev){
    var paso=Math.sign(ev.deltaY)*8;
    if(paso>0 && camY<camMax()){ camY=Math.min(camMax(),camY+paso); ev.preventDefault(); draw(); }
    else if(paso<0 && camY>camMin()){ camY=Math.max(camMin(),camY+paso); ev.preventDefault(); draw(); }
  },{passive:false});
}

/* ---------- arranque ---------- */
function conRegistro(cb){
  if(window.__registro && window.__registro.length){ cb(window.__registro); return; }
  var intentos=0;
  var t=setInterval(function(){
    if(window.__registro && window.__registro.length){ clearInterval(t); cb(window.__registro); return; }
    if(++intentos>40){                              // el poso no depende de nadie
      clearInterval(t);
      fetch("registro.json?v="+Date.now())
        .then(function(r){return r.json();})
        .then(cb)
        .catch(function(){});
    }
  },250);
}

function iniciar(){
  var sec=document.getElementById("poso");
  if(!sec) return;
  cv=document.getElementById("posoCv");
  infoEl=document.getElementById("posoInfo");
  ctx=cv.getContext("2d");
  conRegistro(function(reg){
    if(!construir(reg)){ sec.hidden=true; return; }
    medir();
    montarInteraccion();
    // el ritual: la última noche cae cuando el visitante llega al fondo
    var obs=new IntersectionObserver(function(es){
      es.forEach(function(en){
        visible=en.isIntersecting;
        if(en.isIntersecting && !revelado){
          revelado=true;
          if(ultima) depositNight(ultima, !ultima.torre);
          draw();
        }
      });
    },{threshold:0.25});
    obs.observe(sec);
    window.addEventListener("resize",function(){clearTimeout(medir._t);medir._t=setTimeout(medir,300);},{passive:true});
    tick();
  });
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",iniciar);
}else{
  iniciar();
}
})();
