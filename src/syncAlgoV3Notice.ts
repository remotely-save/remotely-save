import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type RemotelySavePlugin from "./main"; // unavoidable
import type { TransItemType } from "./i18n";

import { log } from "./moreOnLog";

export class SyncAlgoV3Modal extends Modal {
  agree: boolean;
  readonly plugin: RemotelySavePlugin;
  constructor(app: App, plugin: RemotelySavePlugin) {
    super(app);
    this.plugin = plugin;
    this.agree = false;
  }
  onOpen() {
    let { contentEl } = this;
    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    contentEl.createEl("h2", {
      text: t("syncalgov3_title"),
    });

    const ul = contentEl.createEl("ul");
    t("syncalgov3_texts")
      .split("\n")
      .forEach((val) => {
        ul.createEl("li", {
          text: val,
        });
      });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText(t("syncalgov3_button_agree"));
        button.onClick(async () => {
          this.agree = true;
          this.close();
        });
      })
      .addButton((button) => {
        button.setButtonText(t("syncalgov3_button_disagree"));
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
      this.plugin.enableInitSyncIfSet();
      this.plugin.enableSyncOnSaveIfSet();
    } else {
      log.info("do not agree to use the new algorithm");
      this.plugin.unload();
    }
  }
}
