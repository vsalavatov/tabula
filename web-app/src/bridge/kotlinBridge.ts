import type {
  AccountsState,
  AnalyticsState,
  SettingsState,
  SyncState,
  TabulaBridge,
  TransactionsState,
  UnitsState
} from "./types";

type RawBridge = {
  getTransactionsListJson(): string;
  getTransactionsDraftJson(): string;
  getTransactionsLookupJson(): string;
  getTransactionsMetaJson(): string;
  getUnitsStateJson(): string;
  getAccountsStateJson(): string;
  getAnalyticsStateJson(): string;
  getSyncStateJson(): string;
  getSettingsStateJson(): string;
  subscribeTransactionsList(listener: (json: string) => void): { dispose(): void };
  subscribeTransactionsDraft(listener: (json: string) => void): { dispose(): void };
  subscribeTransactionsLookup(listener: (json: string) => void): { dispose(): void };
  subscribeTransactionsMeta(listener: (json: string) => void): { dispose(): void };
  subscribeUnitsState(listener: (json: string) => void): { dispose(): void };
  subscribeAccountsState(listener: (json: string) => void): { dispose(): void };
  subscribeAnalyticsState(listener: (json: string) => void): { dispose(): void };
  subscribeSyncState(listener: (json: string) => void): { dispose(): void };
  subscribeSettingsState(listener: (json: string) => void): { dispose(): void };
  [key: string]: (...args: unknown[]) => unknown;
};

type BridgeFactory = (configJson: string) => RawBridge;

type KotlinBridgeModule = {
  dev?: {
    salavatov?: {
      tabula?: {
        shared?: {
          bridge?: {
            web?: {
              createTabulaWebBridge?: BridgeFactory;
            };
          };
        };
      };
    };
  };
  dev_salavatov_shared_bridge_web?: {
    createTabulaWebBridge?: BridgeFactory;
  };
};

declare global {
  interface Window {
    JSJoda?: unknown;
    initSqlJs?: (config?: Record<string, unknown>) => { await: () => unknown };
    ["@js-joda/core"]?: unknown;
    ["dev.salavatov:shared-bridge-web"]?: KotlinBridgeModule;
  }
}

const kotlinRuntimeScripts = [
  "kotlin-kotlin-stdlib.js",
  "kotlin-kotlinx-atomicfu-runtime.js",
  "kotlinx-atomicfu.js",
  "kotlinx-coroutines-core.js",
  "kotlinx-serialization-kotlinx-serialization-core.js",
  "kotlinx-serialization-kotlinx-serialization-json.js",
  "kotlin_org_jetbrains_kotlin_kotlin_dom_api_compat.js",
  "sqldelight-runtime.js",
  "sqldelight-extensions-async-extensions.js",
  "sqldelight-extensions-coroutines-extensions.js",
  "Kotlin-DateTime-library-kotlinx-datetime.js",
  "tabula-shared-core.js",
  "tabula-shared-db.js",
  "tabula-shared-bridge-web.js",
] as const;

let kotlinBridgeLoadPromise: Promise<void> | null = null;

function parseJson<T>(json: string): T {
  return JSON.parse(json) as T;
}

function generatedAssetUrl(fileName: string) {
  return `/generated/kotlin/${fileName}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

function loadClassicScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[data-tabula-src="${src}"]`);
  if (existing) {
    return existing.dataset.loaded === "true"
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
        });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.tabulaSrc = src;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function ensureKotlinBridgeLoaded(): Promise<void> {
  if (window["dev.salavatov:shared-bridge-web"]) {
    return;
  }
  if (!kotlinBridgeLoadPromise) {
    kotlinBridgeLoadPromise = (async () => {
      await loadClassicScript(generatedAssetUrl("js-joda.js"));
      window["@js-joda/core"] = window.JSJoda;

      await loadClassicScript(generatedAssetUrl("sql-wasm.js"));
      const originalInitSqlJs = window.initSqlJs as unknown as ((config?: Record<string, unknown>) => Promise<unknown>) | undefined;
      if (!originalInitSqlJs) {
        throw new Error("sql.js did not register initSqlJs on window.");
      }
      const sqlJsModule = await originalInitSqlJs({
        locateFile(file: string) {
          if (file === "sql-wasm.wasm") {
            return generatedAssetUrl("sql-wasm.wasm");
          }
          return generatedAssetUrl(file);
        },
      });
      window.initSqlJs = () => Promise.resolve(sqlJsModule);

      for (const scriptName of kotlinRuntimeScripts) {
        await loadClassicScript(generatedAssetUrl(scriptName));
      }
    })();
  }
  await kotlinBridgeLoadPromise;
}

