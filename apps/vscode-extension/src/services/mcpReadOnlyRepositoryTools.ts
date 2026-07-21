import {
  McpRepositoryTools,
  type McpToolCallResult,
} from './mcpRepositoryTools';

/**
 * Production read-only facade that converts asynchronous validation and I/O
 * failures into standard MCP tool errors instead of rejecting the JSON-RPC
 * request and turning a user mistake into an HTTP 500 response.
 */
export class McpReadOnlyRepositoryTools extends McpRepositoryTools {
  override async call(
    name: string,
    rawArguments: unknown,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    try {
      return await super.call(name, rawArguments, signal);
    } catch (error) {
      return toolError(toSafeErrorMessage(error));
    }
  }
}

function toolError(message: string): McpToolCallResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

function toSafeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]');
}
