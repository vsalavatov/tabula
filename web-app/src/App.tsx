import type {ChangeEvent, KeyboardEvent as ReactKeyboardEvent, MutableRefObject, ReactNode} from "react";
import {memo, useEffect, useMemo, useRef, useState} from "react";
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
    FormControl,
    FormControlLabel,
    FormLabel,
    IconButton,
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
    Toolbar,
    Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import {Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
import {Virtuoso, type VirtuosoHandle} from "react-virtuoso";
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
  xs: "1fr",
  lg: "188px minmax(280px, 1.2fr) minmax(460px, 2.1fr) 140px",
};

const transferColumns = {
  xs: "1fr",
  md: "minmax(170px, 1.25fr) 132px minmax(96px, 0.72fr) minmax(170px, 1.25fr) 40px",
};

const registerFieldSx = {
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
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: settings.themeMode === "DARK" ? "dark" : "light",
          primary: { main: "#1f6feb" },
          secondary: { main: "#0891b2" },
          background: { default: settings.themeMode === "DARK" ? "#0f172a" : "#f8fafc" },
        },
        shape: { borderRadius: 14 },
      }),
    [settings.themeMode],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="sticky" color="transparent" elevation={0}>
        <Toolbar sx={{ borderBottom: "1px solid rgba(148,163,184,0.25)", backdropFilter: "blur(16px)" }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Tabula Web
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="xl" sx={{ py: 4, pb: 12 }}>
        <Routes>
          <Route path="/" element={<TransactionsPage bridge={bridge} state={transactions} />} />
          <Route path="/accounts" element={<AccountsPage bridge={bridge} state={accounts} />} />
          <Route path="/units" element={<UnitsPage bridge={bridge} state={units} />} />
          <Route path="/analytics" element={<AnalyticsPage bridge={bridge} state={analytics} />} />
          <Route path="/sync" element={<SyncPage bridge={bridge} state={sync} />} />
          <Route path="/settings" element={<SettingsPage bridge={bridge} state={settings} />} />
        </Routes>
      </Container>
      <Paper sx={{ position: "fixed", insetInline: 16, bottom: 16, borderRadius: 999, overflow: "hidden" }} elevation={8}>
        <Tabs value={pages.findIndex((page) => page.path === location.pathname)} variant="fullWidth">
          {pages.map((page) => (
            <Tab key={page.path} component={NavLink} label={page.label} to={page.path} />
          ))}
        </Tabs>
      </Paper>
    </ThemeProvider>
  );
}

