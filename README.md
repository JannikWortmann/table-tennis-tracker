# PingPong 🏓

A Slack app that tracks table tennis games and ELO rankings. Mention
**@PingPong** in any channel to record games and view the leaderboard.

It's a fun way to keep track of office rivalaries in various sports like table soccer ⚽️, ping pong 🏓 or tennis 🎾. The bot is easily adjustable to suit the counting scheme of the corresponding sport.

## Usage

### Record a game

Mention the bot followed by two players and set scores:

```
@PingPong @Alice @Bob 11-2 11-9
```

Scores follow standard table tennis rules (first to 11, win by 2). The player
who wins the majority of sets wins the match.

### View the leaderboard

```
@PingPong leaderboard
```

All players start at **1000 ELO** with a K-factor of 32. A weekly leaderboard is
also posted automatically every Monday at 9 AM (Europe/Berlin).

---

## Installation
 
> You need a Slack workspace on [a paid plan](https://slack.com/pricing) and the
[Slack CLI](https://api.slack.com/automation/quickstart) installed.

1. Install and authenticate the Slack CLI for the workspace that will host the
   app.
2. Clone this repository
```
git clone https://github.com/JannikWortmann/table-tennis-tracker && cd table-tennis-tracker
```
3. Adjust `config.ts` to use a channel ID from your
   workspace. The channel must be accessible to the app.
```ts
export const APP_CONFIG = {
  app: {
    name: "PingPong",
    description: "Track table tennis games and ELO rankings...",
  },
  weeklyLeaderboard: {
    channelId: "REPLACE_WITH_SLACK_CHANNEL_ID",
    timezone: "Europe/Berlin",
    day: "Monday",
    time: "09:00:00",
  },
};
```

- `weeklyLeaderboard.channelId`: Slack channel ID where the weekly leaderboard
  should be posted. In Slack, open the channel details and copy the channel ID.
- `weeklyLeaderboard.timezone`: IANA timezone name, for example `Europe/Berlin`
  or `America/New_York`.
- `weeklyLeaderboard.day`: One of `Sunday`, `Monday`, `Tuesday`, `Wednesday`,
  `Thursday`, `Friday`, or `Saturday`.
- `weeklyLeaderboard.time`: 24-hour time in `HH:mm:ss` format.

3. Run `slack run` or `slack deploy` and create the triggers when prompted.
4. If creating triggers manually, use the commands below.

The app's datastores are created for the deployed Slack app. Player IDs, channel
IDs, game history, and ratings all live on Slack hosted infrastructure.

ELO constants and table tennis scoring rules intentionally live in code, not
deployment config, because changing them affects rating continuity and game
validation behavior.

### Creating Triggers

On the first `slack run` or `slack deploy`, the CLI will prompt you to create
triggers found in `triggers/`. To create them manually:

```zsh
$ slack trigger create --trigger-def triggers/app_mentioned_trigger.ts
$ slack trigger create --trigger-def triggers/weekly_leaderboard_trigger.ts
```

## Testing

```zsh
$ deno test
```

## Deploying

```zsh
$ slack deploy
```

## Project Structure

### `functions/`

- **`handle_mention.ts`** — Parses `@PingPong` mentions, validates set scores,
  records games, updates ELO ratings, and replies with results.
- **`post_weekly_leaderboard.ts`** — Queries all player ratings and posts a
  ranked leaderboard message.

### `workflows/`

- **`handle_mention_workflow.ts`** — Wires the app-mentioned event to
  `HandleMentionFunction`.
- **`weekly_leaderboard_workflow.ts`** — Wires the scheduled trigger to
  `PostWeeklyLeaderboardFunction`.

### `triggers/`

- **`app_mentioned_trigger.ts`** — Event trigger that fires when the bot is
  mentioned.
- **`weekly_leaderboard_trigger.ts`** — Scheduled trigger that fires every
  Monday at 9 AM.

### `datastores/`

- **`games.ts`** — Stores game history (players, set scores, ELO changes).
- **`player_ratings.ts`** — Stores per-player ELO rating, wins, losses, draws,
  and games played.

### `lib/`

- **`elo.ts`** — ELO rating calculation (K=32, default 1000).
- **`elo_test.ts`** — Tests for the ELO module.

### `manifest.ts`

App configuration: name, description, scopes, workflows, and datastores.
