# Guía de instalación

Pixel City es un fondo de pantalla para **KDE Plasma 6**. No necesita compilar nada ni instalar
dependencias extra: es un paquete de QML y JavaScript que Plasma carga directamente.

## 1. Requisitos

- KDE Plasma **6.0 o superior** (Wayland o X11).
- La herramienta `kpackagetool6`, que viene con Plasma 6.

Para comprobar tu versión de Plasma:

```bash
plasmashell --version
```

Debe decir `plasmashell 6.x.x`. Si dice 5.x, este fondo no funcionará.

## 2. Descargar

**Opción A: con git**

```bash
git clone https://github.com/xaw624/pixel-city.git
cd pixel-city
```

**Opción B: sin git**

1. En la página del repositorio, pulsa **Code → Download ZIP**.
2. Descomprime el archivo.
3. Abre una terminal dentro de la carpeta `pixel-city-main`.

## 3. Instalar

Desde la carpeta del proyecto:

```bash
kpackagetool6 -t Plasma/Wallpaper -i package
```

Debe responder algo como `.../wallpapers/org.xaw.pixelcity/ instalado con éxito`. El fondo queda
instalado solo para tu usuario, en `~/.local/share/plasma/wallpapers/org.xaw.pixelcity/`.

## 4. Activarlo

1. Clic derecho en el escritorio → **Configurar escritorio y fondo**.
2. En **Tipo de fondo**, elige **Pixel City**.
3. Pulsa **Aplicar**.

Tu fondo anterior no se borra: para volver, elige otra vez su tipo de fondo en la misma ventana.

## 5. Actualizar

Si descargaste una versión nueva (con `git pull` o un ZIP nuevo):

```bash
kpackagetool6 -t Plasma/Wallpaper -u package
systemctl --user restart plasma-plasmashell.service
```

El segundo comando reinicia el escritorio para que cargue el código nuevo; la barra de tareas
parpadea un par de segundos y tus ventanas no se cierran.

## 6. Desinstalar

Primero cambia a otro tipo de fondo (paso 4) y luego:

```bash
kpackagetool6 -t Plasma/Wallpaper -r org.xaw.pixelcity
```

## Solución de problemas

**No aparece "Pixel City" en la lista de fondos.**
Reinicia el escritorio y vuelve a abrir la configuración:

```bash
systemctl --user restart plasma-plasmashell.service
```

**El fondo sale negro, vacío o en una esquina.**
Revisa los mensajes de Plasma y abre un *issue* con lo que aparezca:

```bash
journalctl --user -u plasma-plasmashell --since "-5min" | grep -i pixelcity
```

**El fondo no se mueve.**
Es la pausa automática: se detiene cuando la ventana activa está maximizada o a pantalla completa.
Minimiza esa ventana, usa **Meta + D** o haz clic en el escritorio y la animación continúa.

**Quiero verlo sin instalarlo.**
Abre `preview.html` en el navegador. Agrega `?live=1` para verlo animado, o por ejemplo
`?hour=22&live=1` para ver la noche o `?rain=0.8&live=1` para ver la lluvia.
