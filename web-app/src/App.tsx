import type {ChangeEvent, KeyboardEvent as ReactKeyboardEvent, MutableRefObject, ReactNode} from "react";
import {memo, useEffect, useId, useMemo, useRef, useState} from "react";
import {BrowserRouter, NavLink, Route, Routes, useLocation} from "react-router-dom";
import {
    Alert,
    AppBar,
    Autocomplete,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    Container,
    createTheme,
    CssBaseline,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    FormLabel,
    IconButton,
    Link,
    MenuItem,
    Paper,
    Radio,
    RadioGroup,
    Select,
    Stack,
    Switch,
    Tab,
    Tabs,
    TextField,
    ThemeProvider,
    ToggleButton,
    ToggleButtonGroup,
    Toolbar,
    Typography,
    useMediaQuery,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import GitHubIcon from "@mui/icons-material/GitHub";
import PrivacyTipOutlinedIcon from "@mui/icons-material/PrivacyTipOutlined";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import {Virtuoso, type VirtuosoHandle} from "react-virtuoso";
import {BalanceChart, type BalanceChartMode} from "./BalanceChart";
import type {
    Account,
    AccountsState,
    AnalyticsState,
    AnalyticsTimeRange,
    RegisterFocusTarget,
    SettingsState,
    SyncState,
    TabulaBridge,
    ThemeMode,
    Transaction,
    TransactionField,
    TransactionsState,
    Unit,
    UnitsState,
} from "./bridge/types";

const pages = [
  { path: "/", label: "Transactions" },
  { path: "/accounts", label: "Accounts" },
  { path: "/units", label: "Units" },
  { path: "/analytics", label: "Analytics" },
  { path: "/sync", label: "Sync" },
  { path: "/settings", label: "Settings" },
];

const registerColumns = {
  xs: "minmax(0, 1fr)",
  lg: "140px minmax(160px, 1fr) minmax(0, 2.5fr) 136px",
};

const compactScreen = "(max-width:599.95px)";
const shortRegisterScreen = "(max-width:1199.95px) and (max-height:380px)";
const bottomNavigationClearance = 80;

const registerFieldSx = {
  minWidth: 0,
  "& .MuiOutlinedInput-root": {
    minHeight: 48,
  },
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function todayDateInput() {
  return formatDateInput(todayIsoDate());
}

const emptyTransactionsState: TransactionsState = {
  visibleTransactions: [],
  viewportOffset: 0,
  viewportLimit: 0,
  totalTransactionCount: 0,
  hasOlderTransactions: false,
  hasNewerTransactions: false,
  previousDateIso: null,
  groupedTransactions: [],
  canLoadMore: false,
  accounts: [],
  units: [],
  draft: {
    mode: "NEW",
    transactionId: null,
    dateInput: todayDateInput(),
    selectedDateIso: todayIsoDate(),
    dateError: false,
    description: "",
    descriptionError: false,
    transfers: [
      {
        fromAccountId: null,
        fromAccountError: false,
        quantity: null,
        quantityInput: "",
        quantityError: false,
        unitId: null,
        unitError: false,
        toAccountId: null,
        toAccountError: false,
      },
    ],
    focusTarget: { field: "DATE", transferRowIndex: 0, sequence: 0 },
  },
  activeEditingTransactionId: null,
  revealTransaction: null,
  isLoading: true,
  error: null,
};

const emptyUnitsState: UnitsState = {
  units: [],
  form: { name: "", symbol: "", mantissaLength: null, mantissaLengthInput: "", nameError: false, symbolError: false, mantissaError: false },
  isLoading: false,
  error: null,
};

const emptyAccountsState: AccountsState = {
  accounts: [],
  form: { name: "", inPossession: true },
  showArchived: false,
  isLoading: false,
  consistencyResult: null,
  error: null,
};

const emptyAnalyticsState: AnalyticsState = {
  accounts: [],
  units: [],
  selectedAccountId: null,
  selectedUnitId: null,
  timeRange: "LAST_MONTH",
  balanceData: [],
  isLoading: false,
  error: null,
};

const emptySyncState: SyncState = {
  isSignedIn: false,
  accountLabel: null,
  backupFiles: [],
  isLoading: false,
  error: null,
  restoreStatus: {},
};

const emptySettingsState: SettingsState = { themeMode: "SYSTEM" };

function Shell({
  bridge,
  transactions,
  units,
  accounts,
  analytics,
  sync,
  settings,
}: {
  bridge: TabulaBridge;
  transactions: TransactionsState;
  units: UnitsState;
  accounts: AccountsState;
  analytics: AnalyticsState;
  sync: SyncState;
  settings: SettingsState;
}) {
  const location = useLocation();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const compact = useMediaQuery(compactScreen);
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const dark = settings.themeMode === "DARK" || (settings.themeMode === "SYSTEM" && prefersDark);
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: dark ? "dark" : "light",
          primary: { main: "#1f6feb" },
          secondary: { main: "#0891b2" },
          background: { default: dark ? "#0f172a" : "#f8fafc" },
        },
        shape: { borderRadius: 14 },
        components: {
          MuiCssBaseline: {
            styleOverrides: { html: { scrollPaddingBottom: bottomNavigationClearance } },
          },
        },
      }),
    [dark],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="sticky" color="transparent" elevation={0}>
        <Toolbar sx={{ minHeight: { xs: "56px !important", sm: "64px !important" }, borderBottom: "1px solid rgba(148,163,184,0.25)", backdropFilter: "blur(16px)" }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Tabula Web
            </Typography>
            <Typography
              aria-label="Alpha release"
              component="span"
              sx={{
                alignSelf: "flex-start",
                color: "primary.main",
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1,
                mt: 0.35,
              }}
            >
              alpha
            </Typography>
          </Stack>
          <IconButton aria-label="Privacy notice" color="inherit" onClick={() => setPrivacyOpen(true)}>
            <PrivacyTipOutlinedIcon />
          </IconButton>
          <IconButton aria-label="GitHub repository" color="inherit" href="https://github.com/vsalavatov/tabula" target="_blank" rel="noreferrer">
            <GitHubIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <PrivacyDialog open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <Container component="main" maxWidth="xl" sx={{ pt: { xs: 2, sm: 4 }, pb: 12 }}>
        <Routes>
          <Route path="/" element={<TransactionsPage bridge={bridge} state={transactions} />} />
          <Route path="/accounts" element={<AccountsPage bridge={bridge} state={accounts} />} />
          <Route path="/units" element={<UnitsPage bridge={bridge} state={units} />} />
          <Route path="/analytics" element={<AnalyticsPage bridge={bridge} state={analytics} />} />
          <Route path="/sync" element={<SyncPage bridge={bridge} state={sync} />} />
          <Route path="/settings" element={<SettingsPage bridge={bridge} state={settings} />} />
        </Routes>
      </Container>
      <Paper component="nav" aria-label="Main navigation" sx={{ position: "fixed", insetInline: { xs: 8, sm: 16 }, bottom: 16, zIndex: 10, borderRadius: 999, overflow: "hidden" }} elevation={8}>
        <Tabs
          value={pages.findIndex((page) => page.path === location.pathname)}
          variant={compact ? "scrollable" : "fullWidth"}
          scrollButtons="auto"
          allowScrollButtonsMobile
        >
          {pages.map((page) => (
            <Tab key={page.path} component={NavLink} label={page.label} to={page.path} sx={{ minWidth: 0, px: { xs: 1.5, sm: 1 } }} />
          ))}
        </Tabs>
      </Paper>
    </ThemeProvider>
  );
}

function PrivacyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Privacy Notice</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2">
            Tabula is designed so your app data stays under your control. The app does not run a Tabula application
            server, and the project maintainer does not receive your accounts, transactions, units, analytics, database,
            or backup files through normal app use.
          </Typography>
          <Typography variant="body2">
            Your database is stored in your browser. This can include accounts, units, transactions, quantities,
            descriptions, and derived analytics. Local settings such as theme mode are also stored in your browser.
          </Typography>
          <Typography variant="body2">
            If Google Drive sync is enabled, Tabula uses the Google Drive app data folder to list, upload, restore, and
            delete Tabula backup files. The app may cache a short-lived Google Drive access token in browser storage
            during its lifetime.
          </Typography>
          <Typography variant="body2">
            You can use Tabula without Google Drive sync, clear browser site data to remove local data from a device,
            delete backups from the app, and revoke Google access from your Google Account settings.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            The full repository privacy notice is available in{" "}
            <Link href="https://github.com/vsalavatov/tabula/blob/master/PRIVACY.md" target="_blank" rel="noreferrer">
              PRIVACY.md
            </Link>
            .
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function TransactionsPage({ bridge, state }: { bridge: TabulaBridge; state: TransactionsState }) {
  const composerShellRef = useRef<HTMLDivElement | null>(null);
  const stickyComposerSentinelRef = useRef<HTMLDivElement | null>(null);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const revealTimeoutRef = useRef<number | null>(null);
  const [newDraftPinned, setNewDraftPinned] = useState(false);
  const [highlightedTransactionId, setHighlightedTransactionId] = useState<number | null>(null);
  const [activeRevealSequence, setActiveRevealSequence] = useState<number | null>(null);
  const [loadingOlderWindow, setLoadingOlderWindow] = useState(false);
  const [loadingNewerWindow, setLoadingNewerWindow] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  useEffect(() => {
    const reveal = state.revealTransaction;
    if (!reveal) return;
    const localIndex = state.visibleTransactions.findIndex((transaction) => transaction.id === reveal.transactionId);
    if (localIndex < 0) return;

    virtuosoRef.current?.scrollToIndex({
      index: localIndex,
      align: "center",
      behavior: "auto",
    });

    setActiveRevealSequence(reveal.sequence);
    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current);
    }
    let cancelled = false;
    let frameId = 0;

    const finishReveal = () => {
      setHighlightedTransactionId(reveal.transactionId);
      revealTimeoutRef.current = window.setTimeout(() => {
        setHighlightedTransactionId((current) => (current === reveal.transactionId ? null : current));
        setActiveRevealSequence((current) => (current === reveal.sequence ? null : current));
        revealTimeoutRef.current = null;
      }, 1800);
    };

    const tryMountRevealRow = (attempt: number) => {
      if (cancelled) return;
      const row = document.querySelector<HTMLElement>(`[data-transaction-id="${reveal.transactionId}"]`);
      if (!row) {
        if (attempt < 24) {
          frameId = window.requestAnimationFrame(() => tryMountRevealRow(attempt + 1));
        }
        return;
      }
      const rowRect = row.getBoundingClientRect();
      const visibleTop = (composerShellRef.current?.getBoundingClientRect().bottom ?? 0) + 8;
      const visibleBottom = window.innerHeight - bottomNavigationClearance;
      const needsScroll = rowRect.top < visibleTop || rowRect.bottom > visibleBottom;
      if (needsScroll) {
        row.scrollIntoView({ behavior: "auto", block: "center" });
      }
      finishReveal();
    };

    frameId = window.requestAnimationFrame(() => tryMountRevealRow(0));

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      if (revealTimeoutRef.current !== null) {
        window.clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
    };
  }, [state.revealTransaction?.sequence, state.visibleTransactions]);

  useEffect(() => {
    if (loadingOlderWindow && state.hasOlderTransactions && state.visibleTransactions.length > 0) {
      setLoadingOlderWindow(false);
    }
  }, [loadingOlderWindow, state.hasOlderTransactions, state.visibleTransactions.length, state.viewportOffset]);

  useEffect(() => {
    if (loadingNewerWindow && state.visibleTransactions.length > 0) {
      setLoadingNewerWindow(false);
    }
  }, [loadingNewerWindow, state.visibleTransactions.length, state.viewportOffset]);

  useEffect(() => {
    if (state.draft.mode !== "NEW") {
      setNewDraftPinned(false);
      return;
    }
    const sentinel = stickyComposerSentinelRef.current;
    if (!sentinel || typeof window === "undefined") {
      return;
    }
    const updatePinnedState = () => {
      const stickyTopOffset = window.matchMedia(compactScreen).matches ? 56 : 64;
      setNewDraftPinned(!window.matchMedia(shortRegisterScreen).matches && sentinel.getBoundingClientRect().top <= stickyTopOffset + 1);
    };
    updatePinnedState();
    window.addEventListener("scroll", updatePinnedState, { passive: true });
    window.addEventListener("resize", updatePinnedState);
    return () => {
      window.removeEventListener("scroll", updatePinnedState);
      window.removeEventListener("resize", updatePinnedState);
    };
  }, [state.draft.mode]);

  return (
    <Stack spacing={3}>
      <SectionHeader title="Transactions" />
      <Paper
        sx={{
          overflow: "visible",
          position: "relative",
          border: "1px solid rgba(148,163,184,0.28)",
        }}
      >
        <Box ref={stickyComposerSentinelRef} sx={{ position: "absolute", top: 0, insetInline: 0, height: 1, pointerEvents: "none" }} />
        <Box
          ref={composerShellRef}
          data-testid="transaction-new-entry-shell"
          data-sticky-active={newDraftPinned ? "true" : "false"}
          sx={{
            position: "sticky",
            [`@media ${shortRegisterScreen}`]: { position: "static" },
            top: { xs: 56, sm: 64 },
            zIndex: 5,
            backgroundColor: "background.paper",
            boxShadow: newDraftPinned ? "0 10px 28px rgba(15,23,42,0.14)" : "none",
            transition: "box-shadow 140ms ease, background-color 140ms ease",
          }}
        >
          <RegisterColumnLabels pinned={newDraftPinned} />
          {state.draft.mode === "NEW" ? (
            <Box sx={{ borderBottom: "1px solid rgba(148,163,184,0.18)", backgroundColor: "background.paper" }}>
              <TransactionDraftRow bridge={bridge} state={state} sticky />
            </Box>
          ) : null}
        </Box>
        {state.isLoading ? (
          <Box sx={{ px: 2.5, py: 4 }}>
            <Typography color="text.secondary">Loading transactions...</Typography>
          </Box>
        ) : state.totalTransactionCount === 0 ? (
          <Typography color="text.secondary" sx={{ p: 2 }}>No transactions yet.</Typography>
        ) : (
          <Box sx={{ position: "relative" }}>
            <Virtuoso
              ref={virtuosoRef}
              data={state.visibleTransactions}
              computeItemKey={(_, transaction) => transaction.id}
              firstItemIndex={state.viewportOffset}
              useWindowScroll
              overscan={400}
              increaseViewportBy={{ top: 400, bottom: 900 }}
              atTopThreshold={120}
              atBottomThreshold={520}
              startReached={() => {
                if (!state.hasNewerTransactions || loadingNewerWindow || state.draft.mode === "EDIT_EXISTING" || activeRevealSequence !== null) {
                  return;
                }
                setLoadingNewerWindow(true);
                bridge.loadNewerTransactions();
              }}
              endReached={() => {
                if (!state.hasOlderTransactions || loadingOlderWindow || state.draft.mode === "EDIT_EXISTING" || activeRevealSequence !== null) {
                  return;
                }
                setLoadingOlderWindow(true);
                bridge.loadOlderTransactions();
              }}
              itemContent={(absoluteIndex, transaction) => (
                <TransactionRegisterItem
                  absoluteIndex={absoluteIndex}
                  transaction={transaction}
                  previousDateIso={resolvePreviousDateIso(state, transaction)}
                  bridge={bridge}
                  state={state}
                  onDelete={setTransactionToDelete}
                  highlighted={highlightedTransactionId === transaction.id}
                />
              )}
              components={{
                Header: () =>
                  state.hasNewerTransactions ? (
                    <TransactionViewportIndicator position="top" count={state.viewportOffset} />
                  ) : (
                    <Box sx={{ height: 8 }} />
                  ),
                Footer: () =>
                  state.hasOlderTransactions ? (
                    <TransactionViewportIndicator
                      position="bottom"
                      count={Math.max(state.totalTransactionCount - (state.viewportOffset + state.visibleTransactions.length), 0)}
                    />
                  ) : (
                    <Box sx={{ height: 12 }} />
                  ),
              }}
            />
          </Box>
        )}
      </Paper>
      <ConfirmationDialog
        open={transactionToDelete !== null}
        action="Delete transaction"
        destructive
        onCancel={() => setTransactionToDelete(null)}
        onConfirm={() => {
          if (transactionToDelete) bridge.deleteTransaction(transactionToDelete.id);
          setTransactionToDelete(null);
        }}
      >
        “{transactionToDelete?.description}” will be removed and the account balances will be updated.
      </ConfirmationDialog>
    </Stack>
  );
}

