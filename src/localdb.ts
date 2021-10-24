import * as lf from "lovefield-ts/dist/es6/lf.js";
import { TAbstractFile, TFile, TFolder } from "obsidian";

export type DatabaseConnection = lf.DatabaseConnection;

export const DEFAULT_DB_NAME = "saveremotedb";
export const DEFAULT_TBL_DELETE_HISTORY = "filefolderoperationhistory";

export interface FileFolderHistoryRecord {
  key: string;
  ctime: number;
  mtime: number;
  size: number;
  action_when: number;
  action_type: "delete" | "rename";
  key_type: "folder" | "file";
  rename_to: string;
}

export const prepareDB = async () => {
  const schemaBuilder = lf.schema.create(DEFAULT_DB_NAME, 1);
  schemaBuilder
    .createTable(DEFAULT_TBL_DELETE_HISTORY)
    .addColumn("id", lf.Type.INTEGER)
    .addColumn("key", lf.Type.STRING)
    .addColumn("ctime", lf.Type.INTEGER)
    .addColumn("mtime", lf.Type.INTEGER)
    .addColumn("size", lf.Type.INTEGER)
    .addColumn("action_when", lf.Type.INTEGER)
    .addColumn("action_type", lf.Type.STRING)
    .addColumn("key_type", lf.Type.STRING)
    .addPrimaryKey(["id"], true)
    .addIndex("idxKey", ["key"]);
  const db = await schemaBuilder.connect({
    storeType: lf.DataStoreType.INDEXED_DB,
  });
  console.log("db connected");
  return db;
};

export const destroyDB = async (db: lf.DatabaseConnection) => {
  db.close();
  const req = indexedDB.deleteDatabase(DEFAULT_DB_NAME);
  req.onsuccess = (event) => {
    console.log("db deleted");
  };
  req.onblocked = (event) => {
    console.warn("trying to delete db but it was blocked");
  };
  req.onerror = (event) => {
    console.error("tried to delete db but something bad!");
    console.error(event);
  };
};

export const loadHistoryTable = async (db: lf.DatabaseConnection) => {
  const schema = db.getSchema().table(DEFAULT_TBL_DELETE_HISTORY);
  const tbl = db.getSchema().table(DEFAULT_TBL_DELETE_HISTORY);

  const records = await db
    .select()
    .from(schema)
    .orderBy(schema.col("action_when"), lf.Order.ASC)
    .exec();

  return records as FileFolderHistoryRecord[];
};

export const clearHistoryOfKey = async (
  db: lf.DatabaseConnection,
  key: string
) => {
  const schema = db.getSchema().table(DEFAULT_TBL_DELETE_HISTORY);
  const tbl = db.getSchema().table(DEFAULT_TBL_DELETE_HISTORY);

  await db.delete().from(tbl).where(tbl.col("key").eq(key)).exec();
};

export const insertDeleteRecord = async (
  db: lf.DatabaseConnection,
  fileOrFolder: TAbstractFile
) => {
  const schema = db.getSchema().table(DEFAULT_TBL_DELETE_HISTORY);
  const tbl = db.getSchema().table(DEFAULT_TBL_DELETE_HISTORY);
  // console.log(fileOrFolder);
  let k: FileFolderHistoryRecord;
  if (fileOrFolder instanceof TFile) {
    k = {
      key: fileOrFolder.path,
      ctime: fileOrFolder.stat.ctime,
      mtime: fileOrFolder.stat.mtime,
      size: fileOrFolder.stat.size,
      action_when: Date.now(),
      action_type: "delete",
      key_type: "file",
      rename_to: "",
    };
  } else if (fileOrFolder instanceof TFolder) {
    // key should endswith "/"
    const key = fileOrFolder.path.endsWith("/")
      ? fileOrFolder.path
      : `${fileOrFolder.path}/`;
    k = {
      key: key,
      ctime: 0,
      mtime: 0,
      size: 0,
      action_when: Date.now(),
      action_type: "delete",
      key_type: "folder",
      rename_to: "",
    };
  }
  const row = tbl.createRow(k);
  await db.insertOrReplace().into(tbl).values([row]).exec();
};

export const insertRenameRecord = async (
  db: lf.DatabaseConnection,
  fileOrFolder: TAbstractFile,
  oldPath: string
) => {
  const schema = db.getSchema().table(DEFAULT_TBL_DELETE_HISTORY);
  const tbl = db.getSchema().table(DEFAULT_TBL_DELETE_HISTORY);
  // console.log(fileOrFolder);
  let k: FileFolderHistoryRecord;
  if (fileOrFolder instanceof TFile) {
    k = {
      key: oldPath,
      ctime: fileOrFolder.stat.ctime,
      mtime: fileOrFolder.stat.mtime,
      size: fileOrFolder.stat.size,
      action_when: Date.now(),
      action_type: "rename",
      key_type: "file",
      rename_to: fileOrFolder.path,
    };
  } else if (fileOrFolder instanceof TFolder) {
    const key = oldPath.endsWith("/") ? oldPath : `${oldPath}/`;
    const renameTo = fileOrFolder.path.endsWith("/")
      ? fileOrFolder.path
      : `${fileOrFolder.path}/`;
    k = {
      key: key,
      ctime: 0,
      mtime: 0,
      size: 0,
      action_when: Date.now(),
      action_type: "rename",
      key_type: "folder",
      rename_to: renameTo,
    };
  }
  const row = tbl.createRow(k);
  await db.insertOrReplace().into(tbl).values([row]).exec();
};

export const getAllRecords = async (db: lf.DatabaseConnection) => {
  const schema = db.getSchema().table(DEFAULT_TBL_DELETE_HISTORY);
  const res1 = await db.select().from(schema).exec();
  const res2 = res1 as FileFolderHistoryRecord[];
  return res2;
};
