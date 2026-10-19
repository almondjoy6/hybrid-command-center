import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

export function requireStandardUser(elevated) {
  assert.equal(elevated, false,
    'Native tests require a non-administrator terminal. WebView2 ignores environment debugging overrides in elevated hosts; no test application was launched.');
}

export async function checkNativeHost() {
  assert.equal(process.platform, 'win32', 'Native tests require an interactive Windows desktop.');
  const {stdout} = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) | ConvertTo-Json'],
  {windowsHide: true, timeout: 10000});
  const elevated = JSON.parse(stdout);
  requireStandardUser(elevated);
  return {elevated};
}
