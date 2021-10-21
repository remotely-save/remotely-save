import * as path from "path";
import * as fs from "fs";
import { Buffer } from "buffer";
import { Readable } from "stream";
import * as mime from "mime-types";
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

import {
  S3Client,
  ListObjectsCommand,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

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

/**
 * Util func for mkdir -p based on the "path" of original file or folder
 * "a/b/c/" => ["a", "a/b", "a/b/c"]
 * "a/b/c/d/e.txt" => ["a", "a/b", "a/b/c", "a/b/c/d"]
 * @param x string
 * @returns string[] might be empty
 */
const getFolderLevels = (x: string) => {
  const res: string[] = [];

  if (x === "" || x === "/") {
    return res;
  }

  const y1 = x.split("/");
  let i = 0;
  for (let index = 0; index + 1 < y1.length; index++) {
    res.push(y1.slice(0, index + 1).join("/"));
  }
  return res;
};

/**
 * https://stackoverflow.com/questions/8609289
 * @param b Buffer
 * @returns ArrayBuffer
 */
const bufferToArrayBuffer = (b: Buffer) => {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

/**
 * The Body of resp of aws GetObject has mix types
 * and we want to get ArrayBuffer here.
 * See https://github.com/aws/aws-sdk-js-v3/issues/1877
 * @param b The Body of GetObject
 * @returns Promise<ArrayBuffer>
 */
const getObjectBodyToArrayBuffer = async (
  b: Readable | ReadableStream | Blob
) => {
  if (b instanceof Readable) {
    const chunks: Uint8Array[] = [];
    for await (let chunk of b) {
      chunks.push(chunk);
    }
    const buf = Buffer.concat(chunks);
    return bufferToArrayBuffer(buf);
  } else if (b instanceof ReadableStream) {
    return await new Response(b, {}).arrayBuffer();
  } else if (b instanceof Blob) {
    return await b.arrayBuffer();
  } else {
    throw TypeError(`The type of ${b} is not one of the supported types`);
  }
};

export default class SaveRemotePlugin extends Plugin {
  settings: SaveRemotePluginSettings;
  cm: CodeMirror.Editor;

  async onload() {
    console.log("loading plugin obsidian-save-remote");

    await this.loadSettings();

    this.addRibbonIcon("right-arrow-with-tail", "Upload", async () => {
      // console.log(this.app.vault.getFiles());
      // console.log(this.app.vault.getAllLoadedFiles());
      new Notice(`Upload begun.`);
      const allFilesAndFolders = this.app.vault.getAllLoadedFiles();

      const s3Client = new S3Client({
        region: this.settings.s3Region,
        endpoint: this.settings.s3Endpoint,
        credentials: {
          accessKeyId: this.settings.s3AccessKeyID,
          secretAccessKey: this.settings.s3SecretAccessKey,
        },
      });

      try {
        for (const fileOrFolder of allFilesAndFolders) {
          if (fileOrFolder.path === "/") {
            console.log('ignore "/"');
          } else if ("children" in fileOrFolder) {
            // folder
            console.log(`folder ${fileOrFolder.path}/`);
            new Notice(`folder ${fileOrFolder.path}/`);

            const results = await s3Client.send(
              new PutObjectCommand({
                Bucket: this.settings.s3BucketName,
                Key: `${fileOrFolder.path}/`,
                Body: "",
              })
            );
          } else {
            // file
            console.log(`file ${fileOrFolder.path}`);
            const arrContent = await this.app.vault.adapter.readBinary(
              fileOrFolder.path
            );
            new Notice(`file ${fileOrFolder.path}`);
            const results = await s3Client.send(
              new PutObjectCommand({
                Bucket: this.settings.s3BucketName,
                Key: `${fileOrFolder.path}`,
                Body: Buffer.from(arrContent),
                ContentType:
                  mime.contentType(`${fileOrFolder.path}`) || undefined,
              })
            );
          }
        }
        new Notice("Upload finished!");
      } catch (err) {
        console.log("Error", err);
        new Notice(`${err}`);
      }
    });

    this.addRibbonIcon("left-arrow-with-tail", "Download", async () => {
      const allFilesAndFolders = this.app.vault.getAllLoadedFiles();

      const s3Client = new S3Client({
        region: this.settings.s3Region,
        endpoint: this.settings.s3Endpoint,
        credentials: {
          accessKeyId: this.settings.s3AccessKeyID,
          secretAccessKey: this.settings.s3SecretAccessKey,
        },
      });

      try {
        const listObj = await s3Client.send(
          new ListObjectsCommand({ Bucket: this.settings.s3BucketName })
        );

        for (const singleContent of listObj.Contents) {
          const foldersToBuild = getFolderLevels(singleContent.Key);
          for (const folder of foldersToBuild) {
            const r = await this.app.vault.adapter.exists(folder);
            if (!r) {
              console.log(`mkdir ${folder}`);
              new Notice(`mkdir ${folder}`);
              await this.app.vault.adapter.mkdir(folder);
            }
          }

          if (singleContent.Key.endsWith("/")) {
            // kind of a folder
            // pass
          } else {
            // kind of a file
            // download

            console.log(`download file ${singleContent.Key}`);
            new Notice(`download file ${singleContent.Key}`);

            const data = await s3Client.send(
              new GetObjectCommand({
                Bucket: this.settings.s3BucketName,
                Key: singleContent.Key,
              })
            );
            const bodyContents = await getObjectBodyToArrayBuffer(data.Body);
            await this.app.vault.adapter.writeBinary(
              singleContent.Key,
              bodyContents
            );
          }
        }

        new Notice("Download finished!");
      } catch (err) {
        console.log("Error", err);
        new Notice(`${err}`);
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
