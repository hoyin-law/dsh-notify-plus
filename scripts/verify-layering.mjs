/**
 * Verify the load-bearing claim in this repository: the bundle patch really
 * disables DSH Desktop's built-in `desktop-notifications` row, and it degrades
 * to a warning rather than a boot failure on a host that has no such row.
 *
 * It composes the patch layers with the real `dsh` CLI instead of reimplementing
 * the patch algorithm, so a change in DSH's layering shows up here.
 *
 * Usage:
 *   node scripts/verify-layering.mjs
 *   node scripts/verify-layering.mjs --app "C:\Program Files\DSH Desktop\DSH Desktop.exe"
 *
 * The check is offline: `dump-config` composes the tree without mounting it, so
 * no harness process, profile install, or network access is involved.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_APP = {
  win32: "C:\\Program Files\\DSH Desktop\\DSH Desktop.exe",
  darwin: "/Applications/DSH Desktop.app/Contents/MacOS/DSH Desktop",
  linux: "/opt/DSH Desktop/dsh-desktop",
};

/** Parse `--app <executable>`; everything else is rejected loudly. */
function parseArgs(argv) {
  let app;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--app") {
      app = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`unknown argument ${JSON.stringify(argv[index])}`);
    }
  }
  return { app: app ?? DEFAULT_APP[process.platform] ?? DEFAULT_APP.linux };
}

/** Resolve the packaged CLI entry beside one DSH Desktop executable. */
function cliEntryFor(appPath) {
  const appDirectory = dirname(appPath);
  if (process.platform === "darwin") {
    return join(dirname(appDirectory), "Resources", "app.asar", "lib", "desktop-cli.js");
  }
  return join(appDirectory, "resources", "app.asar", "lib", "desktop-cli.js");
}

function writeProfile(home, name, { bundles, extraLayer }) {
  const profile = join(home, "profiles", name);
  mkdirSync(join(profile, "node_modules"), { recursive: true });
  writeFileSync(
    join(profile, "package.json"),
    `${JSON.stringify(
      { name: `dsh-profile-${name}`, private: true, dependencies: {}, dsh: { profile: { bundles } } },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(profile, "cordis.patch.yml"), "# verification fixture profile layer\n[]\n");
  writeFileSync(join(profile, "cordis.yml"), "[]\n");
  writeFileSync(
    join(profile, "pnpm-workspace.yaml"),
    "packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n",
  );
  for (const [name, target] of Object.entries({
    "dsh-notify-plus": REPO_ROOT,
    ...extraLayer,
  })) {
    symlinkSync(target, join(profile, "node_modules", name), process.platform === "win32" ? "junction" : "dir");
  }
  return profile;
}

/** Stand-in for the launcher-owned layer DSH Desktop splices in after web-app. */
function writeFakeDesktopLayer(root) {
  const layer = join(root, "fake-desktop-layer");
  mkdirSync(layer, { recursive: true });
  writeFileSync(
    join(layer, "package.json"),
    `${JSON.stringify(
      {
        name: "fake-desktop-layer",
        version: "0.0.0",
        private: true,
        type: "module",
        main: "cordis.patch.yml",
        dsh: { bundle: { patch: "./cordis.patch.yml" } },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(layer, "cordis.patch.yml"),
    [
      "# Stand-in for the launcher-owned dsh-plugin-desktop layer.",
      "- insert:",
      "    - id: desktop-shell",
      "      name: dsh-plugin-desktop",
      "      config:",
      "        mode: compatibility",
      "    - id: desktop-notifications",
      "      name: dsh-plugin-desktop/notifications",
      "",
    ].join("\n"),
  );
  return layer;
}

/** Run `dump-config` for one fixture profile and return stdout + exit code. */
function dumpConfig({ app, cliEntry, home, profile }) {
  const result = spawnSync(app, ["--expose-internals", cliEntry, "--profile", profile, "--dump-config"], {
    encoding: "utf8",
    env: { ...process.env, DSH_HOME: home, ELECTRON_RUN_AS_NODE: "1" },
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  return { stdout: `${result.stdout ?? ""}${result.stderr ?? ""}`, code: result.status ?? 1 };
}

const failures = [];
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures.push(message);
  }
}

function main() {
  const { app } = parseArgs(process.argv.slice(2));
  const cliEntry = cliEntryFor(app);
  const home = mkdtempSync(join(tmpdir(), "dsh-notify-plus-verify-"));
  console.log(`DSH Desktop executable: ${app}`);
  console.log(`Scratch DSH home:       ${home}\n`);

  try {
    const desktopLayer = writeFakeDesktopLayer(home);

    writeProfile(home, "layered", {
      bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "fake-desktop-layer", "dsh-notify-plus"],
      extraLayer: { "fake-desktop-layer": desktopLayer },
    });
    writeProfile(home, "plain", {
      bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-notify-plus"],
    });

    console.log("layered profile (launcher layer present, as on DSH Desktop)");
    const layered = dumpConfig({ app, cliEntry, home, profile: "layered" });
    check(layered.code === 0, "dump-config exits 0");
    check(
      /- id: desktop-notifications\n\s+name: dsh-plugin-desktop\/notifications\n\s+disabled: true/u.test(layered.stdout),
      "the built-in desktop-notifications row is disabled by this bundle",
    );
    check(
      /- id: desktop-notifications\n\s+name: dsh-plugin-desktop\/notifications\n\s+disabled: true[\s\S]*?- id: dsh-notify-plus/u.test(
        layered.stdout,
      ),
      "this plugin's row is composed after it",
    );
    check(layered.stdout.includes("# == fake-desktop-layer, patched by dsh-notify-plus"), "the patch provenance is attributed to this package");

    console.log("\nplain profile (no launcher layer, e.g. a headless or web-only host)");
    const plain = dumpConfig({ app, cliEntry, home, profile: "plain" });
    check(plain.code === 0, "dump-config still exits 0");
    check(/entry "desktop-notifications" not found/u.test(plain.stdout), "the missing target is reported as a warning");
    check(/- id: dsh-notify-plus/u.test(plain.stdout), "this plugin's row is still composed");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nPatch layering verified.");
}

main();
