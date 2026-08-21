import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { env } from "../env.js";
import { repoByUrl } from "../graph/queries.js";
import {
  WEBHOOK_DELIVERY_HEADER,
  WEBHOOK_DELIVERY_PREFIX,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_HOOK_ID_HEADER,
  WEBHOOK_PATH,
  WEBHOOK_RATE_MAX,
  WEBHOOK_RATE_WINDOW,
  WEBHOOK_REPLAY_TTL_SECONDS,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SIGNATURE_PREFIX,
} from "../queue/constants.js";
import { enqueueParse } from "../queue/parse.js";
import { redis } from "../redis.js";
import { normaliseRepoUrl } from "../repos/register.js";

/**
 * GitHub's push webhook.
 *
 * Registered outside the /api session gate, because GitHub sends no cookie.
 * The signature is what authenticates it, and it is the only thing that does --
 * so nothing below acts on the body until the HMAC has matched.
 *
 * Every answer is a 2xx unless the request is unauthentic. GitHub disables a
 * hook that keeps erroring, and "this repository is not registered here" is not
 * a failure worth losing the hook over.
 */
export async function registerWebhook(app: FastifyInstance) {
  await app.register(async (scope) => {
    // The raw bytes, in this scope only.
    //
    // The signature covers exactly what GitHub sent. Fastify's default JSON
    // parser hands back a parsed object and drops the text, and re-serialising
    // it does not reproduce the original bytes -- key order and whitespace are
    // not preserved, so the digest never matches and it reads as a wrong
    // secret. Scoped rather than global so no other route loses its parsed body.
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req, body, done) => done(null, body),
    );

    scope.post(
      WEBHOOK_PATH,
      {
        config: {
          rateLimit: {
            max: WEBHOOK_RATE_MAX,
            timeWindow: WEBHOOK_RATE_WINDOW,
            // Keyed on the hook id, which is stable per configured webhook and
            // therefore per repository -- not on the body, which is not parsed
            // yet: the limiter runs onRequest, so a key read out of req.body is
            // undefined for every request and each one gets its own bucket,
            // which is a throttle that never throttles. Falls back to the IP.
            keyGenerator: (req) => String(req.headers[WEBHOOK_HOOK_ID_HEADER] ?? req.ip),
          },
        },
      },
      async (req, reply) => {
        const raw = req.body as Buffer;

        if (!signatureMatches(raw, req.headers[WEBHOOK_SIGNATURE_HEADER])) {
          req.log.warn("webhook signature did not match");
          return reply.code(401).send({ error: "bad signature" });
        }

        // Only now is any of this trustworthy.
        const delivery = String(req.headers[WEBHOOK_DELIVERY_HEADER] ?? "");
        const event = String(req.headers[WEBHOOK_EVENT_HEADER] ?? "");

        if (event !== "push") {
          return reply.send({ ok: true, ignored: event });
        }

        // SET NX returns null when the key was already there. One round trip,
        // so two deliveries racing cannot both win.
        if (delivery !== "") {
          const first = await redis.set(
            WEBHOOK_DELIVERY_PREFIX + delivery,
            "1",
            "EX",
            WEBHOOK_REPLAY_TTL_SECONDS,
            "NX",
          );
          if (first === null) {
            // 200, never 4xx: a replay is GitHub retrying, and answering it
            // with an error is how a working hook gets disabled.
            return reply.send({ ok: true, replay: true });
          }
        }

        const fullName = repoFullName(raw);
        if (fullName === null) {
          return reply.send({ ok: true, ignored: "no repository" });
        }

        // Canonical, so a payload spelling cannot miss a registered row -- the
        // same function registration normalises with.
        const githubUrl = normaliseRepoUrl(`https://github.com/${fullName}`);
        const repo = await repoByUrl(db, githubUrl);
        if (repo === null) {
          return reply.send({ ok: true, ignored: "not registered" });
        }

        await enqueueParse({ githubUrl, incremental: repo.lastSyncedCommit !== null });
        return reply.send({ ok: true, queued: githubUrl });
      },
    );
  });
}

/**
 * Whether the body carries a valid signature.
 *
 * Constant-time, and length-checked first because timingSafeEqual throws on
 * buffers of different lengths rather than returning false.
 */
function signatureMatches(raw: Buffer, header: unknown): boolean {
  if (typeof header !== "string" || !header.startsWith(WEBHOOK_SIGNATURE_PREFIX)) {
    return false;
  }

  const expected = Buffer.from(
    WEBHOOK_SIGNATURE_PREFIX +
      createHmac("sha256", env.GITHUB_WEBHOOK_SECRET).update(raw).digest("hex"),
  );
  const actual = Buffer.from(header);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** `owner/repo` out of the payload, or null if it is not there. Runs on
 *  unverified bytes for the rate-limit key, so it must never throw. */
function repoFullName(raw: Buffer | undefined): string | null {
  if (raw === undefined || raw.length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw.toString("utf8"));
    const name = (parsed as { repository?: { full_name?: unknown } }).repository?.full_name;
    return typeof name === "string" && name.includes("/") ? name : null;
  } catch {
    return null;
  }
}
