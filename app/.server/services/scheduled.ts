import { getConfig } from "../config";
import { createDb } from "../db";
import { cleanupOrphanMedia } from "../media/store";
import { pruneNotifications, sendReminders } from "./notifications";
import { notifySavedSearchMatches } from "./saved-searches";

/** Cron Trigger entry point (see `triggers.crons` in wrangler.jsonc). */
export async function runScheduledJobs(now: Date) {
  const db = createDb();
  const { timeZone } = getConfig();
  const reminders = await sendReminders(db, now, timeZone);
  const savedSearchMatches = await notifySavedSearchMatches(db, now, timeZone);
  const removedMedia = await cleanupOrphanMedia(db, now);
  await pruneNotifications(db, now);
  console.log(
    JSON.stringify({
      job: "scheduled",
      reminders,
      savedSearchMatches,
      removedMedia,
      at: now.toISOString(),
    }),
  );
}
