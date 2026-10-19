import http from 'node:http';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';

export async function allocateCdpPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const {port} = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

function version(port, timeout) {
  return new Promise((resolve, reject) => {
    // Use a direct loopback request, independent of inherited HTTP proxy settings.
    const request = http.get({host: '127.0.0.1', port, path: '/json/version'}, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 65536) request.destroy(new Error('CDP version response exceeds 64 KiB'));
      });
      response.once('error', reject);
      response.once('end', () => {
        try {
          if (response.statusCode !== 200) throw new Error(`HTTP ${response.statusCode}`);
          const value = JSON.parse(body);
          const endpoint = new URL(value.webSocketDebuggerUrl);
          if (!value.Browser || endpoint.protocol !== 'ws:' || endpoint.hostname !== '127.0.0.1' ||
              Number(endpoint.port) !== port || !endpoint.pathname.startsWith('/devtools/browser/')) {
            throw new Error('CDP response has no matching loopback browser endpoint');
          }
          resolve(value);
        } catch (error) { reject(error); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('CDP version request timed out')), timeout);
    request.once('close', () => clearTimeout(timer));
    request.once('error', reject);
  });
}

export async function waitForCdp(port, isRunning, timeoutMs = 45000) {
  const deadline = performance.now() + timeoutMs;
  let lastError = 'No response';
  while (performance.now() < deadline) {
    if (!isRunning()) throw new Error('Test application exited before CDP became ready.');
    try { return await version(port, Math.min(1000, deadline - performance.now())); }
    catch (error) { lastError = error.message; }
    const remaining = deadline - performance.now();
    // Do not start a near-zero-budget request that overwrites the useful error.
    if (remaining <= 200) {
      await delay(Math.max(0, remaining));
      break;
    }
    await delay(200);
  }
  throw new Error(`CDP not ready at http://127.0.0.1:${port}/json/version within ${timeoutMs}ms; last error: ${lastError}`);
}
