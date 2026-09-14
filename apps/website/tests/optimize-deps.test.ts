import type { ViteConfig } from "nuxt/schema";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadNuxt } from "nuxt/kit";
import { optimizeDeps, resolveConfig } from "vite-plus";
import { expect, test } from "vite-plus/test";

test("MDC 的预构建依赖通过 Nuxt Content 解析", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const nuxt = await loadNuxt({ cwd: root, dev: true, ready: true });
  const cacheDir = await mkdtemp(join(tmpdir(), "newblog-optimize-deps-"));
  try {
    const config = {
      ...nuxt.options.vite,
      root,
      vue: { template: { compilerOptions: {} } },
      optimizeDeps: { include: ["vue"] },
    } satisfies ViteConfig;
    const context = { isClient: true, isServer: false };
    await nuxt.callHook("vite:extend", { nuxt, config });
    await nuxt.callHook("vite:extendConfig", config, context);
    await nuxt.callHook("vite:configResolved", config, context);

    const includes = config.optimizeDeps?.include ?? [];
    expect(includes).toContain("vue");
    const mdcIncludes = includes.filter((id) => id.includes("@nuxtjs/mdc > "));
    expect(mdcIncludes.length).toBeGreaterThan(0);
    expect(mdcIncludes.every((id) => id.startsWith("@nuxt/content > @nuxtjs/mdc > "))).toBe(true);

    const vite = await resolveConfig(
      {
        root,
        configFile: false,
        cacheDir,
        logLevel: "silent",
        optimizeDeps: { include: mdcIncludes, noDiscovery: true },
      },
      "serve",
    );
    const metadata = await optimizeDeps(vite, true);
    for (const id of mdcIncludes) {
      expect(metadata.optimized[id]?.file, id).toBeTruthy();
    }
  } finally {
    await nuxt.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
}, 30_000);
