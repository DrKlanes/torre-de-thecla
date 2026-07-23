/* ==========================================================
   LA SEÑAL — dungeon synth procedural de la Torre de Thecla · v4
   Mismo código para render offline (WAV) y para la web.
   Determinista: misma semilla, misma pieza, nota a nota.
   v3: paleta de instrumentos, fondos variados, percusión rústica,
       texturas (lluvia, hoguera, pasos, crujido de cinta).
   v4: planificación por ventana (los nodos se crean segundos antes
       de sonar, no todos de golpe), reloj con desplazamiento T para
       reutilizar el mismo AudioContext, reverb corta en móvil,
       y todo drone muere al final del tramo. La composición entera
       (todos los dados) se resuelve al principio: el determinismo
       no cambia, solo cuándo nacen los nodos.
   ========================================================== */
(function(global){
"use strict";

function fnv(s){
  var h = 2166136261;
  for(var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var LA = 438.6;                      // el diapasón enfermo: firma del universo
function hz(midi){ return LA * Math.pow(2, (midi - 69) / 12); }

var MODOS = {
  eolio:    [0,2,3,5,7,8,10],
  frigio:   [0,1,3,5,7,8,10],
  dorico:   [0,2,3,5,7,9,10],
  armonica: [0,2,3,5,7,8,11]
};

/* ---------- la piedra: respuesta de impulso procedural ---------- */
function impulsoPiedra(ctx, R, segundos, oscuro){
  var sr = ctx.sampleRate, n = Math.floor(sr * segundos);
  var buf = ctx.createBuffer(2, n, sr);
  for(var c = 0; c < 2; c++){
    var d = buf.getChannelData(c);
    var lp = 0, coefBase = oscuro ? 0.22 : 0.35;
    for(var i = 0; i < n; i++){
      var t = i / n;
      var dec = Math.pow(1 - t, 2.6);
      var coef = coefBase * (1 - t * 0.8);
      lp = lp + coef * ((R() * 2 - 1) - lp);
      d[i] = lp * dec;
      if(i % 8000 < 40 && t < 0.35) d[i] *= 2.2;
    }
  }
  return buf;
}

function bufferRuido(ctx, R, segundos, coef){
  var sr = ctx.sampleRate, n = Math.floor(sr * segundos);
  var buf = ctx.createBuffer(1, n, sr);
  var d = buf.getChannelData(0), lp = 0, k = coef || 0.12;
  for(var i = 0; i < n; i++){ lp = lp + k * ((R() * 2 - 1) - lp); d[i] = lp * (1 / Math.sqrt(k)) * 0.55; }
  return buf;
}

/* ---------- la partitura ---------- */
function componer(semilla, caracter){
  var R = mulberry32(fnv(semilla));
  var modoNombre = ["eolio","eolio","frigio","dorico","armonica"][Math.floor(R()*5)];
  var modo = MODOS[modoNombre];
  var raiz = 38 + Math.floor(R() * 8);
  var pulso = 60 / (56 + Math.floor(R() * 16));

  var cantabilidad = 0.25 + R() * 0.65;
  function nota(d){ return raiz + 24 + modo[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7); }
  var ESTABLES = [0, 2, 4, 7];

  function frase(cadencia){
    var n = 5 + Math.floor(R() * 4);
    var cima = Math.floor(n * (0.55 + R() * 0.2));
    var d = ESTABLES[Math.floor(R() * 3)];
    var grados = [];
    for(var i = 0; i < n; i++){
      grados.push(d);
      if(i < cima){ d += (R() < 0.22 ? 2 : 1) * (R() < 0.85 ? 1 : -1); }
      else { d -= (R() < 0.25 ? 2 : 1); }
      d = Math.max(-1, Math.min(11, d));
    }
    grados[n - 1] = cadencia;
    var durs = [];
    for(var j = 0; j < n - 1; j++){ durs.push(R() < 0.6 ? 2 : (R() < 0.5 ? 1 : 3)); }
    durs.push(4 + Math.floor(R() * 3));
    return grados.map(function(gr, k){ return {g: gr, d: durs[k]}; });
  }

  var A = frase(0);
  var Ap = A.map(function(x){ return {g: x.g, d: x.d}; });
  Ap[Ap.length - 1].g = (R() < 0.5 ? 4 : 2);
  var B = frase(4).map(function(x){ return {g: x.g + 2, d: x.d}; });
  var tema = A.concat(Ap, B, A);
  if(R() < 0.3){
    var idx = 1 + Math.floor(R() * (A.length - 2));
    tema[tema.length - A.length + idx] = {g: null, tritono: true, d: 2};
  }
  var mutacion = 0.2 + (1 - cantabilidad) * 0.35;

  var progres = [[0,2,4],[5,0,2],[3,5,0],[4,6,1]];
  var nAc = 3 + Math.floor(R() * 2);
  var acordes = [];
  for(var a = 0; a < nAc; a++){
    var g = progres[Math.floor(R() * progres.length)];
    acordes.push(g.map(function(x){ return raiz + 12 + modo[x % 7] + (x > 6 ? 12 : 0); }));
  }

  // ---- la orquestación de la noche ----
  function eligeP(opciones){ // [[nombre, peso], ...]
    var total = 0, i;
    for(i = 0; i < opciones.length; i++) total += opciones[i][1];
    var x = R() * total;
    for(i = 0; i < opciones.length; i++){ x -= opciones[i][1]; if(x <= 0) return opciones[i][0]; }
    return opciones[0][0];
  }
  var instrumento = eligeP([["campana",22],["flauta",16],["cuerdas",18],["organo",12],["piano",14],["clavecin",8],["corno",10]]);
  var fondo = eligeP([["sierra",40],["pad",32],["pedal",28]]);
  var textura = eligeP([["viento",34],["lluvia",22],["hoguera",22],["crujido",22]]);
  var percusion = eligeP([["nada",52],["timbal",26],["yunque",12],["caja",10]]);
  var pasos = R() < 0.25;

  return {
    R: R, semilla: semilla, caracter: caracter || "tragado",
    modo: modoNombre, raiz: raiz, pulso: pulso,
    tema: tema, nota: nota, cantabilidad: cantabilidad, mutacion: mutacion,
    acordes: acordes,
    instrumento: instrumento, fondo: fondo, textura: textura,
    percusion: percusion, pasos: pasos,
    durCoro: (31 + R() * 26),
    durDrone: (23 + R() * 20),
    boomCada: 26 + R() * 44
  };
}

/* ---------- ejecución ---------- */
function tocar(ctx, destino, semilla, caracter, dur){
  var P = componer(semilla, caracter);
  var R = P.R;
  var C = {
    tragado:   {fondo:.50, sub:.34, mel:.42, coro:.20, tex:.10, boom:.55, perc:.5, lp:4200, warble:6, irOsc:false},
    presencia: {fondo:.55, sub:.40, mel:.10, coro:.30, tex:.16, boom:.55, perc:.3, lp:2900, warble:9, irOsc:true},
    clara:     {fondo:.42, sub:.26, mel:.50, coro:.16, tex:.05, boom:.35, perc:.4, lp:5600, warble:2, irOsc:false},
    torre:     {fondo:.24, sub:.36, mel:0,   coro:.07, tex:.06, boom:.85, perc:.6, lp:2300, warble:3, irOsc:true}
  }[P.caracter] || {fondo:.5,sub:.34,mel:.42,coro:.2,tex:.1,boom:.55,perc:.5,lp:4200,warble:6,irOsc:false};

  /* --- el reloj de esta pieza ---
     T: origen de la pieza en el tiempo del contexto (permite reutilizar
     el mismo AudioContext tramo tras tramo).
     En un contexto offline todo se programa de golpe (así se renderiza);
     en vivo, cada evento nace pocos segundos antes de sonar. */
  var T = ctx.currentTime + 0.1;
  var offline = (typeof OfflineAudioContext === "function" && ctx instanceof OfflineAudioContext) ||
                (typeof webkitOfflineAudioContext === "function" && ctx instanceof webkitOfflineAudioContext);
  var movil = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
  var FIN = isFinite(dur) ? T + dur + 10 : 0;   // muerte de los drones (0 = jamás)
  var EV = [], parado = false, reloj = null;
  function en(t, fn){ if(offline){ fn(); } else { EV.push([t, fn]); } }

  var master = ctx.createGain(); master.gain.value = 0.0;
  master.gain.linearRampToValueAtTime(0.82, ctx.currentTime + 4);
  var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = C.lp; lp.Q.value = 0.4;
  // compresor suave antes de la cinta: doma los picos sin estamparlos
  var comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 14; comp.ratio.value = 2.5;
  comp.attack.value = 0.02; comp.release.value = 0.4;
  var sat = ctx.createWaveShaper();
  (function(){ var n = 1024, curva = new Float32Array(n);
    for(var i = 0; i < n; i++){ var x = i / (n - 1) * 2 - 1; curva[i] = Math.tanh(1.1 * x); }
    sat.curve = curva; })();
  lp.connect(comp); comp.connect(sat); sat.connect(master); master.connect(destino);

  var Rir = mulberry32(fnv(semilla + "·piedra"));
  var conv = ctx.createConvolver();
  // en móvil, piedra corta: una convolución de 7–9 s ahoga el hilo de audio del teléfono
  conv.buffer = impulsoPiedra(ctx, Rir, movil ? 3 : (C.irOsc ? 9 : 7), C.irOsc);
  var wet = ctx.createGain(); wet.gain.value = 0.62;
  var dry = ctx.createGain(); dry.gain.value = 0.5;
  conv.connect(wet); wet.connect(lp); dry.connect(lp);
  function alBus(nodo, mezclaSeca){
    nodo.connect(conv);
    if(mezclaSeca !== 0){ var g = ctx.createGain(); g.gain.value = (mezclaSeca || 1); nodo.connect(g); g.connect(dry); }
  }
  function mortal(src){ if(FIN) src.stop(FIN); return src; }   // ningún drone es eterno

  var warble = ctx.createOscillator(); warble.frequency.value = 0.11 + R() * 0.14;
  var warbleG = ctx.createGain(); warbleG.gain.value = C.warble;
  warble.connect(warbleG); warble.start(T); mortal(warble);

  function osc(tipo, midi, cents){
    var o = ctx.createOscillator(); o.type = tipo;
    o.frequency.value = hz(midi); o.detune.value = cents || 0;
    warbleG.connect(o.detune);
    return o;
  }

  /* ===== EL FONDO: tres arquitecturas ===== */
  (function(){
    var g = ctx.createGain(); g.gain.value = 0;
    if(P.fondo === "sierra"){
      var f = ctx.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 0.9; f.frequency.value = 320;
      var v1 = osc("sawtooth", P.raiz, -7), v2 = osc("sawtooth", P.raiz, +6),
          v5 = osc("triangle", P.raiz + 7, 0);
      var g5 = ctx.createGain(); g5.gain.value = 0.5;
      v1.connect(f); v2.connect(f); v5.connect(g5); g5.connect(f);
      f.connect(g);
      v1.start(T); v2.start(T); v5.start(T);
      mortal(v1); mortal(v2); mortal(v5);
      for(var t = 0; t < dur + P.durDrone; t += P.durDrone){
        f.frequency.linearRampToValueAtTime(240 + R() * 320, T + t + P.durDrone * 0.5);
        f.frequency.linearRampToValueAtTime(200 + R() * 200, T + t + P.durDrone);
      }
    } else if(P.fondo === "pad"){
      // pad oscuro: los acordes de la noche, sostenidos y solapados
      var durAc = P.durCoro / P.acordes.length;
      for(var t1 = 0; t1 < dur; t1 += P.durCoro){
        for(var a = 0; a < P.acordes.length; a++){
          var ini = t1 + a * durAc; if(ini > dur) break;
          P.acordes[a].forEach(function(m){
            var ini2 = ini;                       // congelar para el cierre
            var det = R() * 12 - 6, fCorte = 480 + R() * 260;
            en(ini2, function(){
              var o = osc("sawtooth", m - 12, det);
              var fp = ctx.createBiquadFilter(); fp.type = "lowpass"; fp.frequency.value = fCorte; fp.Q.value = 0.7;
              var gv = ctx.createGain(); gv.gain.value = 0;
              o.connect(fp); fp.connect(gv); gv.connect(g);
              gv.gain.setValueAtTime(0, T + ini2);
              gv.gain.linearRampToValueAtTime(0.34, T + ini2 + durAc * 0.5);
              gv.gain.linearRampToValueAtTime(0, T + ini2 + durAc * 1.25);
              o.start(T + ini2); o.stop(T + ini2 + durAc * 1.3);
            });
          });
        }
      }
    } else { // pedal de órgano
      [[0, .5], [7, .3], [12, .2]].forEach(function(par){
        var o = osc("sine", P.raiz + par[0], 0);
        var gv = ctx.createGain(); gv.gain.value = par[1];
        var o2 = osc("triangle", P.raiz + par[0] + 12, 3);
        var gv2 = ctx.createGain(); gv2.gain.value = par[1] * 0.3;
        o.connect(gv); o2.connect(gv2); gv.connect(g); gv2.connect(g);
        o.start(T); o2.start(T); mortal(o); mortal(o2);
      });
    }
    // respiración común del fondo
    for(var t2 = 0; t2 < dur + P.durDrone; t2 += P.durDrone){
      g.gain.linearRampToValueAtTime(C.fondo, T + t2 + P.durDrone * 0.45);
      g.gain.linearRampToValueAtTime(C.fondo * 0.55, T + t2 + P.durDrone);
    }
    alBus(g, 0.9);
    var sub = osc("sine", P.raiz - 12, 0);
    var gs = ctx.createGain(); gs.gain.value = C.sub;
    sub.connect(gs); alBus(gs, 1.2); sub.start(T); mortal(sub);
  })();

  /* ===== LA MELODÍA: el instrumento de la noche ===== */
  var bufAliento = null;   // el soplo de la flauta: un solo buffer para toda la pieza
  function alientoBuf(){
    if(!bufAliento) bufAliento = bufferRuido(ctx, mulberry32(fnv(semilla + "·al")), 1, 0.5);
    return bufAliento;
  }
  /* az: el azar de la nota, tirado al componer (no al sonar) — determinismo intacto */
  function tocarNota(midi, t0, v, durN, octava, az){
    var m = midi + (octava || 0), f0 = hz(m);
    var A = T + t0;                       // el instante absoluto del ataque
    var fin, o, o2, g2, gf;
    g2 = ctx.createGain(); g2.gain.value = 0;
    switch(P.instrumento){
    case "flauta":
      o = osc("triangle", m + 12, 0);
      var vib = ctx.createOscillator(); vib.frequency.value = 4.6 + az * 0.9;
      var vibG = ctx.createGain(); vibG.gain.value = 0;
      vib.connect(vibG); vibG.connect(o.detune); vib.start(A); vib.stop(A + durN + 0.5);
      vibG.gain.setValueAtTime(0, A);
      vibG.gain.linearRampToValueAtTime(9, A + Math.min(0.7, durN * 0.5));
      var aliento = ctx.createBufferSource(); aliento.buffer = alientoBuf(); aliento.loop = true;
      var fal = ctx.createBiquadFilter(); fal.type = "bandpass"; fal.frequency.value = f0 * 4; fal.Q.value = 2;
      var gal = ctx.createGain(); gal.gain.value = 0.05;
      aliento.connect(fal); fal.connect(gal); gal.connect(g2);
      aliento.start(A); aliento.stop(A + durN + 0.4);
      o.connect(g2);
      g2.gain.setValueAtTime(0, A);
      g2.gain.linearRampToValueAtTime(v * 0.6, A + 0.09);
      g2.gain.setValueAtTime(v * 0.6, A + durN);
      fin = A + durN + 0.35; g2.gain.linearRampToValueAtTime(0, fin);
      o.start(A); o.stop(fin + 0.1);
      break;
    case "cuerdas":
      gf = ctx.createBiquadFilter(); gf.type = "lowpass"; gf.frequency.value = 1500; gf.Q.value = 0.5;
      [-9, 0, 8].forEach(function(c){
        var ov = osc("sawtooth", m, c); ov.connect(gf); ov.start(A); ov.stop(A + durN + 1.1);
      });
      gf.connect(g2);
      g2.gain.setValueAtTime(0, A);
      g2.gain.linearRampToValueAtTime(v * 0.33, A + Math.min(0.5, durN * 0.4));
      g2.gain.setValueAtTime(v * 0.33, A + durN);
      fin = A + durN + 0.9; g2.gain.linearRampToValueAtTime(0, fin);
      break;
    case "organo":
      [[1,.55],[2,.4],[3,.2],[4,.15]].forEach(function(h){
        var ov = ctx.createOscillator(); ov.type = "sine";
        ov.frequency.value = f0 * h[0] * (h[0] === 3 ? 1.003 : 1);   // el tercer tubo, enfermo
        warbleG.connect(ov.detune);
        var gh = ctx.createGain(); gh.gain.value = h[1];
        ov.connect(gh); gh.connect(g2); ov.start(A); ov.stop(A + durN + 0.3);
      });
      g2.gain.setValueAtTime(0, A);
      g2.gain.linearRampToValueAtTime(v * 0.42, A + 0.025);
      g2.gain.setValueAtTime(v * 0.42, A + durN);
      fin = A + durN + 0.2; g2.gain.linearRampToValueAtTime(0, fin);
      break;
    case "piano":
      o = osc("triangle", m, -6); o2 = osc("triangle", m, 7);
      var brillo = ctx.createOscillator(); brillo.type = "sine"; brillo.frequency.value = f0 * 4;
      var gb = ctx.createGain(); gb.gain.value = 0.12;
      o.connect(g2); o2.connect(g2); brillo.connect(gb); gb.connect(g2);
      var decP = 3 + az * 2.5;
      g2.gain.setValueAtTime(0, A);
      g2.gain.linearRampToValueAtTime(v * 0.75, A + 0.008);
      g2.gain.exponentialRampToValueAtTime(0.0004, A + decP);
      o.start(A); o.stop(A + decP + 0.1); o2.start(A); o2.stop(A + decP + 0.1);
      brillo.start(A); brillo.stop(A + 0.5);
      fin = A + decP;
      break;
    case "clavecin":
      gf = ctx.createBiquadFilter(); gf.type = "highpass"; gf.frequency.value = 300;
      [-5, 6].forEach(function(c){
        var ov = osc("sawtooth", m, c); ov.connect(gf); ov.start(A); ov.stop(A + 1.6);
      });
      gf.connect(g2);
      g2.gain.setValueAtTime(0, A);
      g2.gain.linearRampToValueAtTime(v * 0.5, A + 0.004);
      g2.gain.exponentialRampToValueAtTime(0.0004, A + 1.3);
      fin = A + 1.3;
      break;
    case "corno":
      o = osc("sawtooth", m - 12, 0);
      gf = ctx.createBiquadFilter(); gf.type = "lowpass"; gf.Q.value = 1.1;
      gf.frequency.setValueAtTime(380, A);
      gf.frequency.linearRampToValueAtTime(1250, A + 0.22);
      o.connect(gf); gf.connect(g2);
      g2.gain.setValueAtTime(0, A);
      g2.gain.linearRampToValueAtTime(v * 0.42, A + 0.16);
      g2.gain.setValueAtTime(v * 0.42, A + durN);
      fin = A + durN + 0.4; g2.gain.linearRampToValueAtTime(0, fin);
      o.start(A); o.stop(fin + 0.1);
      break;
    default: // campana
      o = osc("sine", m, 0);
      o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = f0 * 2.76;
      var gp = ctx.createGain(); gp.gain.value = 0.18;
      o.connect(g2); o2.connect(gp); gp.connect(g2);
      var dec = Math.max(2.5, durN * 1.6);
      g2.gain.setValueAtTime(0, A);
      g2.gain.linearRampToValueAtTime(v, A + 0.012);
      g2.gain.exponentialRampToValueAtTime(0.0004, A + dec);
      o.start(A); o.stop(A + dec + 0.1); o2.start(A); o2.stop(A + dec * 0.4);
      fin = A + dec;
    }
    return g2;
  }

  if(C.mel > 0){
    var canta = P.cantabilidad * (P.caracter === "presencia" ? 0.35 : 1);
    var eco = ctx.createDelay(2); eco.delayTime.value = P.pulso * (R() < 0.5 ? 1.5 : 2);
    var fb = ctx.createGain(); fb.gain.value = 0.3;
    eco.connect(fb); fb.connect(eco);
    var busMel = ctx.createGain(); busMel.gain.value = C.mel * (0.55 + canta * 0.75);
    busMel.connect(eco); eco.connect(busMel);
    alBus(busMel, 0.7);

    var tema = P.tema.map(function(x){ return {g: x.g, d: x.d, tritono: x.tritono}; });
    var nFrase = tema.length / 4;
    var t0 = 6, ciclo = 0;
    while(t0 < dur - 4){
      for(var s = 0; s < tema.length && t0 < dur - 4; s++){
        var ev = tema[s];
        var pos = (s % nFrase) / nFrase;
        var v = (0.4 + 0.45 * Math.sin(pos * Math.PI)) * (0.85 + R() * 0.3);
        var durN = ev.d * P.pulso;
        var midi = ev.tritono ? (P.raiz + 24 + 6) : P.nota(ev.g);
        if(R() > 0.06){
          (function(tt, m2, v2, d2, az){
            en(tt, function(){ tocarNota(m2, tt, v2, d2, 0, az).connect(busMel); });
          })(t0 + (R() - 0.5) * 0.05, midi, v, durN, R());
          if(canta > 0.6 && s >= 2){
            var prev = tema[s - 2];
            if(!prev.tritono){
              (function(tt, m2, v2, d2, az){
                en(tt, function(){ tocarNota(m2, tt, v2, d2, -12, az).connect(busMel); });
              })(t0 + 0.03, P.nota(prev.g), v * 0.38, durN, R());
            }
          }
        }
        t0 += durN;
      }
      t0 += P.pulso * (3 + Math.floor(R() * 3));
      ciclo++;
      if(R() < P.mutacion){
        var im = 1 + Math.floor(R() * (tema.length - 2));
        if(!tema[im].tritono && (im + 1) % nFrase !== 0){
          tema[im].g = Math.max(-1, Math.min(11, tema[im].g + (R() < 0.5 ? 1 : -1)));
        }
      }
    }
  }

  /* ===== CORO fantasma ===== */
  if(C.coro > 0){
    var busCoro = ctx.createGain(); busCoro.gain.value = C.coro;
    alBus(busCoro, 0.35);
    var durAc = P.durCoro / P.acordes.length;
    for(var t1 = 2; t1 < dur; t1 += P.durCoro){
      for(var a = 0; a < P.acordes.length; a++){
        var ini = t1 + a * durAc; if(ini > dur) break;
        P.acordes[a].forEach(function(m){
          var ini2 = ini;
          var det = R() * 10 - 5, fA = 420 + R() * 160, fB = 860 + R() * 320;
          en(ini2, function(){
            var o = osc("sawtooth", m, det);
            var f1 = ctx.createBiquadFilter(); f1.type = "bandpass"; f1.frequency.value = fA; f1.Q.value = 5;
            var f2 = ctx.createBiquadFilter(); f2.type = "bandpass"; f2.frequency.value = fB; f2.Q.value = 6;
            var g3 = ctx.createGain(); g3.gain.value = 0;
            o.connect(f1); o.connect(f2); f1.connect(g3); f2.connect(g3); g3.connect(busCoro);
            g3.gain.setValueAtTime(0, T + ini2);
            g3.gain.linearRampToValueAtTime(0.24, T + ini2 + durAc * 0.45);
            g3.gain.linearRampToValueAtTime(0, T + ini2 + durAc * 1.05);
            o.start(T + ini2); o.stop(T + ini2 + durAc * 1.1);
          });
        });
      }
    }
  }

  /* ===== LA TEXTURA de la noche ===== */
  (function(){
    var Rv = mulberry32(fnv(P.semilla + "·tex"));
    var g = ctx.createGain(); g.gain.value = C.tex; alBus(g, 0.4);
    if(P.textura === "lluvia"){
      var src = ctx.createBufferSource(); src.buffer = bufferRuido(ctx, Rv, 7, 0.5); src.loop = true;
      var f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 3100; f.Q.value = 0.6;
      src.connect(f); f.connect(g); src.start(T); mortal(src);
      for(var t = 0; t < dur; t += 6 + Rv() * 6){ g.gain.linearRampToValueAtTime(C.tex * (0.6 + Rv() * 0.7), T + t + 5); }
    } else if(P.textura === "hoguera"){
      var rum = ctx.createOscillator(); rum.type = "sine"; rum.frequency.value = 52;
      var gr = ctx.createGain(); gr.gain.value = C.tex * 0.5;
      rum.connect(gr); gr.connect(g); rum.start(T); mortal(rum);
      for(var t2 = 1; t2 < dur; t2 += 0.25 + Rv() * 1.6){       // chasquidos
        (function(tt){
          var buf = bufferRuido(ctx, Rv, 0.03, 0.9);
          var fCorte = 1200 + Rv() * 1400, pico = 0.4 + Rv() * 0.9, cola = 0.05 + Rv() * 0.1;
          en(tt, function(){
            var ch = ctx.createBufferSource(); ch.buffer = buf;
            var fc = ctx.createBiquadFilter(); fc.type = "lowpass"; fc.frequency.value = fCorte;
            var gc = ctx.createGain(); gc.gain.value = 0;
            ch.connect(fc); fc.connect(gc); gc.connect(g);
            gc.gain.setValueAtTime(0, T + tt);
            gc.gain.linearRampToValueAtTime(pico, T + tt + 0.004);
            gc.gain.exponentialRampToValueAtTime(0.001, T + tt + cola);
            ch.start(T + tt);
          });
        })(t2);
      }
    } else if(P.textura === "crujido"){
      var hiss = ctx.createBufferSource(); hiss.buffer = bufferRuido(ctx, Rv, 7, 0.7); hiss.loop = true;
      var fh = ctx.createBiquadFilter(); fh.type = "highpass"; fh.frequency.value = 2800;
      var gh = ctx.createGain(); gh.gain.value = 0.35;
      hiss.connect(fh); fh.connect(gh); gh.connect(g); hiss.start(T); mortal(hiss);
      for(var t3 = 0.5; t3 < dur; t3 += 0.2 + Rv() * 1.1){       // clics de vinilo
        (function(tt){
          var buf = bufferRuido(ctx, Rv, 0.006, 0.95);
          var vol = 0.25 + Rv() * 0.5;
          en(tt, function(){
            var cl = ctx.createBufferSource(); cl.buffer = buf;
            var gcl = ctx.createGain(); gcl.gain.value = vol;
            cl.connect(gcl); gcl.connect(g); cl.start(T + tt);
          });
        })(t3);
      }
    } else { // viento
      var src2 = ctx.createBufferSource(); src2.buffer = bufferRuido(ctx, Rv, 7, 0.12); src2.loop = true;
      var f2 = ctx.createBiquadFilter(); f2.type = "bandpass"; f2.Q.value = 1.6; f2.frequency.value = 300;
      src2.connect(f2); f2.connect(g); src2.start(T); mortal(src2);
      for(var t4 = 0; t4 < dur + 20; t4 += 14 + Rv() * 10){
        f2.frequency.linearRampToValueAtTime(160 + Rv() * 640, T + t4 + 12);
        g.gain.linearRampToValueAtTime(C.tex * (0.4 + Rv() * 0.9), T + t4 + 12);
      }
    }
  })();

  /* ===== PERCUSIÓN rústica ===== */
  (function(){
    if(P.percusion === "nada") return;
    var Rp = mulberry32(fnv(P.semilla + "·perc"));
    var g = ctx.createGain(); g.gain.value = C.perc; alBus(g, 0.5);
    var compas = P.pulso * 4;
    function timbal(t, v){
      var f0 = 88 + Rp() * 14;              // tirado ahora, sonado después
      en(t, function(){
        var o = ctx.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(f0, T + t);
        o.frequency.exponentialRampToValueAtTime(52, T + t + 0.5);
        var gv = ctx.createGain(); gv.gain.value = 0;
        gv.gain.setValueAtTime(0, T + t);
        gv.gain.linearRampToValueAtTime(v, T + t + 0.012);
        gv.gain.exponentialRampToValueAtTime(0.0006, T + t + 0.9);
        o.connect(gv); gv.connect(g); o.start(T + t); o.stop(T + t + 1);
      });
    }
    if(P.percusion === "timbal"){
      // latido lento: negra... y a veces la réplica
      for(var t = 8; t < dur - 2; t += compas * 2){
        timbal(t, 0.5);
        if(Rp() < 0.45) timbal(t + P.pulso * 0.75, 0.28);
      }
    } else if(P.percusion === "yunque"){
      for(var t2 = 14 + Rp() * 20; t2 < dur - 2; t2 += 18 + Rp() * 26){
        (function(tt){
          en(tt, function(){
            [1, 1.34, 2.1].forEach(function(r){
              var o = ctx.createOscillator(); o.type = "square"; o.frequency.value = 590 * r;
              var f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = 3;
              var gv = ctx.createGain(); gv.gain.value = 0;
              gv.gain.setValueAtTime(0, T + tt);
              gv.gain.linearRampToValueAtTime(0.16, T + tt + 0.003);
              gv.gain.exponentialRampToValueAtTime(0.0005, T + tt + 0.7);
              o.connect(f); f.connect(gv); gv.connect(g); o.start(T + tt); o.stop(T + tt + 0.8);
            });
          });
        })(t2);
        timbal(t2 + 0.02, 0.2);
      }
    } else { // caja lo-fi: patrón pobre y terco
      var patron = [1, 0, 0, Rp() < 0.5 ? 1 : 0, 0, 1, 0, 0];
      for(var t3 = 8; t3 < dur - 2; t3 += compas){
        for(var i = 0; i < 8; i++){
          if(!patron[i] || Rp() < 0.2) continue;
          (function(tt){
            var buf = bufferRuido(ctx, Rp, 0.02, 0.8);
            en(tt, function(){
              var tick = ctx.createBufferSource(); tick.buffer = buf;
              var ft = ctx.createBiquadFilter(); ft.type = "bandpass"; ft.frequency.value = 900; ft.Q.value = 1.5;
              var gt = ctx.createGain(); gt.gain.value = 0.22;
              tick.connect(ft); ft.connect(gt); gt.connect(g);
              tick.start(T + tt);
            });
          })(t3 + i * P.pulso / 2);
        }
        if(Rp() < 0.7) timbal(t3, 0.35);
      }
    }
  })();

  /* ===== PASOS en la mazmorra ===== */
  if(P.pasos){
    var Rz = mulberry32(fnv(P.semilla + "·pasos"));
    var g = ctx.createGain(); g.gain.value = 0.16; alBus(g, 0.15);
    for(var w = 0; w < 2; w++){
      var t = 15 + Rz() * (dur - 30);
      var n = 5 + Math.floor(Rz() * 5);
      for(var i = 0; i < n; i++){
        (function(ti, vi){
          var buf = bufferRuido(ctx, Rz, 0.05, 0.9);
          en(ti, function(){
            var paso = ctx.createBufferSource(); paso.buffer = buf;
            var fp = ctx.createBiquadFilter(); fp.type = "lowpass"; fp.frequency.value = 240;
            var gp = ctx.createGain(); gp.gain.value = 0;
            gp.gain.setValueAtTime(0, T + ti);
            gp.gain.linearRampToValueAtTime(vi, T + ti + 0.01);
            gp.gain.exponentialRampToValueAtTime(0.001, T + ti + 0.16);
            paso.connect(fp); fp.connect(gp); gp.connect(g); paso.start(T + ti);
          });
        })(t + i * (0.62 + Rz() * 0.2), 0.5 + (i % 2) * 0.2);
      }
      if(Rz() < 0.5) break; // a veces solo pasa una vez
    }
  }

  /* ===== BOOMS: algo enorme, lejos ===== */
  (function(){
    for(var t = 12 + R() * P.boomCada; t < dur - 3; t += P.boomCada * (0.6 + R() * 0.9)){
      (function(tt, f0){
        en(tt, function(){
          var o = ctx.createOscillator(); o.type = "sine";
          o.frequency.setValueAtTime(f0, T + tt);
          o.frequency.exponentialRampToValueAtTime(26, T + tt + 1.3);
          var g = ctx.createGain(); g.gain.value = 0;
          g.gain.setValueAtTime(0, T + tt);
          g.gain.linearRampToValueAtTime(C.boom, T + tt + 0.04);
          g.gain.exponentialRampToValueAtTime(0.0005, T + tt + 2.8);
          o.connect(g); alBus(g, 0.25);
          o.start(T + tt); o.stop(T + tt + 3);
        });
      })(t, 52 + R() * 16);
    }
  })();

  if(isFinite(dur)){
    master.gain.setValueAtTime(0.9, T + dur - 3);
    master.gain.linearRampToValueAtTime(0, T + dur - 0.05);
  }

  /* --- el reloj: despierta a los nodos pocos segundos antes de su hora --- */
  if(!offline){
    EV.sort(function(a, b){ return a[0] - b[0]; });
    var idx = 0, LOOK = 8;
    var latir = function(){
      if(parado) return;
      var ahora = ctx.currentTime - T;
      while(idx < EV.length && EV[idx][0] < ahora + LOOK){
        try{ EV[idx][1](); }catch(e){}
        idx++;
      }
      if(idx >= EV.length && reloj){ clearInterval(reloj); reloj = null; }
    };
    reloj = setInterval(latir, 500);
    latir();
  }

  return {
    master: master,
    parar: function(){
      parado = true;
      if(reloj){ clearInterval(reloj); reloj = null; }
      EV.length = 0;
      try{ master.disconnect(); }catch(e){}
    }
  };
}

global.SENAL = { componer: componer, tocar: tocar, fnv: fnv, LA: LA };
})(typeof window !== "undefined" ? window : this);
