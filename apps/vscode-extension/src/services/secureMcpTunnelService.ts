import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as http from 'node:http';
import { mkdir, readFile, rm } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { McpConnectionInfo } from './mcpConnectorService';
import { logError, logInfo, logWarn } from './logService';

const RUNTIME_API_KEY_SECRET = 'reviewlume.secureMcpTunnel.runtimeApiKey';
const TUNNEL_ID_STATE = 'reviewlume.secureMcpTunnel.tunnelId';
const BINARY_PATH_STATE = 'reviewlume.secureMcpTunnel.binaryPath';
const CONTROL_PLANE_PROXY_STATE = 'reviewlume.secureMcpTunnel.controlPlaneProxy';
const TUNNEL_ID_PATTERN = /^tunnel_[a-z0-9]{32}$/;
const START_TIMEOUT_MS = 60_000;
const CONTROL_PLANE_TIMEOUT_MS = 20_000;
const DOCTOR_TIMEOUT_MS = 45_000;
const PROCESS_STOP_TIMEOUT_MS = 5_000;
const MAX_DIAGNOSTIC_CHARS = 4_000;
const CONTROLLED_ENV_PREFIXES = [
  'TUNNEL_CLIENT_',
  'CONTROL_PLANE_',
  'MCP_',
  'HEALTH_',
  'ADMIN_UI_',
  'CLOUDFLARED_',
  'HARPOON_',
  'PROXY_',
] as const;
const CONTROLLED_ENV_NAMES = new Set([
  'OPENAI_API_KEY',
  'OPENAI_ADMIN_KEY',
  'ALLOW_REMOTE_UI',
  'OPEN_WEB_UI',
  'PID_FILE',
  'LOG_LEVEL',
  'LOG_FORMAT',
  'LOG_FILE',
  'LOG_HTTP_RAW_UNSAFE',
  'REVIEWLUME_MCP_TOKEN',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
]);

export const OPENAI_TUNNELS_URL = 'https://platform.openai.com/settings/organization/tunnels';
export const OPENAI_RUNTIME_KEYS_URL =
  'https://platform.openai.com/settings/organization/api-keys';
export const OPENAI_TUNNEL_CLIENT_RELEASE_URL =
  'https://github.com/openai/tunnel-client/releases/latest';
export const CHATGPT_CONNECTORS_URL = 'https://chatgpt.com/#settings/Connectors';

export type SecureMcpTunnelStatus = 'stopped' | 'starting' | 'ready' | 'failed';

export interface SecureMcpTunnelState {
  readonly status: SecureMcpTunnelStatus;
  readonly tunnelId?: string;
  readonly healthBaseUrl?: string;
  readonly uiUrl?: string;
  readonly proxyUrl?: string;
  readonly error?: string;
}

export interface SecureMcpTunnelConfiguration {
  readonly binaryPath: string;
  readonly tunnelId: string;
  readonly runtimeApiKey: string;
}

export interface SecureMcpTunnelConfigurationStatus {
  readonly binaryPath?: string;
  readonly tunnelId?: string;
  readonly controlPlaneProxy?: string;
  readonly hasRuntimeApiKey: boolean;
}

export interface TunnelClientStatus {
  readonly control_plane_tunnel_id?: unknown;
  readonly tunnel_metadata_error?: unknown;
  readonly channels?: unknown;
}

interface ProxyCandidate {
  readonly value: string;
  readonly source: string;
}

/** Supervises OpenAI's official tunnel-client for one read-only ReviewLume MCP endpoint. */
export class SecureMcpTunnelService {
  readonly #context: vscode.ExtensionContext;
  readonly #listeners = new Set<() => void>();
  #child: ChildProcess | undefined;
  #healthUrlFile: string | undefined;
  #stopping = false;
  #state: SecureMcpTunnelState = { status: 'stopped' };

  constructor(context: vscode.ExtensionContext) {
    this.#context = context;
  }

  get state(): SecureMcpTunnelState {
    return this.#state;
  }

