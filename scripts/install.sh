#!/usr/bin/env bash
# Installs the skill in ~/.claude/skills/pulso (every project)
# or in .claude/skills/pulso of a single project.
#
#   ./scripts/install.sh                 symlink in ~/.claude/skills (stays current with git pull)
#   ./scripts/install.sh --copy          copy instead of symlink
#   ./scripts/install.sh /path/project   install in /path/project/.claude/skills
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/skills/pulso"
MODE=link
TARGET_BASE="$HOME/.claude/skills"

for arg in "$@"; do
  case "$arg" in
    --copy|--copiar) MODE=copy ;;
    -h|--help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "Unknown option: $arg" >&2; exit 2 ;;
    *) TARGET_BASE="$(cd "$arg" && pwd)/.claude/skills" ;;
  esac
done

TARGET="$TARGET_BASE/pulso"
mkdir -p "$TARGET_BASE"
if [[ -e "$TARGET" || -L "$TARGET" ]]; then
  echo "$TARGET already exists. Remove or rename it before installing." >&2
  exit 1
fi

if [[ "$MODE" == copy ]]; then
  cp -R "$SOURCE" "$TARGET"
else
  ln -s "$SOURCE" "$TARGET"
fi
echo "Skill installed in $TARGET"
