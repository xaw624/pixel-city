import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

// Página de ajustes del fondo (Configurar escritorio y fondo → Pixel City).
Kirigami.FormLayout {
    id: page

    property int cfg_Lines
    property int cfg_LinesDefault: 270
    property string cfg_Scene
    property string cfg_SceneDefault: "city"

    readonly property var scenes: [
        { id: "city", text: "Ciudad junto al agua" },
        { id: "beach", text: "Playa" },
        { id: "mountain", text: "Montaña con cabaña" },
        { id: "village", text: "Pueblo nevado" }
    ]

    function sceneIndex(id) {
        for (var i = 0; i < scenes.length; i++)
            if (scenes[i].id === id)
                return i
        return 0
    }

    // Las líneas que dan pixeles enteros en una pantalla de 1080p.
    readonly property var levels: [
        { lines: 216, text: "Baja · pixeles grandes (216 líneas)" },
        { lines: 270, text: "Normal (270 líneas)" },
        { lines: 360, text: "Alta (360 líneas)" },
        { lines: 540, text: "Muy alta · pixeles finos (540 líneas)" }
    ]

    function indexOf(lines) {
        for (var i = 0; i < levels.length; i++)
            if (levels[i].lines === lines)
                return i
        return 1
    }

    QQC2.ComboBox {
        id: scene
        Kirigami.FormData.label: "Escenario:"
        model: page.scenes
        textRole: "text"
        currentIndex: page.sceneIndex(page.cfg_Scene)
        onActivated: page.cfg_Scene = page.scenes[currentIndex].id
    }

    QQC2.ComboBox {
        id: lines
        Kirigami.FormData.label: "Definición:"
        model: page.levels
        textRole: "text"
        currentIndex: page.indexOf(page.cfg_Lines)
        onActivated: page.cfg_Lines = page.levels[currentIndex].lines
    }

    QQC2.Label {
        Layout.maximumWidth: Kirigami.Units.gridUnit * 22
        wrapMode: Text.WordWrap
        font: Kirigami.Theme.smallFont
        opacity: 0.75
        text: "Con más definición la escena tiene más detalle (en la ciudad, más edificios) y la gente se ve más chica. "
            + "Usa algo más de CPU. Al cambiarla se genera de nuevo la escena."
    }
}
