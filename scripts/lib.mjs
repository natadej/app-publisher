export function buildNumber(env = process.env) {
  // Existing Storage Doctor codes are already above two billion. This epoch
  // gives every workflow attempt a unique, increasing code below Play's limit.
  if (Number(env.GITHUB_RUN_ATTEMPT || 1) > 99) throw new Error('Run attempt exceeds reserved range');
  const n = env.GITHUB_RUN_NUMBER
    ? 2030000000 + Number(env.GITHUB_RUN_NUMBER) * 100 + Number(env.GITHUB_RUN_ATTEMPT || 1)
    : Math.floor(Date.now() / 1000);
  if (!Number.isInteger(n) || n < 1 || n > 2100000000) throw new Error('Invalid/exhausted build number');
  return n;
}
export function iosBuildNumber(env = process.env) {
  const serial = env.GITHUB_RUN_NUMBER
    ? Number(env.GITHUB_RUN_NUMBER) * 100 + Number(env.GITHUB_RUN_ATTEMPT || 1)
    : Math.floor(Date.now() / 1000) - 1767225600;
  if (!Number.isInteger(serial) || serial < 1 || serial >= 99990000 || Number(env.GITHUB_RUN_ATTEMPT || 1) > 99) throw new Error('Invalid iOS build sequence');
  return `${Math.floor(serial / 10000) + 1}.${Math.floor(serial / 100) % 100}.${serial % 100}`;
}
export function versionName(input, source = '1.0.0') {
  const v = input || source;
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error('Version must be numeric major.minor.patch');
  return v;
}
export function selectApps(registry, app, platform) {
  if (!['android', 'ios', 'both'].includes(platform)) throw new Error('Unknown platform');
  if (app !== 'all' && !registry[app]) throw new Error('Unknown app');
  return Object.entries(registry).filter(([id, a]) => (app === 'all' || id === app) && (platform === 'both' || a.platforms.includes(platform))).map(([id]) => id);
}
export function configureInfoPlist(xml, app) {
  if (!/<\/dict>\s*<\/plist>/.test(xml)) throw new Error('Invalid Info.plist root');
  xml = xml.replace(/(<key>UISupportedInterfaceOrientations(?:~ipad)?<\/key>\s*<array>)[\s\S]*?<\/array>/g, `$1${(app.orientation === 'landscape' ? ['LandscapeLeft', 'LandscapeRight'] : ['Portrait']).map(o => `<string>UIInterfaceOrientation${o}</string>`).join('')}</array>`);
  const usage = ['<key>UIRequiresFullScreen</key><true/>'];
  if (app.camera) usage.push('<key>NSCameraUsageDescription</key><string>Use photos and the camera for gameplay and learning.</string>', '<key>NSPhotoLibraryUsageDescription</key><string>Select photos for gameplay and learning.</string>');
  if (app.microphone) usage.push('<key>NSMicrophoneUsageDescription</key><string>Hear spoken answers.</string>', '<key>NSSpeechRecognitionUsageDescription</key><string>Check spoken reading answers.</string>');
  return xml.replace(/<\/dict>\s*<\/plist>/, usage.join('\n') + '\n</dict>\n</plist>');
}
