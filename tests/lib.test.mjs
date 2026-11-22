import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildNumber, iosBuildNumber, versionName, selectApps, configureInfoPlist } from '../scripts/lib.mjs';
const apps = JSON.parse(fs.readFileSync(new URL('../apps.json', import.meta.url)));
test('matrix selects supported platforms and all apps', () => {
  assert.equal(selectApps(apps, 'all', 'both').length, 5);
  assert.equal(selectApps(apps, 'all', 'ios').length, 4);
  assert.deepEqual(selectApps(apps, 'mac-storage-doctor', 'ios'), []);
  assert.throws(() => selectApps(apps, '', 'both'));
  assert.throws(() => selectApps(apps, 'all', 'production'));
});
test('versions default and validate user input', () => {
  assert.equal(versionName('', '2.3.4'), '2.3.4');
  assert.equal(versionName(undefined), '1.0.0');
  assert.equal(versionName('3.0.0', '1.0.0'), '3.0.0');
  for (const v of ['bad', '1.2', '1.0.0-beta', '1.0.0;echo']) assert.throws(() => versionName(v));
});
test('builds increment on reruns and exceed existing native version', () => {
  const a = buildNumber({ GITHUB_RUN_NUMBER: '1', GITHUB_RUN_ATTEMPT: '1' });
  const b = buildNumber({ GITHUB_RUN_NUMBER: '1', GITHUB_RUN_ATTEMPT: '2' });
  assert(a > 2026112202);
  assert(b > a);
  assert(buildNumber({ GITHUB_RUN_NUMBER: '2' }) > b);
  assert(buildNumber({}) > 0);
  assert.throws(() => buildNumber({ GITHUB_RUN_NUMBER: '999999999' }));
  assert.throws(() => buildNumber({ GITHUB_RUN_NUMBER: 'x' }));
  assert.throws(() => buildNumber({ GITHUB_RUN_NUMBER: '1', GITHUB_RUN_ATTEMPT: '100' }));
});
test('Apple build numbers fit four/two/two digits and include rerun attempt', () => {
  assert.equal(iosBuildNumber({ GITHUB_RUN_NUMBER: '1' }), '1.1.1');
  assert.equal(iosBuildNumber({ GITHUB_RUN_NUMBER: '1', GITHUB_RUN_ATTEMPT: '2' }), '1.1.2');
  assert.equal(iosBuildNumber({ GITHUB_RUN_NUMBER: '100' }), '2.0.1');
  assert.match(iosBuildNumber({}), /^\d{1,4}\.\d{1,2}\.\d{1,2}$/);
  assert.throws(() => iosBuildNumber({ GITHUB_RUN_NUMBER: '1000000' }));
});
test('Info.plist usage descriptions are root-level, not inside nested scene dictionaries', () => {
  const template = execFileSync('tar', ['-xOf', 'node_modules/@capacitor/cli/assets/ios-spm-template.tar.gz', 'App/App/Info.plist'], { encoding: 'utf8' });
  const xml = configureInfoPlist(template, apps['Word-drop']);
  const parsed = JSON.parse(execFileSync('python3', ['-c', 'import plistlib,sys,json;print(json.dumps(plistlib.loads(sys.stdin.buffer.read())))'], { input: xml, encoding: 'utf8' }));
  assert(parsed.NSCameraUsageDescription);
  assert(parsed.NSMicrophoneUsageDescription);
  assert(parsed.NSSpeechRecognitionUsageDescription);
  assert.equal(parsed.UIRequiresFullScreen, true);
  assert.deepEqual(parsed.UISupportedInterfaceOrientations, ['UIInterfaceOrientationPortrait']);
  assert(!parsed.UIApplicationSceneManifest.NSCameraUsageDescription);
  const landscape = configureInfoPlist(template, apps['Tank-Battle-by-Luffy']);
  assert(!landscape.includes('NSCameraUsageDescription'));
  assert(!landscape.includes('<string>UIInterfaceOrientationPortrait</string>'));
  assert.throws(() => configureInfoPlist('', {}));
});
test('registry has unique immutable identities and valid source/build data', () => {
  assert.equal(new Set(Object.values(apps).map(a => a.appId)).size, 5);
  for (const app of Object.values(apps)) {
    assert.match(app.repo, /^natadej\/[A-Za-z0-9-]+$/);
    assert.match(app.appId, /^com\.natadej\.[a-z]+$/);
    for (const secret of Object.values(app.buildEnv)) assert.match(secret, /^[A-Z][A-Z_]+$/);
  }
});
