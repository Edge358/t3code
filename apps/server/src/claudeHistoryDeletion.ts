// @effect-diagnostics nodeBuiltinImport:off -- This isolated SDK worker uses native lstat to reject links before destructive operations.
import { deleteSession } from "@anthropic-ai/claude-agent-sdk";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const exists = async (file: string) =>
  NodeFSP.lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });

export async function deleteClaudeHistory(
  sessionId: string,
  protectedNativeIds: ReadonlyArray<string> = [],
): Promise<"deleted" | "absent" | "retained"> {
  if (protectedNativeIds.includes(sessionId)) return "retained";
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(sessionId)) {
    throw new Error("Claude history deletion requires a native session UUID.");
  }
  const home = NodePath.resolve(
    process.env.CLAUDE_CONFIG_DIR || NodePath.join(NodeOS.homedir(), ".claude"),
  );
  const removeSessionEnvironment = async () => {
    const parent = NodePath.join(home, "session-env");
    const parentInfo = await exists(parent);
    if (parentInfo === undefined) return;
    if (parentInfo.isSymbolicLink())
      throw new Error("Claude session environment storage is a link.");
    const target = NodePath.join(await NodeFSP.realpath(parent), sessionId);
    const info = await exists(target);
    if (info === undefined) return;
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error("Claude session environment is not a regular directory.");
    await NodeFSP.rmdir(target);
  };
  const projects = NodePath.join(home, "projects");
  const projectRoot = await exists(projects);
  if (projectRoot === undefined) {
    await removeSessionEnvironment();
    return "absent";
  }
  if (projectRoot.isSymbolicLink()) {
    throw new Error("Claude history storage is a link; deletion was not attempted.");
  }
  // A redirected profile or junction above ~/.claude is ordinary on Windows; work on the real folder.
  const root = await NodeFSP.realpath(projects);
  const matches: Array<{ transcript: string; children: string }> = [];
  for (const entry of await NodeFSP.readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error("Claude project history contains a link; deletion was not attempted.");
    if (!entry.isDirectory()) continue;
    const parent = NodePath.join(root, entry.name);
    const transcript = NodePath.join(parent, `${sessionId}.jsonl`);
    const children = NodePath.join(parent, sessionId);
    const file = await exists(transcript);
    const folder = await exists(children);
    if (file?.isSymbolicLink() || folder?.isSymbolicLink())
      throw new Error("Claude session history is a link.");
    if (file !== undefined || folder !== undefined) matches.push({ transcript, children });
  }
  if (matches.length === 0) {
    await removeSessionEnvironment();
    return "absent";
  }
  if (matches.length > 1)
    throw new Error("Claude session ID appears in multiple project histories.");
  const match = matches[0]!;
  if (await exists(match.children)) {
    const descendants = await NodeFSP.readdir(match.children, {
      recursive: true,
      withFileTypes: true,
    });
    const protectedFiles = new Set(
      protectedNativeIds.flatMap((id) => [`${id}.jsonl`, `agent-${id}.jsonl`]),
    );
    if (descendants.some((entry) => entry.isSymbolicLink()))
      throw new Error("Claude child history contains a link.");
    if (descendants.some((entry) => protectedFiles.has(entry.name))) return "retained";
  }
  if (await exists(match.transcript)) await deleteSession(sessionId);
  // An earlier SDK call may have removed the transcript before its child-directory removal failed.
  if (await exists(match.transcript)) throw new Error("Claude transcript remains after deletion.");
  const children = await exists(match.children);
  if (children?.isSymbolicLink()) throw new Error("Claude child history changed to a link.");
  if (children) await NodeFSP.rm(match.children, { recursive: true, force: true });
  if (await exists(match.children)) throw new Error("Claude child history remains after deletion.");
  await removeSessionEnvironment();
  return "deleted";
}
