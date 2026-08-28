import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { PostWeeklyLeaderboardFunction } from "../functions/post_weekly_leaderboard.ts";

const WeeklyLeaderboardWorkflow = DefineWorkflow({
  callback_id: "weekly_leaderboard_workflow",
  title: "Post weekly leaderboard",
  input_parameters: {
    properties: {
      channel_id: { type: Schema.types.string },
    },
    required: ["channel_id"],
  },
});

WeeklyLeaderboardWorkflow.addStep(PostWeeklyLeaderboardFunction, {
  channel_id: WeeklyLeaderboardWorkflow.inputs.channel_id,
});

export default WeeklyLeaderboardWorkflow;
