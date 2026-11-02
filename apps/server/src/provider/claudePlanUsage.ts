import type { SDKControlGetUsageResponse } from "@anthropic-ai/claude-agent-sdk";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { readOAuthLogin, withClaudeHeaders } from "./claudeResetCredits.ts";

const Window = Schema.Struct({
  utilization: Schema.NullOr(Schema.Finite),
  resets_at: Schema.NullOr(Schema.String),
});
const decodeModelLimit = Schema.decodeUnknownOption(
  Schema.Struct({
    kind: Schema.Literal("weekly_scoped"),
    percent: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
    resets_at: Schema.NullOr(Schema.String),
    scope: Schema.Struct({
      model: Schema.Struct({ display_name: Schema.NonEmptyString }),
      surface: Schema.Null,
    }),
  }),
);
const PlanUsage = Schema.Struct({
  five_hour: Schema.optionalKey(Schema.NullOr(Window)),
  seven_day: Schema.optionalKey(Schema.NullOr(Window)),
  extra_usage: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        is_enabled: Schema.Boolean,
        monthly_limit: Schema.NullOr(Schema.Finite),
        used_credits: Schema.NullOr(Schema.Finite),
        utilization: Schema.NullOr(Schema.Finite),
      }),
    ),
  ),
  // The existing usage mapper validates this optional budget separately.
  spend: Schema.optionalKey(Schema.Unknown),
  limits: Schema.optionalKey(Schema.Unknown),
});

export type ClaudePlanUsageResult =
  | { readonly usage: Pick<SDKControlGetUsageResponse, "rate_limits_available" | "rate_limits"> }
  | { readonly message: string };

/** Read only plan usage; keep the CLI's broad optional-traffic restriction enabled. */
export const readClaudePlanUsage = Effect.fn("readClaudePlanUsage")(
  function* (configDir: string, version: string) {
    if ((yield* HostProcess.Platform) === "darwin") {
      return {
        message:
          "Claude limits are unavailable while optional Claude traffic is disabled; the macOS Keychain login is not read.",
      } satisfies ClaudePlanUsageResult;
    }
    const login = yield* readOAuthLogin(configDir);
    if (!login) {
      return {
        message: "Claude limits need a readable local subscription login.",
      } satisfies ClaudePlanUsageResult;
    }
    // The CLI renews an expired login on its next turn; a request now would only return 401.
    if (
      login.expiresAtMs !== undefined &&
      login.expiresAtMs <= DateTime.toEpochMillis(yield* DateTime.now)
    ) {
      return {
        message: "Claude's saved login has expired. Limits return after your next Claude turn.",
      } satisfies ClaudePlanUsageResult;
    }
    const token = login.accessToken;
    const client = yield* HttpClient.HttpClient;
    // Fixed first-party endpoint; no redirects, prompt, or transcript data.
    const response = yield* client
      .execute(
        HttpClientRequest.get("https://api.anthropic.com/api/oauth/usage").pipe(
          withClaudeHeaders(token, version),
        ),
      )
      .pipe(Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }));
    if (response.status !== 200) {
      const message =
        response.status === 401
          ? "Claude could not authenticate the limits request. Sign in to Claude again."
          : response.status === 403
            ? "Claude refused access to subscription limits."
            : response.status === 429
              ? "Claude is rate limiting usage checks. Try again later."
              : "Claude could not return subscription limits. Try again later.";
      return { message } satisfies ClaudePlanUsageResult;
    }
    const body = yield* HttpClientResponse.schemaBodyJson(PlanUsage)(response);
    const modelScoped = (Array.isArray(body.limits) ? body.limits : [])
      .flatMap((entry) => Option.toArray(decodeModelLimit(entry)))
      .filter((entry) => entry.scope.model.display_name.trim().length > 0)
      .map((entry) => ({
        display_name: entry.scope.model.display_name.trim(),
        utilization: entry.percent,
        resets_at: entry.resets_at,
      }));
    if (
      !("five_hour" in body || "seven_day" in body || "extra_usage" in body || "spend" in body) &&
      modelScoped.length === 0
    ) {
      return {
        message: "Claude returned an unrecognized limits response.",
      } satisfies ClaudePlanUsageResult;
    }
    return {
      usage: {
        rate_limits_available: true,
        rate_limits: { ...body, model_scoped: modelScoped },
      },
    } satisfies ClaudePlanUsageResult;
  },
  Effect.timeout("5 seconds"),
  Effect.catch((error) =>
    Effect.succeed<ClaudePlanUsageResult>({
      message: Cause.isTimeoutError(error)
        ? "Claude limits request timed out. Try again."
        : "Could not read Claude limits. Check the connection and local login, then try again.",
    }),
  ),
);
