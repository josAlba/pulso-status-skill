# Changelog

## 2.0.0 · 2026-11-24

### Changed
- The whole skill is now written in English: `SKILL.md`, every reference, the demo data and the template's comments.
- The template speaks English by default and ships a Spanish dictionary. It picks one from `<html lang>` (regional variants such as `es-MX` included) and falls back to English. Copy now lives in `I18N` instead of `TEXT`.
- Modal and tab URLs use English slugs: `#processes/<key>` and `#events`. The 1.x slugs `#procesos/<key>` and `#eventos` keep working.
- `scripts/instalar.sh` is now `scripts/install.sh` and takes `--copy` (`--copiar` still works).
- `scripts/capturas.sh` is replaced by `scripts/screenshots.mjs`, which needs no macOS tools, frames every view and renders an animated diagram.
- `SKILL.md` gains "when not to use it", a checkpoint after the inventory, a definition of done and a list of common mistakes.

### Fixed
- The derived summary counted sub-components ("24 components running"); it now counts top-level components, as the contract says.
- The expired-session banner is built with DOM nodes instead of `innerHTML`.
- Event times no longer wrap when the locale uses AM/PM.
- The template header comment showed the seed escape as `<` instead of `<`.

### Added
- `?lang=` parameter in the demo server.
- Go adapter example in `references/adapters.md`.

## 1.1.0

- Connection map in the Infrastructure tab.

## 1.0.0

- First release.
