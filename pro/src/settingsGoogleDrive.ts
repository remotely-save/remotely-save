import cloneDeep from "lodash/cloneDeep";
import { type App, Modal, Notice, Setting } from "obsidian";
import { getClient } from "../../src/fsGetter";
import type { TransItemType } from "../../src/i18n";
import type RemotelySavePlugin from "../../src/main";
import { stringToFragment } from "../../src/misc";
import { ChangeRemoteBaseDirModal } from "../../src/settings";
import {
  DEFAULT_GOOGLEDRIVE_CONFIG,
  sendRefreshTokenReq,
} from "./fsGoogleDrive";

class GoogleDriveAuthModal extends Modal {
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

    const authUrl = "https://remotelysave.com/auth/googledrive/start";
    const div2 = contentEl.createDiv();
    div2.createDiv({
      text: stringToFragment(t("modal_googledriveauth_tutorial")),
    });
    div2.createEl(
      "button",
      {
        text: t("modal_googledriveauth_copybutton"),
      },
      (el) => {
        el.onclick = async () => {
          await navigator.clipboard.writeText(authUrl);
          new Notice(t("modal_googledriveauth_copynotice"));
        };
      }
    );

    contentEl.createEl("p").createEl("a", {
      href: authUrl,
      text: authUrl,
    });