function TransactionsPage({ bridge, state }: { bridge: TabulaBridge; state: TransactionsState }) {
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const stickyComposerSentinelRef = useRef<HTMLDivElement | null>(null);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const revealTimeoutRef = useRef<number | null>(null);
  const [newDraftPinned, setNewDraftPinned] = useState(false);
  const [highlightedTransactionId, setHighlightedTransactionId] = useState<number | null>(null);
  const [activeRevealSequence, setActiveRevealSequence] = useState<number | null>(null);
  const [loadingOlderWindow, setLoadingOlderWindow] = useState(false);
  const [loadingNewerWindow, setLoadingNewerWindow] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "t") {
        event.preventDefault();
        bridge.addTransferRow();
      }
      if (event.key === "Escape" && state.draft.mode === "EDIT_EXISTING") {
        event.preventDefault();
        bridge.cancelEditingTransaction();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bridge, state.draft.mode]);

  useEffect(() => {
    const focusTarget = state.draft.focusTarget;
    if (!focusTarget) return;
    let cancelled = false;
    let frame = 0;
    let attempts = 0;
    const maxAttempts = 8;

    const applyFocus = () => {
      if (cancelled) return;

      const target = fieldRefs.current[focusKey(focusTarget)];
      if (!target || !target.isConnected) {
        if (attempts < maxAttempts) {
          attempts += 1;
          frame = window.requestAnimationFrame(applyFocus);
        }
        return;
      }

      target.focus({ preventScroll: true });
      if (focusTarget.field === "DATE") {
        setDateCaretToStart(target);
      } else {
        target.select?.();
      }

      if (document.activeElement !== target && attempts < maxAttempts) {
        attempts += 1;
        frame = window.requestAnimationFrame(applyFocus);
      }
    };

    frame = window.requestAnimationFrame(applyFocus);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [state.draft.focusTarget?.sequence]);

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
      const stickyComposerHeight =
        document.querySelector<HTMLElement>('[data-testid="transaction-new-entry-shell"]')?.getBoundingClientRect().height ?? 0;
      const rowRect = row.getBoundingClientRect();
      const visibleTop = stickyComposerHeight + 16;
      const visibleBottom = window.innerHeight - 24;
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
      const stickyTopOffset = window.innerWidth < 600 ? 56 : 64;
      setNewDraftPinned(sentinel.getBoundingClientRect().top <= stickyTopOffset + 1);
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
      <SectionHeader
        title="Transactions"
        action={
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            {state.draft.mode === "EDIT_EXISTING" ? (
              <Button onClick={() => bridge.beginNewTransactionEntry()}>New Entry</Button>
            ) : null}
          </Stack>
        }
      />
      {state.error ? <Alert severity="error">{state.error}</Alert> : null}
      <Paper
        sx={{
          overflow: "visible",
          position: "relative",
          border: "1px solid rgba(148,163,184,0.28)",
          backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.65), rgba(248,250,252,0.95))",
        }}
      >
        <Box ref={stickyComposerSentinelRef} sx={{ position: "absolute", top: 0, insetInline: 0, height: 1, pointerEvents: "none" }} />
        <Box
          data-testid="transaction-new-entry-shell"
          data-sticky-active={newDraftPinned ? "true" : "false"}
          sx={{
            position: "sticky",
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
              <TransactionDraftRow bridge={bridge} state={state} fieldRefs={fieldRefs} sticky pinned={newDraftPinned} />
            </Box>
          ) : null}
        </Box>
        {state.draft.mode === "EDIT_EXISTING" ? (
          <Box sx={{ px: 2.5, py: 1, borderBottom: "1px solid rgba(148,163,184,0.18)", backgroundColor: "rgba(15,23,42,0.03)" }}>
            <Typography variant="caption" sx={{ letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}>
              Editing an existing transaction inline. Press Esc to cancel or Enter in any field to save.
            </Typography>
          </Box>
        ) : null}
        {state.isLoading ? (
          <Box sx={{ px: 2.5, py: 4 }}>
            <Typography color="text.secondary">Loading transactions...</Typography>
          </Box>
        ) : (
          <Box sx={{ position: "relative" }}>
            <Virtuoso
              ref={virtuosoRef}
              data={state.visibleTransactions}
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
                  fieldRefs={fieldRefs}
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
    </Stack>
  );
}

function RegisterColumnLabels({ pinned = false }: { pinned?: boolean }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: registerColumns,
        gap: 2,
        px: 2.5,
        py: 1.5,
        borderBottom: "1px solid rgba(148,163,184,0.18)",
        backgroundColor: pinned ? "rgba(255,255,255,0.98)" : "rgba(148,163,184,0.08)",
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
  fieldRefs,
  highlighted,
}: {
  absoluteIndex: number;
  transaction: Transaction;
  previousDateIso: string | null;
  bridge: TabulaBridge;
  state: TransactionsState;
  fieldRefs: MutableRefObject<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>;
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
        <TransactionDraftRow bridge={bridge} state={state} fieldRefs={fieldRefs} />
      ) : (
        <TransactionSummaryRow bridge={bridge} item={transaction} highlighted={highlighted} />
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
  fieldRefs,
  sticky = false,
  pinned = false,
}: {
  bridge: TabulaBridge;
  state: TransactionsState;
  fieldRefs: MutableRefObject<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>;
  sticky?: boolean;
  pinned?: boolean;
}) {
  const draft = state.draft;
  const editingExisting = draft.mode === "EDIT_EXISTING";
  const dateFieldPointerDownRef = useRef(false);
  const dateFieldPendingCaretRef = useRef<number | null>(null);
  const dateOverwriteValueRef = useRef<string | null>(null);
  const dateOverwriteCaretRef = useRef<number | null>(null);

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
    if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      handleCommit();
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
      data-testid={editingExisting ? "transaction-edit-row" : sticky ? "transaction-new-row" : "transaction-draft-row"}
      sx={{
        px: 2.5,
        py: sticky ? (pinned ? 1.25 : 2) : 1.75,
        backgroundColor: sticky ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.88)",
        transition: "padding 140ms ease, background-color 140ms ease",
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: registerColumns,
          gap: 2,
          alignItems: "start",
        }}
      >
        <Stack spacing={1.25}>
          <TextField
            fullWidth
            autoFocus={draft.focusTarget?.field === "DATE"}
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
            inputProps={{ "aria-label": "Transaction date" }}
            inputRef={setFieldRef(fieldRefs, "DATE", 0)}
            sx={registerFieldSx}
          />
        </Stack>

        <Stack spacing={1.25}>
          <TextField
            fullWidth
            autoFocus={draft.focusTarget?.field === "DESCRIPTION"}
            placeholder="Description"
            value={draft.description}
            error={draft.descriptionError}
            onKeyDown={handleDraftFieldKeyDown}
            onChange={(event) => bridge.updateTransactionDescription(event.target.value)}
            inputProps={{ "aria-label": "Transaction description" }}
            inputRef={setFieldRef(fieldRefs, "DESCRIPTION", 0)}
            sx={registerFieldSx}
          />
        </Stack>

        <Stack spacing={1.25}>
          <Stack
            spacing={1}
            sx={
              sticky
                ? {
                    maxHeight: { xs: 320, md: 236 },
                    overtabuLA: "auto",
                    overscrollBehavior: "contain",
                    pr: 0.5,
                  }
                : undefined
            }
          >
            {draft.transfers.map((transfer, index) => (
              <Box key={`draft-transfer-${index}`} sx={{ display: "grid", gridTemplateColumns: transferColumns, gap: 1, alignItems: "start" }}>
                <LookupAutocomplete
                  ariaLabel={`Transfer ${index + 1} from account`}
                  placeholder="From account"
                  value={transfer.fromAccountId}
                  options={state.accounts}
                  error={transfer.fromAccountError}
                  autoFocus={draft.focusTarget?.field === "FROM_ACCOUNT" && draft.focusTarget?.transferRowIndex === index}
                  inputRef={setFieldRef(fieldRefs, "FROM_ACCOUNT", index)}
                  onChange={(value) => bridge.updateTransferFromAccount(index, value)}
                  onKeyDown={handleDraftFieldKeyDown}
                />
                <TextField
                  autoFocus={draft.focusTarget?.field === "QUANTITY" && draft.focusTarget?.transferRowIndex === index}
                  placeholder="Quantity"
                  value={transfer.quantityInput}
                  error={transfer.quantityError}
                  onKeyDown={handleDraftFieldKeyDown}
                  onChange={(event) => bridge.updateTransferQuantity(index, event.target.value)}
                  inputProps={{ "aria-label": `Transfer ${index + 1} quantity` }}
                  inputRef={setFieldRef(fieldRefs, "QUANTITY", index)}
                  sx={registerFieldSx}
                />
                <LookupAutocomplete
                  ariaLabel={`Transfer ${index + 1} unit`}
                  placeholder="Unit"
                  value={transfer.unitId}
                  options={state.units}
                  error={transfer.unitError}
                  autoFocus={draft.focusTarget?.field === "UNIT" && draft.focusTarget?.transferRowIndex === index}
                  inputRef={setFieldRef(fieldRefs, "UNIT", index)}
                  onChange={(value) => bridge.updateTransferUnit(index, value)}
                  onKeyDown={handleDraftFieldKeyDown}
                />
                <LookupAutocomplete
                  ariaLabel={`Transfer ${index + 1} to account`}
                  placeholder="To account"
                  value={transfer.toAccountId}
                  options={state.accounts}
                  error={transfer.toAccountError}
                  autoFocus={draft.focusTarget?.field === "TO_ACCOUNT" && draft.focusTarget?.transferRowIndex === index}
                  inputRef={setFieldRef(fieldRefs, "TO_ACCOUNT", index)}
                  onChange={(value) => bridge.updateTransferToAccount(index, value)}
                  onKeyDown={handleDraftFieldKeyDown}
                />
                <IconButton
                  aria-label={`Remove transfer ${index + 1}`}
                  size="small"
                  disabled={draft.transfers.length === 1}
                  onClick={() => bridge.removeTransferRow(index)}
                  sx={{ mt: 0.75 }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Stack>
          <Button startIcon={<AddIcon />} onClick={() => bridge.addTransferRow()} sx={{ alignSelf: "flex-start" }}>
            Add transfer
          </Button>
        </Stack>

        <Stack spacing={1} alignItems="stretch" justifyContent="center">
          <Button variant="contained" onClick={handleCommit}>
            {draft.mode === "EDIT_EXISTING" ? "Save changes" : "Save entry"}
          </Button>
          {draft.mode === "EDIT_EXISTING" ? <Button onClick={() => bridge.cancelEditingTransaction()}>Cancel</Button> : null}
          <Typography variant="caption" color="text.secondary">
            Enter saves from any field. Ctrl+T adds a blank transfer row.
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}

const TransactionSummaryRow = memo(function TransactionSummaryRow({
  bridge,
  item,
  highlighted = false,
}: {
  bridge: TabulaBridge;
  item: Transaction;
  highlighted?: boolean;
}) {
  return (
    <Box
      data-transaction-id={item.id}
      data-highlighted={highlighted ? "true" : "false"}
      role="button"
      tabIndex={0}
      aria-label={`Edit ${item.description}`}
      onClick={() => bridge.beginEditingTransaction(item.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          bridge.beginEditingTransaction(item.id);
        }
      }}
      sx={{
        display: "grid",
        gridTemplateColumns: registerColumns,
        gap: 2,
        px: 2.5,
        py: 1.75,
        cursor: "pointer",
        backgroundColor: highlighted ? "rgba(31,111,235,0.12)" : "transparent",
        boxShadow: highlighted ? "inset 0 0 0 1px rgba(31,111,235,0.28)" : "none",
        transition: "background-color 220ms ease, box-shadow 220ms ease",
        "&:hover": { backgroundColor: highlighted ? "rgba(31,111,235,0.14)" : "rgba(31,111,235,0.04)" },
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: "-2px",
        },
      }}
    >
      <Stack spacing={0.35}>
        <RegisterLabel>Saved</RegisterLabel>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {formatTransactionTime(item.timestamp)}
        </Typography>
      </Stack>
      <Stack spacing={0.35}>
        <Typography sx={{ fontWeight: 600 }}>{item.description}</Typography>
        <Typography variant="body2" color="text.secondary">
          {item.transfers.length} {item.transfers.length === 1 ? "transfer" : "transfers"}
        </Typography>
      </Stack>
      <Stack spacing={0.75}>
        {item.transfers.map((transfer) => (
          <Box key={transfer.id} sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
            <Typography variant="body2">
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
          onClick={(event) => {
            event.stopPropagation();
            bridge.deleteTransaction(item.id);
          }}
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
        <Alert severity="warning" onClose={() => bridge.clearConsistencyResult()}>
          {state.consistencyResult.inconsistencies.map((item) => `${item.assetDesc}: ${item.diff}`).join(", ")}
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
                      <TextField value={item.nameInput} onChange={(event) => bridge.updateAccountName(item.account.id, event.target.value)} />
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
  return (
    <Stack spacing={3}>
      <SectionHeader title="Analytics" />
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <Select fullWidth value={state.selectedAccountId ?? ""} onChange={(event) => bridge.selectAnalyticsAccount(Number(event.target.value))}>
            {state.accounts.map((account) => <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>)}
          </Select>
          <Select fullWidth value={state.selectedUnitId ?? ""} onChange={(event) => bridge.selectAnalyticsUnit(Number(event.target.value))}>
            {state.units.map((unit) => <MenuItem key={unit.id} value={unit.id}>{unit.name}</MenuItem>)}
          </Select>
          <Select fullWidth value={state.timeRange} onChange={(event) => bridge.selectAnalyticsTimeRange(event.target.value as AnalyticsTimeRange)}>
            {(["LAST_WEEK", "LAST_MONTH", "LAST_THREE_MONTHS", "LAST_SIX_MONTHS", "LAST_YEAR", "ALL_TIME"] as AnalyticsTimeRange[]).map((range) => (
              <MenuItem key={range} value={range}>{range.replaceAll("_", " ")}</MenuItem>
            ))}
          </Select>
        </Stack>
      </Paper>
      <Paper sx={{ p: 2, height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={state.balanceData.map((point) => ({ ...point, label: new Date(point.date).toLocaleDateString() }))}>
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="balance" stroke="#1f6feb" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Paper>
    </Stack>
  );
}

function SyncPage({ bridge, state }: { bridge: TabulaBridge; state: SyncState }) {
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleDatabaseFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsImporting(true);
    setImportError(null);
    setImportSuccess(null);
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
            <Button component="label" variant="outlined" disabled={isImporting}>
              {isImporting ? "Loading DB..." : "Load DB File"}
              <input hidden type="file" accept=".db,.sqlite,.sqlite3,application/octet-stream,application/x-sqlite3" onChange={handleDatabaseFileSelection} />
            </Button>
            <Button variant="contained" startIcon={<CloudUploadIcon />} onClick={() => bridge.uploadBackup()}>Upload Backup</Button>
          </Stack>
        }
      />
      {state.error ? <Alert severity="error">{state.error}</Alert> : null}
      {importError ? <Alert severity="error" onClose={() => setImportError(null)}>{importError}</Alert> : null}
      {importSuccess ? <Alert severity="success" onClose={() => setImportSuccess(null)}>{importSuccess}</Alert> : null}
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <Button variant={state.isSignedIn ? "outlined" : "contained"} onClick={() => bridge.signIn()}>
            {state.isSignedIn ? `Connected: ${state.accountLabel}` : "Sign in to Google Drive"}
          </Button>
          <Button onClick={() => bridge.loadBackups()}>Refresh Backups</Button>
        </Stack>
      </Paper>
      <Stack spacing={2}>
        {state.backupFiles.map((file) => (
          <Card key={file.id}>
            <CardContent sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "center" }}>
              <Box>
                <Typography fontWeight={600}>{file.name}</Typography>
                <Typography variant="body2" color="text.secondary">{state.restoreStatus[file.id] ?? "Available"}</Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button onClick={() => bridge.restoreBackup(file.id)}>Restore</Button>
                <Button onClick={() => bridge.deleteBackup(file.id)} color="inherit">Delete</Button>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Stack>
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
  ariaLabel,
  placeholder,
  value,
  options,
  error = false,
  autoFocus = false,
  inputRef,
  onChange,
  onKeyDown,
}: {
  ariaLabel: string;
  placeholder: string;
  value: number | null;
  options: T[];
  error?: boolean;
  autoFocus?: boolean;
  inputRef: (element: HTMLInputElement | HTMLTextAreaElement | null) => void;
  onChange: (value: number | null) => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
}) {
  const selected = options.find((option) => option.id === value) ?? null;
  const [inputValue, setInputValue] = useState(selected?.name ?? "");
  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    if (!query) {
      return options;
    }
    return options.filter((option) => option.name.toLowerCase().includes(query));
  }, [inputValue, options]);

  useEffect(() => {
    setInputValue(selected?.name ?? "");
  }, [selected?.id, selected?.name]);

  const applyTypedCandidate = () => {
    const normalizedInput = inputValue.trim().toLowerCase();
    const normalizedSelected = selected?.name.trim().toLowerCase() ?? "";
    const candidate = normalizedInput.length > 0 && normalizedInput !== normalizedSelected ? filteredOptions[0] ?? null : null;
    if (candidate && candidate.id !== selected?.id) {
      setInputValue(candidate.name);
      onChange(candidate.id);
      return true;
    }
    return false;
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      applyTypedCandidate();
    }
    if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const appliedTypedCandidate = applyTypedCandidate();
      event.preventDefault();
      event.stopPropagation();
      if (appliedTypedCandidate) {
        return;
      }
      onKeyDown?.(event);
      return;
    }
    onKeyDown?.(event);
  };

  return (
    <Autocomplete
      size="small"
      autoHighlight
      openOnFocus
      blurOnSelect
      disableClearable
      options={filteredOptions}
      value={selected}
      inputValue={inputValue}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, optionValue) => option.id === optionValue.id}
      sx={registerFieldSx}
      onInputChange={(_, nextValue, reason) => {
        if (reason === "input" || reason === "clear") {
          setInputValue(nextValue);
        }
      }}
      onChange={(_, option) => {
        setInputValue(option?.name ?? "");
        onChange(option?.id ?? null);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={placeholder}
          error={error}
          inputRef={inputRef}
          autoFocus={autoFocus}
          inputProps={{
            ...params.inputProps,
            "aria-label": ariaLabel,
            onKeyDown: handleKeyDown,
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
    fieldRefs.current[focusKey({ field, transferRowIndex, sequence: 0 })] = element;
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
    <BrowserRouter>
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
