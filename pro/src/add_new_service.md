# checklist for adding new service

1. `fsXxx.ts`
2. `settingsXxx.ts`
3. add callback and `xxxConfig` in `baseTypesPro.ts`
4. add `xxxConfig` to `DEFAULT_SETTINGS` and `RemotelySavePluginSettings` in `main.ts`
5. add `registerObsidianProtocolHandler`, if undefinded, `let xxxExpired`, expired notice in `main.ts`
6. add `langs/`
7. add css into `styles.css`
8. general `settings.ts` add: config part, chooser, import export
9. `generateProSettingsPart.ts`
10. `importExport.ts`
11. `fsGetter.ts`
12. `sync.ts` checking for PRO: `checkProRunnableAndFixInplace`
13. `configPersist.test.ts`
14. `README.md` add service at menu and detail
15. `docs/` add service
