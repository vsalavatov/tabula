import {expect, type Page, test} from "@playwright/test";
import {
  createKeyboardDefaultsDatabaseFile,
  createLongRegisterDatabaseFile,
  createMassiveHistoryDatabaseFile,
  createSavingsAutocompleteDatabaseFile,
  createUploadableDatabaseFile,
  createWindowedOlderDateDatabaseFile,
} from "./support/testDatabase";

async function freezeDate(page: Page, isoDateTime: string) {
  await page.addInitScript((fixedIso) => {
    const fixedTime = new Date(fixedIso).getTime();
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args: ConstructorParameters<DateConstructor>) {
        if (args.length === 0) {
          super(fixedTime);
        } else {
          super(...args);
        }
      }
      static now() {
        return fixedTime;
      }
    }
    MockDate.parse = RealDate.parse;
    MockDate.UTC = RealDate.UTC;
    Object.defineProperty(window, "Date", {
      value: MockDate,
      configurable: true,
      writable: true,
    });
  }, isoDateTime);
}

async function gotoTab(page: Page, name: string) {
  await page.getByRole("tab", { name }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function loadDatabaseFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await gotoTab(page, "Sync");
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText(`Loaded database from ${file.name}`)).toBeVisible();
}

async function createUnit(page: Page, name: string, symbol: string, mantissaLength: string) {
  await gotoTab(page, "Units");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Symbol").fill(symbol);
  await page.getByLabel("Mantissa length").fill(mantissaLength);
  await page.getByRole("button", { name: /create unit/i }).click();
  await expect(page.getByRole("heading", { name }).first()).toBeVisible();
}

async function createAccount(page: Page, name: string, inPossession = true) {
  await gotoTab(page, "Accounts");
  const inPossessionCheckbox = page.getByLabel("In possession");
  if ((await inPossessionCheckbox.isChecked()) !== inPossession) {
    await inPossessionCheckbox.click();
  }
  await page.getByLabel("New account").fill(name);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByText(name)).toBeVisible();
}

async function selectAutocomplete(page: Page, label: string, option: string) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  await input.click();
  await input.fill(option);
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(input).toHaveValue(option);
}

async function fillTransfer(
  page: Page,
  rowIndex: number,
  transfer: { from: string; quantity: string; unit: string; to: string },
) {
  await selectAutocomplete(page, `Transfer ${rowIndex} from account`, transfer.from);
  await page.getByLabel(`Transfer ${rowIndex} quantity`).fill(transfer.quantity);
  await selectAutocomplete(page, `Transfer ${rowIndex} unit`, transfer.unit);
  await selectAutocomplete(page, `Transfer ${rowIndex} to account`, transfer.to);
}

async function createTransactionInline(
  page: Page,
  details: {
    description: string;
    dateInput?: string;
    transfers: Array<{ from: string; quantity: string; unit: string; to: string }>;
    addExtraTransfersWithShortcut?: boolean;
    expectCreatedRowVisible?: boolean;
  },
) {
  if (!(await page.getByRole("heading", { name: "Transactions" }).isVisible())) {
    await gotoTab(page, "Transactions");
  }
  await expect(page.getByTestId("transaction-new-row")).toBeVisible();
  await expect(page.getByLabel("Transaction date")).toBeFocused();

  if (details.dateInput) {
    await page.getByLabel("Transaction date").fill(details.dateInput);
  }
  await page.getByLabel("Transaction description").fill(details.description);

  for (const [index, transfer] of details.transfers.entries()) {
    const rowNumber = index + 1;
    if (index > 0) {
      if (details.addExtraTransfersWithShortcut) {
        await page.keyboard.press("Control+t");
      } else {
        await page.getByRole("button", { name: "Add transfer" }).click();
      }
      await expect(page.getByRole("combobox", { name: `Transfer ${rowNumber} from account`, exact: true })).toBeFocused();
    }
    await fillTransfer(page, rowNumber, transfer);
  }

  await page.getByLabel(`Transfer ${details.transfers.length} to account`).focus();
  await page.keyboard.press("Enter");
  if (details.expectCreatedRowVisible ?? true) {
    await expect(page.getByText(details.description)).toBeVisible();
  }
  await expect(page.getByLabel("Transaction date")).toBeFocused();
}

