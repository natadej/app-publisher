#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
APP=${1:?app id required}
MODE=${2:-debug}
[[ "$APP" =~ ^[A-Za-z0-9-]+$ ]] || exit 2
PROJECT="$ROOT/work/$APP/project/android"
case "$MODE" in debug|release) ;; *) echo 'mode must be debug or release' >&2; exit 2;; esac
args=(--no-daemon --console=plain)
args+=("${@:3}")
keydir=''
cleanup() { if [[ -n "$keydir" ]]; then rm -rf "$keydir"; fi; }
trap cleanup EXIT
if [[ "$MODE" == release ]]; then
  if [[ -n "${ANDROID_KEYSTORE_BASE64:-}" && -n "${ANDROID_KEYSTORE_PASSWORD:-}" && -n "${ANDROID_KEY_ALIAS:-}" && -n "${ANDROID_KEY_PASSWORD:-}" ]]; then
    umask 077
    keydir=$(mktemp -d)
    export PUBLISHER_KEYSTORE="$keydir/upload.jks"
    node -e 'require("fs").writeFileSync(process.env.PUBLISHER_KEYSTORE, Buffer.from(process.env.ANDROID_KEYSTORE_BASE64, "base64"))'
    args+=(-I "$ROOT/scripts/android-signing.gradle")
    echo 'Building signed release AAB'
  else
    echo 'Signing secrets incomplete: building unsigned AAB; Play upload will be skipped.'
  fi
  task=bundleRelease
else
  task=assembleDebug
fi
cd "$PROJECT"
./gradlew "${args[@]}" "$task"
