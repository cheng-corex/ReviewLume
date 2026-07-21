import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(extensionRoot, '../..');
const candidates = fs
  .readdirSync(repositoryRoot)
  .filter((name) => /^reviewlume-vscode-.*\.vsix$/u.test(name))
  .sort();

if (candidates.length !== 1) {
  throw new Error(
    `Expected exactly one ReviewLume VSIX in ${repositoryRoot}; found ${candidates.length}.`,
  );
}

const vsixPath = path.join(repositoryRoot, candidates[0]);
const files = readZipEntryNames(fs.readFileSync(vsixPath));
const fileSet = new Set(files);

const required = [
  'extension/package.json',
  'extension/package.nls.json',
  'extension/package.nls.zh-cn.json',
  'extension/readme.md',
  'extension/LICENSE.txt',
  'extension/resources/icon.png',
  'extension/dist/extension.js',
  'extension/dist/commands/mcpConnectorCommands.js',
  'extension/dist/services/mcpConnectorServer.js',
  'extension/dist/services/mcpRepositoryTools.js',
  'extension/dist/services/secureMcpTunnelService.js',
];

const missing = required.filter((file) => !fileSet.has(file));
if (missing.length > 0) {
  throw new Error(`VSIX is missing required runtime files: ${missing.join(', ')}`);
}

const forbidden = files.filter(
  (file) =>
    /(^|\/)\.env(?:\.|$)/u.test(file) ||
    /(^|\/)\.reviewlume(?:\/|$)/u.test(file) ||
    file.startsWith('extension/src/') ||
    file.endsWith('.tsbuildinfo') ||
    /\.test\.js$/u.test(file) ||
    file === 'extension/dist/commands/browserBridgeCommands.js' ||
    file === 'extension/dist/services/browserBridgeService.js' ||
    file.startsWith('extension/dist/views/') ||
    file.startsWith('extension/dist/vendor/web-bridge/') ||
    file.startsWith('extension/dist/node_modules/@reviewlume/bridge-protocol/'),
);

if (forbidden.length > 0) {
  throw new Error(`VSIX contains forbidden files:\n${forbidden.join('\n')}`);
}

console.log(`VSIX content validation passed for ${path.basename(vsixPath)} (${files.length} files).`);

function readZipEntryNames(buffer) {
  const eocdSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const minEocdSize = 22;
  const maxCommentSize = 0xffff;
  const searchStart = Math.max(0, buffer.length - minEocdSize - maxCommentSize);
  let eocdOffset = -1;

  for (let offset = buffer.length - minEocdSize; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('VSIX ZIP end-of-central-directory record was not found.');

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const names = [];
  let offset = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== centralSignature) {
      throw new Error(`Invalid VSIX central-directory entry at index ${index}.`);
    }
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    names.push(buffer.subarray(fileNameStart, fileNameEnd).toString('utf8').replaceAll('\\', '/'));
    offset = fileNameEnd + extraLength + commentLength;
  }

  return names;
}
