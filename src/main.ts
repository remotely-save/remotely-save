import * as path from 'path';
import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
} from 'obsidian';
import * as CodeMirror from 'codemirror';

import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

interface SaveRemotePluginSettings {
  s3Endpoint: string;
  s3Region: string;
  s3AccessKeyID: string;
  s3SecretAccessKey: string;
  s3BucketName: string;
}

const DEFAULT_SETTINGS: SaveRemotePluginSettings = {
  s3Endpoint: '',
  s3Region: '',
  s3AccessKeyID: '',
  s3SecretAccessKey: '',
  s3BucketName: '',
};

const ignoreHiddenFiles = (item: string) => {
  const basename = path.basename(item);
  return basename === '.' || basename[0] !== '.';
};

const getTextToInsert = (x: any) => {
  return '\n```json\n' + JSON.stringify(x, null, 2) + '\n```\n';
};

export default class SaveRemotePlugin extends Plugin {
  settings: SaveRemotePluginSettings;
  cm: CodeMirror.Editor;

  async onload() {
    console.log('loading plugin obsidian-save-remote');

    await this.loadSettings();

    this.addRibbonIcon('dice', 'Save Remote Plugin', async () => {
      // console.log(this.app.vault.getFiles());
      // console.log(this.app.vault.getAllLoadedFiles());
      new Notice(`checking connection`);

      const s3Client = new S3Client({
        region: this.settings.s3Region,
        endpoint: this.settings.s3Endpoint,
        credentials: {
          accessKeyId: this.settings.s3AccessKeyID,
          secretAccessKey: this.settings.s3SecretAccessKey,
        },
      });

      try {
        const allFilesAndFolders = this.app.vault.getAllLoadedFiles();
        for (const fileOrFolder of allFilesAndFolders) {
          if (fileOrFolder.path === '/') {
            console.log('ignore "/"');
          } else if ('children' in fileOrFolder) {
            // folder
            console.log(`folder ${fileOrFolder.path}/`);
            new Notice(`folder ${fileOrFolder.path}/`);

            const results = await s3Client.send(
              new PutObjectCommand({
                Bucket: this.settings.s3BucketName,
                Key: `${fileOrFolder.path}/`,
                Body: '',
              })
            );
          } else {
            // file
            console.log(`file ${fileOrFolder.path}`);
            const strContent = await this.app.vault.adapter.read(
              fileOrFolder.path
            );
            new Notice(`file ${fileOrFolder.path}`);
            const results = await s3Client.send(
              new PutObjectCommand({
                Bucket: this.settings.s3BucketName,
                Key: `${fileOrFolder.path}`,
                Body: strContent,
              })
            );
          }
        }
      } catch (err) {
        console.log('Error', err);
        new Notice(`${err}`);
      }
    });

    this.addSettingTab(new SaveRemoteSettingTab(this.app, this));

    this.registerCodeMirror((cm: CodeMirror.Editor) => {
      this.cm = cm;
      console.log('codemirror registered.');
    });

    // this.registerDomEvent(document, "click", (evt: MouseEvent) => {
    //   console.log("click", evt);
    // });

    // this.registerInterval(
    //   window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
    // );
  }

  onunload() {
    console.log('unloading plugin obsidian-save-remote');
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

    containerEl.createEl('h2', { text: 'Settings for Save Remote' });

    new Setting(containerEl)
      .setName('s3Endpoint')
      .setDesc('s3Endpoint')
      .addText((text) =>
        text
          .setPlaceholder('')
          .setValue(this.plugin.settings.s3Endpoint)
          .onChange(async (value) => {
            this.plugin.settings.s3Endpoint = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('s3Region')
      .setDesc('s3Region')
      .addText((text) =>
        text
          .setPlaceholder('')
          .setValue(`${this.plugin.settings.s3Region}`)
          .onChange(async (value) => {
            this.plugin.settings.s3Region = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('s3AccessKeyID')
      .setDesc('s3AccessKeyID')
      .addText((text) =>
        text
          .setPlaceholder('')
          .setValue(`${this.plugin.settings.s3AccessKeyID}`)
          .onChange(async (value) => {
            this.plugin.settings.s3AccessKeyID = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('s3SecretAccessKey')
      .setDesc('s3SecretAccessKey')
      .addText((text) =>
        text
          .setPlaceholder('')
          .setValue(`${this.plugin.settings.s3SecretAccessKey}`)
          .onChange(async (value) => {
            this.plugin.settings.s3SecretAccessKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('s3BucketName')
      .setDesc('s3BucketName')
      .addText((text) =>
        text
          .setPlaceholder('')
          .setValue(`${this.plugin.settings.s3BucketName}`)
          .onChange(async (value) => {
            this.plugin.settings.s3BucketName = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
