#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
APP=${1:?app id required}
MODE=${2:-simulator}
[[ "$APP" =~ ^[A-Za-z0-9-]+$ ]] || exit 2
PROJECT="$ROOT/work/$APP/project/ios/App"
OUT="$ROOT/work/$APP/ios-output"
mkdir -p "$OUT"
if [[ "$MODE" == simulator ]]; then
  xcodebuild -project "$PROJECT/App.xcodeproj" -scheme App -configuration Debug \
    -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$OUT/DerivedData" CODE_SIGNING_ALLOWED=NO build
  exit
fi
[[ "$MODE" == testflight || "$MODE" == register ]] || { echo 'mode must be simulator, register or testflight'; exit 2; }
for name in ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8 APPLE_TEAM_ID; do
  if [[ -z "${!name:-}" ]]; then echo "Missing $name; skipping $MODE cleanly."; exit 0; fi
done
umask 077
KEYDIR=$(mktemp -d)
trap 'rm -rf "$KEYDIR"' EXIT
export ASC_KEY_PATH="$KEYDIR/AuthKey_${ASC_KEY_ID}.p8"
node -e 'const fs=require("fs"),s=process.env.ASC_KEY_P8;fs.writeFileSync(process.env.ASC_KEY_PATH,s.includes("BEGIN PRIVATE KEY")?s:Buffer.from(s,"base64"))'
cd "$ROOT"
export PUBLISHER_APP="$APP"
bundle exec fastlane ios register_bundle_id
[[ "$MODE" == register ]] && exit
auth=(-allowProvisioningUpdates -authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
xcodebuild -project "$PROJECT/App.xcodeproj" -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$OUT/App.xcarchive" \
  "${auth[@]}" DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Automatic archive
export EXPORT_PLIST="$KEYDIR/ExportOptions.plist"
python3 - <<'PY'
import os, plistlib
with open(os.environ['EXPORT_PLIST'], 'wb') as f:
    plistlib.dump({'method': 'app-store-connect', 'teamID': os.environ['APPLE_TEAM_ID'],
                  'signingStyle': 'automatic', 'manageAppVersionAndBuildNumber': False}, f)
PY
xcodebuild -exportArchive -archivePath "$OUT/App.xcarchive" -exportPath "$OUT/export" \
  -exportOptionsPlist "$EXPORT_PLIST" "${auth[@]}"
export PUBLISHER_IPA
PUBLISHER_IPA=$(find "$OUT/export" -maxdepth 1 -name '*.ipa' -print -quit)
[[ -n "$PUBLISHER_IPA" ]] || { echo 'No IPA exported'; exit 1; }
bundle exec fastlane ios beta
