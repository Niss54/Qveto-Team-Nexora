import { notificationService } from './notification.service.js';

let cronInterval: NodeJS.Timeout | null = null;

export const cronService = {
  /**
   * Starts background recurring tasks (Overdue task alert scanning).
   */
  start(intervalMs: number = 3600000) {
    if (cronInterval) return;

    console.log(`⏱️ [CRON] Starting background overdue task monitor (interval: ${intervalMs / 1000}s)`);

    // Run first scan shortly after startup (10s delay to allow DB connection stabilization)
    setTimeout(() => {
      void this.runOverdueScan();
    }, 10000);

    cronInterval = setInterval(() => {
      void this.runOverdueScan();
    }, intervalMs);
  },

  async runOverdueScan() {
    try {
      const result = await notificationService.checkAndAlertOverdueTasks();
      if (result.newAlertsCreated > 0) {
        console.log(
          `🔔 [CRON] Overdue task scan complete: ${result.checkedTasks} tasks evaluated, ${result.newAlertsCreated} new alert(s) dispatched.`,
        );
      }
    } catch (err) {
      console.error('❌ [CRON] Error during overdue task scan:', err);
    }
  },

  stop() {
    if (cronInterval) {
      clearInterval(cronInterval);
      cronInterval = null;
      console.log('🛑 [CRON] Background overdue monitor stopped.');
    }
  },
};