async function signIntoMockDrive(page: Page) {
  await gotoTab(page, "Sync");
  await page.getByRole("button", { name: /sign in to google drive/i }).click();
  await expect(page.getByRole("button", { name: /connected: mock google drive/i })).toBeVisible();
}

test("imports a database, edits through the inline register, uploads a backup, then restores it", async ({ page }) => {
  const importedDatabase = await createUploadableDatabaseFile();
  await page.goto("/");

  await loadDatabaseFile(page, importedDatabase);

  await gotoTab(page, "Units");
  await expect(page.getByRole("heading", { name: "Imported Euro" })).toBeVisible();

  await gotoTab(page, "Accounts");
  await expect(page.getByText("Imported Wallet")).toBeVisible();

  await signIntoMockDrive(page);
  await expect(page.getByRole("button", { name: "Restore" })).toHaveCount(1);

  await createAccount(page, "Imported Bank");
  await createTransactionInline(page, {
    description: "Imported rebalance",
    transfers: [{ from: "Imported Wallet", to: "Imported Bank", unit: "Imported Euro", quantity: "10" }],
  });

  await gotoTab(page, "Sync");
  await page.getByRole("button", { name: /upload backup/i }).click();
  await expect(page.getByRole("button", { name: "Restore" })).toHaveCount(2);

  await page.getByRole("button", { name: "Restore" }).nth(1).click();
  await expect(page.getByText("Restored").first()).toBeVisible();

  await gotoTab(page, "Accounts");
  await expect(page.getByText("Imported Wallet")).toBeVisible();
  await expect(page.getByText("Imported Bank")).toHaveCount(0);

  await gotoTab(page, "Transactions");
  await expect(page.getByText("Imported rebalance")).toHaveCount(0);

  await gotoTab(page, "Sync");
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByRole("button", { name: "Restore" })).toHaveCount(1);
});

test("creates a multi-transfer transaction with keyboard-first entry and Ctrl+T", async ({ page }) => {
  await page.goto("/");

  await createUnit(page, "Euro", "EUR", "2");
  await createAccount(page, "Wallet");
  await createAccount(page, "Bank");
  await createAccount(page, "Broker");

  await createTransactionInline(page, {
    description: "Salary split",
    transfers: [
      { from: "Bank", to: "Wallet", unit: "Euro", quantity: "750" },
      { from: "Bank", to: "Broker", unit: "Euro", quantity: "250" },
    ],
    addExtraTransfersWithShortcut: true,
  });

  await gotoTab(page, "Transactions");
  await expect(page.getByText("Salary split")).toBeVisible();
  await expect(page.getByText("Bank -> Wallet")).toBeVisible();
  await expect(page.getByText("750 EUR")).toBeVisible();
  await expect(page.getByText("Bank -> Broker")).toBeVisible();
  await expect(page.getByText("250 EUR")).toBeVisible();
});

