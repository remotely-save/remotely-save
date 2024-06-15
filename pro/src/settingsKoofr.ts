import cloneDeep from "lodash/cloneDeep";
import { type App, Modal, Notice, Setting } from "obsidian";
import { getClient } from "../../src/fsGetter";
import type { TransItemType } from "../../src/i18n";
import type RemotelySavePlugin from "../../src/main";
import { stringToFragment } from "../../src/misc";
import { ChangeRemoteBaseDirModal } from "../../src/settings";
import {
  DEFAULT_KOOFR_CONFIG,
  generateAuthUrl,
  sendRefreshTokenReq,
} from "./fsKoofr";

class KoofrAuthModal extends Modal {
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

    const authUrl = generateAuthUrl(this.plugin.settings.koofr.api, true);
    const div2 = contentEl.createDiv();
    div2.createDiv({
      text: stringToFragment(t("modal_koofrauth_tutorial")),
    });
    div2.createEl(
      "button",
      {
        text: t("modal_koofrauth_copybutton"),
      },
      (el) => {
        el.onclick = async () => {
          await navigator.clipboard.writeText(authUrl);
          new Notice(t("modal_koofrauth_copynotice"));
        };
      }
    );

    contentEl.createEl("p").createEl("a", {
      href: authUrl,
      text: authUrl,
    });

    // let refreshToken = "";
    // new Setting(contentEl)
    //   .setName(t("modal_koofr_maualinput"))
    //   .setDesc(t("modal_koofr_maualinput_desc"))
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
    //       new Notice(t("modal_koofr_maualinput_notice"));

    //       try {
    //         if (this.plugin.settings.koofr === undefined) {
    //           this.plugin.settings.koofr = cloneDeep(
    //             DEFAULT_KOOFR_CONFIG
    //           );
    //         }
    //         this.plugin.settings.koofr.refreshToken = refreshToken;
    //         this.plugin.settings.koofr.accessToken = "access";
    //         this.plugin.settings.koofr.accessTokenExpiresAtTimeMs = 1;
    //         this.plugin.settings.koofr.accessTokenExpiresInMs = 1;

    //         // TODO: abstraction leaking now, how to fix?
    //         const k = await sendRefreshTokenReq(refreshToken);
    //         const ts = Date.now();
    //         this.plugin.settings.koofr.accessToken = k.access_token;
    //         this.plugin.settings.koofr.accessTokenExpiresInMs =
    //           k.expires_in * 1000;
    //         this.plugin.settings.koofr.accessTokenExpiresAtTimeMs =
    //           ts + k.expires_in * 1000 - 60 * 2 * 1000;
    //         await this.plugin.saveSettings();

    //         // try to remove data in clipboard
    //         await navigator.clipboard.writeText("");

