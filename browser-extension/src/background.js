import { createRequest, normalizeBaseUrl, assertPairingCode } from './protocol.js';

const POLL_ALARM = 'reviewlume-poll';
const HANDOFF_KEY = 'pendingHandoff';
const TARGET_SITES = new Set(['chatgpt.com', 'claude.ai', 'gemini.google.com']);
const SITE_URLS = {
  'chatgpt.com': 'https://chatgpt.com/',
  'claude.ai': 'https://claude.ai/',
  'gemini.google.com': 'https://gemini.google.com/',
};

function assertTargetSite(value) {
  if (!TARGET_SITES.has(value)) throw new Error('目标站点不受支持。');
  return value;
}

function siteOrigin(targetSite) {
  return `https://${assertTargetSite(targetSite)}/*`;
}

async function state() {
  return chrome.storage.local.get([
    'baseUrl',
    'extensionInstanceId',
    'sessionToken',
    'sessionExpiresAt',
    'pendingPrompt',
  ]);
}

async function pair({ baseUrl, pairingCode, targetSite }) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const code = assertPairingCode(pairingCode);
  const site = assertTargetSite(targetSite);
  const granted = await chrome.permissions.contains({ origins: [siteOrigin(site)] });
  if (!granted) throw new Error('请先确认目标站点权限。');

  const current = await state();
  const extensionInstanceId = current.extensionInstanceId || crypto.randomUUID();
  const request = await createRequest('pairing', { pairingCode: code, extensionInstanceId });
  const response = await fetch(`${normalizedBaseUrl}/v1/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`配对失败（HTTP ${response.status}）。`);
  const result = await response.json();
  await chrome.storage.local.set({
    baseUrl: normalizedBaseUrl,
    extensionInstanceId,
    sessionToken: result.sessionToken,
    sessionExpiresAt: result.expiresAt,
    targetSite: site,
  });
  await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
  return { extensionInstanceId, expiresAt: result.expiresAt };
}

async function acceptHandoff(message, sender) {
  if (message.version !== 1) throw new Error('连接交接版本不受支持。');
  const sourceValue = sender.url || sender.tab?.url;
  if (!sourceValue || sender.tab?.id === undefined) {
    throw new Error('无法确认本地连接页面。');
  }
  const source = new URL(sourceValue);
  if (
    source.protocol !== 'http:' ||
    source.hostname !== '127.0.0.1' ||
    source.pathname !== '/connect' ||
    source.username ||
    source.password
  ) {
    throw new Error('连接交接必须来自本机 ReviewLume 服务。');
  }

  const baseUrl = normalizeBaseUrl(message.baseUrl);
  if (baseUrl !== source.origin) throw new Error('连接交接地址不匹配。');
  const pendingHandoff = {
    baseUrl,
    pairingCode: assertPairingCode(message.pairingCode),
    targetSite: assertTargetSite(message.targetSite),
    sourceTabId: sender.tab.id,
    receivedAt: Date.now(),
  };
  await chrome.storage.session.set({ [HANDOFF_KEY]: pendingHandoff });
  await chrome.tabs.create({
    url: chrome.runtime.getURL('src/connect.html'),
    active: true,
  });
  return { accepted: true };
}

async function completeHandoff(sender) {
  const saved = await chrome.storage.session.get(HANDOFF_KEY);
  const pending = saved[HANDOFF_KEY];
  if (!pending) throw new Error('没有待完成的连接交接。');
  const site = assertTargetSite(pending.targetSite);
  await chrome.storage.session.remove(HANDOFF_KEY);

  let targetOpened = false;
  if (Number.isInteger(pending.sourceTabId)) {
    try {
      await chrome.tabs.update(pending.sourceTabId, {
        url: SITE_URLS[site],
        active: true,
      });
      targetOpened = true;
    } catch {
      // The original handoff tab may have been closed; create a new target tab below.
    }
  }
  if (!targetOpened) {
    await chrome.tabs.create({ url: SITE_URLS[site], active: true });
  }

  const confirmationTabId = sender.tab?.id;
  if (
    confirmationTabId !== undefined &&
    confirmationTabId !== pending.sourceTabId
  ) {
    try {
      await chrome.tabs.remove(confirmationTabId);
    } catch {
      // Pairing is already complete even if the temporary confirmation tab cannot close.
    }
  }
  return { targetSite: site };
}

async function poll() {
  const current = await state();
  if (!current.baseUrl || !current.sessionToken || !current.extensionInstanceId) return;
  if (Date.parse(current.sessionExpiresAt) <= Date.now()) return revoke(false);
  const request = await createRequest('prompt-take', {
    sessionToken: current.sessionToken,
    extensionInstanceId: current.extensionInstanceId,
  });
  const response = await fetch(`${current.baseUrl}/v1/prompt/take`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    cache: 'no-store',
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
      const request = await createRequest('revoke', {
        sessionToken: current.sessionToken,
        extensionInstanceId: current.extensionInstanceId,
      });
      await fetch(`${current.baseUrl}/v1/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        cache: 'no-store',
      });
    } catch {
      // Local revocation must still complete.
    }
  }
  await chrome.alarms.clear(POLL_ALARM);
  await chrome.storage.local.remove([
    'sessionToken',
    'sessionExpiresAt',
    'pendingPrompt',
    'targetSite',
  ]);
  await chrome.storage.session.remove(HANDOFF_KEY);
  await chrome.action.setBadgeText({ text: '' });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) void poll().catch(() => revoke(false));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let action;
  switch (message?.type) {
    case 'handoff': action = acceptHandoff(message, sender); break;
    case 'pair': action = pair(message); break;
    case 'complete-handoff': action = completeHandoff(sender); break;
    case 'poll': action = poll(); break;
    case 'revoke': action = revoke(); break;
    default: action = Promise.reject(new Error('未知操作。'));
  }
  action
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
  return true;
});
