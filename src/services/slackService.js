import { WebClient } from "@slack/web-api";
import { config } from "../config/index.js";
import { log, error } from "../utils/logger.js";

const slackClient = new WebClient(config.slackToken);

function findSlackIdByClickupName(name) {
  if (!name) return null;
  const normalizedName = name.toLowerCase().replace(/\s+/g, "");
  for (const [clickupName, slackId] of Object.entries(config.clickupToSlack)) {
    const normalizedKey = clickupName.toLowerCase().replace(/\s+/g, "");
    if (normalizedKey === normalizedName) return slackId;
  }
  return null;
}

export async function sendReminders(tasks) {
  const tasksByAssignee = {};
  tasks.forEach((t) => {
    t.assignees.forEach((clickupName) => {
      const slackId = findSlackIdByClickupName(clickupName);
      if (!slackId) return;
      if (!tasksByAssignee[slackId]) tasksByAssignee[slackId] = [];
      tasksByAssignee[slackId].push(t);
    });
  });

  for (const [slackId, assigneeTasks] of Object.entries(tasksByAssignee)) {
    const tasksBySpace = {};
    assigneeTasks.forEach((t) => {
      const spaceName = t.spaceName || "Unknown Space";
      if (!tasksBySpace[spaceName]) tasksBySpace[spaceName] = [];
      tasksBySpace[spaceName].push(t);
    });

    const spaceSections = Object.entries(tasksBySpace)
      .map(([spaceName, spaceTasks]) => {
        const taskList = spaceTasks
          .map(
            (t) =>
              `• *${t.name}* (status: ${t.status}) has *no time tracked* (${t.url})`
          )
          .join("\n");
        return `*Space: ${spaceName}*\nYou have tasks missing time tracking:\n${taskList}`;
      })
      .join("\n\n");

    const fullMessage = `You have tasks missing time tracking across your projects:\n\n${spaceSections}`;

    try {
      await slackClient.chat.postMessage({
        channel: slackId,
        text: fullMessage,
        unfurl_links: false,
        unfurl_media: false,
      });
      log(
        `Reminder sent to <@${slackId}> (${assigneeTasks.length} tasks across ${
          Object.keys(tasksBySpace).length
        } spaces)`
      );
    } catch (err) {
      error(`Slack DM failed for ${slackId}:`, err.data || err.message);
    }
  }
}
