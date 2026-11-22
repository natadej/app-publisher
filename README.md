# App Publisher

Central, disposable Capacitor wrappers and store-upload automation for Minn's games.
**No app-source repositories are modified. All credentials belong only in this repo's Actions secrets.**
The GitHub repository `natadej/app-publisher` must be created separately; this local repo does not create or push it.

## Safety boundary

- `ci.yml`: on push/PR, builds all five Android debug apps and four unsigned iOS simulator apps. No secrets or uploads.
- `publish.yml`: manual app/all × Android/iOS/both matrix. Android creates a release AAB and, when configured, uploads **internal / draft** with `changesNotSentForReview=true`. It never starts a rollout or sends changes for review. The `track` choice deliberately only permits `internal`.
- iOS registers the bundle ID if absent, archives/exports with automatic signing and ASC API authentication, then uploads **TestFlight only**. No App Store version submission, external beta review submission, or production release lanes exist. Internal testers may be added manually after processing.
- AAB artifacts are retained even if a Play API upload fails. With missing signing credentials they are **unsigned** and cannot be used for Play onboarding; add the signing secrets and rerun first. Missing upload credentials skip uploads cleanly. Missing Apple credentials still allows the simulator build and skips archive/upload.
- Only dispatch trusted refs. Source repos' default branches execute npm/Gradle build scripts; review upstream changes before publishing. PR CI never receives signing secrets. Restrict Actions access, protect main, and consider an approval-protected GitHub environment before enabling credentials.
- Public web build values are not private at runtime: Vite embeds them in the shipped JS. Do not put database service-role keys or privileged tokens into build-env secrets.

## Registry and versions

`apps.json` defines repo, kind, build command, web root, immutable app ID, name, orientation, supported platforms, icon and optional build-env-secret mappings. All sources are public and shallow-cloned over HTTPS, without a GitHub token. Optional local source paths copy files, never modify them.

| Registry id | App ID | Platforms / orientation |
|---|---|---|
| Battleship-by-Luffy | com.natadej.battleship | Android + iOS / landscape |
| Carnival-Shooter-by-Luffy | com.natadej.carnival | Android + iOS / landscape |
| Tank-Battle-by-Luffy | com.natadej.tankbattle | Android + iOS / landscape |
| Word-drop | com.natadej.worddrop | Android + iOS / portrait |
| mac-storage-doctor | com.natadej.storagedoctor | Native Android only / source layout |

Word Drop has no install/build; its web root is the source root. Storage Doctor copies `android/`, removes the source's debug release signing, overrides versions, and uses the publisher upload key for release builds. It does not get a Capacitor shell.

`version` dispatch input is numeric `major.minor.patch`; otherwise use source `package.json` or `1.0.0`. Source games currently use `0.0.0`: choose an intentional store version (e.g. `1.0.0`) for first submission.
Android versionCode = `2030000000 + GITHUB_RUN_NUMBER * 100 + GITHUB_RUN_ATTEMPT`, above Storage Doctor's existing `2026112202` and below Play's 2100000000 ceiling. Attempts >99 and exhausted ranges fail closed. iOS uses a separate increasing four/two/two-digit build sequence derived from the same run/attempt. Reruns get new versions. Publish runs are serialized, not cancelled. Do not rename/recreate the publishing workflow or reset its run sequence without raising the version epoch. Manual uploads must not reserve higher codes than this pipeline.

Icons are rasterized to a 1024×1024 source via sharp, from the best registered source icon, or a generated letter tile. `@capacitor/assets` generates native launcher icons and splash assets. Carnival/Tank's small SVGs remain scalable; Word Drop uses the fallback. Review final artwork before store submission.

## One-time Google Play setup (each app)

