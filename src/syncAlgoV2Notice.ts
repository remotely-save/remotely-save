import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type RemotelySavePlugin from "./main"; // unavoidable
import * as origLog from "loglevel";
const log = origLog.getLogger("rs-default");

export class SyncAlgoV2Modal extends Modal {
  agree: boolean;
  readonly plugin: RemotelySavePlugin;
  constructor(app: App, plugin: RemotelySavePlugin) {
    super(app);
    this.plugin = plugin;
    this.agree = false;
  }
  onOpen() {
    let { contentEl } = this;
    contentEl.createEl("h2", {
      text: "Remotely Save has a better sync algorithm",
    });

    const texts = [
      "Welcome to use Remotely Save!",

      "From version 0.3.0, a new algorithm has been developed, but it needs uploading extra meta data files _remotely-save-metadata-on-remote.{json,bin} to YOUR configured cloud destinations, besides your notes.",

      "So that, for example, the second device can know that what files/folders have been deleted on the first device by reading those files.",

      'If you agree, plase click the button "agree", and enjoy the plugin! AND PLEASE REMEMBER TO BACKUP YOUR VAULT FIRSTLY!',

      'If you do not agree, you should stop using the current and later versions of Remotely Save. You could consider manually install the old version 0.2.14 which uses old algorithm and does not upload any extra meta data files. By clicking the "Do not agree" button, the plugin will unload itself, and you need to manually disable it in Obsidian settings.',
    ];

    const ul = contentEl.createEl("ul");

    for (const t of texts) {
      ul.createEl("li", {
        text: t,
      });
    }

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Agree");
        button.onClick(async () => {
          this.agree = true;
          this.close();
        });
      })
      .addButton((button) => {
        button.setButtonText("Do not agree");
        button.onClick(() => {
          this.close();
        });
      });
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
    if (this.agree) {
      log.info("agree to use the new algorithm");
      this.plugin.saveAgreeToUseNewSyncAlgorithm();
      this.plugin.enableAutoSyncIfSet();
    } else {
      log.info("do not agree to use the new algorithm");
      this.plugin.unload();
    }
  }
}
