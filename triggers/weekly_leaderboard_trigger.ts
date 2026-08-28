import { Trigger } from "deno-slack-api/types.ts";
import { TriggerTypes } from "deno-slack-api/mod.ts";
import { APP_CONFIG, Weekday } from "../config.ts";
import WeeklyLeaderboardWorkflow from "../workflows/weekly_leaderboard_workflow.ts";

const WEEKDAY_TO_DAY_INDEX: Record<Weekday, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const { channelId, timezone, day, time } = APP_CONFIG.weeklyLeaderboard;

const nextLeaderboardDate = new Date();
const targetDay = WEEKDAY_TO_DAY_INDEX[day];
nextLeaderboardDate.setDate(
  nextLeaderboardDate.getDate() +
    ((targetDay - nextLeaderboardDate.getDay() + 7) % 7 || 7),
);
const startTime = `${nextLeaderboardDate.toISOString().slice(0, 10)}T${time}`;

const weeklyLeaderboardTrigger: Trigger<
  typeof WeeklyLeaderboardWorkflow.definition
> = {
  type: TriggerTypes.Scheduled,
  name: "Weekly leaderboard post",
  description: `Posts the table tennis leaderboard every ${day} at ${time}`,
  workflow: `#/workflows/${WeeklyLeaderboardWorkflow.definition.callback_id}`,
  inputs: {
    channel_id: { value: channelId },
  },
  schedule: {
    start_time: startTime,
    timezone,
    frequency: {
      type: "weekly",
      repeats_every: 1,
      on_days: [day],
    },
  },
};

export default weeklyLeaderboardTrigger;
