import { type App, Modal, Notice, Setting } from "obsidian";
import { FakeFsLocal } from "../../src/fsLocal";
import type { TransItemType } from "../../src/i18n";
import type RemotelySavePlugin from "../../src/main";
import { stringToFragment } from "../../src/misc";
import { clearDupFiles, getDupFiles } from "./clearDupFiles";

class ClearDupFilesModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  readonly t: (x: TransItemType, vars?: any) => string;
  readonly files: string[];
  readonly fsLocal: FakeFsLocal;
  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    t: (x: TransItemType, vars?: any) => string,
    files: string[],
    fsLocal: FakeFsLocal
  ) {
    super(app);
    this.plugin = plugin;
    this.t = t;
    this.files = files;
    this.fsLocal = fsLocal;
  }

  async onOpen() {
    const t = this.t;
    const { contentEl } = this;

    contentEl.createEl("p", {
      text: t("modal_cleardupfiles_warning"),
    });

    contentEl.createEl("pre").createEl("code", {
      text: this.files.join("\n"),
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText(t("modal_cleardupfiles_warning_confirm"));
        button.onClick(async () => {
          await clearDupFiles(this.files, this.fsLocal);
          new Notice(t("modal_cleardupfiles_warning_finished"));
          this.close();
        });
      })
      .addButton((button) => {
        button.setButtonText(t("goback"));
        button.onClick(() => {
          this.close();
        });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export const generateClearDupFilesSettingsPart = (
  containerEl: HTMLElement,
  t: (x: TransItemType, vars?: any) => string,
  app: App,
  plugin: RemotelySavePlugin
) => {
  new Setting(containerEl)
    .setName(t("settings_cleardupfiles"))
    .setDesc(stringToFragment(t("settings_cleardupfiles_desc")))
    .addButton(async (button) => {
      button.setButtonText(t("settings_cleardupfiles_button"));
      button.onClick(async () => {
        const fsLocal = new FakeFsLocal(
          app.vault,
          plugin.settings.syncConfigDir ?? false,
          plugin.settings.syncBookmarks ?? false,
          app.vault.configDir,
          plugin.manifest.id,
          undefined,
          plugin.settings.deleteToWhere ?? "system"
        );

        const files = await getDupFiles(fsLocal);

        const modal = new ClearDupFilesModal(app, plugin, t, files, fsLocal);
        modal.open();
      });
    });
};
