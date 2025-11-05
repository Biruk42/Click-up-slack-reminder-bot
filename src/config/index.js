import dotenv from "dotenv";
import { clickupToSlack, relevantStatuses, trackedSpaces } from "./mappings.js";

dotenv.config();

export const config = {
  teamId: process.env.TEAM_ID,
  clickupToken: process.env.CLICKUP_TOKEN,
  slackToken: process.env.SLACK_TOKEN,
  relevantStatuses,
  clickupToSlack,
  trackedSpaces,
};
