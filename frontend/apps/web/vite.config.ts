import { createReadStream, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** The MediaPipe WASM files that `FilesetResolver.forVisionTasks` loads (non-module variant). */
const MEDIAPIPE_WASM_FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];
const MEDIAPIPE_WASM_URL = 'mediapipe/wasm';

/**
 * Serves the MediaPipe WASM files of `@mediapipe/tasks-vision` (a dependency of
 * `@sllapp/hand-landmarker`) at `/mediapipe/wasm/` in development and copies them into the build.
 */
function mediapipeWasm(): Plugin {
    const require = createRequire(
        fileURLToPath(new URL('../../packages/hand-landmarker/package.json', import.meta.url)),
    );
    const wasmDir = dirname(require.resolve('@mediapipe/tasks-vision/vision_wasm_internal.wasm'));

    return {
        name: 'sllapp-mediapipe-wasm',
        configureServer(server) {
            server.middlewares.use(`/${MEDIAPIPE_WASM_URL}`, (req, res, next) => {
                const name = (req.url ?? '').split('?')[0]!.replace(/^\/+/, '');
                if (!MEDIAPIPE_WASM_FILES.includes(name)) {
                    next();
                    return;
                }
                res.setHeader(
                    'Content-Type',
                    name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
                );
                createReadStream(join(wasmDir, name)).pipe(res);
            });
        },
        generateBundle() {
            for (const name of MEDIAPIPE_WASM_FILES) {
                this.emitFile({
                    type: 'asset',
                    fileName: `${MEDIAPIPE_WASM_URL}/${name}`,
                    source: readFileSync(join(wasmDir, name)),
                });
            }
        },
    };
}

export default defineConfig({
    plugins: [vue(), mediapipeWasm()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        environment: 'jsdom',
    },
});
