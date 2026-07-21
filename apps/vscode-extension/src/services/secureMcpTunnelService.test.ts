import { describe, expect, it } from 'vitest';
import type { McpConnectionInfo } from './mcpConnectorService';
import {
  buildTunnelEnvironment,
  discoverControlPlaneProxy,
  isTunnelClientHelpOutput,
  isValidTunnelId,
  normalizeHealthBaseUrl,
  normalizeProxyUrl,
  parseWindowsProxyServer,
  redactTunnelOutput,
  sanitizeTunnelEnvironment,
  validateTunnelRuntimeStatus,
  type SecureMcpTunnelConfiguration,
} from './secureMcpTunnelService';

const configuration: SecureMcpTunnelConfiguration = {
  binaryPath: '/tools/tunnel-client',
  tunnelId: 'tunnel_0123456789abcdefghijklmnopqrstuv',
  runtimeApiKey: 'runtime-key-value-123456789',
};

const connection: McpConnectionInfo = {
  host: '127.0.0.1',
  port: 32123,
  endpointUrl: 'http://127.0.0.1:32123/mcp',
  bearerToken: 'local-token-value-123456789',
  tunnelToken: 'local-token-value-123456789',
  authorizationHeader: 'Bearer local-token-value-123456789',
  repository: 'fixture',
  repositoryRoot: '/workspace/fixture',
};

const healthyStatus = {
  control_plane_tunnel_id: configuration.tunnelId,
  channels: [{ name: 'main', enabled: true, probe_status: 'ok' }],
};

