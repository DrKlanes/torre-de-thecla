/* ============================================================
   EL HILO — la plomada que une los testimonios
   Una línea punteada a píxel que baja del silencio hacia el poso,
   con un nudo por signatura (matiz de su palo, en susurro) y un
   goteo lento que dice, sin decirlo, que abajo hay más.
   Sin dependencias. Decorativo: aria-hidden, pointer-events solo
   en los nudos (tooltip nativo con signatura y fecha).
   ============================================================ */
(function(){
"use strict";

var HUE = {A:222, B:200, C:245, D:265, X:190};
var cont, hilo, leido, plomada;
var nudos = [];
var timer = null;

function mapaRegistro(){
  var m = {};
  var r = window.__registro || [];
  for(var i=0; i<r.length; i++){
    if(r[i].signatura) m[r[i].signatura] = r[i];
  }
  return m;
}

function construir(){
  if(!cont || !hilo) return;
  for(var i=0; i<nudos.length; i++) nudos[i].remove();
  nudos = [];
  var reg = mapaRegistro();
  var contTop = cont.getBoundingClientRect().top + window.scrollY;
  var arts = cont.querySelectorAll("article.tx");
  for(var j=0; j<arts.length; j++){
    var art = arts[j];
    var sig = art.querySelector(".tx-sig");
    var mancha = art.querySelector(".tx-mancha");
    var ancla = sig || mancha;
    if(!ancla) continue;
    var r = ancla.getBoundingClientRect();
    var y = r.top + window.scrollY - contTop + r.height/2 - 3;
    var n = document.createElement("div");
    n.className = "hilo-nudo" + (mancha ? " torre" : "");
    if(sig){
      var firma = (sig.textContent || "").trim();
      var e = reg[firma];
      if(e && HUE[e.palo]){
        n.style.background = "hsl(" + HUE[e.palo] + ",22%,38%)";
      }
      var f = art.querySelector(".tx-fecha");
      n.title = firma + (f ? " · " + f.textContent : "");
    } else {
      n.title = "la torre";
    }
    n.style.top = Math.round(y) + "px";
    hilo.appendChild(n);
    nudos.push(n);
  }
}

function programar(){
  clearTimeout(timer);
  timer = setTimeout(construir, 150);
}

/* la plomada: tu profundidad de lectura; por encima, el hilo sedimenta */
function plomar(){
  if(!cont || !leido) return;
  var r = cont.getBoundingClientRect();
  if(r.height <= 0) return;
  var y = window.innerHeight * 0.5 - r.top;
  y = Math.max(0, Math.min(r.height, y));
  leido.style.height = Math.round(y) + "px";
  plomada.style.top = Math.round(y - 2) + "px";
  plomada.style.opacity = (y <= 0 || y >= r.height) ? "0" : "1";
}

function init(){
  cont = document.getElementById("transmisiones");
  hilo = document.getElementById("hilo");
  if(!cont || !hilo) return;
  leido = document.getElementById("hiloLeido");
  plomada = document.getElementById("hiloPlomada");

  new MutationObserver(programar).observe(cont, {childList:true});
  window.addEventListener("resize", programar, {passive:true});
  window.addEventListener("scroll", function(){ requestAnimationFrame(plomar); }, {passive:true});

  // el registro puede llegar después que los primeros lotes: reteñir entonces
  var esperas = 0;
  var esp = setInterval(function(){
    if(window.__registro || ++esperas > 40){ clearInterval(esp); construir(); }
  }, 250);

  construir();
  setTimeout(construir, 900);    // tras las fuentes
  setTimeout(construir, 3000);   // tras los primeros lotes lentos
  plomar();
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", init);
}else{
  init();
}
})();
