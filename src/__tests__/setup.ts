import { vi } from 'vitest';

// crypto.subtle polyfill (Node 환경)
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto');
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}

// performance.memory — Chrome 전용 (테스트에서 미지원 → undefined)
if (!('memory' in performance)) {
  Object.defineProperty(performance, 'memory', {
    value: undefined,
    configurable: true,
  });
}

// Worker mock — jsdom에서 미지원
vi.stubGlobal('Worker', class {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage() {}
  terminate() {}
});
