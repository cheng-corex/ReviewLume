import { describe, expect, it } from 'vitest';
import type { McpConnectionInfo } from './mcpConnectorService';
import {
  buildTunnelEnvironment,
  isValidTunnelId,
  normalizeHealthBaseUrl,
  redactTunnelOutput,
  sanitizeTunnelEnvironment,
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

describe('SecureMcpTunnelService helpers', () => {
  it('accepts only canonical OpenAI tunnel IDs', () => {
    expect(isValidTunnelId(configuration.tunnelId)).toBe(true);
    expect(isValidTunnelId('tunnel_ABCDEF0123456789abcdef0123456789')).toBe(false);
    expect(isValidTunnelId('other_0123456789abcdef0123456789abcdef')).toBe(false);
    expect(isValidTunnelId('tunnel_0123')).toBe(false);
  });

  it('passes secrets through environment variables and uses env references in headers', () => {
    const env = buildTunnelEnvironment(
      { PATH: '/bin' },
      configuration,
      connection,
      '/tmp/health.url',
    );

    expect(env.CONTROL_PLANE_API_KEY).toBe(configuration.runtimeApiKey);
    expect(env.CONTROL_PLANE_TUNNEL_ID).toBe(configuration.tunnelId);
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

  it('removes ambient tunnel-client profiles, commands, keys, and unsafe logging overrides', () => {
    const ambient = {
      PATH: '/bin',
      HTTPS_PROXY: 'http://proxy.example.test:8080',
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
    expect(sanitized.HTTPS_PROXY).toBe(ambient.HTTPS_PROXY);
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

    const env = buildTunnelEnvironment(
      ambient,
      configuration,
      connection,
      '/tmp/health.url',
    );
    expect(env.PATH).toBe('/bin');
    expect(env.HTTPS_PROXY).toBe(ambient.HTTPS_PROXY);
    expect(env.CONTROL_PLANE_TUNNEL_ID).toBe(configuration.tunnelId);
    expect(env.MCP_SERVER_URL).toBe(connection.endpointUrl);
    expect(env.MCP_COMMAND).toBeUndefined();
    expect(env.OPENAI_ADMIN_KEY).toBeUndefined();
    expect(env.CLOUDFLARED_TUNNEL_TOKEN).toBeUndefined();
    expect(env.HARPOON_TARGETS).toBeUndefined();
    expect(env.LOG_FILE).toBeUndefined();
    expect(env.ALLOW_REMOTE_UI).toBe('false');
    expect(env.OPEN_WEB_UI).toBe('false');
    expect(env.LOG_HTTP_RAW_UNSAFE).toBe('false');
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
