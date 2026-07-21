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
const TUNNEL_ID_PATTERN = /^tunnel_[0-9a-f]{32}$/;
const START_TIMEOUT_MS = 60_000;
const DOCTOR_TIMEOUT_MS = 45_000;
const PROCESS_STOP_TIMEOUT_MS = 5_000;
const MAX_DIAGNOSTIC_CHARS = 4_000;

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
  readonly hasRuntimeApiKey: boolean;
}

/**
 * Supervises OpenAI's official tunnel-client process for one ReviewLume MCP endpoint.
 * Secrets are kept in VS Code SecretStorage and are passed to the child only through
 * environment variables. They are never included in argv, settings, clipboard, or logs.
 */
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
      if (await verifyTunnelClientBinary(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  async saveConfiguration(configuration: SecureMcpTunnelConfiguration): Promise<void> {
    if (!(await verifyTunnelClientBinary(configuration.binaryPath))) {
      throw new Error('The selected file is not a working OpenAI tunnel-client executable.');
    }
    if (!isValidTunnelId(configuration.tunnelId)) {
      throw new Error('Tunnel ID must match tunnel_ followed by 32 lowercase hexadecimal characters.');
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
    this.#setState({ status: 'starting', tunnelId: configuration.tunnelId });
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
    );

    try {
      await runTunnelDoctor(configuration.binaryPath, env, configuration, connection);
      // Doctor may initialize the health listener. Never let the long-running
      // process inherit a stale URL from the short-lived diagnostic process.
      await rm(healthUrlFile, { force: true });

      const child = spawn(configuration.binaryPath, ['run'], {
        env,
        shell: false,
        windowsHide: true,
        // Do not capture long-running process output. Even a redactor cannot
        // safely guarantee that a secret is not split across arbitrary chunks.
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      this.#child = child;
      child.once('error', (error) => logError('OpenAI tunnel-client process error', error));
      child.once('exit', (code, signal) => {
        if (this.#child === child) this.#child = undefined;
        if (this.#stopping) return;
        const message = `OpenAI tunnel-client exited unexpectedly (${code ?? signal ?? 'unknown'}).`;
        logWarn(message);
        this.#setState({ status: 'failed', tunnelId: configuration.tunnelId, error: message });
      });

      const healthBaseUrl = await waitForTunnelReady(
        healthUrlFile,
        child,
        START_TIMEOUT_MS,
      );
      const uiUrl = new URL('/ui#overview', healthBaseUrl).toString();
      this.#setState({
        status: 'ready',
        tunnelId: configuration.tunnelId,
        healthBaseUrl,
        uiUrl,
      });
      logInfo(`Secure MCP Tunnel ready for ${connection.repository}; tunnel ID ${configuration.tunnelId}`);
      return this.#state;
    } catch (error) {
      await this.#stopProcessOnly();
      const message = error instanceof Error ? error.message : 'Secure MCP Tunnel failed to start.';
      this.#setState({ status: 'failed', tunnelId: configuration.tunnelId, error: message });
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
      throw new Error('Secure MCP Tunnel is not configured. Run ReviewLume: Configure Secure MCP Tunnel first.');
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

export function buildTunnelEnvironment(
  baseEnvironment: NodeJS.ProcessEnv,
  configuration: SecureMcpTunnelConfiguration,
  connection: McpConnectionInfo,
  healthUrlFile: string,
): NodeJS.ProcessEnv {
  return {
    ...baseEnvironment,
    CONTROL_PLANE_API_KEY: configuration.runtimeApiKey,
    CONTROL_PLANE_TUNNEL_ID: configuration.tunnelId,
    MCP_SERVER_URL: connection.endpointUrl,
    REVIEWLUME_MCP_TOKEN: connection.tunnelToken,
    MCP_EXTRA_HEADERS: 'X-ReviewLume-Token: env:REVIEWLUME_MCP_TOKEN',
    MCP_DISCOVERY_EXTRA_HEADERS: 'X-ReviewLume-Token: env:REVIEWLUME_MCP_TOKEN',
    HEALTH_LISTEN_ADDR: '127.0.0.1:0',
    HEALTH_URL_FILE: healthUrlFile,
    LOG_LEVEL: 'info',
    LOG_FORMAT: 'struct-text',
    ALLOW_REMOTE_UI: 'false',
    LOG_HTTP_RAW_UNSAFE: 'false',
  };
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
  if (parsed.username || parsed.password) throw new Error('tunnel-client health URL contains credentials.');
  return parsed.origin;
}

export async function verifyTunnelClientBinary(binaryPath: string): Promise<boolean> {
  try {
    const result = await execFileResult(binaryPath, ['--version'], process.env, 10_000);
    return /tunnel-client/i.test(`${result.stdout}\n${result.stderr}`);
  } catch {
    return false;
  }
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
      {
        env,
        timeout,
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      },
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
  throw new Error(`OpenAI tunnel-client did not become ready within ${timeoutMs / 1000}s (last status ${lastStatus || 'unreachable'}).`);
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
