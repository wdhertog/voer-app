package nl.voerapp;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * Meldingen voor inentingen die binnen 30 dagen verlopen en waarvoor nog geen afspraak is.
 * Eén melding voor alle inentingen samen: de eerste keer zodra er iets binnen 30 dagen valt,
 * daarna elke 7 dagen, en vanaf een week voor het verlopen elke dag.
 */
final class Reminders {

    static final int WINDOW_DAYS = 30;
    static final int DAILY_DAYS = 7;
    static final int REPEAT_DAYS = 7;

    private static final String CHANNEL_ID = "inentingen";
    private static final int NOTIFICATION_ID = 1;
    private static final String PREFS = "reminders";
    private static final String LAST_NOTIFIED = "last_notified";
    private static final int CHECK_HOUR = 9;

    private Reminders() {
    }

    /** Plant de dagelijkse controle (rond 9:00). Veilig om vaker aan te roepen. */
    static void schedule(Context context) {
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, CHECK_HOUR);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) {
            next.add(Calendar.DAY_OF_MONTH, 1);
        }
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        alarms.setInexactRepeating(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(),
                AlarmManager.INTERVAL_DAY, checkIntent(context));
    }

    private static PendingIntent checkIntent(Context context) {
        Intent intent = new Intent(context, ReminderReceiver.class).setAction(ReminderReceiver.ACTION_CHECK);
        return PendingIntent.getBroadcast(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Bekijkt welke inentingen eraan komen en stuurt zo nodig een melding. Met allowNotify=false
     * (na een wijziging in de app) wordt alleen een melding weggehaald die niet meer klopt.
     */
    static void check(Context context, boolean allowNotify) {
        String today = Database.today();
        List<String> lines = new ArrayList<>();
        boolean urgent = false;
        boolean overdue = false;

        Database db = Database.get(context);
        try {
            JSONArray reminders = db.getReminders();
            JSONArray dogs = db.getData(today, today).getJSONArray("dogs");
            for (int i = 0; i < reminders.length(); i++) {
                JSONObject r = reminders.getJSONObject(i);
                if (!r.isNull("appointment_date")) {
                    continue; // er is al een afspraak gepland
                }
                int days = daysBetween(today, r.getString("next_date"));
                if (days > WINDOW_DAYS) {
                    continue;
                }
                urgent |= days <= DAILY_DAYS;
                overdue |= days < 0;
                lines.add(r.getString("name") + " (" + dogName(dogs, r.getLong("dog_id")) + "): " + when(days));
            }
        } catch (Exception e) {
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (lines.isEmpty()) {
            // Niets (meer) te melden: de volgende keer begint de cyclus opnieuw
            prefs.edit().remove(LAST_NOTIFIED).apply();
            manager.cancel(NOTIFICATION_ID);
            return;
        }

        if (!allowNotify) {
            // Na een wijziging in de app: een zichtbare melding stil bijwerken, geen nieuwe sturen
            if (isShowing(manager)) {
                notify(context, manager, lines, overdue, true);
            }
            return;
        }
        String last = prefs.getString(LAST_NOTIFIED, null);
        if (today.equals(last)) {
            return;
        }
        if (last != null && !urgent && daysBetween(last, today) < REPEAT_DAYS) {
            return;
        }
        notify(context, manager, lines, overdue, false);
        prefs.edit().putString(LAST_NOTIFIED, today).apply();
    }

    private static boolean isShowing(NotificationManager manager) {
        for (StatusBarNotification n : manager.getActiveNotifications()) {
            if (n.getId() == NOTIFICATION_ID) {
                return true;
            }
        }
        return false;
    }

    private static void notify(Context context, NotificationManager manager, List<String> lines, boolean overdue,
            boolean silentUpdate) {
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Inentingen",
                    NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Herinneringen voor inentingen die binnenkort verlopen");
            manager.createNotificationChannel(channel);
            builder = new Notification.Builder(context, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(context);
        }

        Intent open = new Intent(context, MainActivity.class)
                .putExtra(MainActivity.EXTRA_VIEW, "dogs")
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(context, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        StringBuilder text = new StringBuilder();
        for (String line : lines) {
            if (text.length() > 0) {
                text.append('\n');
            }
            text.append(line);
        }
        String title = overdue ? "Inenting verlopen" : "Inenting verloopt binnenkort";
        if (lines.size() > 1) {
            title = overdue ? "Inentingen verlopen" : "Inentingen verlopen binnenkort";
        }
        builder.setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFF2F6F4F)
                .setContentTitle(title)
                .setContentText(lines.size() == 1 ? lines.get(0) : lines.size() + " inentingen · plan een afspraak")
                .setStyle(new Notification.BigTextStyle().bigText(text + "\n\nPlan een afspraak in de app."))
                .setContentIntent(content)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setOnlyAlertOnce(silentUpdate);
        try {
            if (!silentUpdate) {
                // Een melding van gisteren die nog openstaat: opnieuw laten afgaan
                manager.cancel(NOTIFICATION_ID);
            }
            manager.notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException e) {
            // Geen toestemming voor meldingen
        }
    }

    private static String dogName(JSONArray dogs, long id) {
        for (int i = 0; i < dogs.length(); i++) {
            JSONObject dog = dogs.optJSONObject(i);
            if (dog != null && dog.optLong("id") == id) {
                return dog.optString("name");
            }
        }
        return "?";
    }

    private static String when(int days) {
        if (days < 0) {
            return "verlopen";
        }
        if (days == 0) {
            return "verloopt vandaag";
        }
        return days == 1 ? "verloopt morgen" : "verloopt over " + days + " dagen";
    }

    static int daysBetween(String from, String to) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        try {
            long diff = format.parse(to).getTime() - format.parse(from).getTime();
            return (int) Math.round(diff / 86400000.0);
        } catch (ParseException e) {
            return Integer.MAX_VALUE;
        }
    }
}
