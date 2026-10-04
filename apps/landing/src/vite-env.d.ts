/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Публичный адрес самого Yargram, куда ведёт кнопка «Открыть Yargram». */
  readonly VITE_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
