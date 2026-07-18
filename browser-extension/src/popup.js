const $ = (id) => document.getElementById(id);
const status = $('status');

function show(message, error = false) {
  status.textContent = message;
  status.style.color = error ? 'crimson' : 'inherit';
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || '操作失败。');
  return response.result;
}

async function restore() {
  const saved = await chrome.storage.local.get(['baseUrl', 'targetSite', 'sessionExpiresAt', 'pendingPrompt']);
  if (saved.baseUrl) $('baseUrl').value = saved.baseUrl;
  if (saved.targetSite) $('targetSite').value = saved.targetSite;
  if (saved.pendingPrompt) show(`已有待填入提示：${saved.pendingPrompt.reviewId}\n${saved.pendingPrompt.prompt.length} 个字符`);
  else if (saved.sessionExpiresAt) show(`已配对，会话到期：${new Date(saved.sessionExpiresAt).toLocaleTimeString()}`);
}

$('pair').addEventListener('click', async () => {
  try {
    const result = await send({ type: 'pair', baseUrl: $('baseUrl').value.trim(), pairingCode: $('pairingCode').value.trim(), targetSite: $('targetSite').value });
    $('pairingCode').value = '';
    show(`配对成功，会话到期：${new Date(result.expiresAt).toLocaleTimeString()}`);
  } catch (error) { show(error.message, true); }
});

$('poll').addEventListener('click', async () => {
  try { await send({ type: 'poll' }); await restore(); } catch (error) { show(error.message, true); }
});

$('fill').addEventListener('click', async () => {
  try {
    const saved = await chrome.storage.local.get(['pendingPrompt']);
    const prompt = saved.pendingPrompt;
    if (!prompt) throw new Error('没有待填入提示。');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) throw new Error('无法确认当前标签页。');
    const hostname = new URL(tab.url).hostname;
    if (hostname !== prompt.targetSite) throw new Error(`提示目标为 ${prompt.targetSite}，当前页面不匹配。`);
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/adapters.js'] });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text, site) => globalThis.reviewLumeFillPrompt(text, site),
      args: [prompt.prompt, prompt.targetSite],
    });
    await chrome.storage.local.remove('pendingPrompt');
    await chrome.action.setBadgeText({ text: '' });
    show(`已填入 ${result.characters} 个字符。请自行检查并发送。`);
  } catch (error) { show(error.message, true); }
});

$('revoke').addEventListener('click', async () => {
  try { await send({ type: 'revoke' }); show('配对已撤销。'); } catch (error) { show(error.message, true); }
});

void restore();
