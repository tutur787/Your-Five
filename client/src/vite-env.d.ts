/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Worker (e.g. "https://your-five-worker.your-subdomain.workers.dev"). Unset in local dev, where the Vite dev-server proxy forwards to the local `wrangler dev` server instead. */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