async function loadBridgeFactory(): Promise<BridgeFactory> {
  await ensureKotlinBridgeLoaded();
  const module = window["dev.salavatov:shared-bridge-web"];
  if (!module) {
    throw new Error("The Kotlin bridge runtime did not register on window.");
  }
  const factory =
    module.dev?.salavatov?.tabula?.shared?.bridge?.web?.createTabulaWebBridge ??
    module.dev_salavatov_shared_bridge_web?.createTabulaWebBridge;
  if (!factory) {
    throw new Error("The generated Kotlin bridge did not expose createTabulaWebBridge.");
  }
  return factory;
}

export async function createKotlinBridge(): Promise<TabulaBridge> {
  const config = {
    googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "",
    cacheKey: "tabula.db",
    useMockDrive: import.meta.env.VITE_MOCK_GOOGLE_DRIVE === "true",
  };
  const createTabulaWebBridge = await loadBridgeFactory();
  const bridge = createTabulaWebBridge(JSON.stringify(config));
  const call = <T>(name: string, ...args: unknown[]) => {
    return (bridge[name] as (...values: unknown[]) => T)(...args);
  };
  type TransactionListSlice = Pick<
    TransactionsState,
    "visibleTransactions" | "viewportOffset" | "viewportLimit" | "totalTransactionCount" | "hasOlderTransactions" | "hasNewerTransactions" | "previousDateIso"
  >;
  type TransactionDraftSlice = Pick<TransactionsState, "draft">;
  type TransactionLookupSlice = Pick<TransactionsState, "accounts" | "units">;
  type TransactionMetaSlice = Pick<TransactionsState, "activeEditingTransactionId" | "revealTransaction" | "isLoading" | "error">;

  let transactionsState: TransactionsState = {
    ...parseJson<TransactionListSlice>(bridge.getTransactionsListJson()),
    ...parseJson<TransactionDraftSlice>(bridge.getTransactionsDraftJson()),
    ...parseJson<TransactionLookupSlice>(bridge.getTransactionsLookupJson()),
    ...parseJson<TransactionMetaSlice>(bridge.getTransactionsMetaJson()),
    groupedTransactions: [],
    canLoadMore: false,
  };
  let unitsState = parseJson<UnitsState>(bridge.getUnitsStateJson());
  let accountsState = parseJson<AccountsState>(bridge.getAccountsStateJson());
  let analyticsState = parseJson<AnalyticsState>(bridge.getAnalyticsStateJson());
  let syncState = parseJson<SyncState>(bridge.getSyncStateJson());
  let settingsState = parseJson<SettingsState>(bridge.getSettingsStateJson());

  const transactionsListeners = new Set<(state: TransactionsState) => void>();
  const unitsListeners = new Set<(state: UnitsState) => void>();
  const accountsListeners = new Set<(state: AccountsState) => void>();
  const analyticsListeners = new Set<(state: AnalyticsState) => void>();
  const syncListeners = new Set<(state: SyncState) => void>();
  const settingsListeners = new Set<(state: SettingsState) => void>();

  const emitTransactionsState = () => {
    transactionsListeners.forEach((listener) => listener(transactionsState));
  };
  const emitUnitsState = () => {
    unitsListeners.forEach((listener) => listener(unitsState));
  };
  const emitAccountsState = () => {
    accountsListeners.forEach((listener) => listener(accountsState));
  };
  const emitAnalyticsState = () => {
    analyticsListeners.forEach((listener) => listener(analyticsState));
  };
  const emitSyncState = () => {
    syncListeners.forEach((listener) => listener(syncState));
  };
  const emitSettingsState = () => {
    settingsListeners.forEach((listener) => listener(settingsState));
  };

  const updateTransactions = (patch: Partial<TransactionsState>) => {
    const nextState = {
      ...transactionsState,
      ...patch,
      canLoadMore: patch.hasOlderTransactions ?? transactionsState.hasOlderTransactions,
    };
    transactionsState = nextState;
    emitTransactionsState();
  };
  const activeSubscriptions = [
    bridge.subscribeTransactionsList((json) => updateTransactions(parseJson<TransactionListSlice>(json))),
    bridge.subscribeTransactionsDraft((json) => updateTransactions(parseJson<TransactionDraftSlice>(json))),
    bridge.subscribeTransactionsLookup((json) => updateTransactions(parseJson<TransactionLookupSlice>(json))),
    bridge.subscribeTransactionsMeta((json) => updateTransactions(parseJson<TransactionMetaSlice>(json))),
    bridge.subscribeUnitsState((json) => {
      unitsState = parseJson<UnitsState>(json);
      emitUnitsState();
    }),
    bridge.subscribeAccountsState((json) => {
      accountsState = parseJson<AccountsState>(json);
      emitAccountsState();
    }),
    bridge.subscribeAnalyticsState((json) => {
      analyticsState = parseJson<AnalyticsState>(json);
      emitAnalyticsState();
    }),
    bridge.subscribeSyncState((json) => {
      syncState = parseJson<SyncState>(json);
      emitSyncState();
    }),
    bridge.subscribeSettingsState((json) => {
      settingsState = parseJson<SettingsState>(json);
      emitSettingsState();
    }),
  ];
  void activeSubscriptions;

  return {
    getTransactionsState: () => transactionsState,
    subscribeTransactionsState(listener) {
      transactionsListeners.add(listener);
      listener(transactionsState);
      return () => {
        transactionsListeners.delete(listener);
      };
    },
    getUnitsState: () => unitsState,
    subscribeUnitsState(listener) {
      unitsListeners.add(listener);
      listener(unitsState);
      return () => {
        unitsListeners.delete(listener);
      };
    },
    getAccountsState: () => accountsState,
    subscribeAccountsState(listener) {
      accountsListeners.add(listener);
      listener(accountsState);
      return () => {
        accountsListeners.delete(listener);
      };
    },
    getAnalyticsState: () => analyticsState,
    subscribeAnalyticsState(listener) {
      analyticsListeners.add(listener);
      listener(analyticsState);
      return () => {
        analyticsListeners.delete(listener);
      };
    },
    getSyncState: () => syncState,
    subscribeSyncState(listener) {
      syncListeners.add(listener);
      listener(syncState);
      return () => {
        syncListeners.delete(listener);
      };
    },
    getSettingsState: () => settingsState,
    subscribeSettingsState(listener) {
      settingsListeners.add(listener);
      listener(settingsState);
      return () => {
        settingsListeners.delete(listener);
      };
    },
    async importDatabaseFile(file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await call<Promise<void>>("importDatabaseBase64", bytesToBase64(bytes));
    },
    signIn: () => call("signIn"),
    loadBackups: () => call("loadBackups"),
    uploadBackup: () => call("uploadBackup"),
    restoreBackup: (fileId) => call("restoreBackup", fileId),
    downloadBackup: (fileId) => call("downloadBackup", fileId),
    deleteBackup: (fileId) => call("deleteBackup", fileId),
    beginNewTransactionEntry: () => call("beginNewTransactionEntry"),
    cancelEditingTransaction: () => call("cancelEditingTransaction"),
    beginEditingTransaction: (id) => call("beginEditingTransaction", id),
    updateTransactionDescription: (value) => call("updateTransactionDescription", value),
    updateTransactionDateInput: (value) => call("updateTransactionDateInput", value),
    stepTransactionDate: (days) => call("stepTransactionDate", days),
    updateTransferFromAccount: (index, value) => call("updateTransferFromAccount", index, value),
    updateTransferQuantity: (index, value) => call("updateTransferQuantity", index, value),
    updateTransferUnit: (index, value) => call("updateTransferUnit", index, value),
    updateTransferToAccount: (index, value) => call("updateTransferToAccount", index, value),
    addTransferRow: () => call("addTransferRow"),
    loadOlderTransactions: () => call("loadOlderTransactions"),
    loadNewerTransactions: () => call("loadNewerTransactions"),
    deleteTransaction: (id) => call("deleteTransaction", id),
    removeTransferRow: (index) => call("removeTransferRow", index),
    commitTransactionDraft: () => call("commitTransactionDraft"),
    updateUnitName: (value) => call("updateUnitName", value),
    updateUnitSymbol: (value) => call("updateUnitSymbol", value),
    updateUnitMantissaLength: (value) => call("updateUnitMantissaLength", value),
    createUnit: () => call("createUnit"),
    toggleShowArchived: (showArchived) => call("toggleShowArchived", showArchived),
    updateNewAccountName: (value) => call("updateNewAccountName", value),
    updateNewAccountInPossession: (value) => call("updateNewAccountInPossession", value),
    createAccount: () => call("createAccount"),
    toggleAccountEditMode: (accountId, enabled) => call("toggleAccountEditMode", accountId, enabled),
    updateAccountName: (accountId, value) => call("updateAccountName", accountId, value),
    updateAccountInPossession: (accountId, value) => call("updateAccountInPossession", accountId, value),
    updateAccountArchived: (accountId, value) => call("updateAccountArchived", accountId, value),
    applyAccountEdits: (accountId) => call("applyAccountEdits", accountId),
    checkConsistency: () => call("checkConsistency"),
    clearConsistencyResult: () => call("clearConsistencyResult"),
    selectAnalyticsAccount: (accountId) => call("selectAnalyticsAccount", accountId),
    selectAnalyticsUnit: (unitId) => call("selectAnalyticsUnit", unitId),
    selectAnalyticsTimeRange: (range) => call("selectAnalyticsTimeRange", range),
    setThemeMode: (mode) => call("setThemeMode", mode),
  };
}
