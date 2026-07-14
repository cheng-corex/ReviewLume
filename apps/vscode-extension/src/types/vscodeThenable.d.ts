export {};

declare global {
  interface Thenable<T> {
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2>;
    catch<TResult = never>(
      onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
    ): Promise<T | TResult>;
    finally(onfinally?: (() => void) | null): Promise<T>;
    readonly [Symbol.toStringTag]: string;
  }
}
