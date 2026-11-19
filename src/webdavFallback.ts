// Only the read-only probe may time out. Never retry a sync operation on another URL.
export async function chooseWebdavAddress(
  primary: string,
  fallback: string | undefined,
  probe: (address: string) => Promise<boolean>,
  timeoutMs = 7500
): Promise<string> {
  if (!fallback?.trim()) return primary;
  const alternative = new URL(fallback.trim());
  if (
    !["http:", "https:"].includes(alternative.protocol) ||
    alternative.username ||
    alternative.password ||
    alternative.search ||
    alternative.hash
  ) {
    throw Error("Invalid WebDAV fallback server address");
  }
  if (primary.replace(/\/+$/, "") === alternative.href.replace(/\/+$/, ""))
    return primary;

  for (const address of [primary, alternative.href]) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const available = await Promise.race([
        probe(address),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        }),
      ]);
      if (available) return address;
    } catch {
      // A transport, authentication or collection lookup failure can be route-specific.
    } finally {
      clearTimeout(timer);
    }
  }
  throw Error(
    "Neither WebDAV address could access the existing remote vault folder"
  );
}
