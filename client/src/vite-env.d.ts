/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Socket.IO server (e.g. "https://your-server.up.railway.app"). Unset in local dev, where the Vite dev-server proxy handles /socket.io instead. */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
