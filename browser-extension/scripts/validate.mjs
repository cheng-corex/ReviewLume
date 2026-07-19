import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(extensionRoot, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExactSet(actual, expected, label) {
  const actualSorted = [...(actual ?? [])].sort();
  const expectedSorted = [...expected].sort();
  assert(
    JSON.stringify(actualSorted) === JSON.stringify(expectedSorted),
    `${label} must be exactly ${JSON.stringify(expectedSorted)}, received ${JSON.stringify(actualSorted)}`,
  );
}

assert(manifest.manifest_version === 3, 'Browser extension must use Manifest V3.');
assertExactSet(manifest.permissions, ['activeTab', 'alarms', 'scripting', 'storage'], 'permissions');
assertExactSet(manifest.host_permissions, ['http://127.0.0.1/*'], 'host_permissions');
assertExactSet(
  manifest.optional_host_permissions,
  ['https://chatgpt.com/*', 'https://claude.ai/*', 'https://gemini.google.com/*'],
  'optional_host_permissions',
);

const forbiddenPermissions = ['cookies', 'history', 'tabs', 'webRequest', 'webRequestBlocking'];
for (const permission of forbiddenPermissions) {
  assert(!manifest.permissions.includes(permission), `Forbidden permission declared: ${permission}`);
}

const referencedFiles = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
].filter(Boolean);
for (const file of referencedFiles) {
  assert(existsSync(join(extensionRoot, file)), `Manifest references missing file: ${file}`);
}

function collectJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
  });
}

const sourceFiles = collectJavaScriptFiles(join(extensionRoot, 'src'));
for (const file of sourceFiles) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  const source = readFileSync(file, 'utf8');
  assert(!/\.submit\s*\(|requestSubmit\s*\(|\.click\s*\(/u.test(source), `${relative(extensionRoot, file)} contains an automatic submission primitive.`);
  assert(!/\bcookies\b|document\.cookie|sessionStorage/u.test(source), `${relative(extensionRoot, file)} contains a forbidden credential/session access primitive.`);
}

console.log(`Validated Manifest V3 browser extension (${sourceFiles.length} JavaScript files).`);
