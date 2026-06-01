import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeNextCronRunAt,
  normalizeCronJobs
} from "./hermes-webui-cron-scheduler.mjs";

const agents = [
  { id: "agent-01", name: "HermesFox", aliases: ["fox"] },
  { id: "agent-02", name: "Hermies", aliases: ["hermies"] }
];

test("normalizes enabled cron jobs and ignores disabled jobs", () => {
  const jobs = normalizeCronJobs(agents, {
    jobs: [
      {
        id: "daily-writing",
        enabled: true,
        type: "task",
        agent: "Hermies",
        schedule: { dailyAt: "12:45" },
        title: "Daily writing",
        prompt: "write the daily article"
      },
      {
        id: "off",
        enabled: false,
        type: "reminder",
        agent: "fox",
        schedule: { intervalMinutes: 30 },
        text: "hidden"
      }
    ]
  });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, "daily-writing");
  assert.equal(jobs[0].type, "task");
  assert.equal(jobs[0].agentId, "agent-02");
  assert.equal(jobs[0].timezone, "Asia/Shanghai");
});

test("computes next daily cron run in the configured timezone", () => {
  const before = new Date("2026-05-31T04:00:00.000Z");
  const first = computeNextCronRunAt(
    { schedule: { dailyAt: "12:45" }, timezone: "Asia/Shanghai" },
    before
  );
  assert.equal(first.toISOString(), "2026-05-31T04:45:00.000Z");

  const after = new Date("2026-05-31T05:00:00.000Z");
  const second = computeNextCronRunAt(
    { schedule: { dailyAt: "12:45" }, timezone: "Asia/Shanghai" },
    after
  );
  assert.equal(second.toISOString(), "2026-06-01T04:45:00.000Z");
});

test("computes interval cron runs from the current instant", () => {
  const now = new Date("2026-05-31T04:00:00.000Z");
  const next = computeNextCronRunAt({ schedule: { intervalMinutes: 15 } }, now);
  assert.equal(next.toISOString(), "2026-05-31T04:15:00.000Z");
});
