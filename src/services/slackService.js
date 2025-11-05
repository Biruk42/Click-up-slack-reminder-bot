import { WebClient } from "@slack/web-api";
import { config } from "../config/index.js";
import { log, error } from "../utils/logger.js";
import { clickupToSlack, projectManagers } from "../config/mappings.js";

const slackClient = new WebClient(config.slackToken);

function findSlackIdByClickupName(name) {
  if (!name) return null;
  const normalizedName = name.toLowerCase().replace(/\s+/g, "");
  for (const [clickupName, slackId] of Object.entries(clickupToSlack)) {
    const normalizedKey = clickupName.toLowerCase().replace(/\s+/g, "");
    if (normalizedKey === normalizedName) return slackId;
  }
  return null;
}

export async function sendReminders(tasks) {
  const codeReviewAlerts = tasks.filter((t) => t.needsCodeReviewerAssigned);
  const reminderTasks = tasks.filter((t) => !t.needsCodeReviewerAssigned);

  for (const task of codeReviewAlerts) {
    for (const name of task.primaryAssignees) {
      const slackId = findSlackIdByClickupName(name);
      if (!slackId) {
        log(`No Slack ID found for ${name}, skipping reviewer reminder.`);
        continue;
      }

      const message = `Assign a code reviewer for your task *${task.name}* (${task.status}) in *${task.spaceName}*.\n *￫ Link:* ${task.url}`;
      try {
        await slackClient.chat.postMessage({
          channel: slackId,
          text: message,
          unfurl_links: false,
          unfurl_media: false,
        });
        log(`Sent code reviewer reminder to ${name} (${slackId})`);
      } catch (err) {
        error(`Slack DM failed for ${slackId}:`, err.data || err.message);
      }
    }
  }

  const tasksByAssignee = {};
  reminderTasks.forEach((t) => {
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
          .map((t) => {
            const issues = [];
            if (t.time_spent === 0) issues.push("time not tracked");
            const today = new Date();
            const isUpdatedToday =
              t.last_comment_date &&
              today.toDateString() ===
                new Date(t.last_comment_date).toDateString();
            if (!isUpdatedToday) issues.push("no recent comment");

            return [
              `  *• ${t.name}*`,
              `      *￫ Status:* ${t.status}`,
              issues.length ? `      *￫ Issues:* ${issues.join(", ")}` : "",
              `      *￫ Link:* ${t.url}`,
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n");

        return `*${spaceName}*\n${taskList}`;
      })
      .join("\n\n");

    const fullMessage = `You have tasks missing time tracked or status updates:\n\n${spaceSections}`;

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

  const pmSlackIds = projectManagers
    .map((name) => clickupToSlack[name])
    .filter(Boolean);

  if (pmSlackIds.length > 0) {
    const allTasksSummary = Object.entries(tasksByAssignee)
      .map(([slackId, userTasks]) => {
        const clickupName =
          Object.entries(clickupToSlack).find(
            ([, id]) => id === slackId
          )?.[0] || "Unknown User";

        const userLines = userTasks
          .map((t) => {
            const issues = [];
            if (t.time_spent === 0) issues.push("time not tracked");

            const today = new Date();
            const isUpdatedToday =
              t.last_comment_date &&
              today.toDateString() ===
                new Date(t.last_comment_date).toDateString();
            if (!isUpdatedToday) issues.push("no recent comment");

            return [
              `  • *${t.name}*`,
              `      ￫ *Status:* ${t.status}`,
              issues.length ? `      ￫ *Issues:* ${issues.join(", ")}` : "",
              `      ￫ *Link:* ${t.url}`,
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n");

        return `*${clickupName}:*\n${userLines}`;
      })
      .join("\n\n");

    const pmMessage = `*Daily Task Summary for All Team Members:*\n\n${allTasksSummary}`;

    for (const pmId of pmSlackIds) {
      try {
        await slackClient.chat.postMessage({
          channel: pmId,
          text: pmMessage,
          unfurl_links: false,
          unfurl_media: false,
        });
        log(`Summary sent to PM <@${pmId}>`);
      } catch (err) {
        error(`Failed to send PM summary to ${pmId}:`, err.message);
      }
    }
  }
}
