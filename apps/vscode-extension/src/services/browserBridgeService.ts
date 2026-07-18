import type { BridgeServerAddress, LocalBridgeServer as LocalBridgeServerType } from '../../../web-bridge/src/index';

type LocalBridgeServerConstructor = typeof LocalBridgeServerType;
type LocalBridgeServerInstance = InstanceType<LocalBridgeServerConstructor>;

function loadLocalBridgeServer(): LocalBridgeServerConstructor {
  try {
    // Packaged VSIX runtime: copied into dist/vendor by the extension build.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('../vendor/web-bridge/index.js') as { readonly LocalBridgeServer: LocalBridgeServerConstructor })
      .LocalBridgeServer;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'MODULE_NOT_FOUND') {
      throw error;
    }

    // Source runtime: use the workspace implementation before packaging has copied the vendor bundle.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('../../../web-bridge/src/index') as { readonly LocalBridgeServer: LocalBridgeServerConstructor })
      .LocalBridgeServer;
  }
}

export interface BrowserPromptInput {
  readonly reviewId: string;
  readonly targetSite: string;
  readonly prompt: string;
}

/** Owns the loopback bridge lifecycle for the current VS Code extension host. */
export class BrowserBridgeService {
  #server: LocalBridgeServerInstance | undefined;
  #address: BridgeServerAddress | undefined;

  #getServer(): LocalBridgeServerInstance {
    // Keep activation side-effect free: the bridge implementation is loaded only after an explicit user command.
    this.#server ??= new (loadLocalBridgeServer())();
    return this.#server;
  }

  async start(): Promise<BridgeServerAddress> {
    this.#address = await this.#getServer().start();
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
    return { address, ...this.#getServer().createPairingCode() };
  }

  getPairedExtensions(): readonly string[] {
    return this.#server?.getPairedExtensions() ?? [];
  }

  async publishPrompt(extensionInstanceId: string, input: BrowserPromptInput): Promise<void> {
    await this.start();
    this.#getServer().publishPromptForExtension(extensionInstanceId, input);
  }

  revokeAll(): void {
    this.#server?.revokeAll();
  }

  async dispose(): Promise<void> {
    await this.#server?.stop();
    this.#server = undefined;
    this.#address = undefined;
  }
}
