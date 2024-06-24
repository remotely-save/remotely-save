import cloneDeep from "lodash/cloneDeep";
import { type App, Modal, Notice, Setting } from "obsidian";
import { getClient } from "../../src/fsGetter";
import type { TransItemType } from "../../src/i18n";
import type RemotelySavePlugin from "../../src/main";
import { stringToFragment } from "../../src/misc";
import { wrapTextWithPasswordHide } from "../../src/settings";
import {
  DEFAULT_AZUREBLOBSTORAGE_CONFIG,
  simpleTransRemotePrefix,
} from "./fsAzureBlobStorage";

class ChangeAzureBlobStorageRemotePrefixModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  readonly newRemotePrefix: string;
  constructor(app: App, plugin: RemotelySavePlugin, newRemotePrefix: string) {
    super(app);
    this.plugin = plugin;
    this.newRemotePrefix = newRemotePrefix;
  }

  onOpen() {
    const { contentEl } = this;

    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    contentEl.createEl("h2", {
      text: t("modal_remoteprefix_azureblobstorage_title"),
    });
    t("modal_remoteprefix_azureblobstorage_shortdesc")
      .split("\n")
      .forEach((val, idx) => {
        contentEl.createEl("p", {
          text: val,
        });
      });

    contentEl.createEl("p", {
      text: t("modal_remoteprefix_azureblobstorage_tosave", {
        prefix: this.newRemotePrefix,
      }),
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText(
          t("modal_remoteprefix_azureblobstorage_secondconfirm_change")
        );
        button.onClick(async () => {
          this.plugin.settings.azureblobstorage.remotePrefix =
            this.newRemotePrefix;
          await this.plugin.saveSettings();
          new Notice(t("modal_remoteprefix_azureblobstorage_notice"));
          this.close();
        });
        button.setClass("remoteprefix-azureblobstorage-second-confirm");
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

export const generateAzureBlobStorageSettingsPart = (
  containerEl: HTMLElement,
  t: (x: TransItemType, vars?: any) => string,
  app: App,
  plugin: RemotelySavePlugin,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  const azureBlobStorageDiv = containerEl.createEl("div", {
    cls: "azureblobstorage-hide",
  });
  azureBlobStorageDiv.toggleClass(
    "azureblobstorage-hide",
    plugin.settings.serviceType !== "azureblobstorage"
  );
  azureBlobStorageDiv.createEl("h2", { text: t("settings_azureblobstorage") });

  const azureBlobStorageLongDescDiv = azureBlobStorageDiv.createEl("div", {
    cls: "settings-long-desc",
  });
  for (const c of [
    t("settings_azureblobstorage_disclaimer1"),
    stringToFragment(t("settings_azureblobstorage_disclaimer2")),
  ]) {
    azureBlobStorageLongDescDiv.createEl("p", {
      text: c,
      cls: "azureblobstorage-disclaimer",
    });
  }

  azureBlobStorageLongDescDiv.createEl("p", {
    text: t("settings_azureblobstorage_folder", {
      remotePrefix:
        plugin.settings.azureblobstorage.remotePrefix ||
        `${app.vault.getName()}/`,
    }),
  });

  azureBlobStorageLongDescDiv.createDiv({
    text: stringToFragment(t("settings_azureblobstorage_pro_desc")),
    cls: "azureblobstorage-disclaimer",
  });

  const azureBlobStorageNotShowUpHintSetting = new Setting(azureBlobStorageDiv)
    .setName(t("settings_azureblobstorage_notshowuphint"))
    .setDesc(t("settings_azureblobstorage_notshowuphint_desc"))
    .addButton(async (button) => {
      button.setButtonText(
        t("settings_azureblobstorage_notshowuphint_view_pro")
      );
      button.onClick(async () => {
        window.location.href = "#settings-pro";
      });
    });

  const azureBlobStorageAllowedToUsedDiv = azureBlobStorageDiv.createDiv();
  // if pro enabled, show up; otherwise hide.
  const allowAzureBlobStorage =
    plugin.settings.pro?.enabledProFeatures.filter(
      (x) => x.featureName === "feature-azure_blob_storage"
    ).length === 1;
  console.debug(
    `allow to show up azureBlobStorage settings? ${allowAzureBlobStorage}`
  );
  if (allowAzureBlobStorage) {
    azureBlobStorageAllowedToUsedDiv.removeClass(
      "azureblobstorage-allow-to-use-hide"
    );
    azureBlobStorageNotShowUpHintSetting.settingEl.addClass(
      "azureblobstorage-allow-to-use-hide"
    );
  } else {
    azureBlobStorageAllowedToUsedDiv.addClass(
      "azureblobstorage-allow-to-use-hide"
    );
    azureBlobStorageNotShowUpHintSetting.settingEl.removeClass(
      "azureblobstorage-allow-to-use-hide"
    );
  }

  new Setting(azureBlobStorageAllowedToUsedDiv)
    .setName(t("settings_azureblobstorage_containersasurl"))
    .setDesc(
      stringToFragment(t("settings_azureblobstorage_containersasurl_desc"))
    )
    .addText((text) => {
      wrapTextWithPasswordHide(text);
      text
        .setPlaceholder("")
        .setValue(`${plugin.settings.azureblobstorage.containerSasUrl}`)
        .onChange(async (value) => {
          plugin.settings.azureblobstorage.containerSasUrl = value.trim();
          await plugin.saveSettings();
        });
    });

  new Setting(azureBlobStorageAllowedToUsedDiv)
    .setName(t("settings_azureblobstorage_containername"))
    .setDesc(t("settings_azureblobstorage_containername_desc"))
    .addText((text) => {
      wrapTextWithPasswordHide(text);
      text
        .setPlaceholder("")
        .setValue(`${plugin.settings.azureblobstorage.containerName}`)
        .onChange(async (value) => {
          plugin.settings.azureblobstorage.containerName = value.trim();
          await plugin.saveSettings();
        });
    });

  let newAzureBlobStorageRemotePrefix =
    plugin.settings.azureblobstorage.remotePrefix || "";
  new Setting(azureBlobStorageAllowedToUsedDiv)
    .setName(t("settings_azureblobstorage_remoteprefix"))
    .setDesc(t("settings_azureblobstorage_remoteprefix_desc"))
    .addText((text) =>
      text
        .setPlaceholder(`${app.vault.getName()}/`)
        .setValue(newAzureBlobStorageRemotePrefix)
        .onChange((value) => {
          const k = simpleTransRemotePrefix(value);
          if (k === "") {
            newAzureBlobStorageRemotePrefix = `${app.vault.getName()}/`;
          } else {
            newAzureBlobStorageRemotePrefix = k;
          }
        })
    )
    .addButton((button) => {
      button.setButtonText(t("confirm"));
      button.onClick(() => {
        new ChangeAzureBlobStorageRemotePrefixModal(
          app,
          plugin,
          newAzureBlobStorageRemotePrefix
        ).open();
      });
    });

  new Setting(azureBlobStorageAllowedToUsedDiv)
    .setName(t("settings_azureblobstorage_parts"))
    .setDesc(t("settings_azureblobstorage_parts_desc"))
    .addDropdown((dropdown) => {
      dropdown.addOption("1", "1");
      dropdown.addOption("2", "2");
      dropdown.addOption("3", "3");
      dropdown.addOption("5", "5");
      dropdown.addOption("10", "10");
      dropdown.addOption("15", "15");
      dropdown.addOption("20", "20 (default)");

      dropdown
        .setValue(`${plugin.settings.azureblobstorage.partsConcurrency}`)
        .onChange(async (val) => {
          const realVal = Number.parseInt(val);
          plugin.settings.azureblobstorage.partsConcurrency = realVal;
          await plugin.saveSettings();
        });
    });

  new Setting(azureBlobStorageAllowedToUsedDiv)
    .setName(t("settings_azureblobstorage_generatefolderobject"))
    .setDesc(t("settings_azureblobstorage_generatefolderobject_desc"))
    .addDropdown((dropdown) => {
      dropdown
        .addOption(
          "notgenerate",
          t("settings_azureblobstorage_generatefolderobject_notgenerate")
        )
        .addOption(
          "generate",
          t("settings_azureblobstorage_generatefolderobject_generate")
        );

      dropdown
        .setValue(
          `${
            plugin.settings.azureblobstorage.generateFolderObject
              ? "generate"
              : "notgenerate"
          }`
        )
        .onChange(async (val) => {
          if (val === "generate") {
            plugin.settings.azureblobstorage.generateFolderObject = true;
          } else {
            plugin.settings.azureblobstorage.generateFolderObject = false;
          }
          await plugin.saveSettings();
        });
    });

  new Setting(azureBlobStorageAllowedToUsedDiv)
    .setName(t("settings_checkonnectivity"))
    .setDesc(t("settings_checkonnectivity_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_checkonnectivity_button"));
      button.onClick(async () => {
        new Notice(t("settings_checkonnectivity_checking"));
        const client = getClient(plugin.settings, app.vault.getName(), () =>
          plugin.saveSettings()
        );
        const errors = { msg: "" };
        const res = await client.checkConnect((err: any) => {
          errors.msg = `${err}`;
        });
        if (res) {
          new Notice(t("settings_azureblobstorage_connect_succ"));
        } else {
          new Notice(t("settings_azureblobstorage_connect_fail"));
          new Notice(errors.msg);
        }
      });
    });

  return {
    azureBlobStorageDiv: azureBlobStorageDiv,
    azureBlobStorageAllowedToUsedDiv: azureBlobStorageAllowedToUsedDiv,
    azureBlobStorageNotShowUpHintSetting: azureBlobStorageNotShowUpHintSetting,
  };
};
