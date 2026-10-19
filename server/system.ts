// Bilgisayar tarafı seçenekler: oturum açılınca SpaceCast'i başlatma, açıkken uyumayı engelleme,
// macOS'ta Uygulamalar klasörüne açma/kapama kısayolu ekleme.

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { SystemInfo } from '../shared/providers.ts';
import { getConfig, saveConfig } from './settings.ts';

const LABEL = 'com.spacecast.app';
const HOME = homedir();
const MAC = process.platform === 'darwin';
const WIN = process.platform === 'win32';
const LINUX = process.platform === 'linux';

let ROOT = '';
let PORT = 5199;
let awake: ChildProcess | null = null;

export function initSystem(root: string, port: number) {
  ROOT = root;
  PORT = port;
  if (getConfig().system.keepAwake) startAwake();
}

const nodeBin = () => process.execPath;
const script = () => join(ROOT, 'server', 'index.ts');
const logFile = () => join(ROOT, 'data', 'sunucu.log');
const pathEnv = () => [dirname(nodeBin()), '/opt/homebrew/bin', '/usr/local/bin', join(HOME, '.local', 'bin'), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');

function autostartFile() {
  if (MAC) return join(HOME, 'Library', 'LaunchAgents', `${LABEL}.plist`);
  if (WIN) return join(process.env.APPDATA ?? join(HOME, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'SpaceCast.vbs');
  if (LINUX) return join(process.env.XDG_CONFIG_HOME ?? join(HOME, '.config'), 'autostart', 'spacecast.desktop');
  return '';
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function autostartContent() {
  if (MAC) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(nodeBin())}</string><string>${xml(script())}</string></array>
  <key>WorkingDirectory</key><string>${xml(ROOT)}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(pathEnv())}</string><key>PORT</key><string>${PORT}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>${xml(logFile())}</string>
  <key>StandardErrorPath</key><string>${xml(logFile())}</string>
</dict>
</plist>
`;
  }
  if (WIN) {
    const q = (s: string) => s.replace(/"/g, '""');
    return `Set sh = CreateObject("WScript.Shell")\r\nsh.CurrentDirectory = "${q(ROOT)}"\r\nsh.Environment("PROCESS")("PORT") = "${PORT}"\r\nsh.Run """${q(nodeBin())}"" ""${q(script())}""", 0, False\r\n`;
  }
  return `[Desktop Entry]\nType=Application\nName=SpaceCast\nExec=env PORT=${PORT} "${nodeBin()}" "${script()}"\nPath=${ROOT}\nX-GNOME-Autostart-enabled=true\nNoDisplay=true\n`;
}

/** Oturum açılınca başlat: yalnızca dosyayı yazar/siler; çalışan sunucuya dokunmaz. */
export function setAutostart(on: boolean) {
  const f = autostartFile();
  if (!f) throw new Error('Bu işletim sisteminde desteklenmiyor');
  if (on) {
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, autostartContent());
  } else {
    rmSync(f, { force: true });
  }
  getConfig().system.autostart = on;
  saveConfig();
}

// ------------------------------------------------------------------ uyku engeli

function startAwake() {
  if (awake) return;
  const pid = String(process.pid);
  try {
    if (MAC) awake = spawn('/usr/bin/caffeinate', ['-s', '-w', pid], { stdio: 'ignore' });
    else if (WIN) {
      const ps =
        "$t = Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);' -Name P -Namespace W -PassThru; " +
        `$t::SetThreadExecutionState([uint32]2147483649) | Out-Null; Wait-Process -Id ${pid}`;
      awake = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], { stdio: 'ignore', windowsHide: true });
    } else if (LINUX) awake = spawn('systemd-inhibit', ['--what=sleep:idle', '--who=SpaceCast', '--why=SpaceCast açık', 'tail', `--pid=${pid}`, '-f', '/dev/null'], { stdio: 'ignore' });
    awake?.on('error', () => { awake = null; });
    awake?.on('exit', () => { awake = null; });
  } catch {
    awake = null;
  }
}

function stopAwake() {
  awake?.kill();
  awake = null;
}

export function setKeepAwake(on: boolean) {
  if (on) startAwake();
  else stopAwake();
  getConfig().system.keepAwake = on;
  saveConfig();
}

export const keepAwakeActive = () => !!awake;

// ------------------------------------------------------------------ macOS kısayolu

const launcherPath = () => join(HOME, 'Applications', 'SpaceCast.app');

const LAUNCHER_SCRIPT = (port: number) => `#!/bin/zsh
# SpaceCast kısayolu: sunucuyu arka planda açar/kapatır.
NODE=${JSON.stringify(nodeBin())}
DIR=${JSON.stringify(ROOT)}
export PORT=${port}
export PATH=${JSON.stringify(pathEnv())}
LOG="$DIR/data/sunucu.log"
up() { curl -s -m 1 -o /dev/null "http://127.0.0.1:$PORT/health"; }
case "$1" in
  status) up && echo up || echo down ;;
  start)
    up && exit 0
    cd "$DIR" || exit 2
    [ -d dist ] || npm run build >> "$LOG" 2>&1
    nohup "$NODE" server/index.ts >> "$LOG" 2>&1 < /dev/null &
    for i in {1..80}; do up && exit 0; sleep 0.25; done
    exit 1 ;;
  stop)
    curl -s -m 3 -X POST "http://127.0.0.1:$PORT/api/system/stop" > /dev/null
    for i in {1..40}; do up || exit 0; sleep 0.25; done
    exit 1 ;;
  open) open "http://localhost:$PORT" ;;
