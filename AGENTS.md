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
  Solo usa la API de Canvas 2D, así que corre igual en QML y en el navegador.
- `preview.html`, `catalog.html`, `cat-test.html`: arneses para probar en el navegador.

## Probar cambios sin tocar el escritorio

`scene.js` se puede renderizar con Firefox sin ventana:

```bash
firefox --headless --no-remote --profile "$(mktemp -d)" --window-size=1920,1080 \
  --screenshot /ruta/absoluta/salida.png "file://$PWD/preview.html?hour=22&sim=30"
```

Usa rutas absolutas para `--screenshot`. Parámetros de `preview.html`: `hour`, `rain`, `sim`
(segundos simulados), `seed`, `live=1`, `weather` (`clear`, `rain`, `storm`, `snow`, `fog`,
`rainbow`, `fireworks`; llama a `setWeather` y congela el clima).

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
- La ciudad usa una semilla fija (`20251115` en `main.qml`): misma ciudad en cada reinicio.

## Estilo

Comentarios y textos en español, como el resto del código. Funciones de dibujo con `fillRect` en
coordenadas enteras; colores como arreglos `[r, g, b]` convertidos con `css()`.
