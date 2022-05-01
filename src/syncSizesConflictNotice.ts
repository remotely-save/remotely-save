import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type RemotelySavePlugin from "./main"; // unavoidable
import type { TransItemType } from "./i18n";
import type { FileOrFolderMixedState } from "./baseTypes";

import { log } from "./moreOnLog";

export class SizesConflictModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  readonly skipSizeLargerThan: number;
  readonly sizesGoWrong: FileOrFolderMixedState[];
  readonly hasPassword: boolean;
  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    skipSizeLargerThan: number,
    sizesGoWrong: FileOrFolderMixedState[],
    hasPassword: boolean
  ) {
    super(app);
    this.plugin = plugin;
    this.skipSizeLargerThan = skipSizeLargerThan;
    this.sizesGoWrong = sizesGoWrong;
    this.hasPassword = hasPassword;
  }
  onOpen() {
    let { contentEl } = this;
    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    contentEl.createEl("h2", {
      text: t("modal_sizesconflict_title"),
    });

    t("modal_sizesconflict_desc", {
      thresholdMB: `${this.skipSizeLargerThan / 1000 / 1000}`,
      thresholdBytes: `${this.skipSizeLargerThan}`,
    })
      .split("\n")
      .forEach((val) => {
        contentEl.createEl("p", { text: val });
      });

    const info = this.serialize();

    contentEl.createDiv().createEl(
      "button",
      {
        text: t("modal_sizesconflict_copybutton"),
      },
      (el) => {
        el.onclick = async () => {
          await navigator.clipboard.writeText(info);
          new Notice(t("modal_sizesconflict_copynotice"));
        };
      }
    );

    contentEl.createEl("pre", {
      text: info,
    });
  }

  serialize() {
    return this.sizesGoWrong
      .map((x) => {
        return [
          x.key,
          this.hasPassword
            ? `encrypted name: ${x.remoteEncryptedKey}`
            : undefined,
          `local ${this.hasPassword ? "encrypted " : ""}bytes: ${
            this.hasPassword ? x.sizeLocalEnc : x.sizeLocal
          }`,
          `remote ${this.hasPassword ? "encrypted " : ""}bytes: ${
            this.hasPassword ? x.sizeRemoteEnc : x.sizeRemote
          }`,
        ]
          .filter((tmp) => tmp !== undefined)
          .join("\n");
      })
      .join("\n\n");
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}