esac
`;

const LAUNCHER_APPLESCRIPT = `set s to "/bin/zsh " & quoted form of (POSIX path of (path to resource "spacecast.sh"))
set durum to do shell script s & " status"
if durum is "up" then
	set r to button returned of (display dialog "SpaceCast açık." buttons {"Sunucuyu kapat", "Aç"} default button "Aç" with title "SpaceCast" with icon note)
	if r is "Sunucuyu kapat" then
		do shell script s & " stop"
		display notification "Sunucu kapatıldı" with title "SpaceCast"
	else
		do shell script s & " open"
	end if
else
	display notification "Sunucu açılıyor…" with title "SpaceCast"
	try
		do shell script s & " start"
		do shell script s & " open"
	on error
		display dialog "SpaceCast açılamadı. Ayrıntılar: data/sunucu.log" buttons {"Tamam"} default button "Tamam" with title "SpaceCast" with icon caution
	end try
end if
`;

/** ~/Applications/SpaceCast.app: tıklayınca sunucuyu açar; açıksa açmayı ya da kapatmayı sorar. */
export function installLauncher() {
  if (!MAC) throw new Error('Kısayol şimdilik yalnızca macOS için');
  const app = launcherPath();
  const tmp = join(ROOT, 'data', 'launcher.applescript');
  writeFileSync(tmp, LAUNCHER_APPLESCRIPT);
  rmSync(app, { recursive: true, force: true });
  mkdirSync(dirname(app), { recursive: true });
  execFileSync('/usr/bin/osacompile', ['-o', app, tmp]);
  rmSync(tmp, { force: true });
  const res = join(app, 'Contents', 'Resources');
  writeFileSync(join(res, 'spacecast.sh'), LAUNCHER_SCRIPT(PORT), { mode: 0o755 });
  const png = join(ROOT, 'public', 'icon-512.png');
  if (existsSync(png)) {
    try {
      execFileSync('/usr/bin/sips', ['-s', 'format', 'icns', png, '--out', join(res, 'applet.icns')], { stdio: 'ignore' });
      rmSync(join(res, 'Assets.car'), { force: true });
      execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Delete :CFBundleIconName', join(app, 'Contents', 'Info.plist')], { stdio: 'ignore' });
    } catch { /* ikon olmadan da çalışır */ }
  }
  try { execFileSync('/usr/bin/codesign', ['--force', '-s', '-', app], { stdio: 'ignore' }); } catch { /* imzasız da açılır */ }
  try { execFileSync('/usr/bin/touch', [app]); } catch { /* yok say */ }
}

export function systemInfo(): SystemInfo {
  const f = autostartFile();
  return {
    platform: process.platform,
    autostart: !!f && existsSync(f),
    autostartSupported: !!f,
    keepAwake: getConfig().system.keepAwake,
    keepAwakeActive: !!awake,
    keepAwakeSupported: MAC || WIN || LINUX,
    launcherSupported: MAC,
    launcherInstalled: MAC && existsSync(launcherPath()),
  };
}
