#!/usr/bin/env bash
# Instala o actualiza Pixel City para el usuario actual. Se puede ejecutar varias veces.
#
#   ./install.sh              instala, o actualiza si ya estaba instalado
#   ./install.sh --activate   además lo pone como fondo en todas las pantallas
#   ./install.sh --restart    además reinicia plasmashell para cargar el código nuevo
#   ./install.sh --uninstall  lo desinstala (cambia antes a otro fondo)
set -euo pipefail

ID="org.xaw.pixelcity"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTIVATE=0
RESTART=0
UNINSTALL=0

for arg in "$@"; do
    case "$arg" in
        --activate) ACTIVATE=1 ;;
        --restart) RESTART=1 ;;
        --uninstall) UNINSTALL=1 ;;
        -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
        *) echo "Opción desconocida: $arg" >&2; exit 2 ;;
    esac
done

command -v kpackagetool6 >/dev/null || { echo "Falta kpackagetool6: se necesita KDE Plasma 6." >&2; exit 1; }

qdbus_cmd() {
    for q in qdbus6 qdbus /usr/lib/qt6/bin/qdbus; do
        command -v "$q" >/dev/null 2>&1 && { echo "$q"; return; }
    done
    return 1
}

if [ "$UNINSTALL" = 1 ]; then
    kpackagetool6 -t Plasma/Wallpaper -r "$ID"
    exit 0
fi

if kpackagetool6 -t Plasma/Wallpaper --list 2>/dev/null | grep -qx "$ID"; then
    kpackagetool6 -t Plasma/Wallpaper -u "$DIR/package"
else
    kpackagetool6 -t Plasma/Wallpaper -i "$DIR/package"
fi

if [ "$RESTART" = 1 ]; then
    systemctl --user restart plasma-plasmashell.service
    # Espera a que plasmashell vuelva a responder por D-Bus antes de seguir.
    for _ in $(seq 1 30); do
        Q="$(qdbus_cmd)" && "$Q" org.kde.plasmashell /PlasmaShell >/dev/null 2>&1 && break
        sleep 0.5
    done
fi

if [ "$ACTIVATE" = 1 ]; then
    Q="$(qdbus_cmd)" || { echo "No encontré qdbus; actívalo a mano en Configurar escritorio y fondo." >&2; exit 1; }
    "$Q" org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell.evaluateScript \
        "desktops().forEach(function (d) { if (d.screen >= 0) d.wallpaperPlugin = '$ID'; });"
    echo "Pixel City activado como fondo."
fi
