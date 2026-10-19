import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {allocateCdpPort, waitForCdp} from './cdp.js';

async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return server.address().port;
}

test('CDP readiness retries startup errors and incomplete responses', async t => {
  let requests = 0;
  const port = await serve(t, (request, response) => {
    assert.equal(request.url, '/json/version');
    requests++;
    if (requests === 1) { response.writeHead(503); response.end(); }
    else if (requests === 2) response.end('{');
    else if (requests === 3) response.end('{}');
    else response.end(JSON.stringify({Browser: 'Test WebView2', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/test`}));
  });
  assert.equal((await waitForCdp(port, () => true, 3000)).Browser, 'Test WebView2');
  assert.equal(requests, 4);
});

test('a stalled CDP endpoint fails within the readiness deadline', async t => {
  const port = await serve(t, () => {});
  const started = performance.now();
  await assert.rejects(waitForCdp(port, () => true, 150), /within 150ms; last error: CDP version request timed out/);
  assert.ok(performance.now() - started < 1500);
});

test('CDP readiness rejects another host or port', async t => {
  const port = await serve(t, (request, response) => response.end(JSON.stringify({
    Browser: 'Other browser', webSocketDebuggerUrl: 'ws://example.test:9222/devtools/browser/other',
  })));
  await assert.rejects(waitForCdp(port, () => true, 150), /no matching loopback browser endpoint/);
});

test('CDP deadline preserves the last response instead of starting a partial polling attempt', async t => {
  let requests = 0;
  const port = await serve(t, (request, response) => {
    requests++;
    response.writeHead(503);
    response.end();
  });
  await assert.rejects(waitForCdp(port, () => true, 150), /last error: HTTP 503/);
  assert.equal(requests, 1);
});

test('CDP readiness fails promptly when the launched application exits', async () => {
  await assert.rejects(waitForCdp(await allocateCdpPort(), () => false), /application exited/);
});

test('port allocation avoids an existing loopback listener', async t => {
  const occupied = await serve(t, () => {});
  assert.notEqual(await allocateCdpPort(), occupied);
});
