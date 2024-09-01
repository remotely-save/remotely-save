# Check performance

1. Go to settings, scroll to the very end, and enable the "Enable Profiler" option.
2. Also enable "Enable Profiler Printing".
3. Check Console Output (directly or via `vConsole` plugin). More details are [here](../how_to_debug/README.md).
4. Sync!
5. You can also "Export Profiler Results" afterwards. A new file `_debug_remotely_save/profiler_results_exported_on_xxxx.md` will be generated.

In the console or exported files, you can see the time cost of each steps.

![profiler settings](./profiler_settings.png)

![profiler exported](./profiler_exported.png)
