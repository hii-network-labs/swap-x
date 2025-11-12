/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_CHAIN_ID?: string;
  readonly VITE_DEFAULT_CHAIN_NAME?: string;
  readonly VITE_DEFAULT_CHAIN_RPC_URL?: string;
  readonly VITE_DEFAULT_CHAIN_EXPLORER?: string;

  readonly VITE_SUBGRAPH_URL?: string;

  readonly VITE_V4_POOL_MANAGER?: string;
  readonly VITE_V4_POSITION_MANAGER?: string;
  readonly VITE_V4_STATE_VIEW?: string;
  readonly VITE_V4_PERMIT2?: string;
  readonly VITE_V4_QUOTER?: string;
  readonly VITE_V4_UNIVERSAL_ROUTER?: string;

  // Optional V3
  readonly VITE_V3_FACTORY?: string;
  readonly VITE_V3_ROUTER?: string;
  readonly VITE_V3_POSITION_MANAGER?: string;
  readonly VITE_V3_QUOTER?: string;
  readonly VITE_V3_QUOTER_V2?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}