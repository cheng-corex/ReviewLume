import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(extensionRoot, 'dist');

const mediaTarget = path.join(distRoot, 'webview', 'media');
fs.mkdirSync(mediaTarget, { recursive: true });
for (const file of ['reviewPanel.js', 'reviewPanel.css', 'reviewPanelTheme.css']) {
  fs.copyFileSync(path.join(extensionRoot, 'src', 'webview', 'media', file), path.join(mediaTarget, file));
}

const zodSource = path.dirname(require.resolve('zod/package.json'));
const zodTarget = path.join(distRoot, 'node_modules', 'zod');
fs.rmSync(zodTarget, { recursive: true, force: true });
fs.cpSync(zodSource, zodTarget, { recursive: true });

fs.rmSync(path.join(zodTarget, 'src'), { recursive: true, force: true });
removeNonRuntimeFiles(zodTarget);

function removeNonRuntimeFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      removeNonRuntimeFiles(entryPath);
      if (fs.readdirSync(entryPath).length === 0) fs.rmdirSync(entryPath);
      continue;
    }
    if (/\.d\.(?:ts|cts|mts)$/u.test(entry.name) || entry.name.endsWith('.map')) {
      fs.rmSync(entryPath, { force: true });
    }
  }
}
