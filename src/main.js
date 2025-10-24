import cron from "node-cron";
import {
  getAllRelevantTasks,
  filterMissingTimeTasks,
} from "./services/clickupService.js";
import { sendReminders } from "./services/slackService.js";
import { log } from "./utils/logger.js";

async function runReminderCheck() {
  log("Starting");
  try {
    const allTasks = await getAllRelevantTasks();
    const missingTimeTasks = filterMissingTimeTasks(allTasks);
    log(`Found ${missingTimeTasks.length} tasks with no time tracked.`);

    if (missingTimeTasks.length > 0) {
      await sendReminders(missingTimeTasks);
    } else {
      log("No missing");
    }
  } catch (err) {
    log("Check failed:", err.message);
  }
}

await runReminderCheck();

if (process.env.NODE_ENV === "development") {
  cron.schedule("*/5 * * * *", runReminderCheck);
  log("test mode");
} else {
  log("production mode.");
}

if (process.env.NODE_ENV !== "development") {
  process.exit(0);
}
