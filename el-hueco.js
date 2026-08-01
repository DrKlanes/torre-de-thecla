/* ============================================================
   EL HUECO — la torre ofrece sitio          (EL VISITANTE ENGULLIDO, fase 2)
   ------------------------------------------------------------
   Aparece UNA vez, cuando el visitante termina de leer el segundo testimonio,
   y solo si hoy cae dentro de una ventana del calendario. No lleva boton de
   cerrar a proposito: se va con Escape o pulsando fuera, y entonces el
   navegador lo recuerda hasta que esa ventana termine.

   FUERA DE VENTANA NO HAY ESPEJO (decision suya, 30 jul): la torre es aspera
   y esquiva, no un cozy-game. La fecha la pone el reloj del visitante, asi que
   esto es PRESENTACION, no seguridad — el buzon valida por su cuenta (fase 3).

   ?ensayo  fuerza abierto  ·  ?tapia  fuerza cerrado   (herramientas de autor)
   Va aparte, como el hilo y el poso: no toca una linea del motor del archivo.
   ============================================================ */
(function(){
  "use strict";

  var caja = document.getElementById("hueco");
  var paso = document.getElementById("huecoPaso");
  var dentro = caja.querySelector(".hueco-caja");
  if(!caja || !paso || !dentro) return;

  var FORZAR = location.search.indexOf("ensayo") >= 0 ? "abre"
             : location.search.indexOf("tapia")  >= 0 ? "cierra" : null;

  var LLAVE = "thecla.hueco.";
  var ventana = null, abierto = false, focoPrevio = null, obs = null;

  function hoyISO(){
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
           + "-" + String(d.getDate()).padStart(2, "0");
  }
  function ventanaDeHoy(cal){
    var hoy = hoyISO(), v = (cal && cal.ventanas) || [];
    for(var i = 0; i < v.length; i++){
      if(hoy >= v[i].abre && hoy <= v[i].cierra) return v[i];
    }
    return null;
  }
  /* el navegador recuerda que lo dejo pasar, y solo durante ESTA ventana:
     la llave lleva la fecha de apertura, asi que la siguiente vuelve a ofrecer */
  function dejadoPasar(v){
    try { return localStorage.getItem(LLAVE + v) === "1"; } catch(e){ return false; }
  }
  function recordar(v){
    try { localStorage.setItem(LLAVE + v, "1"); } catch(e){}
  }
  function olvidar(v){
    try { localStorage.removeItem(LLAVE + v); } catch(e){}
  }

  /* ---- LA TORRE: el pixel art del autor, si existe ----
     No se impone ningun lienzo: se lee el que tenga el PNG y se busca el mayor
     zoom ENTERO que cabe, midiendo — igual que calibrar() en el zaguan, y por
     el mismo motivo (un factor fraccionario parte unos pixeles en 3 y otros en
     4). Si no cabe ni a 1, no se ensena: antes que una torre encogida, ninguna.
     Y si el archivo no esta, el hueco se ve exactamente igual que sin ella. */
  var torre = document.getElementById("huecoTorre");

  function calibrarTorre(){
    if(!torre) return;
    /* el archivo se pide la primera vez que el hueco se abre, no antes */
    if(!torre.src && torre.dataset.src){ torre.src = torre.dataset.src; return; }
    if(!torre.naturalWidth) return;
    var W = torre.naturalWidth, H = torre.naturalHeight;
    caja.style.setProperty("--torre-w", W);
    caja.style.setProperty("--torre-h", H);
    torre.hidden = false;
    torre.style.setProperty("--zoom-torre", 1);
    /* el sitio que queda es el alto libre CON la torre a zoom 1 ya contada */
    var pad = parseFloat(getComputedStyle(caja).paddingTop)
            + parseFloat(getComputedStyle(caja).paddingBottom);
    var otros = dentro.getBoundingClientRect().height - H;
    var alto  = window.innerHeight - pad - otros;
    var ancho = dentro.getBoundingClientRect().width;
    var k = Math.min(Math.floor(ancho / W), Math.floor(alto / H));
    if(k < 1){ torre.hidden = true; return; }
    torre.style.setProperty("--zoom-torre", Math.min(k, 8));
  }

  if(torre){
    torre.addEventListener("error", function(){ torre.hidden = true; });
    torre.addEventListener("load", function(){ if(abierto) calibrarTorre(); });
    var reZoom = null;
    window.addEventListener("resize", function(){
      clearTimeout(reZoom);
      reZoom = setTimeout(function(){ if(abierto) calibrarTorre(); }, 150);
    });
  }

  function frenar(ev){ ev.preventDefault(); }

  function tecla(ev){
    if(ev.key === "Escape"){ cerrar(); return; }
    /* un solo elemento pulsable: el tabulador no tiene donde ir */
    if(ev.key === "Tab"){ ev.preventDefault(); paso.focus(); return; }
    /* mientras el hueco esta delante, los atajos del archivo callan — la G
       del plano escucha en window y se dispararia por detras */
    ev.stopImmediatePropagation();
  }

  function fuera(ev){ if(ev.target === caja) cerrar(); }

  function abrir(){
    if(abierto) return;
    abierto = true;
    focoPrevio = document.activeElement;
    caja.hidden = false;
    calibrarTorre();
    /* dos cuadros: el navegador tiene que registrar el display antes de que
       la transicion de opacidad tenga de donde salir */
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){ caja.classList.add("visible"); });
    });
    /* el foco entra en la caja, no en el paso: el anillo del navegador
       pintaba un recuadro que miente sobre lo que hace el control */
    dentro.focus();
    document.addEventListener("keydown", tecla, true);
    caja.addEventListener("click", fuera);
    caja.addEventListener("wheel", frenar, {passive:false});
    caja.addEventListener("touchmove", frenar, {passive:false});
  }

  function cerrar(){
    if(!abierto) return;
    abierto = false;
    if(ventana && ventana.abre) recordar(ventana.abre);
    caja.classList.remove("visible");
    document.removeEventListener("keydown", tecla, true);
    caja.removeEventListener("click", fuera);
    caja.removeEventListener("wheel", frenar);
    caja.removeEventListener("touchmove", frenar);
    setTimeout(function(){ if(!abierto) caja.hidden = true; }, 1600);
    if(focoPrevio && focoPrevio.focus) focoPrevio.focus();
  }

  /* ---- el disparo: haber TERMINADO de leer el testimonio numero N ----
     El estrato que cierra ese testimonio, entero en pantalla. El archivo
     pinta el mas reciente arriba, asi que el segundo es el de anteanoche. */
  function armar(n){
    var cont = document.getElementById("transmisiones");
    if(!cont) return;
    var mo = new MutationObserver(intentar);
    mo.observe(cont, {childList:true});
    intentar();

    function intentar(){
      var arts = cont.querySelectorAll(".tx");
      if(arts.length < n) return;
      var meta = arts[n - 1].nextElementSibling;
      while(meta && !meta.classList.contains("estrato")) meta = meta.nextElementSibling;
      if(!meta) return;
      mo.disconnect();
      obs = new IntersectionObserver(function(entradas){
        entradas.forEach(function(e){
          if(e.isIntersecting){ obs.disconnect(); abrir(); }
        });
      }, {threshold: 1});
      obs.observe(meta);
    }
  }

  fetch("calendario.json?v=" + Date.now())
    .then(function(r){ return r.json(); })
    .then(function(cal){
      var v = FORZAR === "abre"   ? {abre: hoyISO(), noche: "ensayo"}
            : FORZAR === "cierra" ? null
            : ventanaDeHoy(cal);
      if(!v) return;                    /* fuera de ventana no hay espejo */
      /* ?ensayo es herramienta de autor: cada carga empieza con la pizarra
         limpia. Dentro de esa carga el comportamiento es el real —si lo cierras
         y vuelves a bajar, no reaparece—, pero recargar vuelve a ofrecerlo.
         Sin esto, probarlo una vez lo dejaba mudo para siempre. */
      if(FORZAR === "abre") olvidar(v.abre);
      if(dejadoPasar(v.abre)) return;   /* ya lo dejo pasar en esta ventana */
      ventana = v;
      var n = parseInt(cal && cal.trasTestimonios, 10);
      armar(n > 0 ? n : 2);
    })
    .catch(function(){ /* sin calendario, la torre no ofrece nada */ });
})();
