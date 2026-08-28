import { Trigger } from "deno-slack-api/types.ts";
import {
  TriggerContextData,
  TriggerEventTypes,
  TriggerTypes,
} from "deno-slack-api/mod.ts";
import { APP_CONFIG } from "../config.ts";
import HandleMentionWorkflow from "../workflows/handle_mention_workflow.ts";

const appMentionedTrigger: Trigger<
  typeof HandleMentionWorkflow.definition
> = {
  type: TriggerTypes.Event,
  name: `${APP_CONFIG.app.name} bot mentioned`,
  description:
    `Triggers when the ${APP_CONFIG.app.name} bot is mentioned in a channel`,
  workflow: `#/workflows/${HandleMentionWorkflow.definition.callback_id}`,
  event: {
    event_type: TriggerEventTypes.AppMentioned,
    all_resources: true,
  },
  inputs: {
    channel_id: { value: TriggerContextData.Event.AppMentioned.channel_id },
    user_id: { value: TriggerContextData.Event.AppMentioned.user_id },
    message_text: { value: TriggerContextData.Event.AppMentioned.text },
  },
};

export default appMentionedTrigger;