    let refreshToken = "";
    new Setting(contentEl)
      .setName(t("modal_googledrivce_maualinput"))
      .setDesc(t("modal_googledrivce_maualinput_desc"))
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue("")
          .onChange((val) => {
            refreshToken = val.trim();
          })
      )
      .addButton(async (button) => {
        button.setButtonText(t("submit"));
        button.onClick(async () => {
          new Notice(t("modal_googledrive_maualinput_notice"));

          try {
            if (this.plugin.settings.googledrive === undefined) {
              this.plugin.settings.googledrive = cloneDeep(
                DEFAULT_GOOGLEDRIVE_CONFIG
              );
            }
            this.plugin.settings.googledrive.refreshToken = refreshToken;
            this.plugin.settings.googledrive.accessToken = "access";
            this.plugin.settings.googledrive.accessTokenExpiresAtTimeMs = 1;
            this.plugin.settings.googledrive.accessTokenExpiresInMs = 1;

            // TODO: abstraction leaking now, how to fix?
            const k = await sendRefreshTokenReq(refreshToken);
            const ts = Date.now();
            this.plugin.settings.googledrive.accessToken = k.access_token;
            this.plugin.settings.googledrive.accessTokenExpiresInMs =
              k.expires_in * 1000;
            this.plugin.settings.googledrive.accessTokenExpiresAtTimeMs =
              ts + k.expires_in * 1000 - 60 * 2 * 1000;

            // manually set it expired after 60 days;
            this.plugin.settings.googledrive.credentialsShouldBeDeletedAtTimeMs =
              Date.now() + 1000 * 60 * 60 * 24 * 59;
            await this.plugin.saveSettings();

            // try to remove data in clipboard
            await navigator.clipboard.writeText("");

            new Notice(t("modal_googledrive_maualinput_succ_notice"));
          } catch (e) {
            console.error(e);
            new Notice(t("modal_googledrive_maualinput_fail_notice"));
          } finally {
            this.authDiv.toggleClass(
              "googledrive-auth-button-hide",
              this.plugin.settings.googledrive.refreshToken !== ""
            );
            this.revokeAuthDiv.toggleClass(
              "googledrive-revoke-auth-button-hide",
              this.plugin.settings.googledrive.refreshToken === ""
            );
            this.close();
          }
        });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class GoogleDriveRevokeAuthModal extends Modal {
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
      text: t("modal_googledriverevokeauth_step1"),
    });
    const consentUrl = "https://myaccount.google.com/permissions";
    contentEl.createEl("p").createEl("a", {
      href: consentUrl,
      text: consentUrl,
    });

    contentEl.createEl("p", {
      text: t("modal_googledriverevokeauth_step2"),
    });

    new Setting(contentEl)
      .setName(t("modal_googledriverevokeauth_clean"))
      .setDesc(t("modal_googledriverevokeauth_clean_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("modal_googledriverevokeauth_clean_button"));
        button.onClick(async () => {
          try {
            this.plugin.settings.googledrive = cloneDeep(
              DEFAULT_GOOGLEDRIVE_CONFIG
            );

            await this.plugin.saveSettings();
            this.authDiv.toggleClass(
              "googledrive-auth-button-hide",
              this.plugin.settings.googledrive.refreshToken !== ""
            );
            this.revokeAuthDiv.toggleClass(
              "googledrive-revoke-auth-button-hide",
              this.plugin.settings.googledrive.refreshToken === ""
            );
            new Notice(t("modal_googledriverevokeauth_clean_notice"));
            this.close();
          } catch (err) {
            console.error(err);
            new Notice(t("modal_googledriverevokeauth_clean_fail"));
          }
        });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export const generateGoogleDriveSettingsPart = (
  containerEl: HTMLElement,
  t: (x: TransItemType, vars?: any) => string,
  app: App,
  plugin: RemotelySavePlugin,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  const googleDriveDiv = containerEl.createEl("div", {
    cls: "googledrive-hide",
  });
  googleDriveDiv.toggleClass(
    "googledrive-hide",
    plugin.settings.serviceType !== "googledrive"
  );
  googleDriveDiv.createEl("h2", { text: t("settings_googledrive") });

  const googleDriveLongDescDiv = googleDriveDiv.createEl("div", {
    cls: "settings-long-desc",
  });
  for (const c of [
    t("settings_googledrive_disclaimer1"),
    t("settings_googledrive_disclaimer2"),
  ]) {
    googleDriveLongDescDiv.createEl("p", {
      text: c,
      cls: "googledrive-disclaimer",
    });
  }

  googleDriveLongDescDiv.createEl("p", {
    text: t("settings_googledrive_folder", {
      remoteBaseDir:
        plugin.settings.googledrive.remoteBaseDir || app.vault.getName(),
    }),
  });

  googleDriveLongDescDiv.createDiv({
    text: stringToFragment(t("settings_googledrive_pro_desc")),
    cls: "googledrive-disclaimer",
  });

  const googleDriveNotShowUpHintSetting = new Setting(googleDriveDiv)
    .setName(t("settings_googledrive_notshowuphint"))
    .setDesc(t("settings_googledrive_notshowuphint_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_googledrive_notshowuphint_view_pro"));
      button.onClick(async () => {
        window.location.href = "#settings-pro";
      });
    });

  const googleDriveAllowedToUsedDiv = googleDriveDiv.createDiv();
  // if pro enabled, show up; otherwise hide.
  const allowGoogleDrive =
    plugin.settings.pro?.enabledProFeatures.filter(
      (x) => x.featureName === "feature-google_drive"
    ).length === 1;
  console.debug(`allow to show up google drive settings? ${allowGoogleDrive}`);
  if (allowGoogleDrive) {
    googleDriveAllowedToUsedDiv.removeClass("googledrive-allow-to-use-hide");
    googleDriveNotShowUpHintSetting.settingEl.addClass(
      "googledrive-allow-to-use-hide"
    );
  } else {
    googleDriveAllowedToUsedDiv.addClass("googledrive-allow-to-use-hide");
    googleDriveNotShowUpHintSetting.settingEl.removeClass(
      "googledrive-allow-to-use-hide"
    );
  }

  const googleDriveSelectAuthDiv = googleDriveAllowedToUsedDiv.createDiv();
  const googleDriveAuthDiv = googleDriveSelectAuthDiv.createDiv({
    cls: "googledrive-auth-button-hide settings-auth-related",
  });
  const googleDriveRevokeAuthDiv = googleDriveSelectAuthDiv.createDiv({
    cls: "googledrive-revoke-auth-button-hide settings-auth-related",
  });

  const googleDriveRevokeAuthSetting = new Setting(googleDriveRevokeAuthDiv)
    .setName(t("settings_googledrive_revoke"))
    .setDesc(t("settings_googledrive_revoke_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_googledrive_revoke_button"));
      button.onClick(async () => {
        new GoogleDriveRevokeAuthModal(
          app,
          plugin,
          googleDriveAuthDiv,
          googleDriveRevokeAuthDiv,
          t
        ).open();
      });
    });

  new Setting(googleDriveAuthDiv)
    .setName(t("settings_googledrive_auth"))
    .setDesc(t("settings_googledrive_auth_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_googledrive_auth_button"));
      button.onClick(async () => {
        const modal = new GoogleDriveAuthModal(
          app,
          plugin,
          googleDriveAuthDiv,
          googleDriveRevokeAuthDiv,
          googleDriveRevokeAuthSetting,
          t
        );
        plugin.oauth2Info.helperModal = modal;
        plugin.oauth2Info.authDiv = googleDriveAuthDiv;
        plugin.oauth2Info.revokeDiv = googleDriveRevokeAuthDiv;
        plugin.oauth2Info.revokeAuthSetting = googleDriveRevokeAuthSetting;
        modal.open();
      });
    });

  googleDriveAuthDiv.toggleClass(
    "googledrive-auth-button-hide",
    plugin.settings.googledrive.refreshToken !== ""
  );
  googleDriveRevokeAuthDiv.toggleClass(
    "googledrive-revoke-auth-button-hide",
    plugin.settings.googledrive.refreshToken === ""
  );

  let newgoogleDriveRemoteBaseDir =
    plugin.settings.googledrive.remoteBaseDir || "";
  new Setting(googleDriveAllowedToUsedDiv)
    .setName(t("settings_remotebasedir"))
    .setDesc(t("settings_remotebasedir_desc"))
    .addText((text) =>
      text
        .setPlaceholder(app.vault.getName())
        .setValue(newgoogleDriveRemoteBaseDir)
        .onChange((value) => {
          newgoogleDriveRemoteBaseDir = value.trim();
        })
    )
    .addButton((button) => {
      button.setButtonText(t("confirm"));
      button.onClick(() => {
        new ChangeRemoteBaseDirModal(
          app,
          plugin,
          newgoogleDriveRemoteBaseDir,
          "googledrive"
        ).open();
      });
    });
  new Setting(googleDriveAllowedToUsedDiv)
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
          new Notice(t("settings_googledrive_connect_succ"));
        } else {
          new Notice(t("settings_googledrive_connect_fail"));
          new Notice(errors.msg);
        }
      });
    });

  return {
    googleDriveDiv: googleDriveDiv,
    googleDriveAllowedToUsedDiv: googleDriveAllowedToUsedDiv,
    googleDriveNotShowUpHintSetting: googleDriveNotShowUpHintSetting,
  };
};
