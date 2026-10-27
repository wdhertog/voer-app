package nl.voerapp;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** Widget op het beginscherm: per hond welke voermomenten vandaag al gedaan zijn. */
public class VoerWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        manager.updateAppWidget(widgetIds, build(context));
    }

    /** Ververst alle widgets, bijv. na een voerbeurt of als de app naar de achtergrond gaat. */
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, VoerWidget.class));
        if (ids.length > 0) {
            manager.updateAppWidget(ids, build(context));
        }
    }

    private static RemoteViews build(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget);
        String status;
        StringBuilder details = new StringBuilder();
        try {
            String today = Database.today();
            JSONObject data = Database.get(context).getData(today, today);
            JSONArray dogs = active(data.getJSONArray("dogs"));
            JSONArray meals = active(data.getJSONArray("meals"));
            JSONArray feedings = data.getJSONArray("feedings");
            int total = dogs.length() * meals.length();
            int done = 0;
            for (int i = 0; i < dogs.length(); i++) {
                JSONObject dog = dogs.getJSONObject(i);
                if (details.length() > 0) {
                    details.append('\n');
                }
                details.append(dog.getString("name")).append(':');
                for (int j = 0; j < meals.length(); j++) {
                    JSONObject meal = meals.getJSONObject(j);
                    boolean fed = isFed(feedings, dog.getLong("id"), meal.getLong("id"));
                    if (fed) {
                        done++;
                    }
                    details.append(j == 0 ? " " : " · ").append(fed ? "✓ " : "○ ").append(meal.getString("name"));
                }
            }
            if (total == 0) {
                status = "Voeg honden toe in de app";
            } else if (done == total) {
                status = dogs.length() == 1 ? "✓ Gevoerd!" : "✓ Alle honden gevoerd";
            } else {
                status = "Nog " + (total - done) + " van de " + total + " voerbeurten";
            }
        } catch (Exception e) {
            status = "Open de app";
        }
        views.setTextViewText(R.id.widget_status, status);
        views.setTextViewText(R.id.widget_details, details.toString());

        Intent open = new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 1, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return views;
    }

    private static JSONArray active(JSONArray items) {
        JSONArray result = new JSONArray();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null && item.optBoolean("active")) {
                result.put(item);
            }
        }
        return result;
    }

    private static boolean isFed(JSONArray feedings, long dogId, long mealId) {
        for (int i = 0; i < feedings.length(); i++) {
            JSONObject f = feedings.optJSONObject(i);
            if (f != null && f.optLong("dog_id") == dogId && f.optLong("meal_id") == mealId) {
                return true;
            }
        }
        return false;
    }
}
