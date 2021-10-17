import * as path from "path";
import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  request,
  Platform,
} from "obsidian";
import * as CodeMirror from "codemirror";

import { ListObjectsCommand, S3Client } from "@aws-sdk/client-s3";

interface SaveRemotePluginSettings {
  s3Endpoint: string;
  s3Region: string;
  s3AccessKeyID: string;
  s3SecretAccessKey: string;
  s3BucketName: string;
}

const DEFAULT_SETTINGS: SaveRemotePluginSettings = {
  s3Endpoint: "",
  s3Region: "",
  s3AccessKeyID: "",
  s3SecretAccessKey: "",
  s3BucketName: "",
};

const ignoreHiddenFiles = (item: string) => {
  const basename = path.basename(item);
  return basename === "." || basename[0] !== ".";
};

const getTextToInsert = (x: any) => {
  return "\n```json\n" + JSON.stringify(x, null, 2) + "\n```\n";
};

export default class SaveRemotePlugin extends Plugin {
  settings: SaveRemotePluginSettings;
  cm: CodeMirror.Editor;

  async onload() {
    console.log("loading plugin obsidian-save-remote");

    await this.loadSettings();


    this.addRibbonIcon("dice", "Save Remote Plugin", async () => {
      new Notice(`checking connection`);

      const s3Client = new S3Client({
        region: this.settings.s3Region,
        endpoint: this.settings.s3Endpoint,
        credentials: {
          accessKeyId: this.settings.s3AccessKeyID,
          secretAccessKey: this.settings.s3SecretAccessKey,
        },
      });
      console.log(s3Client)

      try {
        const data = await s3Client.send(
          new ListObjectsCommand({
            Bucket: this.settings.s3BucketName,
          })
        );
        this.cm.replaceRange(
          getTextToInsert(data),
          CodeMirror.Pos(this.cm.lastLine())
        );
        new Notice("good!");
      } catch (err) {
        console.log("Error", err);
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
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
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
          .setValue(this.plugin.settings.s3Endpoint)
          .onChange(async (value) => {
            this.plugin.settings.s3Endpoint = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("s3Region")
      .setDesc("s3Region")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3Region}`)
          .onChange(async (value) => {
            this.plugin.settings.s3Region = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("s3AccessKeyID")
      .setDesc("s3AccessKeyID")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3AccessKeyID}`)
          .onChange(async (value) => {
            this.plugin.settings.s3AccessKeyID = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("s3SecretAccessKey")
      .setDesc("s3SecretAccessKey")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3SecretAccessKey}`)
          .onChange(async (value) => {
            this.plugin.settings.s3SecretAccessKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("s3BucketName")
      .setDesc("s3BucketName")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3BucketName}`)
          .onChange(async (value) => {
            this.plugin.settings.s3BucketName = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
