import QtQuick
import org.kde.plasma.plasmoid
import org.kde.taskmanager as TaskManager
import "scene.js" as Scene

// Fondo pixel art generado por código. Las capas se dibujan en un lienzo de baja resolución
// (unos 270 pixeles de alto) y se escalan sin suavizado para que cada pixel quede nítido.
WallpaperItem {
    id: root

    // Alto del dibujo en pixeles de arte (ajuste "Definición"); con 270 en 1080p cada uno ocupa
    // 4×4 pixeles reales.
    readonly property int lh: Math.max(180, Math.min(720, configuration.Lines || 270))
    readonly property int lw: height > 0 ? Math.ceil(width / height * lh) : 0
    // Fluidez (ajuste "Animación"): 12, 8 o 6 cuadros por segundo para la gente y las aves.
    readonly property int fps: [6, 8, 12].indexOf(configuration.Fps) >= 0 ? configuration.Fps : 12
    // Paisaje: el elegido ("city", "beach", "mountain", "village", "farm" o "cyber") o, si el ajuste
    // "Cambiar de escenario" no es "off", el que toque por hora, día o estación (ver Scene.sceneFor).
    readonly property string rotateMode: configuration.Rotate || "off"
    property string autoScene: ""
    readonly property string sceneName: rotateMode === "off" ? (configuration.Scene || "city") : (autoScene || "city")
    function updateAutoScene() { autoScene = Scene.sceneFor(rotateMode, configuration.Scene || "city", new Date()) }
    onRotateModeChanged: updateAutoScene()
    // Ciudad (ajuste "Ciudad n.º"): 0 es la original; cada número genera otra.
    readonly property int citySeed: 20251115 + Math.max(0, configuration.City || 0)
    onCitySeedChanged: rebuildTimer.restart()
    // Ajustes que no regeneran la escena: destellos, reloj de 12 horas y qué grupos se muestran.
    readonly property var options: ({
        noFlash: !!configuration.NoFlash,
        clock12: !!configuration.Clock12,
        flyers: configuration.Flyers !== false,
        jets: configuration.Jets !== false,
        oddities: configuration.Oddities !== false,
        seasons: configuration.Seasons !== false
    })
    onOptionsChanged: if (world) Scene.setOptions(world, options)
    // Cuándo pausar: "active" (la ventana activa maximizada), "any" (cualquier ventana) o "never".
    readonly property string pauseMode: configuration.Pause || "active"
    onPauseModeChanged: updateCovered()
    readonly property bool mouseOn: configuration.Mouse !== false
    // Órdenes de los atajos de teclado: el comando pixelcity escribe "nombre marca" en la clave
    // Command por D-Bus (setWallpaper) y aquí se ejecuta cada vez que cambia.
    readonly property string order: configuration.Command || ""
    onOrderChanged: if (world && order) Scene.command(world, order.split(" ")[0])

    // Pausa la animación cuando una ventana maximizada o a pantalla completa tapa el escritorio.
    property bool covered: false
    readonly property bool animating: world !== null && !covered

    property var world: null
    property var pal: null
    property int cloudOff: 0
    property real lastStep: 0

    function now() { return Date.now() / 1000 }
    function hourNow() {
        var d = new Date()
        return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
    }

    function rebuild() {
        if (lw < 32 || lh < 32)
            return
        world = Scene.create(lw, lh, root.citySeed, { scene: root.sceneName })
        Scene.setOptions(world, root.options)
        pal = Scene.palette(world, hourNow())
        Scene.warmup(world, pal.hour, pal)
        lastStep = now()
        repaintStatic()
    }

    function repaintStatic() {
        if (!world)
            return
        pal = Scene.palette(world, hourNow())
        sky.requestPaint()
        clouds.requestPaint()
        city.requestPaint()
        front.requestPaint()
    }

    onAnimatingChanged: {
        if (animating) {
            // Al volver: sin salto en la simulación y con la luz de la hora actual.
            lastStep = now()
            repaintStatic()
        }
    }

    // Por omisión solo cuenta la ventana activa: con "mostrar escritorio" o al hacer clic en el fondo
    // no hay ventana activa, aunque otras sigan maximizadas detrás. Con "any" cuenta cualquiera (y
    // "mostrar escritorio" puede no reanudarla); con "never" no se pausa.
    function updateCovered() {
        var A = TaskManager.AbstractTasksModel
        if (pauseMode === "never") {
            covered = false
        } else if (pauseMode === "any") {
            var any = false
            for (var i = 0; i < tasks.count && !any; i++) {
                var ix = tasks.makeModelIndex(i)
                any = !!(tasks.data(ix, A.IsMaximized) || tasks.data(ix, A.IsFullScreen))
            }
            covered = any
        } else {
            var idx = tasks.activeTask
            covered = !!(idx && idx.valid && tasks.data(idx, A.IsActive)
                         && (tasks.data(idx, A.IsMaximized) || tasks.data(idx, A.IsFullScreen)))
        }
    }

    TaskManager.VirtualDesktopInfo {
        id: desktopInfo
    }

    TaskManager.ActivityInfo {
        id: activityInfo
    }

    // Ventanas visibles en esta pantalla, escritorio virtual y actividad (sin las minimizadas).
    TaskManager.TasksModel {
        id: tasks
        groupMode: TaskManager.TasksModel.GroupDisabled
        activity: activityInfo.currentActivity
        filterByActivity: true
        screenGeometry: root.parent ? root.parent.screenGeometry : Qt.rect(0, 0, 0, 0)
        filterByScreen: true
        filterMinimized: true
        onDataChanged: Qt.callLater(root.updateCovered)
        onCountChanged: Qt.callLater(root.updateCovered)
        onActiveTaskChanged: Qt.callLater(root.updateCovered)
        Component.onCompleted: {
            if (tasks.hasOwnProperty("filterByCurrentVirtualDesktop")) {
                tasks.filterByCurrentVirtualDesktop = true
            } else {
                tasks.virtualDesktop = Qt.binding(function () { return desktopInfo.currentDesktop })
                tasks.filterByVirtualDesktop = true
            }
            Qt.callLater(root.updateCovered)
        }
    }

    onLwChanged: rebuildTimer.restart()
    onLhChanged: rebuildTimer.restart()
    onSceneNameChanged: rebuildTimer.restart()
    Component.onCompleted: { updateAutoScene(); rebuildTimer.restart() }

    // Revisa cada minuto si ya toca otro escenario.
    Timer {
        interval: 60000
        repeat: true
        running: root.rotateMode !== "off"
        onTriggered: root.updateAutoScene()
    }

    Timer {
        id: rebuildTimer
        interval: 250
        onTriggered: root.rebuild()
    }

    Rectangle {
        anchors.fill: parent
        color: "#0b1030"
    }

    // Las capas se dibujan en lw×lh unidades y la capa de composición (layer) las junta en una
    // textura de exactamente lw×lh pixeles, que luego se estira a la pantalla sin suavizado.
    // Así no importa la escala fraccionaria (1.1, 1.25...) que Qt reporte para la pantalla.
    component PixelCanvas: Canvas {
        width: root.lw
        height: root.lh
        smooth: false
        antialiasing: false
    }

    Item {
        id: stage
        width: root.lw
        height: root.lh
        transformOrigin: Item.TopLeft
        scale: root.height / root.lh
        layer.enabled: true
        layer.smooth: false
        layer.textureSize: Qt.size(root.lw, root.lh)

        PixelCanvas {
            id: sky
            onPaint: if (root.world) Scene.drawSky(getContext("2d"), root.world, root.pal)
        }
        PixelCanvas {
            id: clouds
            x: -root.cloudOff
            width: root.lw * 2
            onPaint: if (root.world) Scene.drawClouds(getContext("2d"), root.world, root.pal)
        }
        PixelCanvas {
            id: city
            onPaint: if (root.world) Scene.drawCity(getContext("2d"), root.world, root.pal, root.now())
        }
        PixelCanvas {
            id: ambient
            onPaint: if (root.world) Scene.drawAmbient(getContext("2d"), root.world, root.pal, root.now())
        }
        PixelCanvas {
            id: life
            onPaint: if (root.world) Scene.drawLife(getContext("2d"), root.world, root.pal, root.now())
        }
        PixelCanvas {
            id: front
            onPaint: if (root.world) Scene.drawFront(getContext("2d"), root.world, root.pal)
        }
    }

    // Interacción con el ratón (ajuste "Interacción"). Plasma solo le pasa el ratón al fondo con el
    // diseño de escritorio «Escritorio»; con «Vista de carpeta» se lo queda la capa de los íconos.
    // Llegan el movimiento y el clic izquierdo; el clic se toma al presionar, que llega siempre.
    function artPoint(pos) {
        var k = root.height / root.lh
        return Qt.point(pos.x / k, pos.y / k)
    }
    HoverHandler {
        enabled: root.mouseOn
        onHoveredChanged: if (!hovered && root.world) Scene.hover(root.world, null)
        onPointChanged: if (hovered && root.world) {
            var a = root.artPoint(point.position)
            Scene.hover(root.world, a.x, a.y)
        }
    }
    TapHandler {
        enabled: root.mouseOn
        acceptedButtons: Qt.LeftButton
        onPressedChanged: if (pressed && root.world && root.animating) {
            var a = root.artPoint(point.position)
            Scene.poke(root.world, a.x, a.y)
            life.requestPaint()
        }
    }

    // Personas, aves, autos, brillo del agua.
    Timer {
        interval: Math.round(1000 / root.fps)
        repeat: true
        running: root.animating
        onTriggered: {
            var t = root.now()
            Scene.step(root.world, t - root.lastStep, root.pal.hour, root.pal)
            root.lastStep = t
            life.requestPaint()
        }
    }

    // Luces, pantallas, anuncios, dirigible, olas y brillo del agua: cuatro veces por segundo basta.
    Timer {
        interval: 250
        repeat: true
        running: root.animating
        onTriggered: ambient.requestPaint()
    }

    // Las nubes avanzan un pixel cada pocos segundos.
    Timer {
        interval: 3000
        repeat: true
        running: root.animating
        onTriggered: root.cloudOff = (root.cloudOff + 1) % root.lw
    }

    // Cielo, ventanas y luz según la hora.
    Timer {
        interval: 30000
        repeat: true
        running: root.animating
        onTriggered: root.repaintStatic()
    }
}
