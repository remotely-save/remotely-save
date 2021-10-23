import * as lf from "lovefield-ts/dist/es6/lf.js";

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

export async function prepareDB() {
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
}

export function destroyDB(db: lf.DatabaseConnection) {
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
}
