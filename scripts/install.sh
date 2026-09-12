#!/bin/bash
# Installs mdslide on a Mac (Apple silicon): the app into /Applications, python-pptx into mdslide's own venv.
#
#   curl -fsSL https://froggugugugu.github.io/mdslide/install.sh | bash
#
# curl does not mark what it downloads with com.apple.quarantine, so the unnotarized app opens without the
# "is damaged" alert a browser download gets (ADR-0021, ADR-0022). Nothing runs until the last line calls main,
# so a download cut off halfway does nothing.
#
# Options (environment variables, e.g. `... | MDSLIDE_SKIP_PYTHON=1 bash`):
#   MDSLIDE_VERSION=0.2.0  install this release instead of the latest
#   MDSLIDE_APP_DIR=DIR    install into DIR (default /Applications, or ~/Applications when that is not writable)
#   MDSLIDE_ZIP=FILE       install from a downloaded mdslide-<version>-arm64-mac.zip instead of GitHub
#   MDSLIDE_SKIP_PYTHON=1  leave python-pptx alone
#   MDSLIDE_NO_OPEN=1      do not open the app at the end
set -euo pipefail

REPO="froggugugugu/mdslide"
WORK=""

say() { printf '%s\n' "$*"; }
fail() { printf 'mdslide: %s\n' "$*" >&2; exit 1; }
cleanup() { if [ -n "$WORK" ]; then rm -rf "$WORK"; fi; }

# Apple silicon, also when the terminal runs under Rosetta (uname -m then says x86_64).
is_apple_silicon() { [ "$(uname -m)" = arm64 ] || [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = 1 ]; }

# The folder the app keeps settings.json and the venv in: next to MDSLIDE_CONFIG, else $XDG_CONFIG_HOME/mdslide (electron/main.ts).
config_dir() {
  if [ -n "${MDSLIDE_CONFIG:-}" ]; then dirname "$MDSLIDE_CONFIG"; else printf '%s\n' "${XDG_CONFIG_HOME:-$HOME/.config}/mdslide"; fi
}

# The main process of the app at $1 (its helpers live under Contents/Frameworks, so they do not match).
is_running() {
  ps -axo command= | awk -v exe="$1/Contents/MacOS/mdslide" 'index($0, exe) == 1 { found = 1 } END { exit !found }'
}

# releases/latest redirects to releases/tag/v<version>.
latest_version() {
  local url
  url="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest")" || return 1
  printf '%s\n' "${url##*/v}"
}

setup_python() {
  local venv py
  venv="$(config_dir)/venv"
  if [ -x "$venv/bin/python3" ] && "$venv/bin/python3" -c "import pptx" >/dev/null 2>&1; then
    # Braces: bash in a UTF-8 locale reads the first byte of "（" as part of an unbraced name.
    say "python-pptx は入っています（${venv}）。"
    return 0
  fi
  py="$(command -v python3 || true)"
  # Without the Command Line Tools, /usr/bin/python3 only opens an installer dialog (ADR-0019).
  if [ -z "$py" ] || { [ "$py" = /usr/bin/python3 ] && ! xcode-select -p >/dev/null 2>&1; }; then
    say "Python 3 が無いので、python-pptx は入れませんでした。xcode-select --install で Command Line Tools を入れてから、もう一度実行してください。"
    return 0
  fi
  if ! "$py" -c 'import sys; sys.exit(sys.version_info < (3, 9))' >/dev/null 2>&1; then
    say "python-pptx には Python 3.9 以上が要ります（${py}）。python-pptx は入れませんでした。"
    return 0
  fi
  say "python-pptx を $venv に入れています..."
  if "$py" -m venv "$venv" && "$venv/bin/python3" -m pip install --quiet --disable-pip-version-check python-pptx; then
    say "python-pptx を入れました。"
  else
    say "python-pptx を入れられませんでした。mdslide の設定の「書き出し」に入れ方があります。"
  fi
}

main() {
  [ "$(uname -s)" = Darwin ] || fail "mdslide は macOS 専用です。"
  is_apple_silicon || fail "配布版は Apple silicon の Mac 向けです。Intel の Mac ではソースから動かしてください: https://github.com/$REPO"

  local app_dir="${MDSLIDE_APP_DIR:-}"
  if [ -z "$app_dir" ]; then
    if [ -w /Applications ]; then app_dir=/Applications; else app_dir="$HOME/Applications"; fi
  fi
  local target="$app_dir/mdslide.app"
  if is_running "$target"; then fail "mdslide が起動しています。終了してから、もう一度実行してください。"; fi

  WORK="$(mktemp -d)"
  trap cleanup EXIT

  local zip="${MDSLIDE_ZIP:-}" version
  if [ -n "$zip" ]; then
    [ -f "$zip" ] || fail "$zip がありません。"
  else
    version="${MDSLIDE_VERSION:-}"
    if [ -z "$version" ]; then
      version="$(latest_version)" || fail "最新版を調べられませんでした。ネットワークを確かめてください。"
    fi
    version="${version#v}"
    case "$version" in
      "" | *[!0-9.]*) fail "版を読み取れませんでした: $version" ;;
    esac
    zip="$WORK/mdslide-$version-arm64-mac.zip"
    say "mdslide $version をダウンロードしています..."
    curl -fL --progress-bar -o "$zip" "https://github.com/$REPO/releases/download/v$version/mdslide-$version-arm64-mac.zip" \
      || fail "mdslide $version をダウンロードできませんでした。"
  fi

  # --noqtn: a zip downloaded with a browser must not pass its quarantine mark on to the app.
  ditto -x -k --noqtn "$zip" "$WORK/unpacked" || fail "$zip を展開できませんでした。"
  local app="$WORK/unpacked/mdslide.app" got
  [ -d "$app" ] || fail "$zip に mdslide.app が入っていません。"
  codesign --verify --deep --strict "$app" >/dev/null 2>&1 \
    || fail "mdslide.app の署名を確かめられませんでした。ダウンロードが壊れている可能性があるので、入れませんでした。"
  got="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist" 2>/dev/null || true)"

  mkdir -p "$app_dir" || fail "$app_dir を作れませんでした。"
  if [ -e "$target" ]; then
    mv "$target" "$WORK/previous.app" || fail "$target を置き換えられませんでした。"
  fi
  if ! mv "$app" "$target"; then
    if [ -e "$WORK/previous.app" ]; then mv "$WORK/previous.app" "$target"; fi
    fail "$target に入れられませんでした。"
  fi
  xattr -dr com.apple.quarantine "$target" 2>/dev/null || true
  say "mdslide ${got:-} を $target に入れました。"

  if [ "${MDSLIDE_SKIP_PYTHON:-}" != 1 ]; then setup_python; fi
  if [ "${MDSLIDE_NO_OPEN:-}" != 1 ]; then open "$target" || true; fi
}

main
