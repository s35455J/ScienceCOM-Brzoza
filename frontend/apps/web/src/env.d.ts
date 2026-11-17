/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_BACKEND_URL?: string;
    readonly VITE_WEBSOCKET_URL?: string;
    readonly VITE_HAND_LANDMARKER_MODEL_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
