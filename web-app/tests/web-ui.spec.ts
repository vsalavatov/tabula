import {expect, type Page, test} from "@playwright/test";
import {
  createDailyBalanceDatabaseFile,
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
  await page.getByRole("option").getByText(option, { exact: true }).click();
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
        await page.getByLabel(`Transfer ${index} quantity`).press("Alt+Enter");
      } else {
        await page.getByRole("button", { name: "Add transfer" }).click();
      }
      await expect(page.getByLabel(`Transfer ${rowNumber} quantity`)).toBeFocused();
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

test("shows a loading screen while the Kotlin bridge runtime loads", async ({ page }) => {
  await page.route("**/generated/kotlin/js-joda.js", async (route) => {
    await page.waitForTimeout(1000);
    await route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Tabula Web" })).toBeVisible();
  await expect(page.getByText("Loading your workspace...")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
});

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
  await page.getByRole("dialog").getByRole("button", { name: "Restore backup" }).click();
  await expect(page.getByText("Restored").first()).toBeVisible();

  await gotoTab(page, "Accounts");
  await expect(page.getByText("Imported Wallet")).toBeVisible();
  await expect(page.getByText("Imported Bank")).toHaveCount(0);

  await gotoTab(page, "Transactions");
  await expect(page.getByText("Imported rebalance")).toHaveCount(0);

  await gotoTab(page, "Sync");
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete backup" }).click();
  await expect(page.getByRole("button", { name: "Restore" })).toHaveCount(1);
});

test("finds a unit by symbol, updates existing entries, and only deletes it once unused", async ({ page }) => {
  await page.goto("/");
  await createUnit(page, "US Dollar", "USD", "2");
  await createAccount(page, "Wallet");
  await createAccount(page, "Bank");
  await gotoTab(page, "Transactions");

  await page.getByLabel("Transaction description").fill("Currency test");
  await selectAutocomplete(page, "Transfer 1 from account", "Bank");
  await page.getByLabel("Transfer 1 quantity").fill("12");
  const unit = page.getByRole("combobox", { name: "Transfer 1 unit" });
  await unit.fill("uSd");
  await expect(page.getByRole("option", { name: "US Dollar (USD)", exact: true })).toBeVisible();
  await unit.press("Tab");
  await expect(unit).toHaveValue("US Dollar");
  await selectAutocomplete(page, "Transfer 1 to account", "Wallet");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText("12 USD")).toBeVisible();

  await gotoTab(page, "Units");
  await page.getByRole("button", { name: "Edit US Dollar", exact: true }).click();
  const editor = page.getByRole("form", { name: "Edit unit" });
  await expect(editor.getByLabel("Name")).toHaveValue("US Dollar");
  await expect(editor.getByLabel("Symbol")).toHaveValue("USD");
  await editor.getByLabel("Name").fill("Updated Dollar");
  await editor.getByLabel("Symbol").fill("USX");
  await editor.getByLabel("Mantissa length").fill("-1");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor.getByText("Enter a nonnegative whole number")).toBeVisible();
  await editor.getByLabel("Mantissa length").fill("3");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Updated Dollar" })).toBeVisible();
  await expect(page.getByText("USX • mantissa 3")).toBeVisible();

  const deleteUnit = page.getByRole("button", { name: "Delete Updated Dollar" });
  const confirmation = page.getByRole("dialog", { name: "Delete unit?" });
  await deleteUnit.click();
  await confirmation.getByRole("button", { name: "Delete unit", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Cannot delete Updated Dollar");

  await gotoTab(page, "Transactions");
  await expect(page.getByText("12 USX")).toBeVisible();
  await page.getByRole("button", { name: "Delete Currency test" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete transaction" }).click();
  await expect(page.getByText("Currency test")).toHaveCount(0);

  await gotoTab(page, "Units");
  await deleteUnit.click();
  await confirmation.getByRole("button", { name: "Delete unit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Updated Dollar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Unit" })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "Create Unit" })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Updated Dollar" })).toHaveCount(0);
});

test("protects a unit with an imported balance and no transfers", async ({ page }) => {
  await page.goto("/");
  await loadDatabaseFile(page, await createUploadableDatabaseFile());
  await gotoTab(page, "Units");
  await page.getByRole("button", { name: "Delete Imported Euro" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete unit" }).click();
  await expect(page.getByRole("alert")).toContainText("Cannot delete Imported Euro");
  await expect(page.getByRole("heading", { name: "Imported Euro" })).toBeVisible();
});

test("creates a multi-transfer transaction with keyboard-first entry and Alt+Enter", async ({ page }) => {
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

test("keeps actions accessible with many transfers on a narrow screen", async ({ page }) => {
  const seededDatabase = await createKeyboardDefaultsDatabaseFile();
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("/");
  await loadDatabaseFile(page, seededDatabase);
  await gotoTab(page, "Transactions");

  const editor = page.getByRole("form", { name: "New transaction" });
  const add = editor.getByRole("button", { name: "Add transfer" });
  const save = editor.getByRole("button", { name: "Save entry" });
  for (let number = 2; number <= 9; number += 1) {
    await add.click();
    await expect(editor.getByLabel(`Transfer ${number} quantity`)).toBeFocused();
  }

  const last = editor.getByRole("group", { name: "Transfer 9", exact: true });
  await expect(last.getByRole("combobox", { name: /from account/i })).toHaveValue("income");
  await expect(last.getByRole("combobox", { name: /unit/i })).toHaveValue("Euro");
  await expect(last.getByRole("combobox", { name: /to account/i })).toHaveValue("external");
  await expect(last.getByRole("textbox", { name: /quantity/i })).toHaveValue("");
  await expect(last).toBeInViewport({ ratio: 0.95 });
  await expect(editor.getByRole("group", { name: "Transfer 1", exact: true })).not.toBeInViewport();
  await expect(save).toBeInViewport({ ratio: 1 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await last.getByRole("button", { name: "Remove transfer 9" }).click();
  await expect(last).toHaveCount(0);
  await expect(editor.getByLabel("Transfer 8 quantity")).toBeFocused();
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
  const deleteButton = page.getByRole("button", { name: "Delete Delete me" });
  await deleteButton.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Delete transaction?" });
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Delete me")).toBeVisible();
  await deleteButton.press("Space");
  await dialog.getByRole("button", { name: "Delete transaction" }).click();
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

test.describe("daily balance charts", () => {
  test.use({ timezoneId: "Europe/Berlin", locale: "en-US" });

  test("fits full balance labels beside both charts on narrow screens", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await freezeDate(page, "2025-04-12T12:00:00.000Z");
    await page.goto("/");
    await loadDatabaseFile(page, await createDailyBalanceDatabaseFile(1_234_567_890_123.12));
    await gotoTab(page, "Analytics");
    await page.getByRole("combobox", { name: "Account" }).click();
    await page.getByRole("option", { name: "External" }).click();

    const labels = page.locator(".recharts-yAxis .recharts-cartesian-axis-tick-value");
    await expect(labels.first()).toHaveText(/^-1,234,567,890,\d{3}/);
    const labelsFit = () => labels.evaluateAll((ticks) =>
      ticks.length > 0 && ticks.every((tick) => {
        const chart = tick.closest("svg")!.getBoundingClientRect();
        const label = tick.getBoundingClientRect();
        return label.left >= chart.left && label.right <= Math.min(chart.right, window.innerWidth);
      }),
    );
    await expect.poll(labelsFit).toBe(true);

    await page.getByRole("button", { name: "Daily candles" }).click();
    await expect(page.locator("[data-candle-day]")).toHaveCount(3);
    await expect(labels.first()).toHaveText(/^-1,234,567,890,\d{3}/);
    await expect.poll(labelsFit).toBe(true);
  });

  test("uses elapsed days on the axis and shows the real daily balance range", async ({ page }) => {
    await freezeDate(page, "2025-04-12T12:00:00.000Z");
    await page.goto("/");
    await loadDatabaseFile(page, await createDailyBalanceDatabaseFile());
    await gotoTab(page, "Analytics");

    await expect(page.getByRole("button", { name: "Balance line" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".recharts-line-curve")).toBeVisible();
    await page.getByRole("button", { name: "Daily candles" }).click();

    const candles = page.locator("[data-candle-day]");
    await expect(candles).toHaveCount(3);
    const first = page.locator('[data-candle-day="2025-03-28"]');
    const second = page.locator('[data-candle-day="2025-03-30"]');
    const third = page.locator('[data-candle-day="2025-04-09"]');
    const centers = await candles.evaluateAll((elements) => elements.map((node) => {
      const { x, width } = node.getBoundingClientRect();
      return x + width / 2;
    }));
    expect((centers[2] - centers[1]) / (centers[1] - centers[0])).toBeCloseTo(5, 1);
    await expect(first).toHaveAttribute("aria-label", "2025-03-28, open 100 EUR, close 125 EUR");
    await expect(second).toHaveAttribute("aria-label", "2025-03-30, open 125 EUR, close 105 EUR");
    await expect(third).toHaveAttribute("aria-label", "2025-04-09, open 105 EUR, close 110 EUR");

    await first.hover();
    const tooltip = page.locator(".recharts-tooltip-wrapper");
    await expect(tooltip).toContainText("High140 EUR");
    await expect(tooltip).toContainText("Low100 EUR");
    await expect(tooltip).toContainText("Change+25 EUR");

    await page.getByRole("combobox", { name: "Time range" }).click();
    await page.getByRole("option", { name: "Last week" }).click();
    await expect(candles).toHaveCount(1);
    await expect(third).toBeVisible();

    await createTransactionInline(page, {
      description: "Replenishment",
      transfers: [{ from: "External", to: "Wallet", unit: "Euro", quantity: "7" }],
    });
    await gotoTab(page, "Analytics");
    await page.getByRole("button", { name: "Daily candles" }).click();
    await expect(candles).toHaveCount(2);
    await expect(page.locator('[data-candle-day="2025-04-12"]'))
      .toHaveAttribute("aria-label", "2025-04-12, open 110 EUR, close 117 EUR");
  });
});
