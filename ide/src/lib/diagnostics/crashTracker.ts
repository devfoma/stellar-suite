export interface CrashReport {
  timestamp: string;
  stackTrace: string;
  errorMessage: string;
  browserVersion: string;
  platform: string;
  url: string;
}

class CrashTracker {
  private static instance: CrashTracker;
  private isOffline: boolean = false;

  private constructor() {
    if (typeof window !== 'undefined') {
      this.isOffline = !navigator.onLine;
      window.addEventListener('online', () => (this.isOffline = false));
      window.addEventListener('offline', () => (this.isOffline = true));
    }
  }

  public static getInstance(): CrashTracker {
    if (!CrashTracker.instance) {
      CrashTracker.instance = new CrashTracker();
    }
    return CrashTracker.instance;
  }

  public async captureException(error: Error): Promise<CrashReport> {
    const report: CrashReport = {
      timestamp: new Date().toISOString(),
      stackTrace: error.stack || 'No stack trace available',
      errorMessage: error.message,
      browserVersion: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'Unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'Unknown',
    };

    console.error('[Diagnostic Report] IDE Crash Captured:', report);

    // In a real scenario, we would send this to Sentry or a custom endpoint
    return report;
  }

  public async sendReport(report: CrashReport): Promise<boolean> {
    if (this.isOffline) {
      console.warn('[CrashTracker] Offline: Report queued for sync.');
      return false;
    }

    try {
      // Mock API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log('[CrashTracker] Report sent successfully:', report);
      return true;
    } catch (e) {
      console.error('[CrashTracker] Failed to send report:', e);
      return false;
    }
  }
}

export const crashTracker = CrashTracker.getInstance();
