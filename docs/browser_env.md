English | [中文](/docs/browser_env.zh-cn.md)

# Limitations From The Browser Environment

Obsidian desktop is developed by using [Electron](https://www.electronjs.org/). And Obsidian mobile is developed by using [Capacitor](https://capacitorjs.com/)

Technically, the plugin (or any plugin?) runs in the js environment provided by Obsidian. And to support the mobile Obsidian, the plugin is limited to be developed for the browser environment, instead of the Node.js environment.

Then some limitations are applied:

1. [The CORS issue (solved in the new Obsidian version on some platforms).](./browser_env_cors.md)
2. [No Node.js environment.](./browser_env_no_nodejs.md)
3. If the cloud service uses OAuth flow, it needs to support PKCE. More details are [here](./browser_env_oauth2_pkce.md).
4. [No background running after Obsidian is closes.](./browser_env_no_background_after_closing.md)