test("new transaction entry uses current-date and session defaults with keyboard-first tab flow", async ({ page }) => {
  const seededDatabase = await createKeyboardDefaultsDatabaseFile();
  await freezeDate(page, "2025-04-06T12:00:00.000Z");
  await page.goto("/");

  await loadDatabaseFile(page, seededDatabase);
  await page.reload();
  await page.goto("/");

  const dateField = page.getByLabel("Transaction date");
  const descriptionField = page.getByLabel("Transaction description");
  const fromStoreField = page.getByRole("combobox", { name: "Transfer 1 from account", exact: true });
  const quantityField = page.getByLabel("Transfer 1 quantity");
  const unitField = page.getByRole("combobox", { name: "Transfer 1 unit", exact: true });
  const toStoreField = page.getByRole("combobox", { name: "Transfer 1 to account", exact: true });

  await expect(dateField).toBeFocused();
  await expect(dateField).toHaveValue("06-04-2025");

  await page.keyboard.press("Tab");
  await expect(descriptionField).toBeFocused();
  await descriptionField.fill("food");

  await page.keyboard.press("Tab");
  await expect(fromStoreField).toBeFocused();
  await expect(fromStoreField).toHaveValue("income");
  await fromStoreField.fill("gro");
  await expect(page.getByRole("option", { name: "groceries", exact: true })).toBeVisible();
  await page.keyboard.press("Tab");

  await expect(quantityField).toBeFocused();
  await expect(fromStoreField).toHaveValue("groceries");
  await expect(quantityField).toHaveValue("");
  await quantityField.fill("10");
  await page.keyboard.press("Tab");

  await expect(unitField).toBeFocused();
  await expect(unitField).toHaveValue("Euro");
  await page.keyboard.press("Tab");

  await expect(toStoreField).toBeFocused();
  await expect(toStoreField).toHaveValue("external");
  await page.keyboard.press("Enter");

  await expect(dateField).toBeFocused();
  await expect(dateField).toHaveValue("06-04-2025");

  await page.keyboard.press("Tab");
  await expect(descriptionField).toBeFocused();
  await descriptionField.fill("snack");
  await page.keyboard.press("Tab");
  await expect(fromStoreField).toBeFocused();
  await expect(fromStoreField).toHaveValue("groceries");
  await page.keyboard.press("Tab");
  await expect(quantityField).toBeFocused();
  await expect(quantityField).toHaveValue("");
  await quantityField.fill("5");
  await page.keyboard.press("Tab");
  await expect(unitField).toBeFocused();
  await expect(unitField).toHaveValue("Euro");
  await page.keyboard.press("Tab");
  await expect(toStoreField).toBeFocused();
  await expect(toStoreField).toHaveValue("external");
  await page.keyboard.press("Enter");

  await expect(page.getByText("snack")).toBeVisible();
});

test("date field uses overwrite typing and tolerates typed separators", async ({ page }) => {
  const expectDateOverwriteCursor = async (expectedStart: number, expectedEnd: number) => {
    await expect
      .poll(async () => dateField.evaluate((element) => ({
        start: (element as HTMLInputElement).selectionStart,
        end: (element as HTMLInputElement).selectionEnd,
      })))
      .toEqual({ start: expectedStart, end: expectedEnd });
  };

  await freezeDate(page, "2026-05-11T12:00:00.000Z");
  await page.goto("/");

  const dateField = page.getByLabel("Transaction date");
  const descriptionField = page.getByLabel("Transaction description");

  await expect(dateField).toBeFocused();
  await expect(dateField).toHaveValue("11-05-2026");
  await expectDateOverwriteCursor(0, 1);
  await page.keyboard.press("Tab");
  await expect(descriptionField).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dateField).toBeFocused();
  const selectionAfterShiftTab = await dateField.evaluate((element) => ({
    start: (element as HTMLInputElement).selectionStart,
    end: (element as HTMLInputElement).selectionEnd,
  }));
  expect(selectionAfterShiftTab).toEqual({ start: 0, end: 1 });

  await page.keyboard.type("0507");
  await expect(dateField).toHaveValue("05-07-2026");

  await page.reload();
  await expect(dateField).toBeFocused();
  await expect(dateField).toHaveValue("11-05-2026");
  await expectDateOverwriteCursor(0, 1);
  await page.keyboard.type("05-07");
  await expect(dateField).toHaveValue("05-07-2026");

  await page.reload();
  await expect(dateField).toBeFocused();
  await expect(dateField).toHaveValue("11-05-2026");
  await expectDateOverwriteCursor(0, 1);
  await page.keyboard.type("110");
  const cursorAfter110 = await dateField.evaluate((element) => ({
    start: (element as HTMLInputElement).selectionStart,
    end: (element as HTMLInputElement).selectionEnd,
  }));
  expect(cursorAfter110).toEqual({ start: 4, end: 5 });
  await page.keyboard.type("4");
  await expect(dateField).toHaveValue("11-04-2026");

  await page.reload();
  await expect(dateField).toBeFocused();
  await expect(dateField).toHaveValue("11-05-2026");
  await dateField.press("Control+a");
  await dateField.press("Backspace");
  await expect(dateField).toHaveValue("");
  await page.keyboard.type("11052026");
  await expect(dateField).toHaveValue("11-05-2026");

  await dateField.press("Control+a");
  await dateField.press("Backspace");
  await expect(dateField).toHaveValue("");
  await page.keyboard.type("11-05-2026");
  await expect(dateField).toHaveValue("11-05-2026");

  await dateField.press("ArrowUp");
  await expect(dateField).toHaveValue("12-05-2026");
  await dateField.press("ArrowDown");
  await expect(dateField).toHaveValue("11-05-2026");

  await dateField.fill("31-02-2026");
  await expect(dateField).toHaveValue("31-02-2026");
  await dateField.press("ArrowUp");
  await expect(dateField).toHaveValue("31-02-2026");
});

