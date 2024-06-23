import cloneDeep from "lodash/cloneDeep";
import { type App, Modal, Notice, Platform, Setting } from "obsidian";
import { getClient } from "../../src/fsGetter";
import type { TransItemType } from "../../src/i18n";
import type RemotelySavePlugin from "../../src/main";
import { stringToFragment } from "../../src/misc";
import { ChangeRemoteBaseDirModal } from "../../src/settings";
import {
  DEFAULT_ONEDRIVEFULL_CONFIG,
  getAuthUrlAndVerifier as getAuthUrlAndVerifierOnedriveFull,
  sendRefreshTokenReq as sendRefreshTokenReqOnedriveFull,
} from "./fsOnedriveFull";

export class OnedriveFullAuthModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  readonly authDiv: HTMLDivElement;
  readonly revokeAuthDiv: HTMLDivElement;
  readonly revokeAuthSetting: Setting;
  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    authDiv: HTMLDivElement,
    revokeAuthDiv: HTMLDivElement,
    revokeAuthSetting: Setting
  ) {
    super(app);
    this.plugin = plugin;
    this.authDiv = authDiv;
    this.revokeAuthDiv = revokeAuthDiv;
    this.revokeAuthSetting = revokeAuthSetting;
  }

  async onOpen() {
    const { contentEl } = this;

    const { authUrl, verifier } = await getAuthUrlAndVerifierOnedriveFull(
      this.plugin.settings.onedrivefull.clientID,
      this.plugin.settings.onedrivefull.authority
    );
    this.plugin.oauth2Info.verifier = verifier;

    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    t("modal_onedrivefullauth_shortdesc")
      .split("\n")
      .forEach((val) => {
        contentEl.createEl("p", {
          text: val,
        });
      });
    if (Platform.isLinux) {
      t("modal_onedrivefullauth_shortdesc_linux")
        .split("\n")
        .forEach((val) => {
          contentEl.createEl("p", {
            text: stringToFragment(val),
          });
        });
    }
    const div2 = contentEl.createDiv();
    div2.createEl(
      "button",
      {
        text: t("modal_onedrivefullauth_copybutton"),
      },
      (el) => {
        el.onclick = async () => {
          await navigator.clipboard.writeText(authUrl);
          new Notice(t("modal_onedrivefullauth_copynotice"));
        };
      }
    );

    contentEl.createEl("p").createEl("a", {
      href: authUrl,
      text: authUrl,
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export class OnedriveFullRevokeAuthModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  readonly authDiv: HTMLDivElement;
  readonly revokeAuthDiv: HTMLDivElement;
  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    authDiv: HTMLDivElement,
    revokeAuthDiv: HTMLDivElement
  ) {
    super(app);
    this.plugin = plugin;
    this.authDiv = authDiv;
    this.revokeAuthDiv = revokeAuthDiv;
  }

  async onOpen() {
    const { contentEl } = this;
    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    contentEl.createEl("p", {
      text: t("modal_onedrivefullrevokeauth_step1"),
    });
    const consentUrl = "https://microsoft.com/consent";
    contentEl.createEl("p").createEl("a", {
      href: consentUrl,
      text: consentUrl,
    });

    contentEl.createEl("p", {
      text: t("modal_onedrivefullrevokeauth_step2"),
    });

    new Setting(contentEl)
      .setName(t("modal_onedrivefullrevokeauth_clean"))
      .setDesc(t("modal_onedrivefullrevokeauth_clean_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("modal_onedrivefullrevokeauth_clean_button"));
        button.onClick(async () => {
          try {
            this.plugin.settings.onedrivefull = JSON.parse(
              JSON.stringify(DEFAULT_ONEDRIVEFULL_CONFIG)
            );
            await this.plugin.saveSettings();
            this.authDiv.toggleClass(
              "onedrivefull-auth-button-hide",
              this.plugin.settings.onedrivefull.username !== ""
            );
            this.revokeAuthDiv.toggleClass(
              "onedrivefull-revoke-auth-button-hide",
              this.plugin.settings.onedrivefull.username === ""
            );
            new Notice(t("modal_onedrivefullrevokeauth_clean_notice"));
            this.close();
          } catch (err) {
            console.error(err);
            new Notice(t("modal_onedrivefullrevokeauth_clean_fail"));
          }
        });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export const generateOnedriveFullSettingsPart = (
  containerEl: HTMLElement,
  t: (x: TransItemType, vars?: any) => string,
  app: App,
  plugin: RemotelySavePlugin,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  const onedriveFullDiv = containerEl.createEl("div", {
    cls: "onedrivefull-hide",
  });
  onedriveFullDiv.toggleClass(
    "onedrivefull-hide",
    plugin.settings.serviceType !== "onedrivefull"
  );
  onedriveFullDiv.createEl("h2", { text: t("settings_onedrivefull") });

  const onedriveFullLongDescDiv = onedriveFullDiv.createEl("div", {
    cls: "settings-long-desc",
  });
  for (const c of [
    t("settings_onedrivefull_disclaimer1"),
    t("settings_onedrivefull_disclaimer2"),
  ]) {
    onedriveFullLongDescDiv.createEl("p", {
      text: c,
      cls: "onedrivefull-disclaimer",
    });
  }

  onedriveFullLongDescDiv.createEl("p", {
    text: t("settings_onedrivefull_folder", {
      remoteBaseDir:
        plugin.settings.onedrivefull.remoteBaseDir || app.vault.getName(),
    }),
  });

  onedriveFullLongDescDiv.createEl("p", {
    text: t("settings_onedrivefull_nobiz"),
  });

  onedriveFullLongDescDiv.createDiv({
    text: stringToFragment(t("settings_onedrivefull_pro_desc")),
    cls: "onedrivefull-disclaimer",
  });

  const onedriveFullNotShowUpHintSetting = new Setting(onedriveFullDiv)
    .setName(t("settings_onedrivefull_notshowuphint"))
    .setDesc(t("settings_onedrivefull_notshowuphint_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_onedrivefull_notshowuphint_view_pro"));
      button.onClick(async () => {
        window.location.href = "#settings-pro";
      });
    });

  const onedriveFullAllowedToUsedDiv = onedriveFullDiv.createDiv();
  // if pro enabled, show up; otherwise hide.
  const allowOnedriveFull =
    plugin.settings.pro?.enabledProFeatures.filter(
      (x) => x.featureName === "feature-onedrive_full"
    ).length === 1;
  console.debug(`allow to show up onedriveFull settings? ${allowOnedriveFull}`);
  if (allowOnedriveFull) {
    onedriveFullAllowedToUsedDiv.removeClass("onedrivefull-allow-to-use-hide");
    onedriveFullNotShowUpHintSetting.settingEl.addClass(
      "onedrivefull-allow-to-use-hide"
    );
  } else {
    onedriveFullAllowedToUsedDiv.addClass("onedrivefull-allow-to-use-hide");
    onedriveFullNotShowUpHintSetting.settingEl.removeClass(
      "onedrivefull-allow-to-use-hide"
    );
  }

  const onedriveFullSelectAuthDiv = onedriveFullAllowedToUsedDiv.createDiv();
  const onedriveFullAuthDiv = onedriveFullSelectAuthDiv.createDiv({
    cls: "onedrivefull-auth-button-hide settings-auth-related",
  });
  const onedriveFullRevokeAuthDiv = onedriveFullSelectAuthDiv.createDiv({
    cls: "onedrivefull-revoke-auth-button-hide settings-auth-related",
  });

  const onedriveFullRevokeAuthSetting = new Setting(onedriveFullRevokeAuthDiv)
    .setName(t("settings_onedrivefull_revoke"))
    .setDesc(t("settings_onedrivefull_revoke_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_onedrivefull_revoke_button"));
      button.onClick(async () => {
        new OnedriveFullRevokeAuthModal(
          app,
          plugin,
          onedriveFullAuthDiv,
          onedriveFullRevokeAuthDiv
        ).open();
      });
    });

  new Setting(onedriveFullAuthDiv)
    .setName(t("settings_onedrivefull_auth"))
    .setDesc(t("settings_onedrivefull_auth_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_onedrivefull_auth_button"));
      button.onClick(async () => {
        const modal = new OnedriveFullAuthModal(
          app,
          plugin,
          onedriveFullAuthDiv,
          onedriveFullRevokeAuthDiv,
          onedriveFullRevokeAuthSetting
        );
        plugin.oauth2Info.helperModal = modal;
        plugin.oauth2Info.authDiv = onedriveFullAuthDiv;
        plugin.oauth2Info.revokeDiv = onedriveFullRevokeAuthDiv;
        plugin.oauth2Info.revokeAuthSetting = onedriveFullRevokeAuthSetting;
        modal.open();
      });
    });

  onedriveFullAuthDiv.toggleClass(
    "onedrivefull-auth-button-hide",
    plugin.settings.onedrivefull.refreshToken !== ""
  );
  onedriveFullRevokeAuthDiv.toggleClass(
    "onedrivefull-revoke-auth-button-hide",
    plugin.settings.onedrivefull.refreshToken === ""
  );

  let newonedriveFullRemoteBaseDir =
    plugin.settings.onedrivefull.remoteBaseDir || "";
  new Setting(onedriveFullAllowedToUsedDiv)
    .setName(t("settings_remotebasedir"))
    .setDesc(t("settings_remotebasedir_desc"))
    .addText((text) =>
      text
        .setPlaceholder(app.vault.getName())
        .setValue(newonedriveFullRemoteBaseDir)
        .onChange((value) => {
          newonedriveFullRemoteBaseDir = value.trim();
        })
    )
    .addButton((button) => {
      button.setButtonText(t("confirm"));
      button.onClick(() => {
        new ChangeRemoteBaseDirModal(
          app,
          plugin,
          newonedriveFullRemoteBaseDir,
          "onedrivefull"
        ).open();
      });
    });
  new Setting(onedriveFullAllowedToUsedDiv)
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
          new Notice(t("settings_onedrivefull_connect_succ"));
        } else {
          new Notice(t("settings_onedrivefull_connect_fail"));
          new Notice(errors.msg);
        }
      });
    });

  return {
    onedriveFullDiv: onedriveFullDiv,
    onedriveFullAllowedToUsedDiv: onedriveFullAllowedToUsedDiv,
    onedriveFullNotShowUpHintSetting: onedriveFullNotShowUpHintSetting,
  };
};
