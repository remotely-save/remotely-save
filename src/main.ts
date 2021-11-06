import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  request,
  Platform,
  TFile,
  TFolder,
} from "obsidian";
import * as CodeMirror from "codemirror";
import type { DatabaseConnection } from "./localdb";
import {
  prepareDBs,
  destroyDBs,
  loadDeleteRenameHistoryTable,
  insertDeleteRecord,
  insertRenameRecord,
  getAllDeleteRenameRecords,
} from "./localdb";

import type { SyncStatusType } from "./sync";
import { ensembleMixedStates, getOperation, doActualSync } from "./sync";
import { DEFAULT_S3_CONFIG, getS3Client, listFromRemote, S3Config } from "./s3";

interface SaveRemotePluginSettings {
  s3?: S3Config;
  password?: string;
}

const DEFAULT_SETTINGS: SaveRemotePluginSettings = {
  s3: DEFAULT_S3_CONFIG,
  password: "",
};

export default class SaveRemotePlugin extends Plugin {
  settings: SaveRemotePluginSettings;
  cm: CodeMirror.Editor;
  db: DatabaseConnection;
  syncStatus: SyncStatusType;

  async onload() {
    console.log("loading plugin obsidian-save-remote");

    await this.loadSettings();

    await this.prepareDB();

    this.syncStatus = "idle";

    this.registerEvent(
      this.app.vault.on("delete", async (fileOrFolder) => {
        await insertDeleteRecord(this.db, fileOrFolder);
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", async (fileOrFolder, oldPath) => {
        await insertRenameRecord(this.db, fileOrFolder, oldPath);
      })
    );

    this.addRibbonIcon("switch", "Save Remote", async () => {
      if (this.syncStatus !== "idle") {
        new Notice(`Save Remote already running in stage ${this.syncStatus}!`);
        return;
      }

      try {
        new Notice("1/6 Save Remote Sync Preparing");
        this.syncStatus = "preparing";

        new Notice("2/6 Starting to fetch remote meta data.");
        this.syncStatus = "getting_remote_meta";
        const s3Client = getS3Client(this.settings.s3);
        const remoteRsp = await listFromRemote(s3Client, this.settings.s3);

        new Notice("3/6 Starting to fetch local meta data.");
        this.syncStatus = "getting_local_meta";
        const local = this.app.vault.getAllLoadedFiles();
        const localHistory = await loadDeleteRenameHistoryTable(this.db);
        // console.log(remoteRsp);
        // console.log(local);
        // console.log(localHistory);

        new Notice("4/6 Starting to generate sync plan.");
        this.syncStatus = "generating_plan";
        const mixedStates = await ensembleMixedStates(
          remoteRsp.Contents,
          local,
          localHistory,
          this.db,
          this.settings.password
        );

        for (const [key, val] of Object.entries(mixedStates)) {
          getOperation(val, true);
        }

        console.log(mixedStates);

        // The operations above are read only and kind of safe.
        // The operations below begins to write or delete (!!!) something.

        new Notice("5/6 Save Remote Sync data exchanging!");

        this.syncStatus = "syncing";
        await doActualSync(
          s3Client,
          this.settings.s3,
          this.db,
          this.app.vault,
          mixedStates,
          this.settings.password
        );

        new Notice("6/6 Save Remote finish!");
        this.syncStatus = "finish";
        this.syncStatus = "idle";
      } catch (error) {
        this.syncStatus = "idle";
        const msg = `Save Remote error while ${this.syncStatus}`;
        console.log(msg);
        console.log(error);
        new Notice(msg);
        new Notice(error);
      }
    });

    this.addSettingTab(new SaveRemoteSettingTab(this.app, this));

    this.registerCodeMirror((cm: CodeMirror.Editor) => {
      this.cm = cm;
      console.log("codemirror registered.");
    });

    // this.registerDomEvent(document, "click", (evt: MouseEvent) => {
    //   console.log("click", evt);
    // });

    // this.registerInterval(
    //   window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
    // );
  }

  onunload() {
    console.log("unloading plugin obsidian-save-remote");
    this.destroyDBs();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async prepareDB() {
    this.db = await prepareDBs();
  }

  destroyDBs() {
    /* destroyDBs(this.db); */
  }
}

class SaveRemoteSettingTab extends PluginSettingTab {
  plugin: SaveRemotePlugin;

  constructor(app: App, plugin: SaveRemotePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", { text: "Settings for Save Remote" });

    new Setting(containerEl)
      .setName("s3Endpoint")
      .setDesc("s3Endpoint")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.s3.s3Endpoint)
          .onChange(async (value) => {
            this.plugin.settings.s3.s3Endpoint = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("s3Region")
      .setDesc("s3Region")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3.s3Region}`)
          .onChange(async (value) => {
            this.plugin.settings.s3.s3Region = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("s3AccessKeyID")
      .setDesc("s3AccessKeyID")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3.s3AccessKeyID}`)
          .onChange(async (value) => {
            this.plugin.settings.s3.s3AccessKeyID = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("s3SecretAccessKey")
      .setDesc("s3SecretAccessKey")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3.s3SecretAccessKey}`)
          .onChange(async (value) => {
            this.plugin.settings.s3.s3SecretAccessKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("s3BucketName")
      .setDesc("s3BucketName")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3.s3BucketName}`)
          .onChange(async (value) => {
            this.plugin.settings.s3.s3BucketName = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("password")
      .setDesc("password")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.password}`)
          .onChange(async (value) => {
            this.plugin.settings.password = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
