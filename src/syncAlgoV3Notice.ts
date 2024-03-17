import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type RemotelySavePlugin from "./main"; // unavoidable
import type { TransItemType } from "./i18n";

import { stringToFragment } from "./misc";

export class SyncAlgoV3Modal extends Modal {
  agree: boolean;
  manualBackup: boolean;
  requireUpdateAllDev: boolean;
  readonly plugin: RemotelySavePlugin;
  constructor(app: App, plugin: RemotelySavePlugin) {
    super(app);
    this.plugin = plugin;
    this.agree = false;
    this.manualBackup = false;
    this.requireUpdateAllDev = false;
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
          text: stringToFragment(val),
        });
      });

    // code modified partially from BART released under MIT License
    contentEl.createDiv("modal-button-container", (buttonContainerEl) => {
      let agreeBtn: HTMLButtonElement | undefined = undefined;

      buttonContainerEl.createEl(
        "label",
        {
          cls: "mod-checkbox",
        },
        (labelEl) => {
          const checkboxEl = labelEl.createEl("input", {
            attr: { tabindex: -1 },
            type: "checkbox",
          });
          checkboxEl.checked = this.manualBackup;
          checkboxEl.addEventListener("click", () => {
            this.manualBackup = checkboxEl.checked;
            if (agreeBtn !== undefined) {
              if (this.manualBackup && this.requireUpdateAllDev) {
                agreeBtn.removeAttribute("disabled");
              } else {
                agreeBtn.setAttr("disabled", true);
              }
            }
          });
          labelEl.appendText(t("syncalgov3_checkbox_manual_backup"));
        }
      );

      buttonContainerEl.createEl(
        "label",
        {
          cls: "mod-checkbox",
        },
        (labelEl) => {
          const checkboxEl = labelEl.createEl("input", {
            attr: { tabindex: -1 },
            type: "checkbox",
          });
          checkboxEl.checked = this.requireUpdateAllDev;
          checkboxEl.addEventListener("click", () => {
            this.requireUpdateAllDev = checkboxEl.checked;
            if (agreeBtn !== undefined) {
              if (this.manualBackup && this.requireUpdateAllDev) {
                agreeBtn.removeAttribute("disabled");
              } else {
                agreeBtn.setAttr("disabled", true);
              }
            }
          });
          labelEl.appendText(t("syncalgov3_checkbox_requiremultidevupdate"));
        }
      );

      agreeBtn = buttonContainerEl.createEl("button", {
        attr: { type: "button" },
        cls: "mod-cta",
        text: t("syncalgov3_button_agree"),
      });
      agreeBtn.setAttr("disabled", true);
      agreeBtn.addEventListener("click", () => {
        this.agree = true;
        this.close();
      });

      buttonContainerEl
        .createEl("button", {
          attr: { type: "submit" },
          text: t("syncalgov3_button_disagree"),
        })
        .addEventListener("click", () => {
          this.close();
        });
    });
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
    if (this.agree) {
      console.info("agree to use the new algorithm");
      this.plugin.saveAgreeToUseNewSyncAlgorithm();
      this.plugin.enableAutoSyncIfSet();
      this.plugin.enableInitSyncIfSet();
      this.plugin.enableSyncOnSaveIfSet();
    } else {
      console.info("do not agree to use the new algorithm");
      this.plugin.unload();
    }
  }
}