    //         new Notice(t("modal_koofr_maualinput_succ_notice"));
    //       } catch (e) {
    //         console.error(e);
    //         new Notice(t("modal_koofr_maualinput_fail_notice"));
    //       } finally {
    //         this.authDiv.toggleClass(
    //           "koofr-auth-button-hide",
    //           this.plugin.settings.koofr.refreshToken !== ""
    //         );
    //         this.revokeAuthDiv.toggleClass(
    //           "koofr-revoke-auth-button-hide",
    //           this.plugin.settings.koofr.refreshToken === ""
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

class KoofrRevokeAuthModal extends Modal {
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
      text: t("modal_koofrrevokeauth_step1"),
    });
    const consentUrl = "https://app.koofr.net/app/admin/preferences/security";
    contentEl.createEl("p").createEl("a", {
      href: consentUrl,
      text: consentUrl,
    });

    contentEl.createEl("p", {
      text: t("modal_koofrrevokeauth_step2"),
    });

    new Setting(contentEl)
      .setName(t("modal_koofrrevokeauth_clean"))
      .setDesc(t("modal_koofrrevokeauth_clean_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("modal_koofrrevokeauth_clean_button"));
        button.onClick(async () => {
          try {
            this.plugin.settings.koofr = cloneDeep(DEFAULT_KOOFR_CONFIG);

            await this.plugin.saveSettings();
            this.authDiv.toggleClass(
              "koofr-auth-button-hide",
              this.plugin.settings.koofr.refreshToken !== ""
            );
            this.revokeAuthDiv.toggleClass(
              "koofr-revoke-auth-button-hide",
              this.plugin.settings.koofr.refreshToken === ""
            );
            new Notice(t("modal_koofrrevokeauth_clean_notice"));
            this.close();
          } catch (err) {
            console.error(err);
            new Notice(t("modal_koofrrevokeauth_clean_fail"));
          }
        });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export const generateKoofrSettingsPart = (
  containerEl: HTMLElement,
  t: (x: TransItemType, vars?: any) => string,
  app: App,
  plugin: RemotelySavePlugin,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  const koofrDiv = containerEl.createEl("div", {
    cls: "koofr-hide",
  });
  koofrDiv.toggleClass("koofr-hide", plugin.settings.serviceType !== "koofr");
  koofrDiv.createEl("h2", { text: t("settings_koofr") });

  const koofrLongDescDiv = koofrDiv.createEl("div", {
    cls: "settings-long-desc",
  });
  for (const c of [
    t("settings_koofr_disclaimer1"),
    t("settings_koofr_disclaimer2"),
  ]) {
    koofrLongDescDiv.createEl("p", {
      text: c,
      cls: "koofr-disclaimer",
    });
  }

  koofrLongDescDiv.createEl("p", {
    text: t("settings_koofr_folder", {
      remoteBaseDir: plugin.settings.koofr.remoteBaseDir || app.vault.getName(),
    }),
  });

  koofrLongDescDiv.createDiv({
    text: stringToFragment(t("settings_koofr_pro_desc")),
    cls: "koofr-disclaimer",
  });

  const koofrNotShowUpHintSetting = new Setting(koofrDiv)
    .setName(t("settings_koofr_notshowuphint"))
    .setDesc(t("settings_koofr_notshowuphint_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_koofr_notshowuphint_view_pro"));
      button.onClick(async () => {
        window.location.href = "#settings-pro";
      });
    });

  const koofrAllowedToUsedDiv = koofrDiv.createDiv();
  // if pro enabled, show up; otherwise hide.
  const allowKoofr =
    plugin.settings.pro?.enabledProFeatures.filter(
      (x) => x.featureName === "feature-koofr"
    ).length === 1;
  console.debug(`allow to show up koofr settings? ${allowKoofr}`);
  if (allowKoofr) {
    koofrAllowedToUsedDiv.removeClass("koofr-allow-to-use-hide");
    koofrNotShowUpHintSetting.settingEl.addClass("koofr-allow-to-use-hide");
  } else {
    koofrAllowedToUsedDiv.addClass("koofr-allow-to-use-hide");
    koofrNotShowUpHintSetting.settingEl.removeClass("koofr-allow-to-use-hide");
  }

  const koofrSelectAuthDiv = koofrAllowedToUsedDiv.createDiv();
  const koofrAuthDiv = koofrSelectAuthDiv.createDiv({
    cls: "koofr-auth-button-hide settings-auth-related",
  });
  const koofrRevokeAuthDiv = koofrSelectAuthDiv.createDiv({
    cls: "koofr-revoke-auth-button-hide settings-auth-related",
  });

  const koofrRevokeAuthSetting = new Setting(koofrRevokeAuthDiv)
    .setName(t("settings_koofr_revoke"))
    .setDesc(t("settings_koofr_revoke_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_koofr_revoke_button"));
      button.onClick(async () => {
        new KoofrRevokeAuthModal(
          app,
          plugin,
          koofrAuthDiv,
          koofrRevokeAuthDiv,
          t
        ).open();
      });
    });

  new Setting(koofrAuthDiv)
    .setName(t("settings_koofr_auth"))
    .setDesc(t("settings_koofr_auth_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_koofr_auth_button"));
      button.onClick(async () => {
        const modal = new KoofrAuthModal(
          app,
          plugin,
          koofrAuthDiv,
          koofrRevokeAuthDiv,
          koofrRevokeAuthSetting,
          t
        );
        plugin.oauth2Info.helperModal = modal;
        plugin.oauth2Info.authDiv = koofrAuthDiv;
        plugin.oauth2Info.revokeDiv = koofrRevokeAuthDiv;
        plugin.oauth2Info.revokeAuthSetting = koofrRevokeAuthSetting;
        modal.open();
      });
    });

  koofrAuthDiv.toggleClass(
    "koofr-auth-button-hide",
    plugin.settings.koofr.refreshToken !== ""
  );
  koofrRevokeAuthDiv.toggleClass(
    "koofr-revoke-auth-button-hide",
    plugin.settings.koofr.refreshToken === ""
  );

  let newkoofrRemoteBaseDir = plugin.settings.koofr.remoteBaseDir || "";
  new Setting(koofrAllowedToUsedDiv)
    .setName(t("settings_remotebasedir"))
    .setDesc(t("settings_remotebasedir_desc"))
    .addText((text) =>
      text
        .setPlaceholder(app.vault.getName())
        .setValue(newkoofrRemoteBaseDir)
        .onChange((value) => {
          newkoofrRemoteBaseDir = value.trim();
        })
    )
    .addButton((button) => {
      button.setButtonText(t("confirm"));
      button.onClick(() => {
        new ChangeRemoteBaseDirModal(
          app,
          plugin,
          newkoofrRemoteBaseDir,
          "koofr"
        ).open();
      });
    });
  new Setting(koofrAllowedToUsedDiv)
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
          new Notice(t("settings_koofr_connect_succ"));
        } else {
          new Notice(t("settings_koofr_connect_fail"));
          new Notice(errors.msg);
        }
      });
    });

  return {
    koofrDiv: koofrDiv,
    koofrAllowedToUsedDiv: koofrAllowedToUsedDiv,
    koofrNotShowUpHintSetting: koofrNotShowUpHintSetting,
  };
};
