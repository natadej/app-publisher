import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { buildNumber, iosBuildNumber, versionName, configureInfoPlist } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'apps.json')));
const [id, platform = 'android', localSource] = process.argv.slice(2);
const app = registry[id];
if (!app || !app.platforms.includes(platform)) throw new Error('Usage: npm run prepare-app -- <registry-id> <android|ios> [local-source]');
const run = (cmd, args, cwd, env = process.env) => execFileSync(cmd, args, { cwd, env, stdio: 'inherit' });
const work = path.join(root, 'work', id);
if (fs.existsSync(work)) throw new Error(`Remove generated directory before preparing again: ${work}`);
fs.mkdirSync(work, { recursive: true });
const source = path.join(work, 'source');
if (localSource) fs.cpSync(path.resolve(localSource), source, { recursive: true, filter: p => !['.git', 'node_modules', 'dist'].includes(path.basename(p)) });
else run('git', ['clone', '--depth', '1', `https://github.com/${app.repo}.git`, source], root);
const pkgPath = path.join(source, 'package.json');
const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath)) : {};
const version = versionName(process.env.VERSION_NAME, pkg.version || '1.0.0');
const code = buildNumber();
const project = path.join(work, 'project');
fs.mkdirSync(project);
fs.writeFileSync(path.join(work, 'metadata.json'), JSON.stringify({ ...app, id, version, code }, null, 2));
if (app.kind === 'native') {
  fs.cpSync(path.join(source, app.nativeDir), path.join(project, 'android'), { recursive: true, filter: p => !['.gradle', 'build', 'local.properties'].includes(path.basename(p)) });
  const gradle = path.join(project, 'android/app/build.gradle.kts');
  let text = fs.readFileSync(gradle, 'utf8');
  text = text.replace(/versionCode = \d+/, `versionCode = ${code}`).replace(/versionName = "[^"]+"/, `versionName = "${version}"`).replace(/\s*signingConfig = signingConfigs.getByName\("debug"\)/, '');
  fs.writeFileSync(gradle, text);
} else {
  const env = { ...process.env };
  for (const [target, secret] of Object.entries(app.buildEnv)) {
    // Override source .env.production without ever persisting a supplied value.
    env[target] = process.env[secret] || '';
  }
  if (app.build) {
    run('npm', [fs.existsSync(path.join(source, 'package-lock.json')) ? 'ci' : 'install'], source, env);
    run('sh', ['-c', app.build], source, env);
  }
  const web = path.join(project, 'www');
  fs.cpSync(path.join(source, app.webDir), web, { recursive: true, filter: p => !path.basename(p).startsWith('.') && !['node_modules', 'firestore.rules', 'supabase', 'tools'].includes(path.basename(p)) });
  // Native shells load bundled files, not the web service worker's cache.
  const html = path.join(web, 'index.html');
  fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace(/<script\b[^>]*src=["'][^"']*registerSW\.js["'][^>]*><\/script>/g, ''));
  for (const f of ['sw.js', 'registerSW.js']) fs.rmSync(path.join(web, f), { force: true });
  const dependencies = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).dependencies;
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'published-app', version, private: true, dependencies: Object.fromEntries(['@capacitor/core', '@capacitor/android', '@capacitor/ios'].map(k => [k, dependencies[k]])) }));
  run('npm', ['install', '--ignore-scripts'], project);
  fs.writeFileSync(path.join(project, 'capacitor.config.json'), JSON.stringify({ appId: app.appId, appName: app.name, webDir: 'www' }, null, 2));
  const cap = path.join(root, 'node_modules/.bin/cap');
  run(cap, ['add', platform, ...(platform === 'ios' ? ['--packagemanager', 'SPM'] : [])], project);
  const assets = path.join(project, 'assets');
  fs.mkdirSync(assets);
  const icon = app.icon && path.join(source, app.icon);
  const fallback = Buffer.from(`<svg width="1024" height="1024"><rect width="1024" height="1024" rx="180" fill="#214d85"/><text x="512" y="640" text-anchor="middle" font-family="sans-serif" font-size="400" fill="white">${app.name[0]}</text></svg>`);
  await sharp(icon && fs.existsSync(icon) ? icon : fallback, { density: 300 }).resize(1024, 1024).png().toFile(path.join(assets, 'icon-only.png'));
  await sharp(path.join(assets, 'icon-only.png')).resize(2732, 2732, { fit: 'contain', background: '#214d85' }).toFile(path.join(assets, 'splash.png'));
  run(path.join(root, 'node_modules/.bin/capacitor-assets'), ['generate', `--${platform}`], project);
  if (platform === 'android') {
    const gradle = path.join(project, 'android/app/build.gradle');
    fs.writeFileSync(gradle, fs.readFileSync(gradle, 'utf8').replace(/versionCode \d+/, `versionCode ${code}`).replace(/versionName "[^"]+"/, `versionName "${version}"`));
    const manifest = path.join(project, 'android/app/src/main/AndroidManifest.xml');
    let xml = fs.readFileSync(manifest, 'utf8').replace('<activity', `<activity android:screenOrientation="${app.orientation}"`);
    const permissions = [app.camera && 'CAMERA', app.microphone && 'RECORD_AUDIO', app.microphone && 'MODIFY_AUDIO_SETTINGS'].filter(Boolean);
    xml = xml.replace('</manifest>', permissions.map(p => `<uses-permission android:name="android.permission.${p}" />`).join('\n') + '\n</manifest>');
    fs.writeFileSync(manifest, xml);
  } else {
    const plist = path.join(project, 'ios/App/App/Info.plist');
    fs.writeFileSync(plist, configureInfoPlist(fs.readFileSync(plist, 'utf8'), app));
    const pbx = path.join(project, 'ios/App/App.xcodeproj/project.pbxproj');
    fs.writeFileSync(pbx, fs.readFileSync(pbx, 'utf8').replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${iosBuildNumber()};`).replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`));
  }
}
if (platform === 'android') {
  const android = path.join(project, 'android');
  fs.chmodSync(path.join(android, 'gradlew'), 0o755);
  if (process.env.ANDROID_HOME) fs.writeFileSync(path.join(android, 'local.properties'), `sdk.dir=${process.env.ANDROID_HOME}\n`);
}
console.log(`Prepared ${id} ${platform}: ${project} (version ${version}, build ${code})`);
