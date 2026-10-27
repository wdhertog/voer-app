package nl.voerapp;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Lokale opslag: honden, voermomenten en voerregistraties (zelfde opzet als de webversie). */
class Database extends SQLiteOpenHelper {

    private static final String NAME = "voer.db";
    private static final int VERSION = 1;

    Database(Context context) {
        super(context, NAME, null, VERSION);
    }

    @Override
    public void onConfigure(SQLiteDatabase db) {
        db.setForeignKeyConstraintsEnabled(true);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE dogs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,"
                + " active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE TABLE meals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,"
                + " active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE TABLE feedings (id INTEGER PRIMARY KEY AUTOINCREMENT,"
                + " dog_id INTEGER NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,"
                + " meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,"
                + " feed_date TEXT NOT NULL, fed_at TEXT NOT NULL,"
                + " UNIQUE (dog_id, meal_id, feed_date))");
        db.execSQL("CREATE INDEX idx_feedings_date ON feedings (feed_date)");
        db.execSQL("INSERT INTO meals (name, sort_order) VALUES ('Ochtend', 1), ('Avond', 2)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Nog geen eerdere versies
    }

    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    private static String table(String type) {
        if ("dogs".equals(type) || "meals".equals(type)) {
            return type;
        }
        throw new IllegalArgumentException("Onbekend type: " + type);
    }

    // ---------- Lezen ----------

    JSONObject getData(String from, String to) throws JSONException {
        SQLiteDatabase db = getReadableDatabase();
        JSONObject result = new JSONObject();
        result.put("dogs", list(db, "dogs", "sort_order, name COLLATE NOCASE"));
        result.put("meals", list(db, "meals", "sort_order, id"));

        JSONArray feedings = new JSONArray();
        Cursor c = db.rawQuery("SELECT dog_id, meal_id, feed_date, fed_at FROM feedings"
                + " WHERE feed_date BETWEEN ? AND ? ORDER BY feed_date, fed_at", new String[]{from, to});
        try {
            while (c.moveToNext()) {
                JSONObject f = new JSONObject();
                f.put("dog_id", c.getLong(0));
                f.put("meal_id", c.getLong(1));
                f.put("feed_date", c.getString(2));
                f.put("fed_at", c.getString(3));
                feedings.put(f);
            }
        } finally {
            c.close();
        }
        result.put("feedings", feedings);
        result.put("today", today());
        return result;
    }

    private JSONArray list(SQLiteDatabase db, String table, String order) throws JSONException {
        JSONArray rows = new JSONArray();
        Cursor c = db.rawQuery("SELECT id, name, active, sort_order FROM " + table + " ORDER BY " + order, null);
        try {
            while (c.moveToNext()) {
                JSONObject row = new JSONObject();
                row.put("id", c.getLong(0));
                row.put("name", c.getString(1));
                row.put("active", c.getInt(2) == 1);
                row.put("sort_order", c.getInt(3));
                rows.put(row);
            }
        } finally {
            c.close();
        }
        return rows;
    }

    // ---------- Voeren ----------

