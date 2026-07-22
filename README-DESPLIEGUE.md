# Despliegue — torredethecla.dumaker.com

Contenido de esta carpeta (todo va al repo tal cual):

```
index.html            ← la web entera (HTML+CSS+JS en un solo archivo)
manifest.json         ← índice de transmisiones; Hermes lo actualiza cada noche
CNAME                 ← el subdominio, GitHub Pages lo lee automáticamente
fragmentos/           ← un archivo .md por transmisión
preview.html          ← SOLO para previsualizar en local (doble clic). NO subir al repo.
README-DESPLIEGUE.md  ← este archivo. No hace falta subirlo, pero no molesta.
```

## 1. Crear el repo

1. GitHub → New repository → nombre: `torre-de-thecla` (o el que quieras, da igual: el dominio lo tapa) → **Public** → Create.
2. Sube todo el contenido de esta carpeta **excepto `preview.html`** (Add file → Upload files → arrastra → Commit).

## 2. Activar GitHub Pages

1. En el repo: Settings → Pages.
2. Source: **Deploy from a branch** · Branch: **main** · carpeta **/ (root)** → Save.
3. En la misma página, campo **Custom domain**: escribe `torredethecla.dumaker.com` → Save.
4. Cuando el check de DNS pase (puede tardar), marca **Enforce HTTPS**.

## 3. DNS en el proveedor de dumaker.com

Añade un registro:

| Tipo | Nombre/Host | Valor/Destino | TTL |
|---|---|---|---|
| CNAME | `torredethecla` | `TU-USUARIO.github.io` | Auto/3600 |

(Sustituye `TU-USUARIO` por tu usuario de GitHub, en minúsculas. El valor lleva `.github.io`, sin el nombre del repo.)

Propagación: de minutos a unas horas. Verifica en https://torredethecla.dumaker.com

## 4. Antes de la primera noche real

Los cuatro fragmentos actuales son **muestras de desarrollo** (escritas a mano para probar el diseño). Antes de soltar a Hermes:

1. Borra los archivos de `fragmentos/`.
2. Deja `manifest.json` así: `{ "transmisiones": [] }`
3. El contador mostrará SIN SEÑAL hasta la primera transmisión real. SMET-0001 debe nacer limpio, de la máquina.

## 5. Contrato del manifest (para la sesión del pipeline de Hermes)

Cada noche, Hermes: (1) escribe `fragmentos/SMET-####.md`, (2) añade una entrada al array `transmisiones`, (3) commit + push. Entrada:

```json
{ "archivo": "fragmentos/SMET-0042.md", "signatura": "SMET-0042", "fecha": "2026-11-05T03:12:00+01:00", "torre": false }
```

Noche de torre: `"archivo": "fragmentos/torre-0002.md"`, `"signatura": null`, `"torre": true` — la web pinta la mancha en lugar de la signatura.

El orden en el array da igual (la web ordena por fecha), pero por limpieza: añadir al final. El campo `fecha` manda sobre el contador de silencio: formato ISO con zona horaria (`+01:00` invierno, `+02:00` verano).

## Notas de diseño ya implementadas

- **El descenso**: última transmisión arriba; scroll = hundirse. Carga por lotes de 3 con scroll infinito. Al fondo: «— principio del archivo —».
- **Contador de silencio**: tiempo real desde la última `fecha` del manifest. La ausencia se ve.
- **Llegada**: solo la transmisión más reciente «llega» (palabras materializándose con interferencia y cursor). Las demás ya están asentadas. Nada se degrada con la profundidad (Regla 3): solo oscurece el ambiente.
- **Tipografías**: Jacquard 12 (signaturas y contador) + Noticia Text (voces), vía Google Fonts.
- **La mancha**: SVG con turbulencia, sin texto, en el hueco de la signatura de las noches de torre.
- **Señal de fondo**: `[ señal de fondo ]` abajo a la izquierda; al pulsar, embed discreto de la playlist de Spotify. No carga nada de Spotify hasta que se pulsa.
