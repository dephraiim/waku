import type { Plugin, ViteDevServer } from 'vite';
import type { ModuleImportResult } from '../handlers/types.js';

const customCode = `
import { createHotContext as __vite__createHotContext } from "/@vite/client";
import.meta.hot = __vite__createHotContext(import.meta.url);

if (import.meta.hot && !globalThis.__WAKU_HMR_CONFIGURED__) {
  globalThis.__WAKU_HMR_CONFIGURED__ = true;
  import.meta.hot.on('hot-import', (data) => import(/* @vite-ignore */ data));
  import.meta.hot.on('module', (data) => {
    // remove element with the same 'waku-module-id'
    let script = document.querySelector(
      'script[waku-module-id="' + data.id + '"]',
    );
    script?.remove();

    const code = data.code;
    script = document.createElement('script');
    script.type = 'module';
    script.text = code;
    script.setAttribute('waku-module-id', data.id);
    document.head.appendChild(script);
  });
}
`;

export function rscHmrPlugin(): Plugin {
  return {
    name: 'rsc-hmr-plugin',
    enforce: 'post',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: customCode,
          injectTo: 'head',
        },
      ];
    },
  };
}

const pendingMap = new WeakMap<ViteDevServer, Set<string>>();

export function hotImport(vite: ViteDevServer, source: string) {
  let sourceSet = pendingMap.get(vite);
  if (!sourceSet) {
    sourceSet = new Set();
    pendingMap.set(vite, sourceSet);
    vite.ws.on('connection', () => {
      for (const source of sourceSet!) {
        vite.ws.send({ type: 'custom', event: 'hot-import', data: source });
      }
    });
  }
  sourceSet.add(source);
  vite.ws.send({ type: 'custom', event: 'hot-import', data: source });
}

const modulePendingMap = new WeakMap<ViteDevServer, Set<ModuleImportResult>>();

export function moduleImport(
  viteServer: ViteDevServer,
  result: ModuleImportResult,
) {
  let sourceSet = modulePendingMap.get(viteServer);
  if (!sourceSet) {
    sourceSet = new Set();
    modulePendingMap.set(viteServer, sourceSet);
    viteServer.ws.on('connection', () => {
      for (const result of sourceSet!) {
        viteServer.ws.send({ type: 'custom', event: 'module', data: result });
      }
    });
  }
  sourceSet.add(result);
  viteServer.ws.send({ type: 'custom', event: 'module', data: result });
}
