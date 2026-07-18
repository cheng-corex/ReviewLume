import { LocalBridgeServer, type BridgeServerAddress } from '@reviewlume/web-bridge';

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
