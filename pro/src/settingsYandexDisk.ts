import cloneDeep from "lodash/cloneDeep";
import { type App, Modal, Notice, Setting } from "obsidian";
import { getClient } from "../../src/fsGetter";
import type { TransItemType } from "../../src/i18n";
import type RemotelySavePlugin from "../../src/main";
import { stringToFragment } from "../../src/misc";
import { ChangeRemoteBaseDirModal } from "../../src/settings";
import {
  DEFAULT_YANDEXDISK_CONFIG,
  generateAuthUrl,
  sendRefreshTokenReq,
} from "./fsYandexDisk";

class YandexDiskAuthModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  readonly authDiv: HTMLDivElement;
  readonly revokeAuthDiv: HTMLDivElement;
  readonly revokeAuthSetting: Setting;
  readonly t: (x: TransItemType, vars?: any) => string;
  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    authDiv: HTMLDivElement,
    revokeAuthDiv: HTMLDivElement,
    revokeAuthSetting: Setting,
    t: (x: TransItemType, vars?: any) => string
  ) {
    super(app);
    this.plugin = plugin;
    this.authDiv = authDiv;
    this.revokeAuthDiv = revokeAuthDiv;
    this.revokeAuthSetting = revokeAuthSetting;
    this.t = t;
  }

  async onOpen() {
    const { contentEl } = this;
    const t = this.t;

    const authUrl = generateAuthUrl(true);
    const div2 = contentEl.createDiv();
    div2.createDiv({
      text: stringToFragment(t("modal_yandexdiskauth_tutorial")),
    });
    div2.createEl(
      "button",
      {
        text: t("modal_yandexdiskauth_copybutton"),
      },
      (el) => {
        el.onclick = async () => {
          await navigator.clipboard.writeText(authUrl);
          new Notice(t("modal_yandexdiskauth_copynotice"));
        };
      }
    );

    contentEl.createEl("p").createEl("a", {
      href: authUrl,
      text: authUrl,
    });

    // let refreshToken = "";
    // new Setting(contentEl)
    //   .setName(t("modal_yandexdisk_maualinput"))
    //   .setDesc(t("modal_yandexdisk_maualinput_desc"))
    //   .addText((text) =>
    //     text
    //       .setPlaceholder("")
    //       .setValue("")
    //       .onChange((val) => {
    //         refreshToken = val.trim();
    //       })
    //   )
    //   .addButton(async (button) => {
    //     button.setButtonText(t("submit"));
    //     button.onClick(async () => {
    //       new Notice(t("modal_yandexdisk_maualinput_notice"));

    //       try {
    //         if (this.plugin.settings.yandexdisk === undefined) {
    //           this.plugin.settings.yandexdisk = cloneDeep(
    //             DEFAULT_YANDEXDISK_CONFIG
    //           );
    //         }
    //         this.plugin.settings.yandexdisk.refreshToken = refreshToken;
    //         this.plugin.settings.yandexdisk.accessToken = "access";
    //         this.plugin.settings.yandexdisk.accessTokenExpiresAtTimeMs = 1;
    //         this.plugin.settings.yandexdisk.accessTokenExpiresInMs = 1;

    //         // TODO: abstraction leaking now, how to fix?
    //         const k = await sendRefreshTokenReq(refreshToken);
    //         const ts = Date.now();
    //         this.plugin.settings.yandexdisk.accessToken = k.access_token;
    //         this.plugin.settings.yandexdisk.accessTokenExpiresInMs =
    //           k.expires_in * 1000;
    //         this.plugin.settings.yandexdisk.accessTokenExpiresAtTimeMs =
    //           ts + k.expires_in * 1000 - 60 * 2 * 1000;
    //         await this.plugin.saveSettings();

    //         // try to remove data in clipboard
    //         await navigator.clipboard.writeText("");

    //         new Notice(t("modal_yandexdisk_maualinput_succ_notice"));
    //       } catch (e) {
    //         console.error(e);
    //         new Notice(t("modal_yandexdisk_maualinput_fail_notice"));
    //       } finally {
    //         this.authDiv.toggleClass(
    //           "yandexdisk-auth-button-hide",
    //           this.plugin.settings.yandexdisk.refreshToken !== ""
    //         );
    //         this.revokeAuthDiv.toggleClass(
    //           "yandexdisk-revoke-auth-button-hide",
    //           this.plugin.settings.yandexdisk.refreshToken === ""
    //         );
    //         this.close();
    //       }
    //     });
    //   });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class YandexDiskRevokeAuthModal extends Modal {
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
    const t = this.t;
    const { contentEl } = this;

    contentEl.createEl("p", {
      text: t("modal_yandexdiskrevokeauth_step1"),
    });
    const consentUrl = "https://app.yandexDisk.com/account/security";
    contentEl.createEl("p").createEl("a", {
      href: consentUrl,
      text: consentUrl,
    });

    contentEl.createEl("p", {
      text: t("modal_yandexdiskrevokeauth_step2"),
    });

    new Setting(contentEl)
      .setName(t("modal_yandexdiskrevokeauth_clean"))
      .setDesc(t("modal_yandexdiskrevokeauth_clean_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("modal_yandexdiskrevokeauth_clean_button"));
        button.onClick(async () => {
          try {
            this.plugin.settings.yandexdisk = cloneDeep(
              DEFAULT_YANDEXDISK_CONFIG
            );

            await this.plugin.saveSettings();
            this.authDiv.toggleClass(
              "yandexdisk-auth-button-hide",
              this.plugin.settings.yandexdisk.refreshToken !== ""
            );
            this.revokeAuthDiv.toggleClass(
              "yandexdisk-revoke-auth-button-hide",
              this.plugin.settings.yandexdisk.refreshToken === ""
            );
            new Notice(t("modal_yandexdiskrevokeauth_clean_notice"));
            this.close();
          } catch (err) {
            console.error(err);
            new Notice(t("modal_yandexdiskrevokeauth_clean_fail"));
          }
        });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export const generateYandexDiskSettingsPart = (
  containerEl: HTMLElement,
  t: (x: TransItemType, vars?: any) => string,
  app: App,
  plugin: RemotelySavePlugin,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  const yandexDiskDiv = containerEl.createEl("div", {
    cls: "yandexdisk-hide",
  });
  yandexDiskDiv.toggleClass(
    "yandexdisk-hide",
    plugin.settings.serviceType !== "yandexdisk"
  );
  yandexDiskDiv.createEl("h2", { text: t("settings_yandexdisk") });

  const yandexDiskLongDescDiv = yandexDiskDiv.createEl("div", {
    cls: "settings-long-desc",
  });
  for (const c of [
    t("settings_yandexdisk_disclaimer1"),
    t("settings_yandexdisk_disclaimer2"),
  ]) {
    yandexDiskLongDescDiv.createEl("p", {
      text: c,
      cls: "yandexdisk-disclaimer",
    });
  }

  yandexDiskLongDescDiv.createEl("p", {
    text: t("settings_yandexdisk_folder", {
      remoteBaseDir:
        plugin.settings.yandexdisk.remoteBaseDir || app.vault.getName(),
    }),
  });

  yandexDiskLongDescDiv.createDiv({
    text: stringToFragment(t("settings_yandexdisk_pro_desc")),
    cls: "yandexdisk-disclaimer",
  });

  const yandexDiskNotShowUpHintSetting = new Setting(yandexDiskDiv)
    .setName(t("settings_yandexdisk_notshowuphint"))
    .setDesc(t("settings_yandexdisk_notshowuphint_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_yandexdisk_notshowuphint_view_pro"));
      button.onClick(async () => {
        window.location.href = "#settings-pro";
      });
    });

  const yandexDiskAllowedToUsedDiv = yandexDiskDiv.createDiv();
  // if pro enabled, show up; otherwise hide.
  const allowYandexDisk =
    plugin.settings.pro?.enabledProFeatures.filter(
      (x) => x.featureName === "feature-yandex_disk"
    ).length === 1;
  console.debug(`allow to show up yandexDisk settings? ${allowYandexDisk}`);
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

  const yandexDiskSelectAuthDiv = yandexDiskAllowedToUsedDiv.createDiv();
  const yandexDiskAuthDiv = yandexDiskSelectAuthDiv.createDiv({
    cls: "yandexdisk-auth-button-hide settings-auth-related",
  });
  const yandexDiskRevokeAuthDiv = yandexDiskSelectAuthDiv.createDiv({
    cls: "yandexdisk-revoke-auth-button-hide settings-auth-related",
  });

  const yandexDiskRevokeAuthSetting = new Setting(yandexDiskRevokeAuthDiv)
    .setName(t("settings_yandexdisk_revoke"))
    .setDesc(t("settings_yandexdisk_revoke_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_yandexdisk_revoke_button"));
      button.onClick(async () => {
        new YandexDiskRevokeAuthModal(
          app,
          plugin,
          yandexDiskAuthDiv,
          yandexDiskRevokeAuthDiv,
          t
        ).open();
      });
    });

  new Setting(yandexDiskAuthDiv)
    .setName(t("settings_yandexdisk_auth"))
    .setDesc(t("settings_yandexdisk_auth_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_yandexdisk_auth_button"));
      button.onClick(async () => {
        const modal = new YandexDiskAuthModal(
          app,
          plugin,
          yandexDiskAuthDiv,
          yandexDiskRevokeAuthDiv,
          yandexDiskRevokeAuthSetting,
          t
        );
        plugin.oauth2Info.helperModal = modal;
        plugin.oauth2Info.authDiv = yandexDiskAuthDiv;
        plugin.oauth2Info.revokeDiv = yandexDiskRevokeAuthDiv;
        plugin.oauth2Info.revokeAuthSetting = yandexDiskRevokeAuthSetting;
        modal.open();
      });
    });

  yandexDiskAuthDiv.toggleClass(
    "yandexdisk-auth-button-hide",
    plugin.settings.yandexdisk.refreshToken !== ""
  );
  yandexDiskRevokeAuthDiv.toggleClass(
    "yandexdisk-revoke-auth-button-hide",
    plugin.settings.yandexdisk.refreshToken === ""
  );

  let newyandexDiskRemoteBaseDir =
    plugin.settings.yandexdisk.remoteBaseDir || "";
  new Setting(yandexDiskAllowedToUsedDiv)
    .setName(t("settings_remotebasedir"))
    .setDesc(t("settings_remotebasedir_desc"))
    .addText((text) =>
      text
        .setPlaceholder(app.vault.getName())
        .setValue(newyandexDiskRemoteBaseDir)
        .onChange((value) => {
          newyandexDiskRemoteBaseDir = value.trim();
        })
    )
    .addButton((button) => {
      button.setButtonText(t("confirm"));
      button.onClick(() => {
        new ChangeRemoteBaseDirModal(
          app,
          plugin,
          newyandexDiskRemoteBaseDir,
          "yandexdisk"
        ).open();
      });
    });
  new Setting(yandexDiskAllowedToUsedDiv)
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
          new Notice(t("settings_yandexdisk_connect_succ"));
        } else {
          new Notice(t("settings_yandexdisk_connect_fail"));
          new Notice(errors.msg);
        }
      });
    });

  return {
    yandexDiskDiv: yandexDiskDiv,
    yandexDiskAllowedToUsedDiv: yandexDiskAllowedToUsedDiv,
    yandexDiskNotShowUpHintSetting: yandexDiskNotShowUpHintSetting,
  };
};
