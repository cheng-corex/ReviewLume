import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(pnpm, ['exec', 'vsce', 'ls'], {
  cwd: extensionRoot,
  encoding: 'utf8',
  shell: false,
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'vsce ls failed\n');
  process.exit(result.status ?? 1);
}

const files = result.stdout
  .split(/\r?\n/u)
  .map((value) => value.trim().replaceAll('\\', '/'))
  .filter(Boolean);
const fileSet = new Set(files);

const required = [
  'package.json',
  'package.nls.json',
  'package.nls.zh-cn.json',
  'README.md',
  'LICENSE.txt',
  'resources/icon.png',
  'dist/extension.js',
  'dist/commands/mcpConnectorCommands.js',
  'dist/services/mcpConnectorServer.js',
  'dist/services/mcpRepositoryTools.js',
  'dist/services/secureMcpTunnelService.js',
];

const missing = required.filter((file) => !fileSet.has(file));
if (missing.length > 0) {
  throw new Error(`VSIX is missing required runtime files: ${missing.join(', ')}`);
}

const forbidden = files.filter(
  (file) =>
    /(^|\/)\.env(?:\.|$)/u.test(file) ||
    /(^|\/)\.reviewlume(?:\/|$)/u.test(file) ||
    /(^|\/)src(?:\/|$)/u.test(file) ||
    /\.test\.js$/u.test(file) ||
    file === 'dist/commands/browserBridgeCommands.js' ||
    file === 'dist/services/browserBridgeService.js' ||
    file.startsWith('dist/views/') ||
    file.startsWith('dist/vendor/web-bridge/') ||
    file.startsWith('dist/node_modules/@reviewlume/bridge-protocol/'),
);

if (forbidden.length > 0) {
  throw new Error(`VSIX contains forbidden files:\n${forbidden.join('\n')}`);
}

console.log(`VSIX content validation passed (${files.length} files).`);
