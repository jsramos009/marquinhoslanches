declare module "qz-tray" {
  const qz: {
    security: {
      setSignatureAlgorithm(algorithm: string): void;
      setCertificatePromise(factory: () => Promise<string>): void;
      setSignaturePromise(factory: (payload: string) => Promise<string>): void;
    };
    websocket: {
      isActive(): boolean;
      connect(options?: { retries?: number; delay?: number }): Promise<void>;
    };
    printers: { find(): Promise<string | string[]> };
    configs: { create(printer: string, options?: Record<string, unknown>): unknown };
    print(config: unknown, data: unknown[]): Promise<void>;
  };
  export default qz;
}
