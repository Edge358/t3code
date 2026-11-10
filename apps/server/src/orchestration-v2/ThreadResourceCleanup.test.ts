// @effect-diagnostics nodeBuiltinImport:off -- Paths refer only to scoped disposable fixtures.
import * as NodePath from "node:path";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { CheckpointScopeId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import * as ProviderEventLoggers from "@t3tools/provider-core/server/ProviderEventLoggers";
import * as CheckpointStore from "../checkpointing/CheckpointStore.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as ServerConfig from "../config.ts";
import * as Sqlite from "../persistence/Sqlite.ts";
import { toSafeThreadAttachmentSegment } from "../attachmentStore.ts";
import { makeEventNdjsonLogStore, resolveThreadSegment } from "../provider/EventNdjsonLogger.ts";
import { checkpointRefForScopeOrdinal } from "./CheckpointService.ts";
import * as ThreadResourceCleanup from "./ThreadResourceCleanup.ts";

const vcsLayer = VcsProcess.layer.pipe(Layer.provide(NodeServices.layer));
const checkpointLayer = CheckpointStore.layer.pipe(
  Layer.provide(VcsDriverRegistry.layer.pipe(Layer.provide(vcsLayer))),
);
const base = Layer.mergeAll(checkpointLayer, vcsLayer, Sqlite.layerMemory).pipe(
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-resource-delete-" })),
  Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
);

it.effect(
  "removes owned scope refs including unrecorded refs, preserves shared refs, and reports locked refs",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const sql = yield* SqlClient.SqlClient;
      const vcs = yield* VcsProcess.VcsProcess;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-resource-delete-" });
      const git = (args: ReadonlyArray<string>) =>
        vcs.run({
          operation: "deletion.fixture",
          command: "git",
          cwd: directory,
          args,
          timeoutMs: 10_000,
        });
      yield* git(["init"]);
      yield* git([
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "--allow-empty",
        "-m",
        "fixture",
      ]);
      yield* fs.writeFileString(NodePath.join(directory, "keep.txt"), "working tree stays intact");
      const target = ThreadId.make("deleted");
      const kept = ThreadId.make("kept");
      // Helper ids longer than the segment limit once shared one cut log name.
      const helperPrefix = "helper-".padEnd(80, "a");
      const deletedHelper = ThreadId.make(`${helperPrefix}-deleted`);
      const keptHelper = ThreadId.make(`${helperPrefix}-kept`);
      // An id at the limit is never hashed, so its own log name is the helpers' pre-hash name.
      const prefixThread = ThreadId.make(helperPrefix);
      const logPath = (segment: string | null) => NodePath.join(directory, `events.${segment}.log`);
      const legacyHelperLog = logPath(toSafeThreadAttachmentSegment(deletedHelper));
      const scopeId = CheckpointScopeId.make("owned-scope");
      const shared = yield* checkpointRefForScopeOrdinal({ scopeId, ordinalWithinScope: 0 });
      const owned = yield* checkpointRefForScopeOrdinal({ scopeId, ordinalWithinScope: 1 });
      const neighbor = yield* checkpointRefForScopeOrdinal({
        scopeId: CheckpointScopeId.make("neighbor-scope"),
        ordinalWithinScope: 0,
      });
      for (const ref of [shared, owned, neighbor]) yield* git(["update-ref", ref, "HEAD"]);
      for (const threadId of [target, kept, deletedHelper, keptHelper, prefixThread])
        yield* sql`INSERT INTO orchestration_v2_projection_threads
      (thread_id, project_id, title, default_provider, runtime_mode, interaction_mode, created_at, updated_at, payload_json)
      VALUES (${threadId}, 'project', 'fixture', 'codex', 'full-access', 'default', '2026-11-01', '2026-11-01', '{}')`;
      yield* sql`INSERT INTO orchestration_v2_projection_checkpoint_scopes
      (scope_id, thread_id, node_id, kind, ordinal_within_parent, advances_app_run_count, created_at, payload_json)
      VALUES (${scopeId}, ${target}, 'node', 'root_run', 0, 1, '2026-11-01', ${JSON.stringify({ cwd: directory })})`;
      yield* sql`INSERT INTO orchestration_v2_projection_checkpoints
      (checkpoint_id, thread_id, scope_id, node_id, ordinal_within_scope, status, captured_at, payload_json)
      VALUES ('kept-copy', ${kept}, 'neighbor-scope', 'node', 0, 'ready', '2026-11-01', ${JSON.stringify({ ref: shared })})`;
      const store = yield* makeEventNdjsonLogStore(NodePath.join(directory, "events.log"));
      yield* store.logger("native").write({ text: "deleted transcript" }, target);
      yield* store.logger("native").write({ text: "kept transcript" }, kept);
      yield* store.logger("native").write({ text: "deleted helper" }, deletedHelper);
      yield* store.logger("native").write({ text: "kept helper" }, keptHelper);
      yield* fs.writeFileString(legacyHelperLog, "pre-hash helper transcripts");
      const cleanupLayer = ThreadResourceCleanup.layer.pipe(
        Layer.provide(
          Layer.succeed(ProviderEventLoggers.ProviderEventLoggers, {
            native: store.logger("native"),
            canonical: store.logger("canonical"),
          }),
        ),
      );
      yield* Effect.gen(function* () {
        const cleanup = yield* ThreadResourceCleanup.ThreadResourceCleanup;
        const lock = NodePath.join(directory, ".git", `${owned}.lock`);
        yield* fs.writeFileString(lock, "locked fixture");
        assert.equal(
          (yield* cleanup.cleanupCheckpoints(target, [target]).pipe(Effect.result))._tag,
          "Failure",
        );
        yield* fs.remove(lock);
        yield* cleanup.cleanupCheckpoints(target, [target]);
        yield* cleanup.cleanupCheckpoints(target, [target]);
        yield* cleanup.cleanupLogs(target, [target]);
        yield* cleanup.cleanupLogs(deletedHelper, [deletedHelper]);
        assert.isTrue(yield* fs.exists(legacyHelperLog));
        yield* cleanup.cleanupLogs(prefixThread, [prefixThread]);
        assert.isTrue(yield* fs.exists(legacyHelperLog));
        yield* cleanup.cleanupLogs(deletedHelper, [deletedHelper, keptHelper, prefixThread]);
        assert.isFalse(yield* fs.exists(legacyHelperLog));
      }).pipe(Effect.provide(cleanupLayer));
      yield* store.close();
      const refs = (yield* git(["for-each-ref", "--format=%(refname)", "refs/t3/"])).stdout;
      assert.include(refs, shared);
      assert.include(refs, neighbor);
      assert.notInclude(refs, owned);
      assert.equal(
        yield* fs.readFileString(NodePath.join(directory, "keep.txt")),
        "working tree stays intact",
      );
      assert.isFalse(yield* fs.exists(NodePath.join(directory, "events.deleted.log")));
      assert.include(
        yield* fs.readFileString(NodePath.join(directory, "events.kept.log")),
        "kept transcript",
      );
      assert.isFalse(yield* fs.exists(logPath(resolveThreadSegment(deletedHelper))));
      assert.include(
        yield* fs.readFileString(logPath(resolveThreadSegment(keptHelper))),
        "kept helper",
      );
    }).pipe(Effect.provide(base)),
);