  onDidChange(listener: () => void): vscode.Disposable {
    this.#listeners.add(listener);
    return { dispose: () => this.#listeners.delete(listener) };
  }

  async getConfigurationStatus(): Promise<SecureMcpTunnelConfigurationStatus> {
    return {
      binaryPath: await this.#getStoredBinaryPath(),
      tunnelId: this.#context.globalState.get<string>(TUNNEL_ID_STATE),
      controlPlaneProxy: this.#context.globalState.get<string>(CONTROL_PLANE_PROXY_STATE),
      hasRuntimeApiKey: Boolean(await this.#context.secrets.get(RUNTIME_API_KEY_SECRET)),
    };
  }

  async getStoredRuntimeApiKey(): Promise<string | undefined> {
    return this.#context.secrets.get(RUNTIME_API_KEY_SECRET);
  }

  async discoverBinary(): Promise<string | undefined> {
    const configured = vscode.workspace
      .getConfiguration('reviewlume')
      .get<string>('mcp.tunnelClientPath', '')
      .trim();
    const stored = await this.#getStoredBinaryPath();
    const candidates = [configured, stored, 'tunnel-client'].filter(
      (candidate, index, all): candidate is string =>
        Boolean(candidate) && all.indexOf(candidate) === index,
    );

    for (const candidate of candidates) {
      if (await verifyTunnelClientBinary(candidate)) return candidate;
    }
    return undefined;
  }

  async resolveControlPlaneProxy(): Promise<string | undefined> {
    const stored = this.#context.globalState.get<string>(CONTROL_PLANE_PROXY_STATE);
    if (stored) {
      try {
        return normalizeProxyUrl(stored);
      } catch {
        await this.#context.globalState.update(CONTROL_PLANE_PROXY_STATE, undefined);
      }
    }

    const detected = await discoverControlPlaneProxy(process.env, readVsCodeProxy(), process.platform);
    if (!detected) return undefined;
    await this.#context.globalState.update(CONTROL_PLANE_PROXY_STATE, detected.value);
    logInfo(`Secure MCP Tunnel proxy detected from ${detected.source}: ${detected.value}`);
    return detected.value;
  }

  async saveControlPlaneProxy(value: string | undefined): Promise<void> {
    const normalized = value?.trim() ? normalizeProxyUrl(value) : undefined;
    await this.#context.globalState.update(CONTROL_PLANE_PROXY_STATE, normalized);
  }

  async saveConfiguration(configuration: SecureMcpTunnelConfiguration): Promise<void> {
    if (!(await verifyTunnelClientBinary(configuration.binaryPath))) {
      throw new Error('The selected file is not a working OpenAI tunnel-client executable.');
    }
    if (!isValidTunnelId(configuration.tunnelId)) {
      throw new Error('Tunnel ID must match tunnel_ followed by 32 lowercase letters or digits.');
    }
    if (configuration.runtimeApiKey.trim().length < 10) {
      throw new Error('A Runtime API key is required. Do not use an admin key.');
    }

    await Promise.all([
      this.#context.globalState.update(BINARY_PATH_STATE, configuration.binaryPath),
      this.#context.globalState.update(TUNNEL_ID_STATE, configuration.tunnelId),
      this.#context.secrets.store(RUNTIME_API_KEY_SECRET, configuration.runtimeApiKey.trim()),
    ]);
    logInfo('Secure MCP Tunnel configuration saved; credentials omitted from logs');
  }

  async clearRuntimeApiKey(): Promise<void> {
    await this.#context.secrets.delete(RUNTIME_API_KEY_SECRET);
    logInfo('Secure MCP Tunnel Runtime API key removed from SecretStorage');
  }

  async start(connection: McpConnectionInfo): Promise<SecureMcpTunnelState> {
    if (this.#child && this.#state.status === 'ready') return this.#state;
    await this.stop();

    const configuration = await this.#loadConfiguration();
    const controlPlaneProxy = await this.resolveControlPlaneProxy();
    this.#setState({
      status: 'starting',
      tunnelId: configuration.tunnelId,
      proxyUrl: controlPlaneProxy,
    });
    const storageRoot = this.#context.globalStorageUri.fsPath;
    await mkdir(storageRoot, { recursive: true });
    const healthUrlFile = path.join(storageRoot, 'secure-mcp-tunnel-health.url');
    await rm(healthUrlFile, { force: true });
    this.#healthUrlFile = healthUrlFile;

    const env = buildTunnelEnvironment(
      process.env,
      configuration,
      connection,
      healthUrlFile,
      controlPlaneProxy,
    );

    try {
      await runTunnelDoctor(configuration.binaryPath, env, configuration, connection);
      await rm(healthUrlFile, { force: true });

      const child = spawn(configuration.binaryPath, ['run'], {
        env,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      this.#child = child;
      child.once('error', (error) => logError('OpenAI tunnel-client process error', error));
      child.once('exit', (code, signal) => {
        if (this.#child === child) this.#child = undefined;
        if (this.#stopping) return;
        const message = `OpenAI tunnel-client exited unexpectedly (${code ?? signal ?? 'unknown'}).`;
        logWarn(message);
        this.#setState({
          status: 'failed',
          tunnelId: configuration.tunnelId,
          proxyUrl: controlPlaneProxy,
          error: message,
        });
      });

      const healthBaseUrl = await waitForTunnelReady(healthUrlFile, child, START_TIMEOUT_MS);
      await waitForTunnelControlPlane(
        healthBaseUrl,
        child,
        configuration.tunnelId,
        CONTROL_PLANE_TIMEOUT_MS,
        controlPlaneProxy,
      );
      const uiUrl = new URL('/ui#overview', healthBaseUrl).toString();
      this.#setState({
        status: 'ready',
        tunnelId: configuration.tunnelId,
        healthBaseUrl,
        uiUrl,
        proxyUrl: controlPlaneProxy,
      });
      logInfo(
        `Secure MCP Tunnel ready for ${connection.repository}; tunnel ID ${configuration.tunnelId}`,
      );
      return this.#state;
    } catch (error) {
      await this.#stopProcessOnly();
      const message = error instanceof Error ? error.message : 'Secure MCP Tunnel failed to start.';
      this.#setState({
        status: 'failed',
        tunnelId: configuration.tunnelId,
        proxyUrl: controlPlaneProxy,
        error: message,
      });
      logError('Secure MCP Tunnel startup failed', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    try {
      await this.#stopProcessOnly();
      if (this.#healthUrlFile) await rm(this.#healthUrlFile, { force: true });
      this.#healthUrlFile = undefined;
      this.#setState({ status: 'stopped' });
    } finally {
      this.#stopping = false;
    }
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.#listeners.clear();
  }

  async #loadConfiguration(): Promise<SecureMcpTunnelConfiguration> {
    const binaryPath = await this.discoverBinary();
    const tunnelId = this.#context.globalState.get<string>(TUNNEL_ID_STATE);
    const runtimeApiKey = await this.#context.secrets.get(RUNTIME_API_KEY_SECRET);
    if (!binaryPath || !tunnelId || !runtimeApiKey) {
      throw new Error(
        'Secure MCP Tunnel is not configured. Run ReviewLume: Configure Secure MCP Tunnel first.',
      );
    }
    return { binaryPath, tunnelId, runtimeApiKey };
  }

  async #getStoredBinaryPath(): Promise<string | undefined> {
    return this.#context.globalState.get<string>(BINARY_PATH_STATE);
  }