describe('SecureMcpTunnelService helpers', () => {
  it('accepts only canonical OpenAI tunnel IDs', () => {
    expect(isValidTunnelId(configuration.tunnelId)).toBe(true);
    expect(isValidTunnelId('tunnel_ABCDEF0123456789abcdef0123456789')).toBe(false);
    expect(isValidTunnelId('other_0123456789abcdef0123456789abcdef')).toBe(false);
    expect(isValidTunnelId('tunnel_0123')).toBe(false);
  });

  it('recognizes the official Cobra help layout emitted by tunnel-client on Windows', () => {
    const windowsHelp = [
      'Tunnel client for the OpenAI MCP control plane',
      '',
      'Usage:',
      '  tunnel-client [command]',
      '',
      'Available Commands:',
    ].join('\r\n');

    expect(isTunnelClientHelpOutput(windowsHelp)).toBe(true);
    expect(
      isTunnelClientHelpOutput(
        'Use: tunnel-client\nTunnel client for the OpenAI MCP control plane',
      ),
    ).toBe(true);
    expect(isTunnelClientHelpOutput('Usage:\n  another-client [command]')).toBe(false);
  });

  it('normalizes safe HTTP proxy addresses without accepting credentials or paths', () => {
    expect(normalizeProxyUrl('127.0.0.1:10809')).toBe('http://127.0.0.1:10809');
    expect(normalizeProxyUrl('http://127.0.0.1:10809/')).toBe(
      'http://127.0.0.1:10809',
    );
    expect(() => normalizeProxyUrl('socks5://127.0.0.1:10808')).toThrow('HTTP or HTTPS');
    expect(() => normalizeProxyUrl('http://user:pass@127.0.0.1:10809')).toThrow(
      'credentials',
    );
    expect(() => normalizeProxyUrl('http://127.0.0.1:10809/proxy')).toThrow(
      'path',
    );
  });

  it('parses Windows single and per-protocol system proxy formats', () => {
    expect(parseWindowsProxyServer('127.0.0.1:10809')).toBe(
      'http://127.0.0.1:10809',
    );
    expect(
      parseWindowsProxyServer('http=127.0.0.1:8080;https=127.0.0.1:10809'),
    ).toBe('http://127.0.0.1:10809');
    expect(parseWindowsProxyServer('socks=127.0.0.1:10808')).toBeUndefined();
  });

  it('prefers an explicit control-plane proxy and falls back to HTTPS_PROXY', async () => {
    await expect(
      discoverControlPlaneProxy(
        {
          CONTROL_PLANE_HTTP_PROXY: 'http://127.0.0.1:10810',
          HTTPS_PROXY: 'http://127.0.0.1:10809',
        },
        undefined,
        'linux',
      ),
    ).resolves.toEqual({
      value: 'http://127.0.0.1:10810',
      source: 'env:CONTROL_PLANE_HTTP_PROXY',
    });

    await expect(
      discoverControlPlaneProxy(
        { HTTPS_PROXY: 'http://127.0.0.1:10809' },
        undefined,
        'linux',
      ),
    ).resolves.toEqual({
      value: 'http://127.0.0.1:10809',
      source: 'env:HTTPS_PROXY',
    });
  });

  it('uses the VS Code proxy when no environment proxy is present', async () => {
    await expect(
      discoverControlPlaneProxy({}, '127.0.0.1:10809', 'linux'),
    ).resolves.toEqual({
      value: 'http://127.0.0.1:10809',
      source: 'vscode:http.proxy',
    });
  });

  it('passes secrets through controlled environment variables and scopes proxy to control plane', () => {
    const env = buildTunnelEnvironment(
      { PATH: '/bin', HTTPS_PROXY: 'http://ambient.example.test:8080' },
      configuration,
      connection,
      '/tmp/health.url',
      'http://127.0.0.1:10809',
    );

    expect(env.CONTROL_PLANE_API_KEY).toBe(configuration.runtimeApiKey);
    expect(env.CONTROL_PLANE_TUNNEL_ID).toBe(configuration.tunnelId);
    expect(env.CONTROL_PLANE_HTTP_PROXY).toBe('http://127.0.0.1:10809');
    expect(env.HTTPS_PROXY).toBeUndefined();
    expect(env.HTTP_PROXY).toBeUndefined();
    expect(env.MCP_SERVER_URL).toBe(connection.endpointUrl);
    expect(env.REVIEWLUME_MCP_TOKEN).toBe(connection.tunnelToken);
    expect(env.MCP_EXTRA_HEADERS).toBe(
      'X-ReviewLume-Token: env:REVIEWLUME_MCP_TOKEN',
    );
    expect(env.MCP_DISCOVERY_EXTRA_HEADERS).toBe(env.MCP_EXTRA_HEADERS);
    expect(env.MCP_EXTRA_HEADERS).not.toContain(connection.tunnelToken);
    expect(env.MCP_EXTRA_HEADERS).not.toContain(configuration.runtimeApiKey);
    expect(env.ALLOW_REMOTE_UI).toBe('false');
    expect(env.OPEN_WEB_UI).toBe('false');
    expect(env.LOG_HTTP_RAW_UNSAFE).toBe('false');
    expect(env.HARPOON_CAPTURE_PAYLOADS).toBe('false');
  });

  it('removes ambient tunnel profiles, proxy variables, commands, keys, and unsafe logs', () => {
    const ambient = {
      PATH: '/bin',
      HTTPS_PROXY: 'http://proxy.example.test:8080',
      NO_PROXY: 'localhost',
      TUNNEL_CLIENT_CONFIG: '/tmp/ambient.yaml',
      TUNNEL_CLIENT_PROFILE: 'ambient-profile',
      CONTROL_PLANE_TUNNEL_ID: 'tunnel_ambientambientambientambient12',
      OPENAI_API_KEY: 'ambient-openai-key',
      OPENAI_ADMIN_KEY: 'ambient-admin-key',
      MCP_COMMAND: 'command=sh -c unexpected,channel=main',
      MCP_SERVER_URL: 'https://unexpected.example/mcp',
      MCP_EXTRA_HEADERS: 'X-Ambient: secret',
      CLOUDFLARED_TUNNEL_TOKEN: 'ambient-cloudflared-token',
      HARPOON_TARGETS: 'label=unexpected,url=http://127.0.0.1:1',
      ALLOW_REMOTE_UI: 'true',
      OPEN_WEB_UI: 'true',
      LOG_FILE: '/tmp/ambient.log',
      LOG_HTTP_RAW_UNSAFE: 'true',
    } satisfies NodeJS.ProcessEnv;

    const sanitized = sanitizeTunnelEnvironment(ambient);
    expect(sanitized.PATH).toBe('/bin');
    expect(sanitized.HTTPS_PROXY).toBeUndefined();
    expect(sanitized.NO_PROXY).toBeUndefined();
    expect(sanitized.TUNNEL_CLIENT_CONFIG).toBeUndefined();
    expect(sanitized.TUNNEL_CLIENT_PROFILE).toBeUndefined();
    expect(sanitized.CONTROL_PLANE_TUNNEL_ID).toBeUndefined();
    expect(sanitized.OPENAI_API_KEY).toBeUndefined();
    expect(sanitized.OPENAI_ADMIN_KEY).toBeUndefined();
    expect(sanitized.MCP_COMMAND).toBeUndefined();
    expect(sanitized.MCP_SERVER_URL).toBeUndefined();
    expect(sanitized.MCP_EXTRA_HEADERS).toBeUndefined();
    expect(sanitized.CLOUDFLARED_TUNNEL_TOKEN).toBeUndefined();
    expect(sanitized.HARPOON_TARGETS).toBeUndefined();
    expect(sanitized.ALLOW_REMOTE_UI).toBeUndefined();
    expect(sanitized.OPEN_WEB_UI).toBeUndefined();
    expect(sanitized.LOG_FILE).toBeUndefined();
    expect(sanitized.LOG_HTTP_RAW_UNSAFE).toBeUndefined();
  });

  it('requires a matching healthy tunnel and rejects control-plane metadata errors', () => {
    expect(validateTunnelRuntimeStatus(healthyStatus, configuration.tunnelId)).toBeUndefined();
    expect(
      validateTunnelRuntimeStatus(
        { ...healthyStatus, tunnel_metadata_error: 'connect timeout' },
        configuration.tunnelId,
      ),
    ).toBe('connect timeout');
    expect(
      validateTunnelRuntimeStatus(
        { ...healthyStatus, control_plane_tunnel_id: 'tunnel_other' },
        configuration.tunnelId,
      ),
    ).toContain('different');
    expect(
      validateTunnelRuntimeStatus(
        {
          ...healthyStatus,
          channels: [{ name: 'main', enabled: true, probe_status: 'failed' }],
        },
        configuration.tunnelId,
      ),
    ).toContain('not enabled and healthy');
  });

  it('redacts runtime and local credentials from doctor diagnostics', () => {
    const value = [
      configuration.runtimeApiKey,
      connection.tunnelToken,
      connection.authorizationHeader,
      'authorization: Bearer another-secret-value',
    ].join('\n');
    const redacted = redactTunnelOutput(value, configuration, connection);

    expect(redacted).not.toContain(configuration.runtimeApiKey);
    expect(redacted).not.toContain(connection.tunnelToken);
    expect(redacted).not.toContain('another-secret-value');
    expect(redacted).toContain('[REDACTED]');
  });

  it('accepts only loopback HTTP health URLs', () => {
    expect(normalizeHealthBaseUrl('http://127.0.0.1:4567/')).toBe(
      'http://127.0.0.1:4567',
    );
    expect(normalizeHealthBaseUrl('http://localhost:4567/readyz')).toBe(
      'http://localhost:4567',
    );
    expect(() => normalizeHealthBaseUrl('https://example.com/')).toThrow(
      'not loopback HTTP',
    );
    expect(() => normalizeHealthBaseUrl('http://user:pass@127.0.0.1:4567/')).toThrow(
      'contains credentials',
    );
  });
});