test("pressing enter in a dropdown with a typed match applies the suggestion before committing", async ({ page }) => {
  const seededDatabase = await createKeyboardDefaultsDatabaseFile();
  await freezeDate(page, "2025-04-06T12:00:00.000Z");
  await page.goto("/");

  await loadDatabaseFile(page, seededDatabase);
  await gotoTab(page, "Transactions");

  const descriptionField = page.getByLabel("Transaction description");
  const fromStoreField = page.getByRole("combobox", { name: "Transfer 1 from account", exact: true });
  const quantityField = page.getByLabel("Transfer 1 quantity");

  await page.keyboard.press("Tab");
  await expect(descriptionField).toBeFocused();
  await descriptionField.fill("food");
  await page.keyboard.press("Tab");

  await expect(fromStoreField).toBeFocused();
  await expect(fromStoreField).toHaveValue("income");
  await fromStoreField.fill("gro");
  await expect(page.getByRole("option", { name: "groceries", exact: true })).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(fromStoreField).toHaveValue("groceries");
  await expect(quantityField).not.toBeFocused();
  await expect(page.locator('[data-date-iso="2025-04-06"]')).toHaveCount(0);
});

test("pressing enter after arrow navigation in account dropdown applies highlighted savings option", async ({ page }) => {
  const seededDatabase = await createSavingsAutocompleteDatabaseFile();
  await freezeDate(page, "2025-04-06T12:00:00.000Z");
  await page.goto("/");

  await loadDatabaseFile(page, seededDatabase);
  await gotoTab(page, "Transactions");

  const fromStoreField = page.getByRole("combobox", { name: "Transfer 1 from account", exact: true });
  const quantityField = page.getByLabel("Transfer 1 quantity");

  await expect(fromStoreField).toHaveValue("Income");
  await fromStoreField.click();
  await fromStoreField.fill("savings");
  await expect(page.getByRole("option", { name: "Savings", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Savings for car", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Savings for house", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(fromStoreField).toHaveValue("Savings for house");
  await expect(quantityField).not.toBeFocused();
});

test("pressing space after arrow navigation in account dropdown applies highlighted savings option", async ({ page }) => {
  const seededDatabase = await createSavingsAutocompleteDatabaseFile();
  await freezeDate(page, "2025-04-06T12:00:00.000Z");
  await page.goto("/");

  await loadDatabaseFile(page, seededDatabase);
  await gotoTab(page, "Transactions");

  const fromStoreField = page.getByRole("combobox", { name: "Transfer 1 from account", exact: true });
  const quantityField = page.getByLabel("Transfer 1 quantity");

  await expect(fromStoreField).toHaveValue("Income");
  await fromStoreField.click();
  await fromStoreField.fill("savings");
  await expect(page.getByRole("option", { name: "Savings", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Savings for car", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Savings for house", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press(" ");

  await expect(fromStoreField).toHaveValue("Savings for house");
  await expect(quantityField).not.toBeFocused();
});

test("pressing tab after arrow navigation in account dropdown applies highlighted savings option and advances focus", async ({ page }) => {
  const seededDatabase = await createSavingsAutocompleteDatabaseFile();
  await freezeDate(page, "2025-04-06T12:00:00.000Z");
  await page.goto("/");

  await loadDatabaseFile(page, seededDatabase);
  await gotoTab(page, "Transactions");

  const fromStoreField = page.getByRole("combobox", { name: "Transfer 1 from account", exact: true });
  const quantityField = page.getByLabel("Transfer 1 quantity");

  await expect(fromStoreField).toHaveValue("Income");
  await fromStoreField.click();
  await fromStoreField.fill("savings");
  await expect(page.getByRole("option", { name: "Savings", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Savings for car", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Savings for house", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");

  await expect(fromStoreField).toHaveValue("Savings for house");
  await expect(quantityField).toBeFocused();
});

test("new transaction composer stays visible while scrolling older transactions", async ({ page }) => {
  const longRegisterDatabase = await createLongRegisterDatabaseFile();
  await page.goto("/");

  await loadDatabaseFile(page, longRegisterDatabase);
  await gotoTab(page, "Transactions");
  await page.evaluate(() => window.scrollTo(0, 0));

  const stickyShell = page.getByTestId("transaction-new-entry-shell");
  const newRow = page.getByTestId("transaction-new-row");

  await expect(stickyShell).toHaveAttribute("data-sticky-active", "false");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(async () => stickyShell.getAttribute("data-sticky-active")).toBe("true");
  await expect(newRow).toBeVisible();

  const box = await newRow.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeLessThan(220);
});

test("creating an older transaction scrolls to and highlights the inserted row", async ({ page }) => {
  const seededDatabase = await createWindowedOlderDateDatabaseFile();
  await page.goto("/");

  await loadDatabaseFile(page, seededDatabase);
  await gotoTab(page, "Transactions");

  await createTransactionInline(page, {
    dateInput: "15-01-2025",
    description: "Older inserted transaction",
    transfers: [{ from: "wallet", to: "external", unit: "Euro", quantity: "22" }],
    expectCreatedRowVisible: false,
  });

  const insertedRow = page.locator("[data-transaction-id]").filter({ hasText: "Older inserted transaction" });
  await expect(insertedRow).toBeVisible();
  await expect(insertedRow).toHaveAttribute("data-highlighted", "true");
  await expect(page.getByLabel("Transaction date")).toBeFocused();

  const rowBox = await insertedRow.boundingBox();
  expect(rowBox).not.toBeNull();
  expect(rowBox!.y).toBeGreaterThan(140);
  expect(rowBox!.y).toBeLessThan(760);

  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(200);
});

test("older-date insertion keeps the virtualized transaction window bounded on a massive history", async ({ page }) => {
  const seededDatabase = await createMassiveHistoryDatabaseFile();
  await page.goto("/");

  await loadDatabaseFile(page, seededDatabase);
  await gotoTab(page, "Transactions");

  const initialRenderedRows = await page.locator("[data-transaction-id]").count();
  expect(initialRenderedRows).toBeLessThan(260);

  await createTransactionInline(page, {
    dateInput: "05-05-2024",
    description: "Deep history insert",
    transfers: [{ from: "wallet", to: "external", unit: "Euro", quantity: "19" }],
    expectCreatedRowVisible: false,
  });

  const insertedRow = page.locator("[data-transaction-id]").filter({ hasText: "Deep history insert" });
  await expect(insertedRow).toBeVisible();
  await expect(insertedRow).toHaveAttribute("data-highlighted", "true");
  await expect(page.getByLabel("Transaction date")).toBeFocused();

  const renderedRowsAfterReveal = await page.locator("[data-transaction-id]").count();
  expect(renderedRowsAfterReveal).toBeLessThan(260);
  await expect(page.getByText("Massive transaction 9125")).toHaveCount(0);
});

test("accounts tab updates asset balances immediately after adding a transaction", async ({ page }) => {
  await page.goto("/");

  await createUnit(page, "Euro", "EUR", "2");
  await createAccount(page, "Wallet");
  await createAccount(page, "Checking", false);

  await createTransactionInline(page, {
    description: "ATM withdrawal",
    transfers: [{ from: "Checking", to: "Wallet", unit: "Euro", quantity: "120" }],
  });

  await gotoTab(page, "Accounts");
  await expect(page.getByText("Wallet")).toBeVisible();
  await expect(page.getByText("Checking")).toBeVisible();
  await expect(page.getByText("120.00 EUR", { exact: true })).toBeVisible();
  await expect(page.getByText("-120.00 EUR", { exact: true })).toBeVisible();
});

test("transaction row delete removes the transaction and rolls back account balances", async ({ page }) => {
  await page.goto("/");

  await createUnit(page, "Euro", "EUR", "2");
  await createAccount(page, "Wallet");
  await createAccount(page, "Checking", false);

  await createTransactionInline(page, {
    description: "Delete me",
    transfers: [{ from: "Checking", to: "Wallet", unit: "Euro", quantity: "75" }],
  });

  await gotoTab(page, "Transactions");
  await expect(page.getByText("Delete me")).toBeVisible();
  await page.getByRole("button", { name: "Delete Delete me" }).click();
  await expect(page.getByText("Delete me")).toHaveCount(0);

  await gotoTab(page, "Accounts");
  await expect(page.getByText("75.00 EUR", { exact: true })).toHaveCount(0);
  await expect(page.getByText("-75.00 EUR", { exact: true })).toHaveCount(0);
});

test("edits an existing transaction inline, moves it to another date, and keeps grouped headers stable", async ({ page }) => {
  await page.goto("/");

  await createUnit(page, "Euro", "EUR", "2");
  await createAccount(page, "Wallet");
  await createAccount(page, "Bank");

  await createTransactionInline(page, {
    description: "Groceries",
    transfers: [{ from: "Bank", to: "Wallet", unit: "Euro", quantity: "120" }],
  });

  await createTransactionInline(page, {
    description: "Fuel",
    transfers: [{ from: "Bank", to: "Wallet", unit: "Euro", quantity: "40" }],
  });

  await gotoTab(page, "Transactions");
  await page.locator("[data-transaction-id]").filter({ hasText: "Fuel" }).click();
  await expect(page.getByTestId("transaction-edit-row")).toBeVisible();
  await expect(page.getByLabel("Transaction description")).toHaveValue("Fuel");

  await page.getByLabel("Transaction description").fill("Fuel for trip");
  await page.getByLabel("Transaction date").press("Control+a");
  await page.getByLabel("Transaction date").fill("02-05-2026");
  await page.getByLabel("Transfer 1 quantity").fill("65");
  await page.getByLabel("Transfer 1 to account").focus();
  await page.keyboard.press("Enter");

  await expect(page.getByText("Fuel for trip")).toBeVisible();
  await expect(page.locator("[data-date-header]")).toHaveCount(2);
});

test("persists cached data and theme across reload while analytics remain available", async ({ page }) => {
  await page.goto("/");

  await createUnit(page, "US Dollar", "USD", "2");
  await createAccount(page, "Travel Wallet");
  await createAccount(page, "Checking", false);

  await createTransactionInline(page, {
    description: "Travel funding",
    transfers: [{ from: "Checking", to: "Travel Wallet", unit: "US Dollar", quantity: "300" }],
  });

  await gotoTab(page, "Transactions");
  await expect(page.getByText("Travel funding")).toBeVisible();
  await expect(page.getByText("Checking -> Travel Wallet")).toBeVisible();
  await expect(page.getByText("300 USD")).toBeVisible();

  await gotoTab(page, "Accounts");
  await expect(page.getByText("Travel Wallet")).toBeVisible();
  await expect(page.getByText("Checking")).toBeVisible();

  await gotoTab(page, "Settings");
  await page.getByLabel("Dark").check();
  await expect(page.getByLabel("Dark")).toBeChecked();

  await page.reload();

  await gotoTab(page, "Settings");
  await expect(page.getByLabel("Dark")).toBeChecked();

  await gotoTab(page, "Transactions");
  await expect(page.getByText("Travel funding")).toBeVisible();
  await expect(page.getByText("Checking -> Travel Wallet")).toBeVisible();
  await expect(page.getByText("300 USD")).toBeVisible();

  await gotoTab(page, "Accounts");
  await expect(page.getByText("Travel Wallet")).toBeVisible();
  await expect(page.getByText("Checking")).toBeVisible();

  await gotoTab(page, "Analytics");
  await expect(page.locator(".recharts-responsive-container")).toBeVisible();
});

