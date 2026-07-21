const status = document.getElementById('status');

function show(message, error = false) {
  if (!status) return;
  status.textContent = message;
  status.style.color = error ? 'crimson' : 'inherit';
}

async function handoff() {
  if (
    location.protocol !== 'http:' ||
    location.hostname !== '127.0.0.1' ||
    location.pathname !== '/connect'
  ) {
    return;
  }

  const params = new URLSearchParams(location.hash.slice(1));
  const version = Number(params.get('v'));
  const pairingCode = params.get('code') || '';
  const targetSite = params.get('site') || '';

  history.replaceState(null, '', location.pathname);
  show('正在连接 ReviewLume 浏览器扩展…');

  const response = await chrome.runtime.sendMessage({
    type: 'handoff',
    version,
    baseUrl: location.origin,
    pairingCode,
    targetSite,
  });
  if (!response?.ok) throw new Error(response?.error || '连接交接失败。');
  show('连接信息已接收。首次使用时，请在新页面确认目标站点权限。');
}

void handoff().catch((error) => {
  show(error instanceof Error ? error.message : String(error), true);
});
