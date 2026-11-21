# Guía para agentes de código

Pixel City es un fondo de pantalla para KDE Plasma 6 (paquete `Plasma/Wallpaper`, id
`org.xaw.pixelcity`). No hay compilación ni dependencias: QML + un archivo JavaScript.

## Instalar en la máquina del usuario (no interactivo)

```bash
git clone https://github.com/xaw624/pixel-city.git
cd pixel-city
./install.sh --activate
```

- `./install.sh` instala o actualiza (es idempotente).
- `--activate` lo pone como fondo en todas las pantallas vía D-Bus. **Cambia el fondo del usuario**:
  pide confirmación antes de usarlo si el usuario solo pidió instalar.
- `--restart` reinicia `plasmashell` (la barra parpadea unos segundos; las ventanas no se cierran).
  Necesario para que Plasma cargue el código nuevo después de un cambio.
- `--uninstall` lo desinstala.

Equivalente manual:

```bash
kpackagetool6 -t Plasma/Wallpaper -i package     # o -u para actualizar
qdbus6 org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell.evaluateScript \
  "desktops().forEach(function (d) { if (d.screen >= 0) d.wallpaperPlugin = 'org.xaw.pixelcity'; });"
```

## Verificar

```bash
# Instalado:
kpackagetool6 -t Plasma/Wallpaper --list | grep org.xaw.pixelcity
# Fondo activo por pantalla (espera "0:org.xaw.pixelcity"):
qdbus6 org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell.evaluateScript \
  'var o=[]; desktops().forEach(function(d){o.push(d.screen+":"+d.wallpaperPlugin)}); print(o.join(","));'
# Errores de QML/JS del fondo (vacío = bien):
journalctl --user -u plasma-plasmashell --since "-2min" | grep -i pixelcity
```

Para revertir al fondo anterior, pide al usuario que lo elija en **Configurar escritorio y fondo**;
la configuración del fondo anterior se conserva.

## Estructura

- `package/metadata.json`: metadatos del paquete (id, nombre, versión).
- `package/contents/ui/main.qml`: `WallpaperItem`. Apila lienzos (cielo, nubes, ciudad, ambiente,
  vida, primer plano), los escala sin suavizado y maneja temporizadores y la pausa.
- `package/contents/ui/scene.js`: todo el motor (generación, paleta por hora, simulación, dibujo).
  Solo usa la API de Canvas 2D, así que corre igual en QML y en el navegador. Escenas (ajuste
  "Escenario" = `configuration.Scene`): `city` es la base; las demás (`beach`, `mountain`, `village`, `farm`, `cyber`) están en
  la tabla `SCENES` al final con sus funciones `create`, `draw`, `front` y opcionales `ambient`,
  `step`, `life` y `tint`. Comparten cielo, clima y vida. Para agregar una: escribe esas funciones,
  regístrala en `SCENES` y en la lista `scenes` de `config.qml`. Animales que caminan entre la gente
  van en `w.critters` con su dibujo en `CRITTERS`. Banderas útiles: `w.noSnow`, `w.alwaysSnow`,
  `w.minSnow`, `w.noGulls`, `w.noBoats`, `w.noWater`, `w.noStars`, `w.crowd`, `w.lanes`, `w.span`.
  Vehículos con `kind` (en `w.cars`) se dibujan con la función de `VEHICLES`.
  Sigue en un solo archivo porque los JS de QML no comparten globales entre archivos.
- `preview.html`, `catalog.html`, `anuncios.html`: arneses para probar en el navegador.
- `lively/`: versión web para Lively Wallpaper en Windows. `index.html` repite lo que hace
  `main.qml` (capas, ritmos, semilla, pausa con `livelyWallpaperPlaybackChanged`) y recibe los
  ajustes en `livelyPropertyListener` (índices de `LivelyProperties.json`) o por la dirección
  (`?scene=beach&lines=360`). Si cambias los ritmos o las capas de `main.qml`, cámbialos aquí
  también; si agregas un escenario, agrégalo a `SCENE_IDS` y a `LivelyProperties.json` en el
  mismo orden. `lively/build.sh` copia `scene.js` y arma `dist/pixel-city-lively-<versión>.zip`.

