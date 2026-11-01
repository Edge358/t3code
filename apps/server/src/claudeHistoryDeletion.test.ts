// @effect-diagnostics nodeBuiltinImport:off -- Tests exercise the isolated SDK worker against disposable native files.
import * as NodeFSP from "node:fs/promises";
import * as NodeChildProcess from "node:child_process";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { expect, it } from "vite-plus/test";

const target = "11111111-1111-4111-8111-111111111111";
const neighbor = "22222222-2222-4222-8222-222222222222";
const worker = NodeURL.fileURLToPath(new URL("./claude-history-worker.ts", import.meta.url));

it.each(["complete", "orphaned-children", "shared-child", "junction-home"])(
  "deletes %s history and keeps its neighbor using the installed Claude SDK",
  async (scenario) => {
    const home = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-claude-delete-"));
    // A redirected Windows profile reaches the Claude home through a junction.
    const configDir = scenario === "junction-home" ? `${home}-link` : home;
    try {
      if (configDir !== home) await NodeFSP.symlink(home, configDir, "junction");
      const project = NodePath.join(home, "projects", "disposable-project");
      const child = NodePath.join(project, target, "subagents");
      await NodeFSP.mkdir(child, { recursive: true });
      await NodeFSP.writeFile(NodePath.join(child, "agent-test.jsonl"), "synthetic child\n");
      if (scenario !== "orphaned-children")
        await NodeFSP.writeFile(
          NodePath.join(project, `${target}.jsonl`),
          JSON.stringify({
            type: "user",
            sessionId: target,
            message: { role: "user", content: "synthetic" },
          }) + "\n",
        );
      await NodeFSP.writeFile(NodePath.join(project, `${neighbor}.jsonl`), "keep this history\n");
      const run = (protectedNativeIds: string[] = []) =>
        NodeChildProcess.spawnSync(
          process.execPath,
          [worker, "deleteSession", target, JSON.stringify({ protectedNativeIds })],
          {
            env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
            encoding: "utf8",
          },
        );
      if (scenario === "shared-child") {
        const kept = run(["test"]);
        expect(kept.status, kept.stderr).toBe(0);
        expect(JSON.parse(kept.stdout)).toBe("retained");
        expect((await NodeFSP.stat(NodePath.join(project, `${target}.jsonl`))).isFile()).toBe(true);
        expect(await NodeFSP.readFile(NodePath.join(child, "agent-test.jsonl"), "utf8")).toBe(
          "synthetic child\n",
        );
      }
      const first = run();
      expect(first.status, first.stderr).toBe(0);
      expect(JSON.parse(first.stdout)).toBe("deleted");
      await expect(NodeFSP.stat(NodePath.join(project, `${target}.jsonl`))).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(NodeFSP.stat(NodePath.join(project, target))).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(await NodeFSP.readFile(NodePath.join(project, `${neighbor}.jsonl`), "utf8")).toBe(
        "keep this history\n",
      );
      const retry = run();
      expect(retry.status, retry.stderr).toBe(0);
      expect(JSON.parse(retry.stdout)).toBe("absent");
    } finally {
      if (configDir !== home) await NodeFSP.unlink(configDir).catch(() => NodeFSP.rmdir(configDir));
      await NodeFSP.rm(home, { recursive: true, force: true });
    }
  },
);
