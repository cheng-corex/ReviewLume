import type { BridgeServerAddress, LocalBridgeServer as LocalBridgeServerType } from '../../../web-bridge/src/index';

// This runtime dependency is copied into dist/vendor during packaging, so it cannot be a static TS import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LocalBridgeServer } = require('../vendor/web-bridge/index.js') as {
  readonly LocalBridgeServer: typeof LocalBridgeServerType;
};

export interface BrowserPromptInput {
  readonly reviewId: string;
  readonly targetSite: string;
  readonly prompt: string;
}

/** Owns the loopback bridge lifecycle for the current VS Code extension host. */
export class BrowserBridgeService {
  readonly #server = new LocalBridgeServer();
  #address: BridgeServerAddress | undefined;

  async start(): Promise<BridgeServerAddress> {
    this.#address = await this.#server.start();
    return this.#address;
  }

  get address(): BridgeServerAddress | undefined {
    return this.#address;
  }

  async createPairingCode(): Promise<{
    readonly address: BridgeServerAddress;
    readonly code: string;
    readonly expiresAt: string;
  }> {
    const address = await this.start();
    return { address, ...this.#server.createPairingCode() };
  }

  getPairedExtensions(): readonly string[] {
    return this.#server.getPairedExtensions();
  }

  async publishPrompt(extensionInstanceId: string, input: BrowserPromptInput): Promise<void> {
    await this.start();
    this.#server.publishPromptForExtension(extensionInstanceId, input);
  }

  revokeAll(): void {
    this.#server.revokeAll();
  }

  async dispose(): Promise<void> {
    await this.#server.stop();
    this.#address = undefined;
  }
}