    void setFed(long dogId, long mealId, String date, boolean fed) {
        if (date.compareTo(today()) > 0) {
            throw new IllegalArgumentException("Je kunt niet vooruit voeren");
        }
        SQLiteDatabase db = getWritableDatabase();
        if (fed) {
            ContentValues v = new ContentValues();
            v.put("dog_id", dogId);
            v.put("meal_id", mealId);
            v.put("feed_date", date);
            v.put("fed_at", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()));
            db.insertWithOnConflict("feedings", null, v, SQLiteDatabase.CONFLICT_IGNORE);
        } else {
            db.delete("feedings", "dog_id = ? AND meal_id = ? AND feed_date = ?",
                    new String[]{String.valueOf(dogId), String.valueOf(mealId), date});
        }
    }

    // ---------- Honden en voermomenten beheren ----------

    void addItem(String type, String name) {
        String table = table(type);
        SQLiteDatabase db = getWritableDatabase();
        Cursor c = db.rawQuery("SELECT COALESCE(MAX(sort_order), 0) FROM " + table, null);
        int max = 0;
        try {
            if (c.moveToFirst()) {
                max = c.getInt(0);
            }
        } finally {
            c.close();
        }
        ContentValues v = new ContentValues();
        v.put("name", name);
        v.put("sort_order", max + 1);
        db.insertOrThrow(table, null, v);
    }

    void renameItem(String type, long id, String name) {
        ContentValues v = new ContentValues();
        v.put("name", name);
        getWritableDatabase().update(table(type), v, "id = ?", new String[]{String.valueOf(id)});
    }

    void toggleActive(String type, long id) {
        getWritableDatabase().execSQL("UPDATE " + table(type) + " SET active = 1 - active WHERE id = ?",
                new Object[]{id});
    }

    void moveItem(String type, long id, int direction) {
        String table = table(type);
        SQLiteDatabase db = getWritableDatabase();
        String order = "dogs".equals(table) ? "sort_order, name COLLATE NOCASE" : "sort_order, id";
        Cursor c = db.rawQuery("SELECT id FROM " + table + " ORDER BY " + order, null);
        long[] ids = new long[c.getCount()];
        int pos = -1;
        try {
            for (int i = 0; c.moveToNext(); i++) {
                ids[i] = c.getLong(0);
                if (ids[i] == id) {
                    pos = i;
                }
            }
        } finally {
            c.close();
        }
        int swap = pos + direction;
        if (pos < 0 || swap < 0 || swap >= ids.length) {
            return;
        }
        long tmp = ids[pos];
        ids[pos] = ids[swap];
        ids[swap] = tmp;
        db.beginTransaction();
        try {
            for (int i = 0; i < ids.length; i++) {
                db.execSQL("UPDATE " + table + " SET sort_order = ? WHERE id = ?", new Object[]{i + 1, ids[i]});
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    void deleteItem(String type, long id) {
        // Verwijdert ook de bijbehorende voerregistraties (ON DELETE CASCADE)
        getWritableDatabase().delete(table(type), "id = ?", new String[]{String.valueOf(id)});
    }

    // ---------- Back-up ----------

    String exportBackup() throws JSONException {
        JSONObject backup = getData("0000-00-00", "9999-99-99");
        backup.remove("today");
        backup.put("app", "voer-app");
        backup.put("version", 1);
        backup.put("exported_at", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()));
        return backup.toString(1);
    }

    /** Vervangt alle gegevens door die uit de back-up. Gooit een uitzondering als het bestand ongeldig is. */
    void importBackup(String json) throws JSONException {
        JSONObject backup = new JSONObject(json);
        if (!"voer-app".equals(backup.optString("app"))) {
            throw new JSONException("Dit is geen back-up van de Voer-app");
        }
        JSONArray dogs = backup.getJSONArray("dogs");
        JSONArray meals = backup.getJSONArray("meals");
        JSONArray feedings = backup.getJSONArray("feedings");

        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("feedings", null, null);
            db.delete("dogs", null, null);
            db.delete("meals", null, null);
            insertItems(db, "dogs", dogs);
            insertItems(db, "meals", meals);
            for (int i = 0; i < feedings.length(); i++) {
                JSONObject f = feedings.getJSONObject(i);
                ContentValues v = new ContentValues();
                v.put("dog_id", f.getLong("dog_id"));
                v.put("meal_id", f.getLong("meal_id"));
                v.put("feed_date", f.getString("feed_date"));
                v.put("fed_at", f.getString("fed_at"));
                db.insertWithOnConflict("feedings", null, v, SQLiteDatabase.CONFLICT_IGNORE);
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    private static void insertItems(SQLiteDatabase db, String table, JSONArray items) throws JSONException {
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.getJSONObject(i);
            ContentValues v = new ContentValues();
            v.put("id", item.getLong("id"));
            v.put("name", item.getString("name"));
            v.put("active", item.optBoolean("active", true) ? 1 : 0);
            v.put("sort_order", item.optInt("sort_order", i + 1));
            db.insertOrThrow(table, null, v);
        }
    }
}
