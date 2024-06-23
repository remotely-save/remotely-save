import cloneDeep from "lodash/cloneDeep";
import { type App, Modal, Notice, Setting } from "obsidian";
import { features } from "process";
import type { TransItemType } from "../../src/i18n";
import type RemotelySavePlugin from "../../src/main";
import { stringToFragment } from "../../src/misc";
import {
  DEFAULT_PRO_CONFIG,
  generateAuthUrlAndCodeVerifierChallenge,
  getAndSaveProEmail,
  getAndSaveProFeatures,
  sendAuthReq,
  setConfigBySuccessfullAuthInplace,
} from "./account";
import {
  type FeatureInfo,
  PRO_CLIENT_ID,
  type ProConfig,
} from "./baseTypesPro";

export class ProAuthModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  readonly authDiv: HTMLDivElement;
  readonly revokeAuthDiv: HTMLDivElement;
  readonly revokeAuthSetting: Setting;
  readonly proFeaturesListSetting: Setting;
  readonly t: (x: TransItemType, vars?: any) => string;
  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    authDiv: HTMLDivElement,
    revokeAuthDiv: HTMLDivElement,
    revokeAuthSetting: Setting,
    proFeaturesListSetting: Setting,
    t: (x: TransItemType, vars?: any) => string
  ) {
    super(app);
    this.plugin = plugin;
    this.authDiv = authDiv;
    this.revokeAuthDiv = revokeAuthDiv;
    this.revokeAuthSetting = revokeAuthSetting;
    this.proFeaturesListSetting = proFeaturesListSetting;
    this.t = t;
  }

  async onOpen() {
    const { contentEl } = this;

    const { authUrl, codeVerifier, codeChallenge } =
      await generateAuthUrlAndCodeVerifierChallenge(false);
    this.plugin.oauth2Info.verifier = codeVerifier;

    const t = this.t;

    const div2 = contentEl.createDiv();
    div2.createEl(
      "button",
      {
        text: t("modal_proauth_copybutton"),
      },
      (el) => {
        el.onclick = async () => {
          await navigator.clipboard.writeText(authUrl);
          new Notice(t("modal_proauth_copynotice"));
        };
      }
    );

    contentEl.createEl("p").createEl("a", {
      href: authUrl,
      text: authUrl,
    });

    // manual paste
    let authCode = "";
    new Setting(contentEl)
      .setName(t("modal_proauth_maualinput"))
      .setDesc(t("modal_proauth_maualinput_desc"))
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue("")
          .onChange((val) => {
            authCode = val.trim();
          })
      )
      .addButton(async (button) => {
        button.setButtonText(t("submit"));
        button.onClick(async () => {
          new Notice(t("modal_proauth_maualinput_notice"));
          try {
            const authRes = await sendAuthReq(
              codeVerifier ?? "verifier",
              authCode,
              async (e: any) => {
                new Notice(t("protocol_pro_connect_fail"));
                new Notice(`${e}`);
                throw e;
              }
            );
            console.debug(authRes);
            const self = this;
            setConfigBySuccessfullAuthInplace(
              this.plugin.settings.pro!,
              authRes!,
              () => self.plugin.saveSettings()
            );
            await getAndSaveProFeatures(
              this.plugin.settings.pro!,
              this.plugin.manifest.version,
              () => self.plugin.saveSettings()
            );
            this.proFeaturesListSetting.setDesc(
              stringToFragment(
                t("settings_pro_features_desc", {
                  features: featureListToText(
                    this.plugin.settings.pro!.enabledProFeatures
                  ),
                })
              )
            );
            await getAndSaveProEmail(
              this.plugin.settings.pro!,
              this.plugin.manifest.version,
              () => self.plugin.saveSettings()
            );

            new Notice(
              t("protocol_pro_connect_manualinput_succ", {
                email: this.plugin.settings.pro!.email ?? "(no email)",
              })
            );

            this.plugin.oauth2Info.verifier = ""; // reset it
            this.plugin.oauth2Info.authDiv?.toggleClass(
              "pro-auth-button-hide",
              this.plugin.settings.pro?.refreshToken !== ""
            );
            this.plugin.oauth2Info.authDiv = undefined;

            this.plugin.oauth2Info.revokeAuthSetting?.setDesc(
              t("protocol_pro_connect_succ_revoke", {
                email: this.plugin.settings.pro?.email,
              })
            );
            this.plugin.oauth2Info.revokeAuthSetting = undefined;
            this.plugin.oauth2Info.revokeDiv?.toggleClass(
              "pro-revoke-auth-button-hide",
              this.plugin.settings.pro?.email === ""
            );
            this.plugin.oauth2Info.revokeDiv = undefined;

            // try to remove data in clipboard
            await navigator.clipboard.writeText("");

            this.close();
          } catch (err) {
            console.error(err);
            new Notice(t("modal_proauth_maualinput_conn_fail"));
          }
        });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export class ProRevokeAuthModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  readonly authDiv: HTMLDivElement;
  readonly revokeAuthDiv: HTMLDivElement;
  readonly t: (x: TransItemType, vars?: any) => string;
  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    authDiv: HTMLDivElement,
    revokeAuthDiv: HTMLDivElement,
    t: (x: TransItemType, vars?: any) => string
  ) {
    super(app);
    this.plugin = plugin;
    this.authDiv = authDiv;
    this.revokeAuthDiv = revokeAuthDiv;
    this.t = t;
  }

  async onOpen() {
    const { contentEl } = this;
    const t = this.t;

    contentEl.createEl("p", {
      text: t("modal_prorevokeauth"),
    });

    new Setting(contentEl)
      .setName(t("modal_prorevokeauth_clean"))
      .setDesc(t("modal_prorevokeauth_clean_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("modal_prorevokeauth_clean_button"));
        button.onClick(async () => {
          try {
            this.plugin.settings.pro = cloneDeep(DEFAULT_PRO_CONFIG);
            await this.plugin.saveSettings();
            this.authDiv.toggleClass(
              "pro-auth-button-hide",
              this.plugin.settings.pro?.refreshToken !== ""
            );
            this.revokeAuthDiv.toggleClass(
              "pro-revoke-auth-button-hide",
              this.plugin.settings.pro?.refreshToken === ""
            );
            new Notice(t("modal_prorevokeauth_clean_notice"));
            this.close();
          } catch (err) {
            console.error(err);
            new Notice(t("modal_prorevokeauth_clean_fail"));
          }
        });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

const featureListToText = (features: FeatureInfo[]) => {
  // TODO: i18n
  if (features === undefined || features.length === 0) {
    return "No features enabled.";
  }
  return features
    .map((x) => {
      return `${x.featureName} (expire: ${new Date(
        Number(x.expireAtTimeMs)
      ).toISOString()})`;
    })
    .join("<br/>");
};

export const generateProSettingsPart = (
  proDiv: HTMLDivElement,
  t: (x: TransItemType, vars?: any) => string,
  app: App,
  plugin: RemotelySavePlugin,
  saveUpdatedConfigFunc: () => Promise<any> | undefined,
  onedriveFullAllowedToUsedDiv: HTMLDivElement,
  onedriveFullNotShowUpHintSetting: Setting,
  googleDriveAllowedToUsedDiv: HTMLDivElement,
  googleDriveNotShowUpHintSetting: Setting,
  boxAllowedToUsedDiv: HTMLDivElement,
  boxNotShowUpHintSetting: Setting,
  pCloudAllowedToUsedDiv: HTMLDivElement,
  pCloudNotShowUpHintSetting: Setting,
  yandexDiskAllowedToUsedDiv: HTMLDivElement,
  yandexDiskNotShowUpHintSetting: Setting,
  koofrAllowedToUsedDiv: HTMLDivElement,
  koofrNotShowUpHintSetting: Setting,
  azureBlobStorageAllowedToUsedDiv: HTMLDivElement,
  azureBlobStorageNotShowUpHintSetting: Setting
) => {
  proDiv
    .createEl("h2", { text: t("settings_pro") })
    .setAttribute("id", "settings-pro");

  proDiv.createEl("div", {
    text: stringToFragment(t("settings_pro_tutorial")),
  });

  const proSelectAuthDiv = proDiv.createDiv();
  const proAuthDiv = proSelectAuthDiv.createDiv({
    cls: "pro-auth-button-hide settings-auth-related",
  });

  const proRevokeAuthDiv = proSelectAuthDiv.createDiv({
    cls: "pro-revoke-auth-button-hide settings-auth-related",
  });

  const proFeaturesListSetting = new Setting(proRevokeAuthDiv)
    .setName(t("settings_pro_features"))
    .setDesc(
      stringToFragment(
        t("settings_pro_features_desc", {
          features: featureListToText(plugin.settings.pro!.enabledProFeatures),
        })
      )
    );
  proFeaturesListSetting.addButton(async (button) => {
    button.setButtonText(t("settings_pro_features_refresh_button"));
    button.onClick(async () => {
      new Notice(t("settings_pro_features_refresh_fetch"));
      await getAndSaveProFeatures(
        plugin.settings.pro!,
        plugin.manifest.version,
        saveUpdatedConfigFunc
      );
      proFeaturesListSetting.setDesc(
        stringToFragment(
          t("settings_pro_features_desc", {
            features: featureListToText(
              plugin.settings.pro!.enabledProFeatures
            ),
          })
        )
      );

      const allowOnedriveFull =
        plugin.settings.pro?.enabledProFeatures.filter(
          (x) => x.featureName === "feature-box"
        ).length === 1;
      console.debug(
        `allow to show up OnedriveFull settings? ${allowOnedriveFull}`
      );
      if (allowOnedriveFull) {
        onedriveFullAllowedToUsedDiv.removeClass(
          "onedrivefull-allow-to-use-hide"
        );
        onedriveFullNotShowUpHintSetting.settingEl.addClass(
          "onedrivefull-allow-to-use-hide"
        );
      } else {
        onedriveFullAllowedToUsedDiv.addClass("onedrivefull-allow-to-use-hide");
        onedriveFullNotShowUpHintSetting.settingEl.removeClass(
          "onedrivefull-allow-to-use-hide"
        );
      }

      const allowGoogleDrive =
        plugin.settings.pro?.enabledProFeatures.filter(
          (x) => x.featureName === "feature-google_drive"
        ).length === 1;
      console.debug(
        `allow to show up google drive settings? ${allowGoogleDrive}`
      );
      if (allowGoogleDrive) {
        googleDriveAllowedToUsedDiv.removeClass(
          "googledrive-allow-to-use-hide"
        );
        googleDriveNotShowUpHintSetting.settingEl.addClass(
          "googledrive-allow-to-use-hide"
        );
      } else {
        googleDriveAllowedToUsedDiv.addClass("googledrive-allow-to-use-hide");
        googleDriveNotShowUpHintSetting.settingEl.removeClass(
          "googledrive-allow-to-use-hide"
        );
      }

      const allowBox =
        plugin.settings.pro?.enabledProFeatures.filter(
          (x) => x.featureName === "feature-box"
        ).length === 1;
      console.debug(`allow to show up Box settings? ${allowBox}`);
      if (allowBox) {
        boxAllowedToUsedDiv.removeClass("box-allow-to-use-hide");
        boxNotShowUpHintSetting.settingEl.addClass("box-allow-to-use-hide");
      } else {
        boxAllowedToUsedDiv.addClass("box-allow-to-use-hide");
        boxNotShowUpHintSetting.settingEl.removeClass("box-allow-to-use-hide");
      }

      const allowPCloud =
        plugin.settings.pro?.enabledProFeatures.filter(
          (x) => x.featureName === "feature-pcloud"
        ).length === 1;
      console.debug(`allow to show up pCloud settings? ${allowPCloud}`);
      if (allowPCloud) {
        pCloudAllowedToUsedDiv.removeClass("pcloud-allow-to-use-hide");
        pCloudNotShowUpHintSetting.settingEl.addClass(
          "pcloud-allow-to-use-hide"
        );
      } else {
        pCloudAllowedToUsedDiv.addClass("pcloud-allow-to-use-hide");
        pCloudNotShowUpHintSetting.settingEl.removeClass(
          "pcloud-allow-to-use-hide"
        );
      }

      const allowYandexDisk =
        plugin.settings.pro?.enabledProFeatures.filter(
          (x) => x.featureName === "feature-yandex_disk"
        ).length === 1;
      console.debug(
        `allow to show up Yandex Disk settings? ${allowYandexDisk}`
      );
      if (allowYandexDisk) {
        yandexDiskAllowedToUsedDiv.removeClass("yandexdisk-allow-to-use-hide");
        yandexDiskNotShowUpHintSetting.settingEl.addClass(
          "yandexdisk-allow-to-use-hide"
        );
      } else {
        yandexDiskAllowedToUsedDiv.addClass("yandexdisk-allow-to-use-hide");
        yandexDiskNotShowUpHintSetting.settingEl.removeClass(
          "yandexdisk-allow-to-use-hide"
        );
      }

      const allowKoofr =
        plugin.settings.pro?.enabledProFeatures.filter(
          (x) => x.featureName === "feature-koofr"
        ).length === 1;
      console.debug(`allow to show up Koofr settings? ${allowKoofr}`);
      if (allowKoofr) {
        koofrAllowedToUsedDiv.removeClass("koofr-allow-to-use-hide");
        koofrNotShowUpHintSetting.settingEl.addClass("koofr-allow-to-use-hide");
      } else {
        koofrAllowedToUsedDiv.addClass("koofr-allow-to-use-hide");
        koofrNotShowUpHintSetting.settingEl.removeClass(
          "koofr-allow-to-use-hide"
        );
      }

      const allowAzureBlobStorage =
        plugin.settings.pro?.enabledProFeatures.filter(
          (x) => x.featureName === "feature-azure_blob_storage"
        ).length === 1;
      console.debug(
        `allow to show up AzureBlobStorage settings? ${allowAzureBlobStorage}`
      );
      if (allowAzureBlobStorage) {
        azureBlobStorageAllowedToUsedDiv.removeClass(
          "azureblobstorage-allow-to-use-hide"
        );
        azureBlobStorageNotShowUpHintSetting.settingEl.addClass(
          "azureBlobStorage-allow-to-use-hide"
        );
      } else {
        azureBlobStorageAllowedToUsedDiv.addClass(
          "azureblobstorage-allow-to-use-hide"
        );
        azureBlobStorageNotShowUpHintSetting.settingEl.removeClass(
          "azureblobstorage-allow-to-use-hide"
        );
      }

      new Notice(t("settings_pro_features_refresh_succ"));
    });
  });

  const proRevokeAuthSetting = new Setting(proRevokeAuthDiv)
    .setName(t("settings_pro_revoke"))
    .setDesc(
      t("settings_pro_revoke_desc", {
        email: plugin.settings.pro?.email,
      })
    )
    .addButton(async (button) => {
      button.setButtonText(t("settings_pro_revoke_button"));
      button.onClick(async () => {
        new ProRevokeAuthModal(
          app,
          plugin,
          proAuthDiv,
          proRevokeAuthDiv,
          t
        ).open();
      });
    });

  new Setting(proAuthDiv)
    .setName(t("settings_pro_intro"))
    .setDesc(stringToFragment(t("settings_pro_intro_desc")))
    .addButton(async (button) => {
      button.setButtonText(t("settings_pro_intro_button"));
      button.onClick(async () => {
        window.open("https://remotelysave.com/user/signupin", "_self");
      });
    });

  new Setting(proAuthDiv)
    .setName(t("settings_pro_auth"))
    .setDesc(t("settings_pro_auth_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_pro_auth_button"));
      button.onClick(async () => {
        const modal = new ProAuthModal(
          app,
          plugin,
          proAuthDiv,
          proRevokeAuthDiv,
          proRevokeAuthSetting,
          proFeaturesListSetting,
          t
        );
        plugin.oauth2Info.helperModal = modal;
        plugin.oauth2Info.authDiv = proAuthDiv;
        plugin.oauth2Info.revokeDiv = proRevokeAuthDiv;
        plugin.oauth2Info.revokeAuthSetting = proRevokeAuthSetting;

        modal.open();
      });
    });

  proAuthDiv.toggleClass(
    "pro-auth-button-hide",
    plugin.settings.pro?.refreshToken !== ""
  );
  proRevokeAuthDiv.toggleClass(
    "pro-revoke-auth-button-hide",
    plugin.settings.pro?.refreshToken === ""
  );
};
