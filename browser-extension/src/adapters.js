const ADAPTERS = {
  'chatgpt.com': ['#prompt-textarea', 'textarea[data-testid="prompt-textarea"]'],
  'claude.ai': ['div[contenteditable="true"][data-testid="chat-input"]', 'div[contenteditable="true"].ProseMirror'],
  'gemini.google.com': ['div[contenteditable="true"][role="textbox"]', 'rich-textarea div[contenteditable="true"]'],
};

function visible(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
}

function locateComposer(hostname) {
  const selectors = ADAPTERS[hostname];
  if (!selectors) throw new Error('当前站点没有受支持的适配器。');
  const candidates = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]).filter(visible);
  const unique = [...new Set(candidates)];
  if (unique.length !== 1) throw new Error(unique.length === 0 ? '未找到可确认的输入框。' : '发现多个候选输入框，已安全停止。');
  return unique[0];
}

export function fillPrompt(prompt, expectedSite) {
  if (location.hostname !== expectedSite) throw new Error('当前页面与提示目标站点不一致。');
  const composer = locateComposer(location.hostname);
  composer.focus();
  if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
    const prototype = composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(composer, prompt);
  } else {
    composer.textContent = prompt;
  }
  composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
  composer.dispatchEvent(new Event('change', { bubbles: true }));
  return { characters: prompt.length };
}
