import cloneDeep from "lodash/cloneDeep";
import { type App, Modal, Notice, Setting } from "obsidian";
import { getClient } from "../../src/fsGetter";
import type { TransItemType } from "../../src/i18n";
import type RemotelySavePlugin from "../../src/main";
import { stringToFragment } from "../../src/misc";
import { ChangeRemoteBaseDirModal } from "../../src/settings";
import { DEFAULT_PCLOUD_CONFIG, generateAuthUrl } from "./fsPCloud";

class PCloudAuthModal extends Modal {
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

    const { authUrl } = await generateAuthUrl(true);
    const div2 = contentEl.createDiv();
    div2.createDiv({
      text: stringToFragment(t("modal_pcloudauth_tutorial")),
    });
    div2.createEl(
      "button",
      {
        text: t("modal_pcloudauth_copybutton"),
      },
      (el) => {
        el.onclick = async () => {
          await navigator.clipboard.writeText(authUrl);
          new Notice(t("modal_pcloudauth_copynotice"));
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

class PCloudRevokeAuthModal extends Modal {
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
      text: t("modal_pcloudrevokeauth_step1"),
    });
    const consentUrl = "https://my.pcloud.com/#page=settings&settings=tab-apps";
    contentEl.createEl("p").createEl("a", {
      href: consentUrl,
      text: consentUrl,
    });

    contentEl.createEl("p", {
      text: t("modal_pcloudrevokeauth_step2"),
    });

    new Setting(contentEl)
      .setName(t("modal_pcloudrevokeauth_clean"))
      .setDesc(t("modal_pcloudrevokeauth_clean_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("modal_pcloudrevokeauth_clean_button"));
        button.onClick(async () => {
          try {
            this.plugin.settings.pcloud = cloneDeep(DEFAULT_PCLOUD_CONFIG);

            await this.plugin.saveSettings();
            this.authDiv.toggleClass(
              "pcloud-auth-button-hide",
              this.plugin.settings.pcloud.accessToken !== ""
            );
            this.revokeAuthDiv.toggleClass(
              "pcloud-revoke-auth-button-hide",
              this.plugin.settings.pcloud.accessToken === ""
            );
            new Notice(t("modal_pcloudrevokeauth_clean_notice"));
            this.close();
          } catch (err) {
            console.error(err);
            new Notice(t("modal_pcloudrevokeauth_clean_fail"));
          }
        });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export const generatePCloudSettingsPart = (
  containerEl: HTMLElement,
  t: (x: TransItemType, vars?: any) => string,
  app: App,
  plugin: RemotelySavePlugin,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  const pCloudDiv = containerEl.createEl("div", {
    cls: "pcloud-hide",
  });
  pCloudDiv.toggleClass(
    "pcloud-hide",
    plugin.settings.serviceType !== "pcloud"
  );
  pCloudDiv.createEl("h2", { text: t("settings_pcloud") });

  const pcloudLongDescDiv = pCloudDiv.createEl("div", {
    cls: "settings-long-desc",
  });
  for (const c of [
    t("settings_pcloud_disclaimer1"),
    t("settings_pcloud_disclaimer2"),
  ]) {
    pcloudLongDescDiv.createEl("p", {
      text: c,
      cls: "pcloud-disclaimer",
    });
  }

  pcloudLongDescDiv.createEl("p", {
    text: t("settings_pcloud_folder", {
      remoteBaseDir:
        plugin.settings.pcloud.remoteBaseDir || app.vault.getName(),
    }),
  });

  pcloudLongDescDiv.createDiv({
    text: stringToFragment(t("settings_pcloud_pro_desc")),
    cls: "pcloud-disclaimer",
  });

  const pCloudNotShowUpHintSetting = new Setting(pCloudDiv)
    .setName(t("settings_pcloud_notshowuphint"))
    .setDesc(t("settings_pcloud_notshowuphint_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_pcloud_notshowuphint_view_pro"));
      button.onClick(async () => {
        window.location.href = "#settings-pro";
      });
    });

  const pCloudAllowedToUsedDiv = pCloudDiv.createDiv();
  // if pro enabled, show up; otherwise hide.
  const allowPCloud =
    plugin.settings.pro?.enabledProFeatures.filter(
      (x) => x.featureName === "feature-pcloud"
    ).length === 1;
  console.debug(`allow to show up pcloud settings? ${allowPCloud}`);
  if (allowPCloud) {
    pCloudAllowedToUsedDiv.removeClass("pcloud-allow-to-use-hide");
    pCloudNotShowUpHintSetting.settingEl.addClass("pcloud-allow-to-use-hide");
  } else {
    pCloudAllowedToUsedDiv.addClass("pcloud-allow-to-use-hide");
    pCloudNotShowUpHintSetting.settingEl.removeClass(
      "pcloud-allow-to-use-hide"
    );
  }

  const pcloudSelectAuthDiv = pCloudAllowedToUsedDiv.createDiv();
  const pcloudAuthDiv = pcloudSelectAuthDiv.createDiv({
    cls: "pcloud-auth-button-hide settings-auth-related",
  });
  const pcloudRevokeAuthDiv = pcloudSelectAuthDiv.createDiv({
    cls: "pcloud-revoke-auth-button-hide settings-auth-related",
  });

  const pcloudRevokeAuthSetting = new Setting(pcloudRevokeAuthDiv)
    .setName(t("settings_pcloud_revoke"))
    .setDesc(t("settings_pcloud_revoke_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_pcloud_revoke_button"));
      button.onClick(async () => {
        new PCloudRevokeAuthModal(
          app,
          plugin,
          pcloudAuthDiv,
          pcloudRevokeAuthDiv,
          t
        ).open();
      });
    });

  new Setting(pcloudAuthDiv)
    .setName(t("settings_pcloud_auth"))
    .setDesc(t("settings_pcloud_auth_desc"))
    .addButton(async (button) => {
      button.setButtonText(t("settings_pcloud_auth_button"));
      button.onClick(async () => {
        const modal = new PCloudAuthModal(
          app,
          plugin,
          pcloudAuthDiv,
          pcloudRevokeAuthDiv,
          pcloudRevokeAuthSetting,
          t
        );
        plugin.oauth2Info.helperModal = modal;
        plugin.oauth2Info.authDiv = pcloudAuthDiv;
        plugin.oauth2Info.revokeDiv = pcloudRevokeAuthDiv;
        plugin.oauth2Info.revokeAuthSetting = pcloudRevokeAuthSetting;
        modal.open();
      });
    });

  pcloudAuthDiv.toggleClass(
    "pcloud-auth-button-hide",
    plugin.settings.pcloud.accessToken !== ""
  );
  pcloudRevokeAuthDiv.toggleClass(
    "pcloud-revoke-auth-button-hide",
    plugin.settings.pcloud.accessToken === ""
  );

  let newpcloudRemoteBaseDir = plugin.settings.pcloud.remoteBaseDir || "";
  new Setting(pCloudAllowedToUsedDiv)
    .setName(t("settings_remotebasedir"))
    .setDesc(t("settings_remotebasedir_desc"))
    .addText((text) =>
      text
        .setPlaceholder(app.vault.getName())
        .setValue(newpcloudRemoteBaseDir)
        .onChange((value) => {
          newpcloudRemoteBaseDir = value.trim();
        })
    )
    .addButton((button) => {
      button.setButtonText(t("confirm"));
      button.onClick(() => {
        new ChangeRemoteBaseDirModal(
          app,
          plugin,
          newpcloudRemoteBaseDir,
          "pcloud"
        ).open();
      });
    });

  new Setting(pCloudAllowedToUsedDiv)
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
          new Notice(t("settings_pcloud_connect_succ"));
        } else {
          new Notice(t("settings_pcloud_connect_fail"));
          new Notice(errors.msg);
        }
      });
    });

  return {
    pCloudDiv: pCloudDiv,
    pCloudAllowedToUsedDiv: pCloudAllowedToUsedDiv,
    pCloudNotShowUpHintSetting: pCloudNotShowUpHintSetting,
  };
};