  async #stopProcessOnly(): Promise<void> {
    const child = this.#child;
    this.#child = undefined;
    if (!child || child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), delay(PROCESS_STOP_TIMEOUT_MS)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }

  #setState(state: SecureMcpTunnelState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}

export function isValidTunnelId(value: string): boolean {
  return TUNNEL_ID_PATTERN.test(value.trim());
}

export function normalizeProxyUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Proxy URL is empty.');
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const parsed = new URL(withScheme);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Proxy URL must use HTTP or HTTPS.');
  }
  if (!parsed.hostname || !parsed.port) throw new Error('Proxy URL must include a host and port.');
  if (parsed.username || parsed.password) {
    throw new Error('Proxy credentials are not stored by ReviewLume.');
  }
  if ((parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) {
    throw new Error('Proxy URL must not contain a path, query, or fragment.');
  }
  return parsed.origin;
}

export function parseWindowsProxyServer(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!trimmed.includes('=')) return normalizeProxyUrl(trimmed);
  const entries = new Map<string, string>();
  for (const item of trimmed.split(';')) {
    const separator = item.indexOf('=');
    if (separator <= 0) continue;
    entries.set(item.slice(0, separator).trim().toLowerCase(), item.slice(separator + 1).trim());
  }
  const selected = entries.get('https') ?? entries.get('http');
  return selected ? normalizeProxyUrl(selected) : undefined;
}

export async function discoverControlPlaneProxy(
  environment: NodeJS.ProcessEnv,
  vsCodeProxy: string | undefined,
  platform: NodeJS.Platform,
): Promise<ProxyCandidate | undefined> {
  const environmentCandidates: readonly [string, string][] = [
    ['CONTROL_PLANE_HTTP_PROXY', environment.CONTROL_PLANE_HTTP_PROXY ?? ''],
    ['HTTPS_PROXY', environment.HTTPS_PROXY ?? environment.https_proxy ?? ''],
    ['HTTP_PROXY', environment.HTTP_PROXY ?? environment.http_proxy ?? ''],
  ];
  for (const [source, candidate] of environmentCandidates) {
    if (!candidate.trim()) continue;
    try {
      return { value: normalizeProxyUrl(candidate), source: `env:${source}` };
    } catch {
      // Ignore malformed ambient proxy values and continue discovery.
    }
  }

  if (vsCodeProxy?.trim()) {
    try {
      return { value: normalizeProxyUrl(vsCodeProxy), source: 'vscode:http.proxy' };
    } catch {
      // Continue to the OS proxy.
    }
  }

  if (platform !== 'win32') return undefined;
  const windowsProxy = await readWindowsSystemProxy();
  return windowsProxy ? { value: windowsProxy, source: 'windows:system-proxy' } : undefined;
}

