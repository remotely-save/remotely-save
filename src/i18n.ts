import merge from "lodash/merge";
import Mustache from "mustache";
import { moment } from "obsidian";

import { LANGS as LANGS_PRO } from "../pro/src/langs";
import { LANGS as LANGS_BASIC } from "./langs";

const LANGS = merge(LANGS_BASIC, LANGS_PRO);

export type LangType = keyof typeof LANGS;
export type LangTypeAndAuto = LangType | "auto";
export type TransItemType = keyof (typeof LANGS)["en"];

export class I18n {
  lang: LangTypeAndAuto;
  readonly saveSettingFunc: (tolang: LangTypeAndAuto) => Promise<void>;
  constructor(
    lang: LangTypeAndAuto,
    saveSettingFunc: (tolang: LangTypeAndAuto) => Promise<void>
  ) {
    this.lang = lang;
    this.saveSettingFunc = saveSettingFunc;
  }
  async changeTo(anotherLang: LangTypeAndAuto) {
    this.lang = anotherLang;
    await this.saveSettingFunc(anotherLang);
  }

  /**
   * Detect the language set in Obsidian's settings.
   *
   * `moment.locale()` is a mutable global state: other plugins may change
   * it, and it may not be ready yet when this plugin loads, so it can
   * return "en" even when the user chose another language. Obsidian
   * persists its language setting in localStorage under the "language"
   * key, which has neither problem, so read it first and only fall back
   * to `moment.locale()` if that fails.
   *
   * The raw value is normalized to match the keys in LANGS, e.g. both
   * Obsidian's "zh" (Simplified Chinese) and moment's "zh-cn" map to
   * "zh_cn", and "zh-TW" maps to "zh_tw".
   */
  private detectLang(): string {
    let raw = "";
    try {
      raw = window.localStorage.getItem("language") ?? "";
    } catch (e) {
      // localStorage can be unavailable in some contexts; fall back below.
    }
    if (!raw) {
      raw = moment.locale();
    }
    const normalized = raw.toLowerCase().replace("-", "_");
    if (normalized === "zh" || normalized === "zh_hans") {
      return "zh_cn";
    }
    return normalized;
  }

  _get(key: TransItemType) {
    let realLang: LangType = "en";
    if (this.lang === "auto") {
      const detected = this.detectLang();
      if (detected in LANGS) {
        realLang = detected as LangType;
      }
    } else {
      realLang = this.lang;
    }

    const res: string =
      (LANGS[realLang] as (typeof LANGS)["en"])[key] || LANGS["en"][key] || key;
    return res;
  }

  t(key: TransItemType, vars?: Record<string, string>) {
    if (vars === undefined) {
      return this._get(key);
    }
    return Mustache.render(this._get(key), vars);
  }
}
