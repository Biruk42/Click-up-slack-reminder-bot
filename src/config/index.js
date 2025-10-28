import dotenv from "dotenv";
import mappings from "./mappings.js";

dotenv.config();

export const config = {
  teamId: process.env.TEAM_ID,
  clickupToken: process.env.CLICKUP_TOKEN,
  slackToken: process.env.SLACK_TOKEN,
  relevantStatuses: ["in progress", "code review", "testing", "ready to prod"],
  clickupToSlack: mappings,
  trackedSpaces: ["Poker Real Gaming & Store"],
};