function RegisterColumnLabels({ pinned = false }: { pinned?: boolean }) {
  return (
    <Box
      sx={{
        display: { xs: "none", lg: "grid" },
        gridTemplateColumns: registerColumns,
        gap: 2,
        px: 2.5,
        py: 1.5,
        borderBottom: "1px solid rgba(148,163,184,0.18)",
        backgroundColor: pinned ? "background.paper" : "action.hover",
        transition: "background-color 140ms ease",
      }}
    >
      <RegisterLabel>Date</RegisterLabel>
      <RegisterLabel>Description</RegisterLabel>
      <RegisterLabel>Transfers</RegisterLabel>
      <RegisterLabel>Actions</RegisterLabel>
    </Box>
  );
}

const TransactionDateHeader = memo(function TransactionDateHeader({ label, dateIso }: { label: string; dateIso: string }) {
  return (
    <Box data-date-header={label} data-date-iso={dateIso} sx={{ px: 2.5, py: 1.25, backgroundColor: "rgba(31,111,235,0.06)" }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "primary.main", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </Typography>
    </Box>
  );
});

function TransactionRegisterItem({
  absoluteIndex,
  transaction,
  previousDateIso,
  bridge,
  state,
  onDelete,
  highlighted,
}: {
  absoluteIndex: number;
  transaction: Transaction;
  previousDateIso: string | null;
  bridge: TabulaBridge;
  state: TransactionsState;
  onDelete: (transaction: Transaction) => void;
  highlighted: boolean;
}) {
  const transactionDateIso = transaction.timestamp.slice(0, 10);
  const showDateHeader = transactionDateIso !== previousDateIso;
  const date = new Date(transaction.timestamp);
  const headerLabel = formatDateHeaderLabel(date);

  return (
    <Box data-transaction-row-index={absoluteIndex} sx={{ borderBottom: "1px solid rgba(148,163,184,0.16)" }}>
      {showDateHeader ? <TransactionDateHeader label={headerLabel} dateIso={transactionDateIso} /> : null}
      {state.activeEditingTransactionId === transaction.id ? (
        <TransactionDraftRow bridge={bridge} state={state} />
      ) : (
        <TransactionSummaryRow bridge={bridge} item={transaction} highlighted={highlighted} onDelete={onDelete} editing={state.draft.mode === "EDIT_EXISTING"} />
      )}
    </Box>
  );
}

function TransactionViewportIndicator({ position, count }: { position: "top" | "bottom"; count: number }) {
  if (count <= 0) {
    return <Box sx={{ height: 8 }} />;
  }
  return (
    <Box
      sx={{
        px: 2.5,
        py: 1.25,
        display: "flex",
        justifyContent: "center",
        backgroundColor: "rgba(148,163,184,0.05)",
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {position === "top" ? `${count} newer transactions above` : `${count} older transactions below`}
      </Typography>
    </Box>
  );
}

function TransactionDraftRow({
  bridge,
  state,
  sticky = false,
}: {
  bridge: TabulaBridge;
  state: TransactionsState;
  sticky?: boolean;
}) {
  const draft = state.draft;
  const editingExisting = draft.mode === "EDIT_EXISTING";
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const transfersRef = useRef<HTMLDivElement | null>(null);
  const dateFieldPointerDownRef = useRef(false);
  const dateFieldPendingCaretRef = useRef<number | null>(null);
  const dateOverwriteValueRef = useRef<string | null>(null);
  const dateOverwriteCaretRef = useRef<number | null>(null);

  useEffect(() => {
    const focusTarget = draft.focusTarget;
    if (!focusTarget) return;

    const frame = window.requestAnimationFrame(() => {
      const target = fieldRefs.current[focusKey(focusTarget)];
      if (!target) return;

      target.focus({ preventScroll: true });
      if (focusTarget.field === "DATE") {
        setDateCaretToStart(target);
        dateOverwriteValueRef.current = target.value;
        dateOverwriteCaretRef.current = 0;
      } else {
        target.select();
      }

      const panel = transfersRef.current;
      if (panel?.contains(target)) {
        const row = target.closest("[data-transfer-row]");
        const rowRect = row?.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        if (rowRect && rowRect.top < panelRect.top) {
          panel.scrollTop += rowRect.top - panelRect.top - 4;
        } else if (rowRect && rowRect.bottom > panelRect.bottom) {
          panel.scrollTop += rowRect.bottom - panelRect.bottom + 4;
        }
      }

      if (editingExisting || window.matchMedia(shortRegisterScreen).matches) {
        const rect = target.getBoundingClientRect();
        const top = window.matchMedia("(min-width:1200px)").matches ? 112 : 72;
        const bottom = window.innerHeight - bottomNavigationClearance;
        if (rect.top < top) window.scrollBy(0, rect.top - top);
        else if (rect.bottom > bottom) window.scrollBy(0, rect.bottom - bottom);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draft.focusTarget?.sequence, editingExisting]);

  useEffect(() => {
    const pendingCaret = dateFieldPendingCaretRef.current;
    if (pendingCaret === null) return;

    const dateField = fieldRefs.current[focusKey({ field: "DATE", transferRowIndex: 0 })];
    if (!dateField || document.activeElement !== dateField) return;

    const frame = window.requestAnimationFrame(() => {
      setDateOverwriteCursor(dateField, pendingCaret);
      dateFieldPendingCaretRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draft.dateInput, fieldRefs]);

  const handleCommit = () => {
    const dateField = fieldRefs.current[focusKey({ field: "DATE", transferRowIndex: 0 })];
    const descriptionField = fieldRefs.current[focusKey({ field: "DESCRIPTION", transferRowIndex: 0 })];
    bridge.updateTransactionDateInput(dateField?.value ?? draft.dateInput);
    bridge.updateTransactionDescription(descriptionField?.value ?? draft.description);
    draft.transfers.forEach((transfer, index) => {
      const quantityField = fieldRefs.current[focusKey({ field: "QUANTITY", transferRowIndex: index })];
      bridge.updateTransferQuantity(index, quantityField?.value ?? transfer.quantityInput);
    });
    bridge.commitTransactionDraft();
  };
  const handleDraftFieldKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (!event.repeat) handleCommit();
    }
  };
  const handleDateFieldFocus = (target: HTMLInputElement | HTMLTextAreaElement) => {
    if (dateFieldPointerDownRef.current) {
      dateFieldPointerDownRef.current = false;
      return;
    }

    setDateCaretToStart(target);
    if (!isFullDateInput(target.value)) return;
    dateOverwriteValueRef.current = target.value;
    dateOverwriteCaretRef.current = 0;
  };
  const handleDateFieldKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const hasModifier = event.shiftKey || event.altKey || event.ctrlKey || event.metaKey;
    if (event.key === "Enter" || hasModifier) {
      handleDraftFieldKeyDown(event);
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (!isValidDateInput(draft.dateInput)) return;
      event.preventDefault();
      dateOverwriteValueRef.current = null;
      dateOverwriteCaretRef.current = null;
      bridge.stepTransactionDate(event.key === "ArrowUp" ? 1 : -1);
      return;
    }

    const input = event.target as HTMLInputElement;
    const currentValue = input?.value ?? "";
    const baseValue = isFullDateInput(dateOverwriteValueRef.current ?? "") ? (dateOverwriteValueRef.current as string) : currentValue;
    if (!isFullDateInput(baseValue)) {
      dateOverwriteValueRef.current = null;
      dateOverwriteCaretRef.current = null;
      handleDraftFieldKeyDown(event);
      return;
    }

    const selectionStart = input.selectionStart ?? currentValue.length;
    const selectionEnd = input.selectionEnd ?? currentValue.length;
    const startIndex = dateOverwriteCaretRef.current ?? Math.min(selectionStart, selectionEnd);
    const fullSelection = selectionStart === 0 && selectionEnd === currentValue.length;

    if (event.key === "Backspace" || event.key === "Delete") {
      if (fullSelection) {
        event.preventDefault();
        dateOverwriteValueRef.current = null;
        dateOverwriteCaretRef.current = null;
        bridge.updateTransactionDateInput("");
        return;
      }
      dateOverwriteValueRef.current = null;
      dateOverwriteCaretRef.current = null;
      handleDraftFieldKeyDown(event);
      return;
    }

    if (event.key === "-") {
      event.preventDefault();
      setDateOverwriteCursor(input, startIndex);
      dateOverwriteCaretRef.current = startIndex;
      return;
    }

    if (!/^\d$/.test(event.key)) {
      dateOverwriteValueRef.current = null;
      dateOverwriteCaretRef.current = null;
      handleDraftFieldKeyDown(event);
      return;
    }

    const replaceIndex = nextDateEditableIndex(startIndex);
    if (replaceIndex < 0) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    const nextValue = `${baseValue.slice(0, replaceIndex)}${event.key}${baseValue.slice(replaceIndex + 1)}`;
    const nextCaret = nextDateEditableIndex(replaceIndex + 1);
    dateOverwriteValueRef.current = nextValue;
    dateOverwriteCaretRef.current = nextCaret >= 0 ? nextCaret : baseValue.length;
    setDateOverwriteCursor(input, nextCaret >= 0 ? nextCaret : baseValue.length);
    dateFieldPendingCaretRef.current = nextCaret >= 0 ? nextCaret : currentValue.length;
    bridge.updateTransactionDateInput(nextValue);
  };

  return (
    <Box
      component="form"
      aria-label={editingExisting ? "Edit transaction" : "New transaction"}
      data-testid={editingExisting ? "transaction-edit-row" : sticky ? "transaction-new-row" : "transaction-draft-row"}
      onSubmit={(event) => {
        event.preventDefault();
        handleCommit();
      }}
      onKeyDownCapture={(event) => {
        if (!event.nativeEvent.isComposing && event.key === "Enter" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat) bridge.addTransferRow();
        }
      }}
      onKeyDown={(event) => {
        if (!event.defaultPrevented && event.key === "Escape" && editingExisting) {
          event.preventDefault();
          bridge.cancelEditingTransaction();
        }
      }}
      sx={{
        p: { xs: 1.25, sm: 2 },
        backgroundColor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0, 9rem) minmax(0, 1fr)", lg: registerColumns.lg },
          gap: { xs: 1, sm: 1.5, lg: 2 },
          alignItems: "start",
        }}
      >
        <Stack spacing={1.25}>
          <TextField
            fullWidth
            placeholder="dd-mm-yyyy"
            value={draft.dateInput}
            error={draft.dateError}
            onKeyDown={handleDateFieldKeyDown}
            onMouseDown={() => {
              dateFieldPointerDownRef.current = true;
              dateFieldPendingCaretRef.current = null;
              dateOverwriteValueRef.current = null;
              dateOverwriteCaretRef.current = null;
            }}
            onFocus={(event) => handleDateFieldFocus(event.target as HTMLInputElement)}
            onBlur={() => {
              dateFieldPointerDownRef.current = false;
              dateFieldPendingCaretRef.current = null;
              dateOverwriteValueRef.current = null;
              dateOverwriteCaretRef.current = null;
            }}
            onChange={(event) => bridge.updateTransactionDateInput(normalizeTypedDateInput(event.target.value))}
            helperText={draft.dateError ? "Use dd-mm-yyyy" : undefined}
            slotProps={{ htmlInput: { "aria-label": "Transaction date" } }}
            inputRef={setFieldRef(fieldRefs, "DATE", 0)}
            sx={registerFieldSx}
          />
        </Stack>

        <Stack spacing={1.25}>
          <TextField
            fullWidth
            placeholder="Description"
            value={draft.description}
            error={draft.descriptionError}
            onKeyDown={handleDraftFieldKeyDown}
            onChange={(event) => bridge.updateTransactionDescription(event.target.value)}
            slotProps={{ htmlInput: { "aria-label": "Transaction description" } }}
            inputRef={setFieldRef(fieldRefs, "DESCRIPTION", 0)}
            sx={registerFieldSx}
          />
        </Stack>

        <Box sx={{ gridColumn: { xs: "1 / -1", lg: "auto" }, minWidth: 0 }}>
          <Stack
            ref={transfersRef}
            spacing={1}
            sx={{ maxHeight: "min(16rem, max(7.5rem, 32dvh))", overflowY: "auto", p: 0.5, mt: -0.5 }}
          >
            {draft.transfers.map((transfer, index) => (
              <Box
                key={`draft-transfer-${index}`}
                data-transfer-row
                role="group"
                aria-label={`Transfer ${index + 1}`}
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "minmax(0, 1fr) minmax(0, 1.15fr) auto",
                    sm: "minmax(0, 1.3fr) minmax(0, .7fr) minmax(0, 1fr) minmax(0, 1.3fr) auto",
                  },
                  gridTemplateAreas: { xs: '"from quantity remove" "unit to remove"', sm: '"from quantity unit to remove"' },
                  gap: 1,
                  alignItems: "start",
                  "&:not(:last-child)": { borderBottom: { xs: 1, sm: 0 }, borderColor: "divider", pb: { xs: 1, sm: 0 } },
                }}
              >
                <LookupAutocomplete
                  gridArea="from"
                  ariaLabel={`Transfer ${index + 1} from account`}
                  label="From account"
                  value={transfer.fromAccountId}
                  options={state.accounts}
                  error={transfer.fromAccountError}
                  inputRef={setFieldRef(fieldRefs, "FROM_ACCOUNT", index)}
                  onChange={(value) => bridge.updateTransferFromAccount(index, value)}
                  onKeyDown={handleDraftFieldKeyDown}
                />
                <TextField
                  label="Quantity"
                  size="small"
                  value={transfer.quantityInput}
                  error={transfer.quantityError}
                  onKeyDown={handleDraftFieldKeyDown}
                  onChange={(event) => bridge.updateTransferQuantity(index, event.target.value)}
                  slotProps={{ htmlInput: { "aria-label": `Transfer ${index + 1} quantity` } }}
                  inputRef={setFieldRef(fieldRefs, "QUANTITY", index)}
                  sx={{ ...registerFieldSx, gridArea: "quantity" }}
                />
                <LookupAutocomplete
                  gridArea="unit"
                  ariaLabel={`Transfer ${index + 1} unit`}
                  label="Unit"
                  value={transfer.unitId}
                  options={state.units}
                  error={transfer.unitError}
                  inputRef={setFieldRef(fieldRefs, "UNIT", index)}
                  onChange={(value) => bridge.updateTransferUnit(index, value)}
                  onKeyDown={handleDraftFieldKeyDown}
                />
                <LookupAutocomplete
                  gridArea="to"
                  ariaLabel={`Transfer ${index + 1} to account`}
                  label="To account"
                  value={transfer.toAccountId}
                  options={state.accounts}
                  error={transfer.toAccountError}
                  inputRef={setFieldRef(fieldRefs, "TO_ACCOUNT", index)}
                  onChange={(value) => bridge.updateTransferToAccount(index, value)}
                  onKeyDown={handleDraftFieldKeyDown}
                />
                {draft.transfers.length > 1 && (
                  <IconButton
                    aria-label={`Remove transfer ${index + 1}`}
                    onClick={() => bridge.removeTransferRow(index)}
                    sx={{ gridArea: "remove", alignSelf: "center" }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            ))}
          </Stack>
        </Box>

        <Stack
          direction={{ xs: "row", lg: "column" }}
          useFlexGap
          flexWrap="wrap"
          spacing={0.5}
          sx={{ gridColumn: { xs: "1 / -1", lg: "auto" }, justifyContent: "space-between" }}
        >
          <Button startIcon={<AddIcon />} onClick={() => bridge.addTransferRow()} aria-keyshortcuts="Alt+Enter" title="Alt+Enter">
            Add transfer
          </Button>
          {editingExisting ? <Button onClick={() => bridge.cancelEditingTransaction()} aria-keyshortcuts="Escape">Cancel</Button> : null}
          <Button type="submit" variant="contained">
            {editingExisting ? "Save changes" : "Save entry"}
          </Button>
        </Stack>
        {state.error && <Alert severity="error" sx={{ gridColumn: "1 / -1", py: 0 }}>{state.error}</Alert>}
      </Box>
    </Box>
  );
}

const TransactionSummaryRow = memo(function TransactionSummaryRow({
  bridge,
  item,
  highlighted = false,
  onDelete,
  editing,
}: {
  bridge: TabulaBridge;
  item: Transaction;
  highlighted?: boolean;
  onDelete: (transaction: Transaction) => void;
  editing: boolean;
}) {
  return (
    <Box
      data-transaction-id={item.id}
      data-highlighted={highlighted ? "true" : "false"}
      sx={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: registerColumns,
        gap: 2,
        px: 2.5,
        py: 1.75,
        backgroundColor: highlighted ? "rgba(31,111,235,0.12)" : "transparent",
        boxShadow: highlighted ? "inset 0 0 0 1px rgba(31,111,235,0.28)" : "none",
        transition: "background-color 220ms ease, box-shadow 220ms ease",
        "&:hover": { backgroundColor: highlighted ? "rgba(31,111,235,0.14)" : "rgba(31,111,235,0.04)" },
      }}
    >
      <Stack spacing={0.35}>
        <RegisterLabel>Saved</RegisterLabel>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {formatTransactionTime(item.timestamp)}
        </Typography>
      </Stack>
      <Stack spacing={0.35}>
        <Typography
          component="button"
          type="button"
          aria-label={`Edit ${item.description}`}
          disabled={editing}
          onClick={() => bridge.beginEditingTransaction(item.id)}
          sx={{
            fontWeight: 600,
            p: 0,
            border: 0,
            background: "none",
            color: "inherit",
            textAlign: "start",
            overflowWrap: "anywhere",
            "&:enabled::after": { content: '""', position: "absolute", inset: 0, cursor: "pointer" },
            "&:focus-visible::after": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: "-2px" },
          }}
        >
          {item.description}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {item.transfers.length} {item.transfers.length === 1 ? "transfer" : "transfers"}
        </Typography>
      </Stack>
      <Stack spacing={0.75}>
        {item.transfers.map((transfer) => (
          <Box key={transfer.id} sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
            <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
              {transfer.accountFrom.name} {"->"} {transfer.accountTo.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatTransferQuantity(transfer.quantity)} {transfer.unit.symbol}
            </Typography>
          </Box>
        ))}
      </Stack>
      <Stack alignItems={{ xs: "flex-start", lg: "flex-end" }} spacing={0.5}>
        <IconButton
          aria-label={`Delete ${item.description}`}
          size="small"
          onClick={() => onDelete(item)}
          sx={{ zIndex: 1 }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
});

function AccountsPage({ bridge, state }: { bridge: TabulaBridge; state: AccountsState }) {
  return (
    <Stack spacing={3}>
      <SectionHeader title="Accounts" action={<Button onClick={() => bridge.checkConsistency()}>Check Consistency</Button>} />
      {state.error ? <Alert severity="error">{state.error}</Alert> : null}
      {state.consistencyResult ? (
        <Alert severity={state.consistencyResult.inconsistencies.length ? "warning" : "success"} onClose={() => bridge.clearConsistencyResult()}>
          {state.consistencyResult.inconsistencies.length
            ? state.consistencyResult.inconsistencies.map((item) => `${item.assetDesc}: ${item.diff}`).join(", ")
            : "Account balances are consistent."}
        </Alert>
      ) : null}
      <FormControlLabel control={<Switch checked={state.showArchived} onChange={(event) => bridge.toggleShowArchived(event.target.checked)} />} label="Show archived accounts" />
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField fullWidth label="New account" value={state.form.name} onChange={(event) => bridge.updateNewAccountName(event.target.value)} />
          <FormControlLabel control={<Checkbox checked={state.form.inPossession} onChange={(event) => bridge.updateNewAccountInPossession(event.target.checked)} />} label="In possession" />
          <Button variant="contained" onClick={() => bridge.createAccount()}>Create Account</Button>
        </Stack>
      </Paper>
      <Stack spacing={2}>
        {state.accounts.map((item) => (
          <Card key={item.account.id}>
            <CardContent>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between">
                <Box sx={{ flex: 1 }}>
                  {item.editMode ? (
                    <Stack spacing={1}>
                      <TextField label="Account name" value={item.nameInput} onChange={(event) => bridge.updateAccountName(item.account.id, event.target.value)} />
                      <FormControlLabel control={<Checkbox checked={item.inPossessionInput} onChange={(event) => bridge.updateAccountInPossession(item.account.id, event.target.checked)} />} label="In possession" />
                      <FormControlLabel control={<Checkbox checked={item.archivedInput} onChange={(event) => bridge.updateAccountArchived(item.account.id, event.target.checked)} />} label="Archived" />
                      {item.showArchivedError ? <Alert severity="warning">Account cannot be archived while it has assets.</Alert> : null}
                    </Stack>
                  ) : (
                    <>
                      <Typography variant="h6">{item.account.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.account.inPossession ? "In possession" : "External"}{item.account.isArchived ? " • Archived" : ""}
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                        {item.assets.map((asset) => <Alert key={`${item.account.id}-${asset.unitId}`} severity="info">{asset.repr}</Alert>)}
                      </Stack>
                    </>
                  )}
                </Box>
                <Stack direction="row" spacing={1}>
                  {item.editMode ? (
                    <>
                      <Button onClick={() => bridge.toggleAccountEditMode(item.account.id, false)}>Cancel</Button>
                      <Button variant="contained" onClick={() => bridge.applyAccountEdits(item.account.id)}>Save</Button>
                    </>
                  ) : (
                    <Button startIcon={<EditIcon />} onClick={() => bridge.toggleAccountEditMode(item.account.id, true)}>Edit</Button>
                  )}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}

function UnitsPage({ bridge, state }: { bridge: TabulaBridge; state: UnitsState }) {
  return (
    <Stack spacing={3}>
      <SectionHeader title="Units" />
      {state.error ? <Alert severity="error">{state.error}</Alert> : null}
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField label="Name" value={state.form.name} error={state.form.nameError} onChange={(event) => bridge.updateUnitName(event.target.value)} />
          <TextField label="Symbol" value={state.form.symbol} error={state.form.symbolError} onChange={(event) => bridge.updateUnitSymbol(event.target.value)} />
          <TextField label="Mantissa length" value={state.form.mantissaLengthInput} error={state.form.mantissaError} onChange={(event) => bridge.updateUnitMantissaLength(event.target.value)} />
          <Button variant="contained" onClick={() => bridge.createUnit()}>Create Unit</Button>
        </Stack>
      </Paper>
      <Stack spacing={2}>
        {state.units.map((unit) => (
          <Card key={unit.id}>
            <CardContent>
              <Typography variant="h6">{unit.name}</Typography>
              <Typography variant="body2" color="text.secondary">{unit.symbol} • mantissa {unit.mantissaLength}</Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}

function AnalyticsPage({ bridge, state }: { bridge: TabulaBridge; state: AnalyticsState }) {
  const [mode, setMode] = useState<BalanceChartMode>("line");
  const unit = state.units.find((item) => item.id === state.selectedUnitId);
  const rangeLabels: Record<AnalyticsTimeRange, string> = {
    LAST_WEEK: "Last week",
    LAST_MONTH: "Last month",
    LAST_THREE_MONTHS: "Last three months",
    LAST_SIX_MONTHS: "Last six months",
    LAST_YEAR: "Last year",
    ALL_TIME: "All time",
  };
  return (
    <Stack spacing={3}>
      <SectionHeader
        title="Analytics"
        action={
          <ToggleButtonGroup
            aria-label="Chart type"
            value={mode}
            exclusive
            size="small"
            onChange={(_, value: BalanceChartMode | null) => {
              if (value) setMode(value);
            }}
          >
            <ToggleButton value="line">Balance line</ToggleButton>
            <ToggleButton value="candles">Daily candles</ToggleButton>
          </ToggleButtonGroup>
        }
      />
      {state.error && <Alert severity="error">{state.error}</Alert>}
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <Select fullWidth displayEmpty inputProps={{ "aria-label": "Account" }} disabled={!state.accounts.length} value={state.selectedAccountId ?? ""} onChange={(event) => bridge.selectAnalyticsAccount(Number(event.target.value))}>
            <MenuItem value="" disabled>{state.accounts.length ? "Select account" : "No accounts"}</MenuItem>
            {state.accounts.map((account) => <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>)}
          </Select>
          <Select fullWidth displayEmpty inputProps={{ "aria-label": "Unit" }} disabled={!state.units.length} value={state.selectedUnitId ?? ""} onChange={(event) => bridge.selectAnalyticsUnit(Number(event.target.value))}>
            <MenuItem value="" disabled>{state.units.length ? "Select unit" : "No units"}</MenuItem>
            {state.units.map((unit) => <MenuItem key={unit.id} value={unit.id}>{unit.name}</MenuItem>)}
          </Select>
          <Select fullWidth inputProps={{ "aria-label": "Time range" }} value={state.timeRange} onChange={(event) => bridge.selectAnalyticsTimeRange(event.target.value as AnalyticsTimeRange)}>
            {Object.entries(rangeLabels).map(([range, label]) => (
              <MenuItem key={range} value={range}>{label}</MenuItem>
            ))}
          </Select>
        </Stack>
      </Paper>
      {state.isLoading || !state.balanceData.length ? (
        <Paper sx={{ p: 2 }}>
          <Typography color="text.secondary" role="status">
            {state.isLoading ? "Loading balance history…" : "No balance history for this selection."}
          </Typography>
        </Paper>
      ) : (
        <BalanceChart days={state.balanceData} unit={unit} mode={mode} />
      )}
    </Stack>
  );
}

function SyncPage({ bridge, state }: { bridge: TabulaBridge; state: SyncState }) {
  const [backupAction, setBackupAction] = useState<{ kind: "restore" | "delete"; id: string; name: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const driveBusy = state.isLoading || Object.values(state.restoreStatus).includes("Restoring...");
  const fileBusy = isImporting || isDownloading;

  const handleDownloadDatabaseFile = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    setDownloadSuccess(null);
    try {
      const blob = await bridge.downloadDatabaseFile();
      const fileName = `tabula-${todayIsoDate()}.db`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setDownloadSuccess(`Downloaded ${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setDownloadError(`Failed to download database file: ${message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDatabaseFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsImporting(true);
    setImportError(null);
    setImportSuccess(null);
    setDownloadError(null);
    setDownloadSuccess(null);
    try {
      await bridge.importDatabaseFile(file);
      setImportSuccess(`Loaded database from ${file.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setImportError(`Failed to load database file: ${message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Stack spacing={3}>
      <SectionHeader
        title="Sync"
        action={
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button variant="outlined" startIcon={<DownloadIcon />} disabled={fileBusy || driveBusy} onClick={handleDownloadDatabaseFile}>
              {isDownloading ? "Downloading DB..." : "Download DB File"}
            </Button>
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} disabled={fileBusy || driveBusy}>
              {isImporting ? "Loading DB..." : "Load DB File"}
              <input hidden type="file" disabled={fileBusy || driveBusy} accept=".db,.sqlite,.sqlite3,application/octet-stream,application/x-sqlite3" onChange={handleDatabaseFileSelection} />
            </Button>
          </Stack>
        }
      />
      {state.error ? <Alert severity="error">{state.error}</Alert> : null}
      {downloadError ? <Alert severity="error" onClose={() => setDownloadError(null)}>{downloadError}</Alert> : null}
      {downloadSuccess ? <Alert severity="success" onClose={() => setDownloadSuccess(null)}>{downloadSuccess}</Alert> : null}
      {importError ? <Alert severity="error" onClose={() => setImportError(null)}>{importError}</Alert> : null}
      {importSuccess ? <Alert severity="success" onClose={() => setImportSuccess(null)}>{importSuccess}</Alert> : null}
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <Button variant={state.isSignedIn ? "outlined" : "contained"} disabled={fileBusy || driveBusy} onClick={() => bridge.signIn()}>
            {state.isSignedIn ? `Connected: ${state.accountLabel}` : "Sign in to Google Drive"}
          </Button>
          <Button disabled={!state.isSignedIn || driveBusy || fileBusy} onClick={() => bridge.loadBackups()}>Refresh Backups</Button>
          <Button variant="contained" startIcon={<CloudUploadIcon />} disabled={!state.isSignedIn || driveBusy || fileBusy} onClick={() => bridge.uploadBackup()}>Upload Backup</Button>
        </Stack>
      </Paper>
      <Stack spacing={2}>
        {state.backupFiles.map((file) => (
          <Card key={file.id}>
            <CardContent sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, justifyContent: "space-between", gap: 1, alignItems: { sm: "center" } }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight={600} sx={{ overflowWrap: "anywhere" }}>{file.name}</Typography>
                <Typography variant="body2" color="text.secondary">{state.restoreStatus[file.id] ?? "Available"}</Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button disabled={driveBusy || fileBusy} onClick={() => setBackupAction({ kind: "restore", ...file })}>Restore</Button>
                <Button disabled={driveBusy || fileBusy} onClick={() => setBackupAction({ kind: "delete", ...file })} color="inherit">Delete</Button>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
      <ConfirmationDialog
        open={backupAction !== null}
        action={backupAction?.kind === "restore" ? "Restore backup" : "Delete backup"}
        destructive={backupAction?.kind === "delete"}
        onCancel={() => setBackupAction(null)}
        onConfirm={() => {
          if (backupAction?.kind === "restore") bridge.restoreBackup(backupAction.id);
          if (backupAction?.kind === "delete") bridge.deleteBackup(backupAction.id);
          setBackupAction(null);
        }}
      >
        {backupAction?.kind === "restore"
          ? `Restoring “${backupAction.name}” will replace the current local database.`
          : `“${backupAction?.name}” will be removed from Google Drive.`}
      </ConfirmationDialog>
    </Stack>
  );
}

function ConfirmationDialog({ open, action, destructive, onCancel, onConfirm, children }: {
  open: boolean;
  action: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      aria-labelledby={titleId}
      slotProps={{ transition: { onEntered: () => cancelRef.current?.focus() } }}
    >
      <DialogTitle id={titleId}>{action}?</DialogTitle>
      <DialogContent>
        <Typography sx={{ overflowWrap: "anywhere" }}>{children}</Typography>
      </DialogContent>
      <DialogActions>
        <Button ref={cancelRef} onClick={onCancel}>Cancel</Button>
        <Button color={destructive ? "error" : "primary"} onClick={onConfirm}>{action}</Button>
      </DialogActions>
    </Dialog>
  );
}

function SettingsPage({ bridge, state }: { bridge: TabulaBridge; state: SettingsState }) {
  return (
    <Stack spacing={3}>
      <SectionHeader title="Settings" />
      <Paper sx={{ p: 3 }}>
        <FormControl>
          <FormLabel>Theme mode</FormLabel>
          <RadioGroup value={state.themeMode} onChange={(event) => bridge.setThemeMode(event.target.value as ThemeMode)}>
            <FormControlLabel value="LIGHT" control={<Radio />} label="Light" />
            <FormControlLabel value="DARK" control={<Radio />} label="Dark" />
            <FormControlLabel value="SYSTEM" control={<Radio />} label="System" />
          </RadioGroup>
        </FormControl>
      </Paper>
    </Stack>
  );
}

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "center" }}>
      <Typography variant="h4" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {action}
    </Stack>
  );
}

function RegisterLabel({ children }: { children: ReactNode }) {
  return (
    <Typography variant="caption" sx={{ letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary", fontWeight: 700 }}>
      {children}
    </Typography>
  );
}

function LookupAutocomplete<T extends Account | Unit>({
  gridArea,
  ariaLabel,
  label,
  value,
  options,
  error = false,
  inputRef,
  onChange,
  onKeyDown,
}: {
  gridArea: "from" | "unit" | "to";
  ariaLabel: string;
  label: string;
  value: number | null;
  options: T[];
  error?: boolean;
  inputRef: (element: HTMLInputElement | HTMLTextAreaElement | null) => void;
  onChange: (value: number | null) => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
}) {
  const selected = options.find((option) => option.id === value) ?? null;
  const [inputValue, setInputValue] = useState(selected?.name ?? "");
  const keyboardOptionId = useRef<number | null>(null);
  const inputMatchesSelection = inputValue === (selected?.name ?? "");
  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    if (!query || inputMatchesSelection) {
      return options;
    }
    return options.filter((option) => option.name.toLowerCase().includes(query));
  }, [inputValue, inputMatchesSelection, options]);

  useEffect(() => {
    setInputValue(selected?.name ?? "");
  }, [selected?.id, selected?.name]);

  const applyCandidate = () => {
    const highlighted = filteredOptions.find((option) => option.id === keyboardOptionId.current);
    const candidate = highlighted ?? (inputValue.trim() && !inputMatchesSelection ? filteredOptions[0] : undefined);
    if (!candidate) return false;

    keyboardOptionId.current = null;
    setInputValue(candidate.name);
    if (candidate.id !== selected?.id) onChange(candidate.id);
    return true;
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Tab") {
      applyCandidate();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat && !applyCandidate() && inputMatchesSelection) onKeyDown?.(event);
      return;
    }
    if (event.key === " " && keyboardOptionId.current !== null && applyCandidate()) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <Autocomplete<T>
      size="small"
      autoHighlight
      openOnFocus
      blurOnSelect
      forcePopupIcon={false}
      options={filteredOptions}
      value={selected}
      inputValue={inputValue}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, optionValue) => option.id === optionValue.id}
      filterOptions={(available) => available}
      sx={{ ...registerFieldSx, gridArea }}
      onBlur={() => {
        keyboardOptionId.current = null;
        setInputValue(selected?.name ?? "");
      }}
      onInputChange={(_, nextValue, reason) => {
        if (reason === "input" || reason === "clear") {
          keyboardOptionId.current = null;
          setInputValue(nextValue);
        }
      }}
      onChange={(_, option) => {
        setInputValue(option?.name ?? "");
        onChange(option?.id ?? null);
      }}
      onHighlightChange={(_, option, reason) => {
        keyboardOptionId.current = reason === "keyboard" ? option?.id ?? null : null;
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={error}
          inputRef={inputRef}
          slotProps={{
            htmlInput: {
              ...params.inputProps,
              "aria-label": ariaLabel,
              onKeyDown: handleKeyDown,
            },
          }}
        />
      )}
    />
  );
}

function setFieldRef(
  fieldRefs: MutableRefObject<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>,
  field: TransactionField,
  transferRowIndex: number,
) {
  return (element: HTMLInputElement | HTMLTextAreaElement | null) => {
    fieldRefs.current[focusKey({ field, transferRowIndex })] = element;
  };
}

function focusKey(target: Pick<RegisterFocusTarget, "field" | "transferRowIndex">) {
  return `${target.field}-${target.transferRowIndex}`;
}

function resolvePreviousDateIso(state: TransactionsState, transaction: Transaction) {
  const localIndex = state.visibleTransactions.findIndex((item) => item.id === transaction.id);
  if (localIndex <= 0) {
    return state.previousDateIso;
  }
  return state.visibleTransactions[localIndex - 1]?.timestamp.slice(0, 10) ?? state.previousDateIso;
}

function formatDateInput(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return "";
  return `${day}-${month}-${year}`;
}

function isFullDateInput(value: string) {
  return /^\d{2}-\d{2}-\d{4}$/.test(value);
}

function setDateCaretToStart(target: HTMLInputElement | HTMLTextAreaElement) {
  if (!isFullDateInput(target.value)) {
    target.select?.();
    return;
  }
  setDateOverwriteCursor(target, 0);
}

function nextDateEditableIndex(start: number) {
  const editableIndexes = [0, 1, 3, 4, 6, 7, 8, 9];
  return editableIndexes.find((index) => index >= start) ?? -1;
}

function setDateOverwriteCursor(target: HTMLInputElement | HTMLTextAreaElement, index: number) {
  const editableIndex = nextDateEditableIndex(index);
  if (editableIndex < 0) {
    target.setSelectionRange?.(target.value.length, target.value.length);
    return;
  }
  target.setSelectionRange?.(editableIndex, editableIndex + 1);
}

function normalizeTypedDateInput(value: string) {
  const sanitized = value.replace(/[^\d-]/g, "");
  const digits = sanitized.replace(/\D/g, "").slice(0, 8);
  const formatted = formatDigitsAsDateInput(digits);

  if (sanitized.endsWith("-") && (digits.length === 2 || digits.length === 4) && !formatted.endsWith("-")) {
    return `${formatted}-`;
  }
  return formatted;
}

function formatDigitsAsDateInput(digits: string) {
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function isValidDateInput(value: string) {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return false;
  const [, dayStr, monthStr, yearStr] = match;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);
  const candidate = new Date(year, month - 1, day);
  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day
  );
}

function formatDateHeaderLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTransactionTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatTransferQuantity(quantity: number) {
  return Number.isInteger(quantity) ? quantity.toString() : quantity.toString();
}

export function App({ bridge }: { bridge: TabulaBridge }) {
  const [transactions, setTransactions] = useState<TransactionsState>(bridge.getTransactionsState() ?? emptyTransactionsState);
  const [units, setUnits] = useState<UnitsState>(bridge.getUnitsState() ?? emptyUnitsState);
  const [accounts, setAccounts] = useState<AccountsState>(bridge.getAccountsState() ?? emptyAccountsState);
  const [analytics, setAnalytics] = useState<AnalyticsState>(bridge.getAnalyticsState() ?? emptyAnalyticsState);
  const [sync, setSync] = useState<SyncState>(bridge.getSyncState() ?? emptySyncState);
  const [settings, setSettings] = useState<SettingsState>(bridge.getSettingsState() ?? emptySettingsState);

  useEffect(() => bridge.subscribeTransactionsState(setTransactions), [bridge]);
  useEffect(() => bridge.subscribeUnitsState(setUnits), [bridge]);
  useEffect(() => bridge.subscribeAccountsState(setAccounts), [bridge]);
  useEffect(() => bridge.subscribeAnalyticsState(setAnalytics), [bridge]);
  useEffect(() => bridge.subscribeSyncState(setSync), [bridge]);
  useEffect(() => bridge.subscribeSettingsState(setSettings), [bridge]);

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Shell
        bridge={bridge}
        transactions={transactions}
        units={units}
        accounts={accounts}
        analytics={analytics}
        sync={sync}
        settings={settings}
      />
    </BrowserRouter>
  );
}
