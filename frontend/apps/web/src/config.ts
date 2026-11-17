/** Runtime configuration. Each value can be overridden with a `VITE_*` variable in `.env.local`. */

const env = import.meta.env;

const backendUrl = (env.VITE_BACKEND_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');

export const config = {
    /** Base URL of the Spring Boot backend (REST). */
    backendUrl,
    /** WebSocket endpoint of the backend; derived from `backendUrl` by default. */
    webSocketUrl: env.VITE_WEBSOCKET_URL ?? `${backendUrl.replace(/^http/, 'ws')}/ws`,
    /** Folder with the MediaPipe WASM files. The Vite plugin in `vite.config.ts` serves it. */
    mediapipeWasmPath: `${env.BASE_URL}mediapipe/wasm`,
    /** The MediaPipe hand landmarker model (official Google model by default). */
    handLandmarkerModelUrl:
        env.VITE_HAND_LANDMARKER_MODEL_URL ??
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
} as const;
