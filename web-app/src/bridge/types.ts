export type ThemeMode = "LIGHT" | "DARK" | "SYSTEM";
export type AnalyticsTimeRange =
  | "LAST_WEEK"
  | "LAST_MONTH"
  | "LAST_THREE_MONTHS"
  | "LAST_SIX_MONTHS"
  | "LAST_YEAR"
  | "ALL_TIME";

export interface Account {
  id: number;
  name: string;
  owning: boolean;
  isArchived: boolean;
}

export interface Unit {
  id: number;
  name: string;
  symbol: string;
  mantissaLength: number;
}

export interface Transfer {
  id: number;
  accountFrom: Account;
  accountTo: Account;
  unit: Unit;
  quantity: number;
}

export interface Transaction {
  id: number;
  description: string;
  timestamp: string;
  transfers: Transfer[];
}

export type TransactionListItem =
  | { dateIso: string; label: string }
  | { transaction: Transaction; isEditing: boolean };

export type TransactionDraftMode = "NEW" | "EDIT_EXISTING";
export type TransactionField = "DATE" | "DESCRIPTION" | "FROM_ACCOUNT" | "QUANTITY" | "UNIT" | "TO_ACCOUNT";

export interface RegisterFocusTarget {
  field: TransactionField;
  transferRowIndex: number;
  sequence: number;
}

export interface TransactionRevealState {
  transactionId: number;
  sequence: number;
}

export interface TransactionDraftState {
  mode: TransactionDraftMode;
  transactionId: number | null;
  dateInput: string;
  selectedDateIso: string;
  dateError: boolean;
  description: string;
  descriptionError: boolean;
  transfers: Array<{
    fromAccountId: number | null;
    fromAccountError: boolean;
    quantity: number | null;
    quantityInput: string;
    quantityError: boolean;
    unitId: number | null;
    unitError: boolean;
    toAccountId: number | null;
    toAccountError: boolean;
  }>;
  focusTarget: RegisterFocusTarget | null;
}

export interface TransactionsState {
  visibleTransactions: Transaction[];
  viewportOffset: number;
  viewportLimit: number;
  totalTransactionCount: number;
  hasOlderTransactions: boolean;
  hasNewerTransactions: boolean;
  previousDateIso: string | null;
  groupedTransactions: TransactionListItem[];
  canLoadMore: boolean;
  accounts: Account[];
  units: Unit[];
  draft: TransactionDraftState;
  activeEditingTransactionId: number | null;
  revealTransaction: TransactionRevealState | null;
  isLoading: boolean;
  error: string | null;
}

export interface UnitsState {
  units: Unit[];
  form: {
    name: string;
    symbol: string;
    mantissaLength: number | null;
    mantissaLengthInput: string;
    nameError: boolean;
    symbolError: boolean;
    mantissaError: boolean;
  };
  isLoading: boolean;
  error: string | null;
}

export interface AccountsState {
  accounts: Array<{
    account: Account;
    assets: Array<{ unitId: number; unitName: string; repr: string }>;
    editMode: boolean;
    nameInput: string;
    owningInput: boolean;
    archivedInput: boolean;
    showArchivedError: boolean;
  }>;
  form: { name: string; owning: boolean };
  showArchived: boolean;
  isLoading: boolean;
  consistencyResult: { inconsistencies: Array<{ assetDesc: string; diff: number }> } | null;
  error: string | null;
}

export interface AnalyticsState {
  accounts: Account[];
  units: Unit[];
  selectedAccountId: number | null;
  selectedUnitId: number | null;
  timeRange: AnalyticsTimeRange;
  balanceData: Array<{ date: string; balance: number }>;
  isLoading: boolean;
  error: string | null;
}

export interface SyncState {
  isSignedIn: boolean;
  accountLabel: string | null;
  backupFiles: Array<{ id: string; name: string }>;
  isLoading: boolean;
  error: string | null;
  restoreStatus: Record<string, string>;
}

export interface SettingsState {
  themeMode: ThemeMode;
}

export interface TabulaBridge {
  getTransactionsState(): TransactionsState;
  subscribeTransactionsState(listener: (state: TransactionsState) => void): () => void;
  getUnitsState(): UnitsState;
  subscribeUnitsState(listener: (state: UnitsState) => void): () => void;
  getAccountsState(): AccountsState;
  subscribeAccountsState(listener: (state: AccountsState) => void): () => void;
  getAnalyticsState(): AnalyticsState;
  subscribeAnalyticsState(listener: (state: AnalyticsState) => void): () => void;
  getSyncState(): SyncState;
  subscribeSyncState(listener: (state: SyncState) => void): () => void;
  getSettingsState(): SettingsState;
  subscribeSettingsState(listener: (state: SettingsState) => void): () => void;
  importDatabaseFile(file: File): Promise<void>;
  signIn(): void;
  loadBackups(): void;
  uploadBackup(): void;
  restoreBackup(fileId: string): void;
  downloadBackup(fileId: string): void;
  deleteBackup(fileId: string): void;
  beginNewTransactionEntry(): void;
  cancelEditingTransaction(): void;
  beginEditingTransaction(id: number): void;
  updateTransactionDescription(value: string): void;
  updateTransactionDateInput(value: string): void;
  stepTransactionDate(days: number): void;
  updateTransferFromAccount(index: number, value: number | null): void;
  updateTransferQuantity(index: number, value: string): void;
  updateTransferUnit(index: number, value: number | null): void;
  updateTransferToAccount(index: number, value: number | null): void;
  addTransferRow(): void;
  loadOlderTransactions(): void;
  loadNewerTransactions(): void;
  deleteTransaction(id: number): void;
  removeTransferRow(index: number): void;
  commitTransactionDraft(): void;
  updateUnitName(value: string): void;
  updateUnitSymbol(value: string): void;
  updateUnitMantissaLength(value: string): void;
  createUnit(): void;
  toggleShowArchived(showArchived: boolean): void;
  updateNewAccountName(value: string): void;
  updateNewAccountOwning(value: boolean): void;
  createAccount(): void;
  toggleAccountEditMode(accountId: number, enabled: boolean): void;
  updateAccountName(accountId: number, value: string): void;
  updateAccountOwning(accountId: number, value: boolean): void;
  updateAccountArchived(accountId: number, value: boolean): void;
  applyAccountEdits(accountId: number): void;
  checkConsistency(): void;
  clearConsistencyResult(): void;
  selectAnalyticsAccount(accountId: number): void;
  selectAnalyticsUnit(unitId: number): void;
  selectAnalyticsTimeRange(range: AnalyticsTimeRange): void;
  setThemeMode(mode: ThemeMode): void;
}
