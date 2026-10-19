import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const config = JSON.parse(read('src-tauri/tauri.conf.json'));

test('release versions agree across npm, Cargo and Tauri', () => {
  const lock = JSON.parse(read('package-lock.json'));
  const cargoVersion = read('src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)?.[1];
  const cargoLockVersion = read('src-tauri/Cargo.lock').match(/\[\[package\]\]\r?\nname = "hybrid-command-center"\r?\nversion = "([^"]+)"/)?.[1];
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  for (const version of [lock.version, lock.packages[''].version, cargoVersion, cargoLockVersion, config.version]) {
    assert.equal(version, pkg.version);
  }
});

test('release preserves the installed updater trust and application identity', () => {
  assert.equal(config.identifier, 'com.local.hybridcommandcenter');
  assert.equal(config.productName, 'Hybrid Command Center');
  assert.deepEqual(config.plugins.updater.endpoints, ['https://github.com/almondjoy6/hybrid-command-center/releases/latest/download/latest.json']);
  const publicKey = Buffer.from(config.plugins.updater.pubkey, 'base64').toString().trim().split(/\r?\n/)[1];
  assert.equal(publicKey, 'RWRvlJENBHpjjna4hmScu20hIL6Nt9HcQPWNUu8qzI+DMjI7ZPGdkDfd');
  assert.equal(config.plugins.updater.windows.installMode, 'passive');
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.deepEqual(config.bundle.targets, ['nsis']);
});