export function buildTunnelEnvironment(
  baseEnvironment: NodeJS.ProcessEnv,
  configuration: SecureMcpTunnelConfiguration,
  connection: McpConnectionInfo,
  healthUrlFile: string,
  controlPlaneProxy?: string,
): NodeJS.ProcessEnv {
  const environment = sanitizeTunnelEnvironment(baseEnvironment);
  return {
    ...environment,
    CONTROL_PLANE_API_KEY: configuration.runtimeApiKey,
    CONTROL_PLANE_TUNNEL_ID: configuration.tunnelId,
    ...(controlPlaneProxy
      ? { CONTROL_PLANE_HTTP_PROXY: normalizeProxyUrl(controlPlaneProxy) }
      : {}),
    MCP_SERVER_URL: connection.endpointUrl,
    REVIEWLUME_MCP_TOKEN: connection.tunnelToken,
    MCP_EXTRA_HEADERS: 'X-ReviewLume-Token: env:REVIEWLUME_MCP_TOKEN',
    MCP_DISCOVERY_EXTRA_HEADERS: 'X-ReviewLume-Token: env:REVIEWLUME_MCP_TOKEN',
    MCP_MAX_CONCURRENT_REQUESTS: '4',
    HEALTH_LISTEN_ADDR: '127.0.0.1:0',
    HEALTH_URL_FILE: healthUrlFile,
    LOG_LEVEL: 'info',
    LOG_FORMAT: 'struct-text',
    LOG_HTTP_RAW_UNSAFE: 'false',
    ALLOW_REMOTE_UI: 'false',
    OPEN_WEB_UI: 'false',
    HARPOON_CAPTURE_PAYLOADS: 'false',
  };
}

export function sanitizeTunnelEnvironment(
  baseEnvironment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...baseEnvironment };
  for (const key of Object.keys(environment)) {
    const normalized = key.toUpperCase();
    if (
      CONTROLLED_ENV_NAMES.has(normalized) ||
      CONTROLLED_ENV_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    ) {
      delete environment[key];
    }
  }
  return environment;
}

export function redactTunnelOutput(
  value: string,
  configuration: Pick<SecureMcpTunnelConfiguration, 'runtimeApiKey'>,
  connection: Pick<McpConnectionInfo, 'tunnelToken' | 'authorizationHeader'>,
): string {
  let output = value;
  for (const secret of [
    configuration.runtimeApiKey,
    connection.tunnelToken,
    connection.authorizationHeader,
  ]) {
    if (secret) output = output.split(secret).join('[REDACTED]');
  }
  return output
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, '[REDACTED]')
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?\S+/gi, '$1[REDACTED]');
}

export function normalizeHealthBaseUrl(value: string): string {
  const parsed = new URL(value.trim());
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== 'http:' ||
    (hostname !== '127.0.0.1' && hostname !== 'localhost' && hostname !== '[::1]')
  ) {
    throw new Error('tunnel-client health URL is not loopback HTTP.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('tunnel-client health URL contains credentials.');
  }
  return parsed.origin;
}

export function isTunnelClientHelpOutput(output: string): boolean {
  return (
    /(?:^|\r?\n)\s*(?:Use|Usage):\s*(?:\r?\n\s*)?tunnel-client\b/i.test(output) &&
    /Tunnel client for the OpenAI MCP control plane/i.test(output)
  );
}

export function validateTunnelRuntimeStatus(
  status: TunnelClientStatus,
  expectedTunnelId: string,
): string | undefined {
  if (status.control_plane_tunnel_id !== expectedTunnelId) {
    return 'Tunnel diagnostics reported a different control-plane tunnel ID.';
  }
  if (typeof status.tunnel_metadata_error === 'string' && status.tunnel_metadata_error.trim()) {
    return status.tunnel_metadata_error.trim();
  }
  if (!Array.isArray(status.channels)) return 'Tunnel diagnostics did not report MCP channels.';
  const main = status.channels.find(
    (channel): channel is Record<string, unknown> =>
      Boolean(channel) && typeof channel === 'object' && (channel as Record<string, unknown>).name === 'main',
  );
  if (!main || main.enabled !== true || main.probe_status !== 'ok') {
    return 'Tunnel main MCP channel is not enabled and healthy.';
  }
  return undefined;
}

