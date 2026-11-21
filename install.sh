#!/usr/bin/env bash
# Instala o actualiza Pixel City para el usuario actual. Se puede ejecutar varias veces.
#
#   ./install.sh              instala, o actualiza si ya estaba instalado (con el comando pixelcity
#                             y sus atajos de teclado Meta+Ctrl+letra)
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
        -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
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

# Atajos de teclado: un .desktop oculto por orden que se registra en kglobalaccel como los
# "comandos" de Preferencias del sistema → Atajos (ahí se pueden cambiar; reinstalar respeta el
# cambio). Formato: orden|tecla|nombre; la tecla siempre es Meta+Ctrl+letra.
BIN="$HOME/.local/bin/pixelcity"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
SHORTCUTS=(
    "fuegos|Meta+Ctrl+F|fuegos artificiales"
    "ovni|Meta+Ctrl+U|ovni"
    "estrellas|Meta+Ctrl+E|lluvia de estrellas"
    "aurora|Meta+Ctrl+B|aurora boreal"
    "gato|Meta+Ctrl+G|gato negro"
    "globo|Meta+Ctrl+O|globo que se escapa"
    "lluvia|Meta+Ctrl+L|empezar o parar la lluvia"
    "jets|Meta+Ctrl+J|jets"
)

if [ "$UNINSTALL" = 1 ]; then
    kpackagetool6 -t Plasma/Wallpaper -r "$ID"
    rm -f "$BIN"
    for s in "${SHORTCUTS[@]}"; do
        rm -f "$APPS/$ID.${s%%|*}.desktop"
        gdbus call --session --dest org.kde.kglobalaccel --object-path /kglobalaccel \
            --method org.kde.KGlobalAccel.unregister "$ID.${s%%|*}.desktop" _launch >/dev/null 2>&1 || true
    done
    command -v kbuildsycoca6 >/dev/null && kbuildsycoca6 >/dev/null 2>&1 || true
    exit 0
fi

if kpackagetool6 -t Plasma/Wallpaper --list 2>/dev/null | grep -qx "$ID"; then
    kpackagetool6 -t Plasma/Wallpaper -u "$DIR/package"
else
    kpackagetool6 -t Plasma/Wallpaper -i "$DIR/package"
fi

mkdir -p "$(dirname "$BIN")" "$APPS"
install -m 755 "$DIR/bin/pixelcity" "$BIN"
for s in "${SHORTCUTS[@]}"; do
    IFS='|' read -r order key name <<< "$s"
    cat > "$APPS/$ID.$order.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Pixel City: $name
Exec=$BIN $order
Icon=preferences-desktop-wallpaper
NoDisplay=true
StartupNotify=false
X-KDE-GlobalAccel-CommandShortcut=true
X-KDE-Shortcuts=$key
EOF
done
command -v kbuildsycoca6 >/dev/null && kbuildsycoca6 >/dev/null 2>&1 || true

# Registra cada atajo: primero como predeterminado y luego como actual, sin pisar uno que el
# usuario ya haya cambiado (kglobalaccel carga el guardado si existe).
register_shortcuts() {
    command -v gdbus >/dev/null || return 1
    local s order key name comp code
    for s in "${SHORTCUTS[@]}"; do
        IFS='|' read -r order key name <<< "$s"
        comp="$ID.$order.desktop"
        code=$(( 0x10000000 | 0x04000000 | $(printf '%d' "'${key##*+}") ))   # Meta | Ctrl | letra
        local act="['$comp', '_launch', 'Pixel City: $name', 'Pixel City: $name']"
        gdbus call --session --dest org.kde.kglobalaccel --object-path /kglobalaccel \
            --method org.kde.KGlobalAccel.doRegister "$act" >/dev/null || return 1
        gdbus call --session --dest org.kde.kglobalaccel --object-path /kglobalaccel \
            --method org.kde.KGlobalAccel.setShortcut "$act" "[$code]" 1 >/dev/null || return 1
        gdbus call --session --dest org.kde.kglobalaccel --object-path /kglobalaccel \
            --method org.kde.KGlobalAccel.setShortcut "$act" "[$code]" 0 >/dev/null || return 1
    done
}
register_shortcuts || echo "No pude registrar los atajos; agrégalos en Preferencias del sistema → Atajos." >&2

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
