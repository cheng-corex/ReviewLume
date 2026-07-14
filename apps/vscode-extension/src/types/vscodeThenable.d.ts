export {};

declare global {
  interface Thenable<T> extends Promise<T> {}
}