## Probar cambios sin tocar el escritorio

`scene.js` se puede renderizar con Firefox sin ventana:

```bash
firefox --headless --no-remote --profile "$(mktemp -d)" --window-size=1920,1080 \
  --screenshot /ruta/absoluta/salida.png "file://$PWD/preview.html?hour=22&sim=30"
```

Usa rutas absolutas para `--screenshot`. Parámetros de `preview.html`: `hour`, `rain`, `sim`
(segundos simulados), `seed`, `live=1`, `scene` (`city`, `beach`, `mountain`, `village`, `farm`, `cyber`), `weather` (`clear`, `rain`, `storm`, `snow`, `fog`,
`rainbow`, `fireworks`, `aurora`; llama a `setWeather` y congela el clima), `flyer` (un tipo de `FLYERS`), `jets=1`,
`date=10-31` (finge la fecha: temporadas, lluvias de estrellas, luna llena) y `odd=cat,whale,...` (saca curiosidades
con `forceOddity`: `cat`, `opossum`, `nessie`, `whale`, `sat`, `starlink`, `balloon`, `shower`, `aurora`, `wolf`).

## Trampas conocidas

- **No uses `Screen.devicePixelRatio`**: con escala fraccionaria en Wayland (p. ej. 1.1) Qt reporta 2.
  El lienzo mide `lh` líneas (ajuste "Definición": 216, 270, 360 o 540; 270 por omisión, en
  `contents/config/main.xml` y `contents/ui/config.qml`) y se escala con `root.height / lh` dentro
  de un `layer` con `textureSize` explícito. Los tamaños de `scene.js` están en pixeles de arte:
  con más líneas todo se ve más chico y caben más edificios. Prueba con `preview.html?px=2`.
- Los `Canvas` deben tener `smooth: false` y `antialiasing: false`, o el pixel art sale borroso.
- `Canvas.canvasSize` no estira la imagen al tamaño del item; no lo uses para escalar.
- `drawLife` y `drawAmbient` empiezan con `clearRect`: cada uno necesita su propio lienzo.
- Capas y ritmos: vida a 12 fps, ambiente a 4 fps, ciudad/cielo cada 30 s, nubes 1 px cada 3 s.
  Lo que cambia poco va en `drawAmbient`, no en `drawLife`.
- La pausa usa `org.kde.taskmanager`: solo cuenta la **ventana activa** maximizada o a pantalla
  completa (contar todas rompe "mostrar escritorio").
- El clima vive en `step` (lluvia/nieve/tormenta, neblina, arcoíris, fuegos artificiales). Lo que se
  pinta en cielo o ciudad (neblina, arcoíris, nieve acumulada) solo se actualiza cada 30 s: cámbialo
  despacio. Relámpagos y fuegos van en `drawLife` y se recortan con `w.sky` (silueta de la ciudad)
  para quedar detrás de los edificios.
- Anuncios de azotea: `BIG_ADS` (animales animados) y `SMALL_ADS` (íconos); cada cartel rota con
  `adState`. La cara va en `drawAdFace` (ambiente) y el marco en `drawBillboard` (ciudad). No cambies
  las llamadas a `R()` al generar carteles: cambiarían la ciudad de la semilla fija.
- Relojes voladores: `w.flyer` es el que cruza ahora; los tipos están en `FLYERS` (con `ok`, `make`,
  `draw` y opcionales `step` y `slow`) y se turnan en el orden de `FLYER_ORDER`, saltando los que no
  pueden salir por hora, clima o escenario (el dirigible siempre puede). Los lentos (`slow`) van en la
  capa ambiental; los demás, en la de vida. La hora sale de `clockDots`. Para ver uno ya:
  `preview.html?flyer=skywrite&live=1` (`dir=-1` para que cruce al revés). Tipos: `blimp` (siempre),
  `banner` (avioneta con cartel, de día; en la playa alterna con helados), `duster` (fumigadora, solo
  campo), `skywrite` (hora con humo, de día despejado), `balloon` (globo, de día sin lluvia), `heli`
  (ciudad, playa, ciberpunk), `holo` (dron con holograma, solo ciberpunk), `swarm` (drones de noche) y
  `sleigh` (trineo, pueblo del 1 de diciembre al 6 de enero) y `ufo` (ovni de madrugada, sale la mitad de
  las veces que le toca; flota con un rayo que lleva la hora y cae sobre `w.sky`; en el campo levanta una
  vaca con `c.lift` y la devuelve). Los que remolcan cartel usan
  `drawTowedBanner`; los que deben quedar detrás de los edificios se recortan con `skyPx`/`skyDot`.
