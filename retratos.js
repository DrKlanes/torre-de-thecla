/* ==========================================================
   LOS RETRATOS — el censo de la torre, pintado
   ----------------------------------------------------------
   El arte es del autor, dibujado a mano, pieza a pieza.
   Este script solo hace lo que la torre hace: componer el
   expediente (censo.json), virar la brasa al tono de la voz,
   y dejar que la señal de cada noche decida cuánto de la cara
   llega. Nada aquí inventa un solo píxel.

   Se engancha solo, como el hilo: un <script> y a esperar.
   - archivo (index.html): retrato bajo el testimonio, si llegó.
     La última noche se revela por líneas, como se revela el texto.
   - plano maestro: retrato arriba de la ficha, ya revelado.
   Datos: window.__registro (ya lo cargan ambas páginas),
   censo.json (el censo de rostros) y partes.png (el atlas:
   columna 0=F, 1=M, 2=B, filas = variantes).
   ========================================================== */
(function(){
"use strict";

var W = 44, H = 64;

/* ---- doctrina (espejo de escribano.py y del laboratorio) ---- */
var RAMPA = ["04070d","070a13","0b111e","111827","1e2638","30384b","4c5467","606d8a","919cb6","c2c8d6"];
var BRASA_1 = "dfbc49", BRASA_2 = "f4d87b";
var LUZ = {                              // brasa 1 y 2 viradas al tono del palo
  A: ["5c7ecc","8ba6e4"],
  B: ["5ca7cc","8bc6e4"],
  C: ["665ccc","938be4"],
  D: ["8b5ccc","b08be4"],
  X: ["5cb9cc","8bd5e4"]
};
var NITIDEZ = {abisal:-1, turbia:0, clara:1};   // la señal, en pasos de rampa
var CON_ROSTRO = {A:1, B:1};                    // solo quien tiene un quién
var UMBRAL = 6;                                 // el + solo mueve los planos con luz
var VELO = {fuerza:1.5, inicio:0.20};           // ley fija: sombra hacia la derecha
var BAYER4 = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];

function hx(h){ return [parseInt(h.substr(0,2),16), parseInt(h.substr(2,2),16), parseInt(h.substr(4,2),16)]; }
var RAMPA_RGB = RAMPA.map(hx);
var IDX = {};
RAMPA_RGB.forEach(function(c,i){ IDX[(c[0]<<16)|(c[1]<<8)|c[2]] = i; });
var B1 = hx(BRASA_1), B2 = hx(BRASA_2);
var K1 = (B1[0]<<16)|(B1[1]<<8)|B1[2], K2 = (B2[0]<<16)|(B2[1]<<8)|B2[2];
var LUZ_RGB = {}; for(var p in LUZ) LUZ_RGB[p] = LUZ[p].map(hx);

var quieto = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- el velo: siempre hacia la derecha, el cuarto de la brasa limpio ---- */
function velo(x, y){
  var g = (x/(W-1) - VELO.inicio) / (1 - VELO.inicio);
  if(g <= 0) return 0;
  var t = g * VELO.fuerza, base = Math.floor(t), frac = t - base;
  var b = (BAYER4[(y&3)*4 + (x&3)] + 0.5) / 16;
  return -(base + (b < frac ? 1 : 0));
}

/* ---- pintar un expediente: exp {f,m,b,v} + palo + señal de la noche ---- */
function pintar(atlas, exp, palo, senal){
  var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  var cx = cv.getContext("2d", {willReadFrequently:true});
  cx.imageSmoothingEnabled = false;
  [[2, exp.b], [1, exp.m], [0, exp.f]].forEach(function(par){   // B -> M -> F
    cx.drawImage(atlas, par[0]*W, par[1]*H, W, H, 0, 0, W, H);
  });
  var id = cx.getImageData(0, 0, W, H), d = id.data;
  var v = Math.max(-2, Math.min(2, (exp.v||0) + (NITIDEZ[senal]||0)));
  var luz = LUZ_RGB[palo] || LUZ_RGB.A;
  for(var y = 0; y < H; y++){
    for(var x = 0; x < W; x++){
      var o = (y*W + x) * 4;
      if(!d[o+3]) continue;
      var k = (d[o]<<16)|(d[o+1]<<8)|d[o+2];
      if(k === K1 || k === K2){                       // la luz de la voz — intocable
        var L = luz[k === K1 ? 0 : 1];
        d[o] = L[0]; d[o+1] = L[1]; d[o+2] = L[2];
        continue;
      }
      var i = IDX[k];
      if(i === undefined) continue;                   // fuera de rampa: se respeta
      var t = v + velo(x, y);
      if(t > 0 && i < UMBRAL) t = 0;                  // el ancla oscura no se despega
      var j = i + t; if(j < 0) j = 0; if(j > 9) j = 9;
      var C = RAMPA_RGB[j];
      d[o] = C[0]; d[o+1] = C[1]; d[o+2] = C[2];
    }
  }
  return id;
}

/* ---- montar un retrato en el DOM ---- */
function montar(atlas, exp, entrada, clase){
  var caja = document.createElement("div");
  caja.className = clase;
  var cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  caja.appendChild(cv);

  var base = pintar(atlas, exp, entrada.palo, entrada.senal);
  var cx = cv.getContext("2d");
  cx.imageSmoothingEnabled = false;

  /* base = la imagen pura; id = la imagen con el sedimento de ESTE momento.
     El tinte solo toca pixeles con carne (alfa > 0): el vacio sigue siendo vacio. */
  var estado = {base:base, id:base, t:0, sed:null, cv:cv, cx:cx, vivo:true, revelado:false};
  caja.__retrato = estado;
  return caja;
}

function volcar(e){ e.cx.putImageData(e.id, 0, 0); }

/* ---- el sedimento: lo leido se hunde en azul — SOLO la carne, jamas el vacio ---- */
var _probe = null;
function colorSedimento(){
  if(!_probe){
    _probe = document.createElement("i");
    _probe.style.cssText = "position:absolute;visibility:hidden;color:var(--sedimento,#5a76b4)";
    document.body.appendChild(_probe);
  }
  var m = getComputedStyle(_probe).color.match(/(\d+)[, ]+(\d+)[, ]+(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : [90, 118, 180];
}
/* hundirse es bajar: el sedimento MULTIPLICA (tiñe y oscurece), nunca aclara */
function mezcla(c, sed, t){
  var m0 = c[0]*sed[0]/255, m1 = c[1]*sed[1]/255, m2 = c[2]*sed[2]/255;
  return [Math.round(c[0] + (m0-c[0])*t),
          Math.round(c[1] + (m1-c[1])*t),
          Math.round(c[2] + (m2-c[2])*t)];
}
function tintar(e){
  if(e.t <= 0.01 || !e.sed){ e.id = e.base; return; }
  var id2 = new ImageData(new Uint8ClampedArray(e.base.data), W, H);
  var d = id2.data, t = e.t;
  for(var o = 0; o < d.length; o += 4){
    if(!d[o+3]) continue;                              // el vacio no se sedimenta
    var c = mezcla([d[o], d[o+1], d[o+2]], e.sed, t);  // multiplicar: tinte que oscurece
    d[o] = c[0]; d[o+1] = c[1]; d[o+2] = c[2];
  }
  e.id = id2;
}

/* ---- la revelación por líneas: la imagen llega como llega el texto ---- */
function revelar(e, dur){
  if(quieto){ volcar(e); e.revelado = true; return; }
  var t0 = null;
  function paso(t){
    if(!t0) t0 = t;
    var fr = Math.min(1, (t - t0) / dur);
    var filas = Math.round(fr * H);
    e.cx.clearRect(0, 0, W, H);
    if(filas > 0){
      // lo ya recibido, firme
      e.cx.putImageData(e.id, 0, 0, 0, 0, W, Math.max(1, filas - 2));
      // la línea que está entrando tiembla un píxel y se asienta
      if(filas < H){
        var tempCv = revelar._tmp || (revelar._tmp = document.createElement("canvas"));
        tempCv.width = W; tempCv.height = H;
        var tc = tempCv.getContext("2d");
        tc.putImageData(e.id, 0, 0);
        var jit = (Math.random() < 0.5 ? -1 : 1);
        e.cx.drawImage(tempCv, 0, Math.max(0, filas - 2), W, 2, jit, Math.max(0, filas - 2), W, 2);
      }
    }
    if(fr < 1){ requestAnimationFrame(paso); }
    else { volcar(e); e.revelado = true; }
  }
  requestAnimationFrame(paso);
}

/* ---- el titilar: la señal nunca está del todo sujeta ---- */
function titilar(e){
  if(quieto) return;
  function chispas(){
    if(!e.vivo) return;
    setTimeout(function(){
      if(!e.vivo || !e.revelado || document.hidden){ chispas(); return; }
      var id2 = new ImageData(new Uint8ClampedArray(e.id.data), W, H);
      var d = id2.data, db = e.base.data, n = 3 + Math.floor(Math.random()*5);
      for(var k = 0; k < n; k++){
        var x = Math.floor(W*VELO.inicio + Math.random()*W*(1-VELO.inicio));
        var y = Math.floor(Math.random()*H);
        var o = (y*W + x)*4;
        if(!db[o+3]) continue;
        var i = IDX[(db[o]<<16)|(db[o+1]<<8)|db[o+2]]; // el indice, de la imagen pura
        if(i === undefined) continue;                  // la luz no titila
        var j = Math.max(0, Math.min(9, i + (Math.random() < 0.5 ? -1 : 1)));
        var C = (e.t > 0.01 && e.sed) ? mezcla(RAMPA_RGB[j], e.sed, e.t) : RAMPA_RGB[j];
        d[o] = C[0]; d[o+1] = C[1]; d[o+2] = C[2];
      }
      e.cx.putImageData(id2, 0, 0);
      setTimeout(function(){ if(e.vivo && e.revelado) volcar(e); }, 60 + Math.random()*60);
      chispas();
    }, 2000 + Math.random()*2000);
  }
  function cinta(){
    if(!e.vivo) return;
    setTimeout(function(){
      if(!e.vivo || !e.revelado || document.hidden){ cinta(); return; }
      var y0 = Math.floor(Math.random()*(H-4)), alto = 2 + Math.floor(Math.random()*3);
      var tempCv = titilar._tmp || (titilar._tmp = document.createElement("canvas"));
      tempCv.width = W; tempCv.height = H;
      tempCv.getContext("2d").putImageData(e.id, 0, 0);
      e.cx.clearRect(0, y0, W, alto);
      e.cx.drawImage(tempCv, 0, y0, W, alto, (Math.random()<0.5?-1:1), y0, W, alto);
      setTimeout(function(){ if(e.vivo && e.revelado) volcar(e); }, 70 + Math.random()*50);
      cinta();
    }, 15000 + Math.random()*10000);
  }
  chispas(); cinta();
}

/* ---- estilos (una sola inyección, como hace el hilo) ---- */
function estilos(){
  var css = [
    ".retrato-noche{position:relative;width:220px;margin:3rem auto 0;}",
    ".retrato-noche canvas,.retrato-ficha canvas{width:100%;display:block;",
    "  image-rendering:pixelated;image-rendering:crisp-edges;}",
    ".retrato-ficha{position:relative;width:176px;margin:0 0 1.6rem;}",
    "@media (max-width:600px){.retrato-noche{width:176px}}"
  ].join("\n");
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);
}

/* ---- datos: el registro ya viaja en __registro; el censo se pide una vez ---- */
function conDatos(cb){
  var censo = null, reg = null, esperas = 0;
  fetch("censo.json?v=" + Date.now())
    .then(function(r){ return r.ok ? r.json() : {}; })
    .then(function(c){ censo = c; listo(); })
    .catch(function(){ censo = {}; listo(); });
  var t = setInterval(function(){
    if(window.__registro || ++esperas > 60){ clearInterval(t); reg = window.__registro || []; listo(); }
  }, 250);
  function listo(){ if(censo !== null && reg !== null) cb(censo, reg); }
}

function porSignatura(reg){
  var m = {};
  reg.forEach(function(e){ if(e.signatura) m[e.signatura] = e; });
  return m;
}

/* ---- ¿esta noche tiene rostro? la frontera se comprueba también aquí ---- */
function rostroDe(entrada, censo){
  if(!entrada || !entrada.retrato) return null;
  if(!CON_ROSTRO[entrada.palo]) return null;
  return censo[entrada.carta] || null;
}

/* ============================================================
   EL ARCHIVO — bajo cada testimonio, antes del estrato
   ============================================================ */
function archivo(atlas, censo, reg){
  var mapa = porSignatura(reg);
  var cont = document.getElementById("transmisiones");
  if(!cont) return;

  function vestir(art){
    if(art.__conRetrato) return;
    art.__conRetrato = true;
    var sigEl = art.querySelector(".tx-sig");
    if(!sigEl) return;                                 // la torre no se ve a sí misma
    var entrada = mapa[sigEl.textContent.trim()];
    var exp = rostroDe(entrada, censo);
    if(!exp) return;                                   // la cara no llegó, o no hay quién

    var caja = montar(atlas, exp, entrada, "retrato-noche");
    art.appendChild(caja);
    var e = caja.__retrato;
    var reciente = art.classList.contains("reciente");

    // se revela al entrar en pantalla; la última noche, despacio y temblando
    var io = new IntersectionObserver(function(ens){
      ens.forEach(function(en){
        if(!en.isIntersecting || e.revelado) return;
        io.unobserve(caja);
        revelar(e, reciente ? 1400 : 500);
        titilar(e);
      });
    }, {rootMargin: "60px"});
    io.observe(caja);
  }

  // los que ya están, y los que vengan
  cont.querySelectorAll("article.tx").forEach(vestir);
  new MutationObserver(function(ms){
    ms.forEach(function(m){
      [].forEach.call(m.addedNodes, function(n){
        if(n.nodeType === 1 && n.matches && n.matches("article.tx")) vestir(n);
      });
    });
  }).observe(cont, {childList:true});

  // el retrato se hunde en el sedimento con su testimonio (misma ley que el texto,
  // pero pintada dentro del canvas: el tinte solo alcanza la carne, nunca el vacio)
  function sedimento(){
    var vh = window.innerHeight, movil = window.innerWidth < 700;
    var foco = vh * (movil ? 0.62 : 0.52), tope = vh * 0.06;
    document.querySelectorAll(".retrato-noche").forEach(function(caja){
      var e = caja.__retrato;
      if(!e || !e.revelado) return;
      var r = caja.getBoundingClientRect();
      if(r.top > vh * 1.5 || r.bottom < -vh) return;
      var t = (foco - r.bottom) / (foco - tope);
      t = Math.max(0, Math.min(1, t)) * 0.85;
      if(Math.abs(t - e.t) < 0.02) return;             // sin cambio: ni un repintado
      e.t = t; e.sed = colorSedimento();
      tintar(e); volcar(e);
    });
  }
  window.addEventListener("scroll", function(){ requestAnimationFrame(sedimento); }, {passive:true});
}

/* ============================================================
   EL PLANO MAESTRO — la foto del expediente, arriba de la ficha
   ============================================================ */
function ficha(atlas, censo, reg){
  var cuerpo = document.getElementById("fichaCuerpo");
  if(!cuerpo) return;
  var mapa = porSignatura(reg);

  new MutationObserver(function(){
    if(cuerpo.querySelector(".retrato-ficha")) return;
    var sigEl = cuerpo.querySelector(".f-sig");
    if(!sigEl) return;
    var entrada = mapa[sigEl.textContent.trim()];
    var exp = rostroDe(entrada, censo);
    if(!exp) return;
    var caja = montar(atlas, exp, entrada, "retrato-ficha");
    var fecha = cuerpo.querySelector(".f-fecha");
    (fecha || sigEl).insertAdjacentElement("afterend", caja);
    var e = caja.__retrato;
    volcar(e); e.revelado = true;                      // la ficha no transmite: archiva
    titilar(e);
  }).observe(cuerpo, {childList:true});
}

/* gancho de autor, como la tecla G de los planos: desde la consola,
   __retratos.revelar(document.querySelector(".retrato-noche")) re-emite. */
window.__retratos = {
  revelar: function(caja, dur){
    var e = caja && caja.__retrato;
    if(!e) return false;
    e.revelado = false;
    revelar(e, dur || 1400);
    return true;
  }
};

/* ---- arranque ---- */
function arrancar(){
  estilos();
  var atlas = new Image();
  atlas.onload = function(){
    conDatos(function(censo, reg){
      archivo(atlas, censo, reg);
      ficha(atlas, censo, reg);
    });
  };
  atlas.src = "partes.png?v=2";
}
if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", arrancar);
} else {
  arrancar();
}

})();
