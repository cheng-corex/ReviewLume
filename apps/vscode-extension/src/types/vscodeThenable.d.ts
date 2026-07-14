export {};

declare global {
  interface Thenable<T> {
    catch<TResult = never>(
      onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
    ): Promise<T | TResult>;
    finally(onfinally?: (() => void) | null): Promise<T>;
    readonly [Symbol.toStringTag]: string;
  }
}
