import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

if (process.env.BUILD_CHANNEL === 'production' || process.argv.includes('release')) {
  throw new Error('Production Android release blocked: billing, signing and release review are not configured.');
}
const tools = resolve('.tools');
const javaRoot = join(tools, 'java');
const java = process.env.JAVA_HOME || (existsSync(javaRoot) && join(javaRoot, readdirSync(javaRoot)[0]));
const sdk = process.env.ANDROID_HOME || join(tools, 'android-sdk');
if (!java || !existsSync(java) || !existsSync(join(sdk, 'platforms', 'android-36'))) {
  throw new Error('JDK 21 and Android SDK 36 required. See docs/ANDROID.md; no tooling is installed automatically.');
}
const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk,
  ANDROID_USER_HOME: join(tools, 'android-user'), GRADLE_USER_HOME: join(tools, 'gradle'),
};
mkdirSync(tools, { recursive: true });
function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, { env, cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const windows = process.platform === 'win32';
const keytool = join(java, 'bin', windows ? 'keytool.exe' : 'keytool');
if (!existsSync(join(tools, 'debug.keystore'))) {
  run(keytool, ['-genkeypair', '-keystore', join(tools, 'debug.keystore'), '-storepass', 'android',
    '-keypass', 'android', '-alias', 'androiddebugkey', '-dname', 'CN=Android Debug,O=Android,C=US',
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000']);
}
const tasks = process.argv.includes('--instrumented') ? [':app:connectedDebugAndroidTest'] : [':app:assembleDebug', ':app:testDebugUnitTest', ':app:lintDebug'];
if (process.argv.includes('--instrumented') && !env.ANDROID_SERIAL) {
  throw new Error('Set ANDROID_SERIAL to one explicitly approved test device/emulator before running instrumented tests.');
}
const args = ['--no-daemon', '--console=plain', ...tasks];
if (windows) run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `gradlew.bat ${args.join(' ')}`], resolve('android'));
else run('./gradlew', args, resolve('android'));
