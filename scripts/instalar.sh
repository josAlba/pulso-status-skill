#!/usr/bin/env bash
# Instala la skill en ~/.claude/skills/pulso (para todos los proyectos)
# o en .claude/skills/pulso de un proyecto concreto.
#
#   ./scripts/instalar.sh                  enlace simbólico en ~/.claude/skills (se actualiza con git pull)
#   ./scripts/instalar.sh --copiar         copia en lugar de enlace
#   ./scripts/instalar.sh /ruta/proyecto   instala en /ruta/proyecto/.claude/skills
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/skills/pulso"
MODE=link
TARGET_BASE="$HOME/.claude/skills"

for arg in "$@"; do
  case "$arg" in
    --copiar) MODE=copy ;;
    *) TARGET_BASE="$(cd "$arg" && pwd)/.claude/skills" ;;
  esac
done

TARGET="$TARGET_BASE/pulso"
mkdir -p "$TARGET_BASE"
if [[ -e "$TARGET" || -L "$TARGET" ]]; then
  echo "Ya existe $TARGET. Bórralo o renómbralo antes de instalar." >&2
  exit 1
fi

if [[ "$MODE" == copy ]]; then
  cp -R "$SOURCE" "$TARGET"
else
  ln -s "$SOURCE" "$TARGET"
fi
echo "Skill instalada en $TARGET"
