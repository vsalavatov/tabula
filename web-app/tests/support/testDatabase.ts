import initSqlJs, {type Database} from "sql.js";

export type UploadableDatabaseFile = {
  name: string;
  mimeType: string;
  buffer: Buffer;
};

const SQLITE_MIME_TYPE = "application/x-sqlite3";
const DB_USER_VERSION = 6;

const BASE_SCHEMA_SQL = `
  CREATE TABLE Units (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    mantissaLength INTEGER NOT NULL
  );
  CREATE TABLE Accounts (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    owning INTEGER NOT NULL CHECK (owning == 0 OR owning == 1),
    archived INTEGER NOT NULL CHECK (archived == 0 OR archived == 1) DEFAULT 0
  );
  CREATE TABLE Assets (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    account INTEGER NOT NULL REFERENCES Accounts(id),
    unit INTEGER NOT NULL REFERENCES Units(id),
    quantity REAL NOT NULL,
    UNIQUE (account, unit)
  );
  CREATE TABLE Transactions (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    description TEXT NOT NULL
  );
  CREATE TABLE Transfers (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    transaction_ INTEGER NOT NULL REFERENCES Transactions(id),
    accountFrom INTEGER NOT NULL REFERENCES Accounts(id),
    accountTo INTEGER NOT NULL REFERENCES Accounts(id),
    unit INTEGER NOT NULL REFERENCES Units(id),
    delta REAL NOT NULL
  );
`;

type SeedDatabase = (db: Database) => void;

async function createDatabaseFile(name: string, seedDatabase: SeedDatabase): Promise<UploadableDatabaseFile> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  try {
    db.exec(BASE_SCHEMA_SQL);
    seedDatabase(db);
    db.exec(`PRAGMA user_version = ${DB_USER_VERSION};`);
    return {
      name,
      mimeType: SQLITE_MIME_TYPE,
      buffer: Buffer.from(db.export()),
    };
  } finally {
    db.close();
  }
}

export async function createUploadableDatabaseFile(): Promise<UploadableDatabaseFile> {
  return createDatabaseFile("manual-import.db", (db) => {
    db.exec(`
      INSERT INTO Units (name, symbol, mantissaLength) VALUES ('Imported Euro', 'EUR', 2);
      INSERT INTO Accounts (name, owning, archived) VALUES ('Imported Wallet', 1, 0);
      INSERT INTO Assets (account, unit, quantity) VALUES (1, 1, 42.5);
    `);
  });
}

export async function createKeyboardDefaultsDatabaseFile(): Promise<UploadableDatabaseFile> {
  return createDatabaseFile("keyboard-defaults.db", (db) => {
    db.exec(`
      INSERT INTO Units (id, name, symbol, mantissaLength) VALUES (1, 'Euro', 'EUR', 2);
      INSERT INTO Accounts (id, name, owning, archived) VALUES
        (1, 'groceries', 1, 0),
        (2, 'external', 0, 0),
        (3, 'income', 1, 0);
      INSERT INTO Assets (account, unit, quantity) VALUES
        (1, 1, -26),
        (2, 1, -49),
        (3, 1, 75);
      INSERT INTO Transactions (id, timestamp, description) VALUES
        (1, 1743760800000, 'food'),
        (2, 1743760800001, 'salary'),
        (3, 1743850800000, 'stuff');
      INSERT INTO Transfers (id, transaction_, accountFrom, accountTo, unit, delta) VALUES
        (1, 1, 1, 2, 1, 26),
        (2, 2, 2, 3, 1, 100),
        (3, 3, 3, 2, 1, 25);
    `);
  });
}

export async function createSavingsAutocompleteDatabaseFile(): Promise<UploadableDatabaseFile> {
  return createDatabaseFile("savings-autocomplete.db", (db) => {
    db.exec(`
      INSERT INTO Units (id, name, symbol, mantissaLength) VALUES (1, 'Euro', 'EUR', 2);
      INSERT INTO Accounts (id, name, owning, archived) VALUES
        (1, 'Income', 1, 0),
        (2, 'Savings', 1, 0),
        (3, 'Savings for car', 1, 0),
        (4, 'Savings for house', 1, 0),
        (5, 'External', 0, 0);
      INSERT INTO Assets (account, unit, quantity) VALUES
        (1, 1, 100),
        (2, 1, 0),
        (3, 1, 0),
        (4, 1, 0),
        (5, 1, -100);
      INSERT INTO Transactions (id, timestamp, description) VALUES
        (1, 1743850800000, 'seed salary');
      INSERT INTO Transfers (id, transaction_, accountFrom, accountTo, unit, delta) VALUES
        (1, 1, 1, 5, 1, 100);
    `);
  });
}

