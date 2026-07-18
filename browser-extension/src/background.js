import { createRequest, normalizeBaseUrl, assertPairingCode } from './protocol.js';

const POLL_ALARM = 'reviewlume-poll';

async function state() {
  return chrome.storage.local.get(['baseUrl', 'extensionInstanceId', 'sessionToken', 'sessionExpiresAt', 'pendingPrompt']);
}

async function pair({ baseUrl, pairingCode, targetSite }) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const code = assertPairingCode(pairingCode);
  const origin = `https://${targetSite}/*`;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error('站点权限未获批准。');
  const current = await state();
  const extensionInstanceId = current.extensionInstanceId || crypto.randomUUID();
  const request = await createRequest('pairing', { pairingCode: code, extensionInstanceId });
  const response = await fetch(`${normalizedBaseUrl}/v1/pair`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), cache: 'no-store',
  });
  if (!response.ok) throw new Error(`配对失败（HTTP ${response.status}）。`);
  const result = await response.json();
  await chrome.storage.local.set({ baseUrl: normalizedBaseUrl, extensionInstanceId, sessionToken: result.sessionToken, sessionExpiresAt: result.expiresAt, targetSite });
  await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
  return { extensionInstanceId, expiresAt: result.expiresAt };
}

async function poll() {
  const current = await state();
  if (!current.baseUrl || !current.sessionToken || !current.extensionInstanceId) return;
  if (Date.parse(current.sessionExpiresAt) <= Date.now()) return revoke(false);
  const request = await createRequest('prompt-take', { sessionToken: current.sessionToken, extensionInstanceId: current.extensionInstanceId });
  const response = await fetch(`${current.baseUrl}/v1/prompt/take`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), cache: 'no-store',
  });
  if (response.status === 204) return;
  if (!response.ok) throw new Error(`读取提示失败（HTTP ${response.status}）。`);
  const prompt = await response.json();
  await chrome.storage.local.set({ pendingPrompt: prompt });
  await chrome.action.setBadgeText({ text: '1' });
}

async function revoke(remote = true) {
  const current = await state();
  if (remote && current.baseUrl && current.sessionToken && current.extensionInstanceId) {
    try {
      const request = await createRequest('revoke', { sessionToken: current.sessionToken, extensionInstanceId: current.extensionInstanceId });
      await fetch(`${current.baseUrl}/v1/revoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), cache: 'no-store' });
    } catch { /* local revocation must still complete */ }
  }
  await chrome.alarms.clear(POLL_ALARM);
  await chrome.storage.local.remove(['sessionToken', 'sessionExpiresAt', 'pendingPrompt', 'targetSite']);
  await chrome.action.setBadgeText({ text: '' });
}

chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === POLL_ALARM) void poll().catch(() => revoke(false)); });
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const action = message?.type === 'pair' ? pair(message) : message?.type === 'poll' ? poll() : message?.type === 'revoke' ? revoke() : Promise.reject(new Error('未知操作。'));
  action.then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
