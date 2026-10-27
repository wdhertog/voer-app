package nl.voerapp;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Dagelijkse controle van de inentingen, en opnieuw inplannen na een herstart of update. */
public class ReminderReceiver extends BroadcastReceiver {

    static final String ACTION_CHECK = "nl.voerapp.CHECK_REMINDERS";

    @Override
    public void onReceive(final Context context, Intent intent) {
        if (ACTION_CHECK.equals(intent.getAction())) {
            final PendingResult result = goAsync();
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Reminders.check(context, true);
                    } finally {
                        result.finish();
                    }
                }
            }).start();
        } else {
            // BOOT_COMPLETED of MY_PACKAGE_REPLACED: alarmen zijn dan gewist
            Reminders.schedule(context);
        }
    }
}