export async function createLongRegisterDatabaseFile(): Promise<UploadableDatabaseFile> {
  return createDatabaseFile("long-register.db", (db) => {
    db.exec(`
      INSERT INTO Units (id, name, symbol, mantissaLength) VALUES (1, 'Euro', 'EUR', 2);
      INSERT INTO Accounts (id, name, owning, archived) VALUES
        (1, 'wallet', 1, 0),
        (2, 'external', 0, 0);
    `);

    const transactionInsert = db.prepare("INSERT INTO Transactions (id, timestamp, description) VALUES (?, ?, ?)");
    const transferInsert = db.prepare("INSERT INTO Transfers (id, transaction_, accountFrom, accountTo, unit, delta) VALUES (?, ?, ?, ?, ?, ?)");
    for (let index = 1; index <= 45; index += 1) {
      const day = ((index - 1) % 25) + 1;
      const timestamp = Date.UTC(2025, 3, day, 12, 0, 0, index);
      transactionInsert.run([index, timestamp, `Seeded transaction ${index}`]);
      transferInsert.run([index, index, 1, 2, 1, index]);
    }
    transactionInsert.free();
    transferInsert.free();
  });
}

export async function createWindowedOlderDateDatabaseFile(): Promise<UploadableDatabaseFile> {
  return createDatabaseFile("windowed-older-date.db", (db) => {
    db.exec(`
      INSERT INTO Units (id, name, symbol, mantissaLength) VALUES (1, 'Euro', 'EUR', 2);
      INSERT INTO Accounts (id, name, owning, archived) VALUES
        (1, 'wallet', 1, 0),
        (2, 'external', 0, 0);
    `);

    const transactionInsert = db.prepare("INSERT INTO Transactions (id, timestamp, description) VALUES (?, ?, ?)");
    const transferInsert = db.prepare("INSERT INTO Transfers (id, transaction_, accountFrom, accountTo, unit, delta) VALUES (?, ?, ?, ?, ?, ?)");
    const baseTime = Date.UTC(2025, 0, 1, 12, 0, 0, 0);
    for (let index = 1; index <= 140; index += 1) {
      const timestamp = baseTime + index * 86_400_000 + index;
      transactionInsert.run([index, timestamp, `Windowed transaction ${index}`]);
      transferInsert.run([index, index, 1, 2, 1, index]);
    }
    transactionInsert.free();
    transferInsert.free();
  });
}

export async function createMassiveHistoryDatabaseFile(): Promise<UploadableDatabaseFile> {
  return createDatabaseFile("massive-history.db", (db) => {
    db.exec(`
      INSERT INTO Units (id, name, symbol, mantissaLength) VALUES (1, 'Euro', 'EUR', 2);
      INSERT INTO Accounts (id, name, owning, archived) VALUES
        (1, 'wallet', 1, 0),
        (2, 'external', 0, 0);
    `);

    const transactionInsert = db.prepare("INSERT INTO Transactions (id, timestamp, description) VALUES (?, ?, ?)");
    const transferInsert = db.prepare("INSERT INTO Transfers (id, transaction_, accountFrom, accountTo, unit, delta) VALUES (?, ?, ?, ?, ?, ?)");
    const baseTime = Date.UTC(2021, 0, 1, 12, 0, 0, 0);
    let transactionId = 1;
    let transferId = 1;
    for (let dayIndex = 0; dayIndex < 365 * 5; dayIndex += 1) {
      const dayBase = baseTime + dayIndex * 86_400_000;
      for (let transferIndex = 0; transferIndex < 5; transferIndex += 1) {
        const timestamp = dayBase + transferIndex * 60_000 + transactionId;
        transactionInsert.run([transactionId, timestamp, `Massive transaction ${transactionId}`]);
        transferInsert.run([transferId, transactionId, 1, 2, 1, transactionId]);
        transactionId += 1;
        transferId += 1;
      }
    }
    transactionInsert.free();
    transferInsert.free();
  });
}
