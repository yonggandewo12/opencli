import { beforeEach, describe, expect, it, vi } from 'vitest';

const { MockWebSocket } = vi.hoisted(() => {
  class MockWebSocket {
    static OPEN = 1;
    readyState = 1;
    private handlers = new Map<string, Array<(...args: any[]) => void>>();

    constructor(_url: string) {
      queueMicrotask(() => this.emit('open'));
    }

    on(event: string, handler: (...args: any[]) => void): void {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    send(_message: string): void {}

    close(): void {
      this.readyState = 3;
    }

    private emit(event: string, ...args: any[]): void {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args);
      }
    }
  }

  return { MockWebSocket };
});

vi.mock('ws', () => ({
  WebSocket: MockWebSocket,
}));

import { CDPBridge } from './cdp.js';

describe('CDPBridge cookies', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('filters cookies by actual domain match instead of substring match', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');

    const bridge = new CDPBridge();
    vi.spyOn(bridge, 'send').mockResolvedValue({
      cookies: [
        { name: 'good', value: '1', domain: '.example.com' },
        { name: 'exact', value: '2', domain: 'example.com' },
        { name: 'bad', value: '3', domain: 'notexample.com' },
      ],
    });

    const page = await bridge.connect();
    const cookies = await page.getCookies({ domain: 'example.com' });

    expect(cookies).toEqual([
      { name: 'good', value: '1', domain: '.example.com' },
      { name: 'exact', value: '2', domain: 'example.com' },
    ]);
  });
});

describe('CDPBridge event listener detection', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('fetchInteractiveNodeIds returns empty set when AXTree is unavailable', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');

    const bridge = new CDPBridge();
    vi.spyOn(bridge, 'send').mockRejectedValue(new Error('AXTree not available'));

    const interactiveIds = await bridge.fetchInteractiveNodeIds();

    expect(interactiveIds).toBeInstanceOf(Set);
    expect(interactiveIds.size).toBe(0);
  });

  it('fetchInteractiveNodeIds parses AXTree and extracts interactive nodes', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');

    const bridge = new CDPBridge();
    let callCount = 0;
    vi.spyOn(bridge, 'send').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return {}; // Accessibility.enable
      if (callCount === 2) {
        // Mock AXTree response
        return {
          tree: {
            children: [
              {
                backendNodeId: 123,
                role: 'button',
                name: 'Click me',
                properties: [],
              },
              {
                backendNodeId: 456,
                role: 'text',
                name: 'Plain text',
                properties: [],
              },
              {
                backendNodeId: 789,
                role: 'link',
                name: 'A link',
                properties: [],
              },
            ],
          },
        };
      }
      return {};
    });

    const interactiveIds = await bridge.fetchInteractiveNodeIds();

    expect(interactiveIds.size).toBe(2);
    expect(interactiveIds.has(123)).toBe(true); // button
    expect(interactiveIds.has(456)).toBe(false); // text
    expect(interactiveIds.has(789)).toBe(true); // link
  });

  it('fetchEventListeners returns empty map when DOM is unavailable', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');

    const bridge = new CDPBridge();
    vi.spyOn(bridge, 'send').mockRejectedValue(new Error('DOM not available'));

    const listeners = await bridge.fetchEventListeners();

    expect(listeners).toBeInstanceOf(Map);
    expect(listeners.size).toBe(0);
  });

  it('fetchEventListeners parses DOM and extracts event listeners', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');

    const bridge = new CDPBridge();
    let callCount = 0;
    vi.spyOn(bridge, 'send').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return {}; // DOM.enable
      if (callCount === 2) return {}; // DOMDebugger.enable
      if (callCount === 3) {
        // Mock flattened document
        return {
          nodes: [
            { nodeId: 1, localName: 'div' },
            { nodeId: 2, localName: 'button' },
          ],
        };
      }
      if (callCount === 4) {
        // Mock event listeners for node 2
        return {
          listeners: [
            { type: 'click' },
            { type: 'mousedown' },
          ],
        };
      }
      return { listeners: [] };
    });

    const listeners = await bridge.fetchEventListeners();

    expect(listeners.size).toBeGreaterThan(0);
  });
});
