import cron from "node-cron";
import {
  getAllRelevantTasks,
  filterMissingTimeTasks,
} from "./services/clickupService.js";
import { sendReminders } from "./services/slackService.js";
import { log } from "./utils/logger.js";

async function runReminderCheck() {
  log("Starting ClickUp time tracking check...");
  try {
    const allTasks = await getAllRelevantTasks();
    const missingTimeTasks = filterMissingTimeTasks(allTasks);
    log(
      `Found ${missingTimeTasks.length} tasks with relevant status and no time tracked.`
    );

    if (missingTimeTasks.length > 0) {
      await sendReminders(missingTimeTasks);
    } else {
      log("No missing time tracking found—all good!");
    }
  } catch (err) {
    log("Check failed:", err.message);
  }
}

runReminderCheck();

cron.schedule("0 17 * * *", runReminderCheck);
log("Bot scheduled—waiting for next run.");

if (process.env.NODE_ENV === "development") {
  cron.schedule("*/5 * * * *", runReminderCheck);
}
