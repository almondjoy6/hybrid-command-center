export const HISTORY_MS = 70000;

export function recordSamples(history, gpus, at) {
  const devices = new Map(gpus.map(gpu => [String(gpu.index), gpu]));
  const next = {};
  for (const id of new Set([...Object.keys(history), ...devices.keys()])) {
    const util = devices.get(id)?.util;
    const value = Number.isFinite(util) && util >= 0 && util <= 100 ? util : null;
    next[id] = [...(history[id] || []), {at, value}].slice(-35);
  }
  return next;
}

export function utilizationPath(samples, end) {
  let path = '', previous = null;
  for (const sample of samples) {
    if (sample.at < end - HISTORY_MS || sample.at > end || sample.value == null) {
      previous = null;
      continue;
    }
    const x = 100 * (sample.at - end + HISTORY_MS) / HISTORY_MS;
    const command = previous && sample.at - previous.at <= 5000 ? 'L' : 'M';
    path += `${command}${x.toFixed(2)},${100 - sample.value} `;
    previous = sample;
  }
  return path.trim();
}
