import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, mkdtemp, writeFile, copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {allocateCdpPort} from './cdp.js';
import {checkNativeHost} from './host.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const run = promisify(execFile);
await checkNativeHost();
await mkdir(path.join(root, 'native-test-results'), {recursive: true});
const reportDir = await mkdtemp(path.join(root, 'native-test-results/companion-'));
// A separate executable lets test:all rebuild the active binary while this fixture stays open.
const executable = path.join(reportDir, 'hybrid-command-center.exe');
await copyFile(path.join(root, 'src-tauri/target/debug/hybrid-command-center.exe'), executable);
const fullSuite = process.argv.includes('--all');
const phases = fullSuite ? [['Overview', 2], ['Settings', 3]] : [['Overview', 3], ['Settings', 3]];
const profileDir = path.join(reportDir, 'WebView2');
const port = await allocateCdpPort();
const launchedAt = new Date().toISOString();
// A normal-mode instance has no debugger. Disposable storage protects the user's real session.
const companion = spawn(executable, [], {
  cwd: root, windowsHide: true, stdio: 'ignore', env: {...process.env,
    WEBVIEW2_USER_DATA_FOLDER: profileDir, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--proxy-server=http://127.0.0.1:9',
    HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', ALL_PROXY: 'http://127.0.0.1:9', NO_PROXY: 'localhost,127.0.0.1',
  },
});
const args = ['-NoProfile', '-NonInteractive', '-File', path.join(root, 'tests/native/window.ps1'),
  '-AppProcessId', String(companion.pid), '-Executable', executable, '-LaunchedAt', launchedAt,
  '-ProfileDir', profileDir, '-CdpPort', String(port)];
const results = [];
try {
  await new Promise((resolve, reject) => { companion.once('spawn', resolve); companion.once('error', reject); });
  const info = JSON.parse((await run('powershell.exe', args, {windowsHide: true, timeout: 45000})).stdout);
  args.push('-ExpectedStartTime', info.startedAt);
  const snapshot = JSON.parse((await run('powershell.exe', [...args, '-Action', 'Diagnostics'], {windowsHide: true, timeout: 45000})).stdout);
  assert.ok(snapshot.processes.some(process => process.usesTestProfile), 'Companion must use disposable storage.');
  assert.ok(snapshot.processes.every(process => !process.debugArgument), 'Companion must run without remote debugging.');
  await writeFile(path.join(reportDir, 'companion.json'), JSON.stringify({window: info, snapshot}, null, 2));
  for (const [page, repetitions] of phases) {
    if (page === 'Settings') {
      const result = await run('powershell.exe', [...args, '-Action', 'OpenSettings'], {windowsHide: true, timeout: 45000});
      assert.equal(JSON.parse(result.stdout).settingsOpen, true);
    }
    for (let iteration = 1; iteration <= repetitions; iteration++) {
      assert.equal(companion.exitCode, null, 'Normal-mode companion exited before the coexistence check.');
      console.log(`Native coexistence: companion ${page}, run ${iteration}/${repetitions} (companion PID ${companion.pid})`);
      try {
        assert.ok(!fullSuite || process.env.npm_execpath, 'Use npm run test:native:coexist -- --all for complete-suite repetitions.');
        const command = fullSuite ? [process.env.npm_execpath, 'run', 'test:all'] : ['--test', 'tests/native/desktop.test.js'];
        const result = await run(process.execPath, command, {cwd: root, timeout: 180000, maxBuffer: 256 * 1024});
        await writeFile(path.join(reportDir, `${page}-${iteration}.log`), result.stdout + result.stderr);
        assert.equal(companion.exitCode, null, 'Normal-mode companion exited during the coexistence check.');
        console.log(result.stdout);
        results.push({page, iteration, passed: true});
      } catch (error) {
        const log = path.join(reportDir, `${page}-${iteration}.log`);
        await writeFile(log, (error.stdout || '') + (error.stderr || '') + `\nExit code: ${error.code}\n`);
        results.push({page, iteration, passed: false});
        throw new Error(`Coexistence ${page} run ${iteration} failed (exit ${error.code}). Full output: ${log}`);
      } finally {
        await writeFile(path.join(reportDir, 'results.json'), JSON.stringify(results, null, 2));
      }
    }
  }
} finally {
  try {
    if (companion.pid && companion.exitCode === null) {
      await run('powershell.exe', [...args, '-Action', 'Close'], {windowsHide: true, timeout: 45000});
      const deadline = performance.now() + 10000;
      let cleanup;
      do {
        cleanup = JSON.parse((await run('powershell.exe', [...args, '-Action', 'Diagnostics'], {windowsHide: true, timeout: 45000})).stdout);
        await writeFile(path.join(reportDir, 'cleanup.json'), JSON.stringify(cleanup, null, 2));
        if (!cleanup.processes.length) break;
        await delay(200);
      } while (performance.now() < deadline);
      assert.equal(cleanup.processes.length, 0, 'Companion WebView2 processes remain; inspect cleanup.json.');
      assert.equal(companion.exitCode, 0, 'Companion must close cleanly.');
    } else if (companion.pid) {
      assert.fail('Normal-mode companion exited unexpectedly.');
    }
  } finally {
    companion.unref();
    console.log(`Coexistence diagnostics: ${reportDir}`);
  }
}
