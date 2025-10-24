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

await runReminderCheck();

if (process.env.NODE_ENV === "development") {
  cron.schedule("*/5 * * * *", runReminderCheck);
  log("Dev mode: Running every 5 minutes for testing.");
} else {
  log("Production run complete—no further scheduling needed.");
}

if (process.env.NODE_ENV !== "development") {
  process.exit(0);
}