export async function verifyTunnelClientBinary(binaryPath: string): Promise<boolean> {
  try {
    const result = await execFileResult(binaryPath, ['--help'], process.env, 10_000);
    return isTunnelClientHelpOutput(`${result.stdout}\n${result.stderr}`);
  } catch {
    return false;
  }
}

async function readWindowsSystemProxy(): Promise<string | undefined> {
  try {
    const result = await execFileResult(
      'reg.exe',
      [
        'query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
        '/v',
        'ProxyEnable',
      ],
      process.env,
      5_000,
    );
    if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(result.stdout)) return undefined;
    const server = await execFileResult(
      'reg.exe',
      [
        'query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
        '/v',
        'ProxyServer',
      ],
      process.env,
      5_000,
    );
    const match = server.stdout.match(/ProxyServer\s+REG_SZ\s+(.+)$/im);
    return match?.[1] ? parseWindowsProxyServer(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

function readVsCodeProxy(): string | undefined {
  const value = vscode.workspace.getConfiguration('http').get<string>('proxy', '').trim();
  return value || undefined;
}

async function runTunnelDoctor(
  binaryPath: string,
  env: NodeJS.ProcessEnv,
  configuration: SecureMcpTunnelConfiguration,
  connection: McpConnectionInfo,
): Promise<void> {
  try {
    await execFileResult(binaryPath, ['doctor', '--explain'], env, DOCTOR_TIMEOUT_MS);
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const safe = redactTunnelOutput(raw, configuration, connection).slice(-MAX_DIAGNOSTIC_CHARS);
    throw new Error(`OpenAI tunnel-client doctor failed: ${safe}`);
  }
}

async function execFileResult(
  binaryPath: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  timeout: number,
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      [...args],
      { env, timeout, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${error.message}\n${stderr || stdout}`));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

async function waitForTunnelReady(
  healthUrlFile: string,
  child: ChildProcess,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let healthBaseUrl: string | undefined;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`OpenAI tunnel-client exited before becoming ready (code ${child.exitCode}).`);
    }
    if (!healthBaseUrl) {
      try {
        healthBaseUrl = normalizeHealthBaseUrl(await readFile(healthUrlFile, 'utf8'));
      } catch {
        await delay(250);
        continue;
      }
    }
    try {
      lastStatus = await getHttpStatus(new URL('/readyz', healthBaseUrl));
      if (lastStatus === 200) return healthBaseUrl;
    } catch {
      lastStatus = 0;
    }
    await delay(500);
  }
  throw new Error(
    `OpenAI tunnel-client did not become ready within ${timeoutMs / 1000}s ` +
      `(last status ${lastStatus || 'unreachable'}).`,
  );
}

async function waitForTunnelControlPlane(
  healthBaseUrl: string,
  child: ChildProcess,
  expectedTunnelId: string,
  timeoutMs: number,
  proxyUrl?: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'Tunnel control-plane status is unavailable.';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `OpenAI tunnel-client exited before the control plane became ready (code ${child.exitCode}).`,
      );
    }
    try {
      const status = await getJson<TunnelClientStatus>(new URL('/api/status', healthBaseUrl));
      const validationError = validateTunnelRuntimeStatus(status, expectedTunnelId);
      if (!validationError) return;
      lastError = validationError;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  const proxyHint = proxyUrl ? ` Proxy: ${proxyUrl}.` : ' No control-plane proxy was detected.';
  throw new Error(`OpenAI Tunnel control plane is not ready: ${lastError}.${proxyHint}`);
}

async function getHttpStatus(target: URL): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = http.get(
      target,
      { timeout: 3_000, headers: { Accept: 'text/plain, application/json' } },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );
    request.once('timeout', () => request.destroy(new Error('Health check timed out.')));
    request.once('error', reject);
  });
}

async function getJson<T>(target: URL): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = http.get(
      target,
      { timeout: 3_000, headers: { Accept: 'application/json' } },
      (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        response.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > 256 * 1024) {
            request.destroy(new Error('Tunnel status response is too large.'));
            return;
          }
          chunks.push(chunk);
        });
        response.once('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error(`Tunnel status returned HTTP ${response.statusCode ?? 0}.`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
          } catch {
            reject(new Error('Tunnel status returned invalid JSON.'));
          }
        });
      },
    );
    request.once('timeout', () => request.destroy(new Error('Tunnel status check timed out.')));
    request.once('error', reject);
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
