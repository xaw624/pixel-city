import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

// Página de ajustes del fondo (Configurar escritorio y fondo → Pixel City). La ventana de Plasma no
// desplaza los ajustes de los fondos, así que la página trae su propia zona desplazable (como el fondo
// «Imagen» de KDE). Es un Item con poco alto implícito (un ColumnLayout lo recalcula con todo el
// contenido): así Plasma le da el alto visible de la ventana y la zona de abajo se desplaza.
Item {
    id: page

    property var configDialog
    // Para alinear nuestras etiquetas con las de Plasma ("Distribución:", "Tipo de fondo…").
    property alias formLayout: form
    implicitHeight: Kirigami.Units.gridUnit * 12
    implicitWidth: form.implicitWidth

    property int cfg_Lines
    property int cfg_LinesDefault: 270
    property string cfg_Scene
    property string cfg_SceneDefault: "city"
    property string cfg_Rotate
    property string cfg_RotateDefault: "off"
    property int cfg_City
    property int cfg_CityDefault: 0
    property int cfg_Fps
    property int cfg_FpsDefault: 12
    property string cfg_Pause
    property string cfg_PauseDefault: "active"
    property bool cfg_Clock12
    property bool cfg_Clock12Default: false
    property bool cfg_NoFlash
    property bool cfg_NoFlashDefault: false
    property bool cfg_Flyers
    property bool cfg_FlyersDefault: true
    property bool cfg_Jets
    property bool cfg_JetsDefault: true
    property bool cfg_Oddities
    property bool cfg_OdditiesDefault: true
    property bool cfg_Seasons
    property bool cfg_SeasonsDefault: true
    property bool cfg_Mouse
    property bool cfg_MouseDefault: true

    readonly property var scenes: [
        { id: "city", text: "Ciudad junto al agua" },
        { id: "beach", text: "Playa" },
        { id: "mountain", text: "Montaña con cabaña" },
        { id: "village", text: "Pueblo nevado" },
        { id: "farm", text: "Campo con granja y molino" },
        { id: "cyber", text: "Calle ciberpunk" }
    ]
    readonly property var rotations: [
        { id: "off", text: "No, siempre el elegido" },
        { id: "hour", text: "Cada hora" },
        { id: "day", text: "Cada día" },
        { id: "season", text: "Según la estación del año" }
    ]
    // Las líneas que dan pixeles enteros en una pantalla de 1080p.
    readonly property var levels: [
        { id: 216, text: "Baja · pixeles grandes (216 líneas)" },
        { id: 270, text: "Normal (270 líneas)" },
        { id: 360, text: "Alta (360 líneas)" },
        { id: 540, text: "Muy alta · pixeles finos (540 líneas)" }
    ]
    readonly property var speeds: [
        { id: 12, text: "Normal (12 cuadros por segundo)" },
        { id: 8, text: "Ahorro (8 cuadros por segundo)" },
        { id: 6, text: "Mínima (6 cuadros por segundo)" }
    ]
    readonly property var pauses: [
        { id: "active", text: "Si la ventana activa está maximizada" },
        { id: "any", text: "Si cualquier ventana está maximizada" },
        { id: "never", text: "Nunca" }
    ]

    // Posición de un valor en una de las listas de arriba (o la primera si no está).
    function find(list, id) {
        for (var i = 0; i < list.length; i++)
            if (list[i].id === id)
                return i
        return 0
    }

    // Cada ajuste va en una sola fila con su botón de ayuda (?), para que la página quede compacta.
    component Help: Kirigami.ContextualHelpButton {}

    QQC2.ScrollView {
        id: scroll
        anchors.fill: parent
        contentWidth: availableWidth
        QQC2.ScrollBar.horizontal.policy: QQC2.ScrollBar.AlwaysOff

        Kirigami.FormLayout {
            id: form
            width: scroll.availableWidth
            // Siempre con las etiquetas a la izquierda: en el modo angosto (etiquetas arriba) Kirigami
            // calcula mal el alto y la zona no se puede desplazar.
            wideMode: true

            Component.onCompleted: {
                if (typeof appearanceRoot !== "undefined" && appearanceRoot.parentLayout)
                    twinFormLayouts.push(appearanceRoot.parentLayout)
            }

            // ----- Escena -----

            RowLayout {
                Kirigami.FormData.label: "Escenario:"
                QQC2.ComboBox {
                    model: page.scenes
                    textRole: "text"
                    enabled: page.cfg_Rotate === "off"
                    currentIndex: page.find(page.scenes, page.cfg_Scene)
                    onActivated: page.cfg_Scene = page.scenes[currentIndex].id
                }
            }

            RowLayout {
                Kirigami.FormData.label: "Cambiar de escenario:"
                QQC2.ComboBox {
                    model: page.rotations
                    textRole: "text"
                    currentIndex: page.find(page.rotations, page.cfg_Rotate)
                    onActivated: page.cfg_Rotate = page.rotations[currentIndex].id
                }
                Help {
                    toolTipText: "Cambia de escenario solo. Según la estación: pueblo nevado en invierno, campo en primavera, "
                        + "playa en verano y montaña en otoño."
                }
            }

            RowLayout {
                Kirigami.FormData.label: "Ciudad n.º:"
                QQC2.SpinBox {
                    from: 0
                    to: 99999
                    editable: true
                    value: page.cfg_City
                    onValueModified: page.cfg_City = value
                }
                QQC2.Button {
                    text: "Otra"
                    icon.name: "media-playlist-shuffle"
                    onClicked: page.cfg_City = 1 + Math.floor(Math.random() * 99999)
                }
                QQC2.Button {
                    text: "La original"
                    enabled: page.cfg_City !== 0
                    onClicked: page.cfg_City = 0
                }
                Help {
                    toolTipText: "Cada número arma otra ciudad, con otros edificios y anuncios (y otra playa, montaña, pueblo…). "
                        + "La 0 es la original."
                }
            }

            RowLayout {
                Kirigami.FormData.label: "Definición:"
                QQC2.ComboBox {
                    model: page.levels
                    textRole: "text"
                    currentIndex: page.find(page.levels, page.cfg_Lines)
                    onActivated: page.cfg_Lines = page.levels[currentIndex].id
                }
                Help {
                    toolTipText: "Con más definición la escena tiene más detalle (en la ciudad, más edificios) y la gente se ve "
                        + "más chica. Usa algo más de CPU. Al cambiarla se genera de nuevo la escena."
                }
            }

            // ----- Qué se muestra -----

            Item { Kirigami.FormData.isSection: true }

            QQC2.CheckBox {
                Kirigami.FormData.label: "Mostrar:"
                text: "Relojes voladores (dirigible, avionetas, drones…)"
                checked: page.cfg_Flyers
                onToggled: page.cfg_Flyers = checked
            }
            QQC2.CheckBox {
                text: "Jets a la hora en punto"
                checked: page.cfg_Jets
                onToggled: page.cfg_Jets = checked
            }
            QQC2.CheckBox {
                text: "Curiosidades (ovni, aurora, gato, monstruo…)"
                checked: page.cfg_Oddities
                onToggled: page.cfg_Oddities = checked
            }
            QQC2.CheckBox {
                text: "Adornos de Halloween y Día de Muertos"
                checked: page.cfg_Seasons
                onToggled: page.cfg_Seasons = checked
            }

            QQC2.CheckBox {
                Kirigami.FormData.label: "Reloj:"
                text: "Formato de 12 horas"
                checked: page.cfg_Clock12
                onToggled: page.cfg_Clock12 = checked
            }

            RowLayout {
                Kirigami.FormData.label: "Accesibilidad:"
                QQC2.CheckBox {
                    text: "Sin destellos"
                    checked: page.cfg_NoFlash
                    onToggled: page.cfg_NoFlash = checked
                }
                Help {
                    toolTipText: "Quita los relámpagos y el flash de las fotos, y hace que las chispas y luces no parpadeen. "
                        + "Recomendado si las luces intermitentes te molestan."
                }
            }

            // ----- Rendimiento -----

            Item { Kirigami.FormData.isSection: true }

            RowLayout {
                Kirigami.FormData.label: "Animación:"
                QQC2.ComboBox {
                    model: page.speeds
                    textRole: "text"
                    currentIndex: page.find(page.speeds, page.cfg_Fps)
                    onActivated: page.cfg_Fps = page.speeds[currentIndex].id
                }
                Help {
                    toolTipText: "Con menos cuadros por segundo la gente camina menos fluida y el fondo gasta menos batería."
                }
            }

            RowLayout {
                Kirigami.FormData.label: "Pausar:"
                QQC2.ComboBox {
                    model: page.pauses
                    textRole: "text"
                    currentIndex: page.find(page.pauses, page.cfg_Pause)
                    onActivated: page.cfg_Pause = page.pauses[currentIndex].id
                }
                Help {
                    toolTipText: "La animación se detiene cuando una ventana tapa el escritorio. Con «cualquier ventana» ahorra "
                        + "más, pero con «Mostrar escritorio» puede seguir en pausa mientras haya ventanas maximizadas."
                }
            }

            // ----- Interacción -----

            Item { Kirigami.FormData.isSection: true }

            RowLayout {
                Kirigami.FormData.label: "Interacción:"
                QQC2.CheckBox {
                    text: "Reaccionar al ratón"
                    checked: page.cfg_Mouse
                    onToggled: page.cfg_Mouse = checked
                }
                Help {
                    toolTipText: "Espanta al gato y a las palomas, saluda a la gente, suelta globos, salpica el agua, corre al "
                        + "ovni o lanza fuegos artificiales al cielo. Solo funciona con la distribución «Escritorio» (arriba); "
                        + "con «Vista de carpetas» el ratón es para los íconos.<br><br>Los atajos funcionan siempre: "
                        + "Meta+Ctrl+F fuegos, U ovni, E estrellas, B aurora, G gato, O globo, L lluvia y J jets "
                        + "(se cambian en Preferencias del sistema → Atajos)."
                }
            }
        }
    }
}
