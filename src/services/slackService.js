import { WebClient } from "@slack/web-api";
import { config } from "../config/index.js";
import { log, error } from "../utils/logger.js";

const slackClient = new WebClient(config.slackToken);

export async function sendReminders(tasks) {
  const tasksByAssignee = {};
  tasks.forEach((t) => {
    t.assignees.forEach((clickupId) => {
      const slackId = config.clickupToSlack[clickupId];
      if (!slackId) return;
      if (!tasksByAssignee[slackId]) tasksByAssignee[slackId] = [];
      tasksByAssignee[slackId].push(t);
    });
  });

  for (const [slackId, assigneeTasks] of Object.entries(tasksByAssignee)) {
    const taskList = assigneeTasks
      .map(
        (t) =>
          `• *${t.name}* (status: ${t.status}) has *no time tracked* (${t.url})`
      )
      .join("\n");
    try {
      await slackClient.chat.postMessage({
        channel: slackId,
        text: `You have tasks missing time tracking:\n${taskList}`,
        unfurl_links: false,
        unfurl_media: false,
      });
      log(`Reminder sent to <@${slackId}> (${assigneeTasks.length} tasks)`);
    } catch (err) {
      error(`Slack DM failed for ${slackId}:`, err.data || err.message);
    }
  }
}
