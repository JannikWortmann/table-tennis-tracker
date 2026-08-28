import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { HandleMentionFunction } from "../functions/handle_mention.ts";

const HandleMentionWorkflow = DefineWorkflow({
  callback_id: "handle_mention_workflow",
  title: "Handle PingPong bot mention",
  input_parameters: {
    properties: {
      channel_id: { type: Schema.types.string },
      user_id: { type: Schema.types.string },
      message_text: { type: Schema.types.string },
    },
    required: ["channel_id", "user_id", "message_text"],
  },
});

HandleMentionWorkflow.addStep(HandleMentionFunction, {
  channel_id: HandleMentionWorkflow.inputs.channel_id,
  user_id: HandleMentionWorkflow.inputs.user_id,
  message_text: HandleMentionWorkflow.inputs.message_text,
});

export default HandleMentionWorkflow;
