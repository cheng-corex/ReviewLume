const HANDOFF_KEY = 'pendingHandoff';
const SITE_LABELS = {
  'chatgpt.com': 'ChatGPT',
  'claude.ai': 'Claude',
  'gemini.google.com': 'Gemini',
};
const approve = document.getElementById('approve');
const summary = document.getElementById('summary');
const status = document.getElementById('status');
let pendingHandoff;

function show(message, error = false) {
  status.textContent = message;
  status.style.color = error ? 'crimson' : 'inherit';
}

function validateHandoff(value) {
  if (!value || typeof value !== 'object') throw new Error('没有待处理的连接信息。');
  if (!SITE_LABELS[value.targetSite]) throw new Error('目标站点不受支持。');
  const parsed = new URL(value.baseUrl);
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    !parsed.port ||
    parsed.pathname !== '/'
  ) {
    throw new Error('本地桥接地址无效。');
  }
  if (!/^[A-Z0-9]{8}$/.test(value.pairingCode)) throw new Error('短时配对码无效。');
  return value;
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || '操作失败。');
  return response.result;
}

async function pairAndOpen() {
  approve.disabled = true;
  show('正在建立本地短时会话…');
  const result = await send({
    type: 'pair',
    baseUrl: pendingHandoff.baseUrl,
    pairingCode: pendingHandoff.pairingCode,
    targetSite: pendingHandoff.targetSite,
  });
  show(`配对成功，会话到期：${new Date(result.expiresAt).toLocaleTimeString()}。正在打开目标站点…`);
  await send({ type: 'complete-handoff' });
}

async function initialize() {
  const saved = await chrome.storage.session.get(HANDOFF_KEY);
  pendingHandoff = validateHandoff(saved[HANDOFF_KEY]);
  const label = SITE_LABELS[pendingHandoff.targetSite];
  summary.textContent = `ReviewLume 请求连接 ${label}。`;
  const origin = `https://${pendingHandoff.targetSite}/*`;
  const granted = await chrome.permissions.contains({ origins: [origin] });
  if (granted) {
    show('站点权限已经存在，正在自动连接…');
    await pairAndOpen();
    return;
  }
  approve.textContent = `允许访问 ${label} 并连接`;
  approve.hidden = false;
  show('首次连接只需确认一次该站点权限。');
}

approve.addEventListener('click', async () => {
  const origin = `https://${pendingHandoff.targetSite}/*`;
  const permissionRequest = chrome.permissions.request({ origins: [origin] });
  approve.disabled = true;
  try {
    const granted = await permissionRequest;
    if (!granted) throw new Error('站点权限未获批准。');
    await pairAndOpen();
  } catch (error) {
    approve.disabled = false;
    show(error instanceof Error ? error.message : String(error), true);
  }
});

void initialize().catch((error) => {
  show(error instanceof Error ? error.message : String(error), true);
});
