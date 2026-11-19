#!/usr/bin/env bash
# Arma el zip de Pixel City para Lively Wallpaper (Windows): dist/pixel-city-lively-<versión>.zip
# Se arrastra el zip a la ventana de Lively para agregarlo a la biblioteca.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(sed -n 's/.*"Version": *"\([^"]*\)".*/\1/p' package/metadata.json)
work=dist/lively
zipfile=dist/pixel-city-lively-$version.zip

rm -rf "$work" "$zipfile"
mkdir -p "$work"
cp lively/index.html lively/LivelyInfo.json lively/LivelyProperties.json "$work/"
cp package/contents/ui/scene.js "$work/"
cp LICENSE "$work/LICENSE.txt"
# Miniatura: la captura de noche reducida a un pixel por pixel de arte (1920×1080 → 480×270).
magick docs/noche.png -filter point -resize 480x270 -quality 92 "$work/thumbnail.jpg"

(cd "$work" && zip -q -X -r "../$(basename "$zipfile")" .)
echo "$zipfile"
