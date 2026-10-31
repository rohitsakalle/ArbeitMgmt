import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('This synthetic force-stop check requires an explicitly selected emulator, not a physical device.');
const adb = resolve('.tools', 'android-sdk', 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const env = { ...process.env, ANDROID_USER_HOME: resolve('.tools', 'android-user') };
function run(args) {
  const result = spawnSync(adb, ['-s', serial, ...args], { env, encoding: 'utf8', timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error(`ADB smoke operation failed: ${result.error?.message || result.stderr}`);
  return result.stdout.trim();
}
const recordBytes = () => run(['exec-out', 'run-as', 'at.arbeitmgmt.beta', 'cat', 'no_backup/records-v1.json']);
const before = recordBytes();
const data = JSON.parse(before);
const visit = data.visits.find(v => v.reference === 'SYNTHETIC Österreich Łódź İstanbul Brașov');
if (!visit || visit.notes[0]?.originalText !== 'PRIVATE-SMOKE-SENTINEL') throw new Error('Run the instrumented synthetic fixture test first.');
run(['shell', 'am', 'start', '-W', '-n', 'at.arbeitmgmt.beta/.MainActivity']);
const oldPid = run(['shell', 'pidof', 'at.arbeitmgmt.beta']);
run(['shell', 'am', 'force-stop', 'at.arbeitmgmt.beta']);
run(['shell', 'am', 'start', '-W', '-n', 'at.arbeitmgmt.beta/.MainActivity']);
await new Promise(resolve => setTimeout(resolve, 3000));
const newPid = run(['shell', 'pidof', 'at.arbeitmgmt.beta']);
if (!newPid || newPid === oldPid) throw new Error('App did not restart in a new process.');
if (recordBytes() !== before) throw new Error('Saved records changed across force-stop/relaunch.');
console.log(`Emulator offline force-stop/relaunch passed; saved snapshot SHA-256 ${createHash('sha256').update(before).digest('hex')}.`);