1. Enroll a Google Play developer account and complete identity/organization verification. Create each app manually in [Play Console](https://play.google.com/console/), matching the registry's package ID. Package IDs cannot be changed after publication.
2. Enroll in Play App Signing. Generate and back up an **upload** keystore. For an existing Play app use its already-registered upload key, or request an upload-key reset; a new arbitrary key will not work. This repository currently uses one upload key for all five apps.
3. Dispatch a signed Android build. Download the `aab-...` workflow artifact and **upload the first AAB manually** in Console. API onboarding cannot reliably initialize a new app. The automated upload may fail on this first run; the artifact step precedes it.
4. Complete store listing, screenshots, privacy-policy URL, ads declaration, content rating, **data safety**, **target audience**, app access instructions, applicable device permissions, and any testing/account requirements. Do not infer declarations from the presence of local processing alone: optional cloud services count too.
5. In Google Cloud enable the **Google Play Android Developer API**, create a service account and JSON key. Invite its email under Play Console **Users and permissions**, restrict to these apps and internal-testing release permissions. No production-release permission is necessary.
6. Subsequent dispatches upload internal drafts. A human decides when/if to roll out or send anything for review; this repo never does it.

**Storage Doctor blocker:** source uses broad file/usage access and explicitly documents sideload-only distribution. Google Play restricts `MANAGE_EXTERNAL_STORAGE` to approved core use cases. Complete the permissions declaration and obtain eligibility before expecting Play acceptance; this pipeline cannot bypass that policy. Native target SDK 35 is inherited from source; confirm current Play target requirements and update the source when required (web wrappers currently target SDK 36).

## One-time Apple setup (each web app)

1. Enroll in the Apple Developer Program. Ensure the team has accepted current agreements and has access to cloud-managed distribution certificates/automatic signing.
2. Register the bundle identifier via `bash scripts/ios.sh <id> register` (after prepare) or let a publish run do it. The API key needs permission for Certificates, Identifiers & Profiles. Existing IDs must belong to this team.
3. **Manually create the app record** in [App Store Connect](https://appstoreconnect.apple.com/apps), selecting that bundle ID, primary language, name, SKU and access. Bundle-ID API registration does not create this record. Create it before uploading a binary; `register` mode can run independently first.
4. Complete privacy-policy URL, **app privacy labels**, **age rating**, export-compliance declarations, screenshots, App Review contact/demo access as applicable, and internal TestFlight tester groups. External TestFlight testing can require beta review and is deliberately not automated.
5. Create a **team API key** under Users and Access → Integrations → App Store Connect API. Use an Admin-authorized key/team configuration with identifier and signing privileges; grant cloud-managed certificate access if required. The key ID, issuer ID, downloaded `.p8` and developer team ID are the four Apple secrets below.

The macOS job passes `-allowProvisioningUpdates -authenticationKeyPath ... -authenticationKeyID ... -authenticationKeyIssuerID ...` to archive and export and requests automatic signing. It does not import a `.p12` or install provisioning profiles. Apple's team/account permissions and cloud-signing eligibility must already be enabled; API credentials alone do not guarantee that Apple can provision a brand-new team. A signing failure is reported, not bypassed with unsigned uploads. Real signing/TestFlight upload needs verification with the owner's team; Linux checks cannot prove it.

## Exact Actions secrets

Add only to **natadej/app-publisher → Settings → Secrets and variables → Actions** after creating that repo. Never place credentials in app repos or source files.

| Secret | How to obtain / format |
|---|---|
| ANDROID_KEYSTORE_BASE64 | Generate offline: `keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`; base64 encode the binary keystore (Linux `base64 -w0 upload.jks`, macOS `base64 -i upload.jks`). Keep an offline backup. |
| ANDROID_KEYSTORE_PASSWORD | Keystore password chosen above |
| ANDROID_KEY_ALIAS | Alias chosen above, e.g. `upload` |
| ANDROID_KEY_PASSWORD | Private key password (normally same as store password for PKCS12) |
| PLAY_SERVICE_ACCOUNT_JSON | Full JSON key contents from the Google Cloud service account invited to Play Console |
| ASC_KEY_ID | Key ID shown for the App Store Connect team API key |
| ASC_ISSUER_ID | Issuer ID shown on the ASC API page |
| ASC_KEY_P8 | Entire downloaded `AuthKey_....p8` contents, or base64 encoding of that file; download is available only once |
| APPLE_TEAM_ID | 10-character team ID from developer.apple.com/account → Membership details (not issuer ID) |
| BATTLESHIP_VITE_LEADERBOARD_URL | Optional public Cloudflare leaderboard API endpoint from the owner; never committed here. Missing = device-only scores |
| CARNIVAL_VITE_SUPABASE_URL | Optional public Supabase project URL from Project Settings → API |
| CARNIVAL_VITE_SUPABASE_ANON_KEY | Optional **anon/publishable** key from the same Supabase project, never service-role key. Set together with URL; missing = local leaderboard |

Carnival's source `.env.production` is deliberately overridden with empty values when the central secrets are absent, so CI does not silently inherit production endpoints. Word Drop has no build-time configuration: the source contains public Supabase leaderboard config; Firebase sync is configured by the parent inside the app, and Gemini keys are user-entered. The pipeline does not inject private Gemini or Firebase admin keys.

Signing material is decoded only into restrictive temporary directories and removed on script exit. No signing files are included in artifacts. Android uses a Gradle init script with environment-based passwords; iOS uses a temporary P8 for Xcode/fastlane.

## Run

Prerequisites: Node 24, JDK 21, Android SDK (`ANDROID_HOME`, platforms/build tools 35 and 36), and Internet for npm/Maven. iOS also needs macOS with current Xcode, Ruby 3.3 and Bundler (`bundle install`). Generated iOS projects use Swift Package Manager, not CocoaPods. CI installs the tools; macos-latest supplies Xcode.

```sh
npm ci
npm test
npm run prepare-app -- Tank-Battle-by-Luffy android
bash scripts/build-android.sh Tank-Battle-by-Luffy debug
# APK: work/Tank-Battle-by-Luffy/project/android/app/build/outputs/apk/debug/app-debug.apk

# Optional local source snapshot instead of public clone:
npm run prepare-app -- Word-drop android /absolute/path/to/Word-drop
bash scripts/build-android.sh Word-drop debug

# With signing env already set (do not put credentials in commands/history):
bash scripts/build-android.sh Tank-Battle-by-Luffy release
# AAB: work/Tank-Battle-by-Luffy/project/android/app/build/outputs/bundle/release/*.aab

# macOS, separate fresh preparation:
npm run prepare-app -- Battleship-by-Luffy ios
bash scripts/ios.sh Battleship-by-Luffy simulator
bundle install
bash scripts/ios.sh Battleship-by-Luffy register
bash scripts/ios.sh Battleship-by-Luffy testflight

# After the owner creates/pushes the repo and sets secrets:
gh workflow run publish.yml -R natadej/app-publisher \
  -f app=Tank-Battle-by-Luffy -f platform=android -f track=internal -f version=1.0.0
```

Generated projects live under ignored `work/<id>/`; preparation refuses to overwrite one. Remove only that generated app directory to start fresh. Source repositories remain untouched. `VERSION_NAME` overrides the version locally. `build` registry commands currently all use `npm run build`; `null` means copy-only.

Local verification on this machine required JDK 21 (the preinstalled default was 17) and SDK 36 installation. Maven Central returned HTTP 429 for dependency downloads; a local-only Gradle init script redirected Maven Central to Google's mirror. Extra Gradle arguments can be passed after the build mode, e.g. `bash scripts/build-android.sh <id> debug -I /absolute/path/to/local-mirror.gradle`. No mirror override is imposed on GitHub runners.

## WebView compatibility and remaining device checks

- **Paths:** all Vite configs use relative `base: './'`, not `/Repo-Name/`; Word Drop uses relative local assets. Existing GitHub Pages URLs in sharing text do not affect bundled asset loading. Generated PWA `registerSW.js` tags are removed and the service worker file is not used in the native wrapper; Capacitor bundles its own assets. The web manifest can remain without affecting native orientation.
- **Carnival:** Android CAMERA/RECORD_AUDIO/MODIFY_AUDIO_SETTINGS and iOS camera/photo/microphone/speech usage strings are generated. MediaPipe uses bundled model/WASM assets and browser camera APIs. Capacitor handles WebView media permission prompts, but actual camera access, eye calibration, WASM support and performance must be tested on physical devices. Loading models offline must be tested after a fresh native install, not just after a web cache warmup.
- **Word Drop:** same camera/microphone/photo/speech declarations. Web Speech `SpeechRecognition` is not reliably available in Android WebView/WKWebView; adding usage strings does **not** add a native speech engine. Its parent “He read it” button is the fallback. A native speech plugin and source integration would be needed for dependable voice checking. Google sign-in via Firebase popup may be blocked in embedded browsers; a system-browser/native auth flow may be needed. Firebase authorized-domain/origin and OAuth configuration must account for Capacitor origins, not just GitHub Pages.
- Word Drop loads Google fonts, Tesseract/ONNX runtime from CDNs, optional Gemini APIs and Supabase over HTTPS. It is not fully offline. Speech synthesis voices vary by device. Photo picker, local storage persistence and permissions need device checks.
- Leaderboard backends must permit Capacitor origins (`https://localhost` on Android / `capacitor://localhost` on iOS) via CORS; Battleship's source Worker allowlist may currently only allow the web deployment. Configure the backend separately. No live endpoint is committed or contacted by these checks.
- App Store minimum-functionality and kids/privacy policies still apply. A successful wrapper build is not evidence of store acceptance or a working microphone/sign-in flow.

No store credentials or live uploads are used by local verification. iOS signing/simulator checks are left to the macOS Actions runner unless separately verified on an authorized Mac.
