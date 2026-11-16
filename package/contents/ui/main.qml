import QtQuick
import org.kde.plasma.plasmoid
import org.kde.taskmanager as TaskManager
import "scene.js" as Scene

// Fondo pixel art generado por código. Las capas se dibujan en un lienzo de baja resolución
// (unos 270 pixeles de alto) y se escalan sin suavizado para que cada pixel quede nítido.
WallpaperItem {
    id: root

    // Alto del dibujo en pixeles de arte; en 1080p cada uno ocupa 4×4 pixeles reales.
    readonly property int lh: 270
    readonly property int lw: height > 0 ? Math.ceil(width / height * lh) : 0
    readonly property int fps: 12

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
        world = Scene.create(lw, lh, 20251115)
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

    // Solo cuenta la ventana activa: con "mostrar escritorio" o al hacer clic en el fondo no hay
    // ventana activa, aunque otras sigan maximizadas detrás.
    function updateCovered() {
        var A = TaskManager.AbstractTasksModel, idx = tasks.activeTask
        covered = !!(idx && idx.valid && tasks.data(idx, A.IsActive)
                     && (tasks.data(idx, A.IsMaximized) || tasks.data(idx, A.IsFullScreen)))
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
    Component.onCompleted: rebuildTimer.restart()

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

    // Luces, pantallas, gato, dirigible y brillo del agua: cuatro veces por segundo basta.
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