- Gente con celular (`p.phone`, camina más lento; de noche le alumbra la cara y a veces saca una foto con
  flash) o linterna (`p.torch`, solo de noche y sobre todo fuera de la ciudad): se decide en `spawnPerson`
  según `w.hour`; el dibujo está en `drawPhone` y `drawTorch`.
- Curiosidades (sección "curiosidades" de `scene.js`, simuladas en `stepOddities`): satélites y trenes de
  satélites (`w.sats`), lluvias de estrellas en sus fechas (`SHOWERS`, salen del mismo punto), aurora en montaña y
  pueblo (`w.aurora`, noches frías, capa ambiental recortada con `w.sky`), globos de niños que se escapan
  (`p.balloon`, `w.balloons`), ciclistas y repartidores (`p.bike`, `drawBiker`), patinetas (`p.skate`), gato negro y
  tlacuache (`w.odd`, `drawOdd`; el gato en la ciudad camina por el barandal, el tlacuache hurga junto a las bancas
  y se hace el muerto), búho y lobo en la montaña (el lobo, con luna llena según `moonPhase`), monstruo del lago
  (`w.nessie`) y ballena en la playa (`w.whale`). Temporadas con `season(w)`: calabazas (25–31 oct), fantasmitas
  (31 oct) y papel picado, cempasúchil y velas (28 oct–2 nov), solo en ciudad y campo; el pueblo es navideño todo
  el año. Usa `today(w)` en vez de `new Date()` para que `date=` funcione. Nada de esto toca la semilla ni las
  capas fijas.
- Jets de la hora en punto: `w.jets`, aparte de los turnos (`stepJets`); `preview.html?jets=1`.
- La ciudad usa una semilla fija (`20251115` en `main.qml`): misma ciudad en cada reinicio.
- Al tocar lo común, verifica que la ciudad no cambie: renderiza `drawSky`/`drawCity`/`drawFront`
  con hora y `t` fijos antes y después, y compara con `magick compare -metric AE` (debe dar 0).
- Playa: sin nieve (`w.noSnow`), el sol recorre `w.span` para no esconderse tras el cabo y los
  carriles de gente están en `w.lanes` (orilla y delante de las sombrillas, que son fijas).
- `w.sky[x]` (silueta contra el cielo) debe existir en toda escena: recorta fuegos y relámpagos, y
  fuera de la ciudad oculta el brillo del sol en el agua cuando el sol está detrás de un cerro.
- Pueblo: siempre hay nieve (`w.alwaysSnow`, `w.minSnow`), nadie saca paraguas y los foquitos se
  calculan en `createVillage` (`w.bulbs`) y se animan en `drawVillageAmbient`. Los patinadores son
  personas en `w.critters` (tipo `skater`) que giran en elipse sobre la pista.
- Campo: los colores de las parcelas dependen del mes (`fieldCols`); hay menos gente (`w.crowd`) y
  los vehículos del camino son `w.cars` con `kind` (tractor, camioneta) dibujados en `drawFarmVehicle`.
  Las aspas del molino giran en la capa de vida (`drawMillSails`), no en la ambiental.
- Ciberpunk: el smog se aplica en `tintCyber` (gancho `tint` de la paleta); empieza lloviendo y
  `w.rainChance` es alto. Los signos de los letreros son inventados (`makeGlyphs`), no texto real.
- Montaña: las canoas van en la parte lejana del lago (`w.yW + 1..5`) para no pasar delante de los
  pinos de la orilla ni de la cabaña.

## Estilo

Comentarios y textos en español, como el resto del código. Funciones de dibujo con `fillRect` en
coordenadas enteras; colores como arreglos `[r, g, b]` convertidos con `css()`.
