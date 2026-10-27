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

/** Lokale opslag: honden, voermomenten, voerregistraties, gewicht en inentingen. */
class Database extends SQLiteOpenHelper {

    private static final String NAME = "voer.db";
    private static final int VERSION = 2;

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
        onUpgrade(db, 1, VERSION);
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            // Versie 2: gegevens per hond, gewicht en inentingen
            db.execSQL("ALTER TABLE dogs ADD COLUMN sex TEXT");
            db.execSQL("ALTER TABLE dogs ADD COLUMN birth_date TEXT");
            db.execSQL("ALTER TABLE dogs ADD COLUMN photo TEXT");
            db.execSQL("CREATE TABLE weights (id INTEGER PRIMARY KEY AUTOINCREMENT,"
                    + " dog_id INTEGER NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,"
                    + " date TEXT NOT NULL, weight REAL NOT NULL, note TEXT NOT NULL DEFAULT '')");
            db.execSQL("CREATE TABLE vaccinations (id INTEGER PRIMARY KEY AUTOINCREMENT,"
                    + " dog_id INTEGER NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,"
                    + " date TEXT NOT NULL, name TEXT NOT NULL, next_date TEXT, note TEXT NOT NULL DEFAULT '')");
            db.execSQL("CREATE INDEX idx_weights_dog ON weights (dog_id, date)");
            db.execSQL("CREATE INDEX idx_vaccinations_dog ON vaccinations (dog_id, date)");
        }
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
        result.put("dogs", dogs(db, null));
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

    private JSONArray dogs(SQLiteDatabase db, Long id) throws JSONException {
        JSONArray rows = new JSONArray();
        Cursor c = db.rawQuery("SELECT id, name, active, sort_order, sex, birth_date, photo FROM dogs"
                + (id != null ? " WHERE id = " + id : "") + " ORDER BY sort_order, name COLLATE NOCASE", null);
        try {
            while (c.moveToNext()) {
                JSONObject row = new JSONObject();
                row.put("id", c.getLong(0));
                row.put("name", c.getString(1));
                row.put("active", c.getInt(2) == 1);
                row.put("sort_order", c.getInt(3));
                row.put("sex", c.isNull(4) ? JSONObject.NULL : c.getString(4));
                row.put("birth_date", c.isNull(5) ? JSONObject.NULL : c.getString(5));
                row.put("photo", c.isNull(6) ? JSONObject.NULL : c.getString(6));
                rows.put(row);
            }
        } finally {
            c.close();
        }
        return rows;
    }

    /** Alle kolommen van een tabel als JSON (voor gewicht, inentingen en de back-up). */
    private static JSONArray rows(SQLiteDatabase db, String sql, String[] args) throws JSONException {
        JSONArray rows = new JSONArray();
        Cursor c = db.rawQuery(sql, args);
        try {
            while (c.moveToNext()) {
                JSONObject row = new JSONObject();
                for (int i = 0; i < c.getColumnCount(); i++) {
                    switch (c.getType(i)) {
                        case Cursor.FIELD_TYPE_NULL:
                            row.put(c.getColumnName(i), JSONObject.NULL);
                            break;
                        case Cursor.FIELD_TYPE_INTEGER:
                            row.put(c.getColumnName(i), c.getLong(i));
                            break;
                        case Cursor.FIELD_TYPE_FLOAT:
                            row.put(c.getColumnName(i), c.getDouble(i));
                            break;
                        default:
                            row.put(c.getColumnName(i), c.getString(i));
                    }
                }
                rows.put(row);
            }
        } finally {
            c.close();
        }
        return rows;
    }

    // ---------- Gegevens per hond ----------

    JSONObject getDog(long id) throws JSONException {
        SQLiteDatabase db = getReadableDatabase();
        JSONArray found = dogs(db, id);
        if (found.length() == 0) {
            throw new IllegalArgumentException("Hond niet gevonden");
        }
        String[] args = {String.valueOf(id)};
        JSONObject result = new JSONObject();
        result.put("dog", found.getJSONObject(0));
        result.put("weights", rows(db, "SELECT id, date, weight, note FROM weights WHERE dog_id = ?"
                + " ORDER BY date DESC, id DESC", args));
        result.put("vaccinations", rows(db, "SELECT id, date, name, next_date, note FROM vaccinations"
                + " WHERE dog_id = ? ORDER BY date DESC, id DESC", args));
        result.put("today", today());
        return result;
    }

    void updateDog(long id, String name, String sex, String birthDate) {
        ContentValues v = new ContentValues();
        v.put("name", name);
        v.put("sex", sex);
        v.put("birth_date", birthDate);
        getWritableDatabase().update("dogs", v, "id = ?", new String[]{String.valueOf(id)});
    }

    void setDogPhoto(long id, String photo) {
        ContentValues v = new ContentValues();
        v.put("photo", photo);
        getWritableDatabase().update("dogs", v, "id = ?", new String[]{String.valueOf(id)});
    }

    void addWeight(long dogId, String date, double weight, String note) {
        if (!(weight > 0 && weight < 200)) {
            throw new IllegalArgumentException("Vul een geldig gewicht in");
        }
        ContentValues v = new ContentValues();
        v.put("dog_id", dogId);
        v.put("date", date);
        v.put("weight", weight);
        v.put("note", note);
        getWritableDatabase().insertOrThrow("weights", null, v);
    }

    void addVaccination(long dogId, String date, String name, String nextDate, String note) {
        ContentValues v = new ContentValues();
        v.put("dog_id", dogId);
        v.put("date", date);
        v.put("name", name);
        v.put("next_date", nextDate);
        v.put("note", note);
        getWritableDatabase().insertOrThrow("vaccinations", null, v);
    }

    void deleteRecord(String type, long id) {
        if (!"weights".equals(type) && !"vaccinations".equals(type)) {
            throw new IllegalArgumentException("Onbekend type: " + type);
        }
        getWritableDatabase().delete(type, "id = ?", new String[]{String.valueOf(id)});
    }

    /** Per hond en soort inenting de meest recente, als daar een volgende datum bij staat. */
    JSONArray getReminders() throws JSONException {
        return rows(getReadableDatabase(),
                "SELECT v.dog_id, v.name, v.next_date FROM vaccinations v JOIN dogs d ON d.id = v.dog_id"
                        + " WHERE d.active = 1 AND v.next_date IS NOT NULL AND v.next_date <> ''"
                        + " AND NOT EXISTS (SELECT 1 FROM vaccinations n WHERE n.dog_id = v.dog_id"
                        + " AND n.name = v.name COLLATE NOCASE AND (n.date > v.date OR (n.date = v.date AND n.id > v.id)))"
                        + " ORDER BY v.next_date", null);
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
        SQLiteDatabase db = getReadableDatabase();
        backup.put("weights", rows(db, "SELECT dog_id, date, weight, note FROM weights ORDER BY id", null));
        backup.put("vaccinations", rows(db, "SELECT dog_id, date, name, next_date, note FROM vaccinations ORDER BY id", null));
        backup.put("app", "voer-app");
        backup.put("version", 2);
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
        // Back-ups van versie 1 hebben nog geen gewicht en inentingen
        JSONArray weights = backup.optJSONArray("weights");
        JSONArray vaccinations = backup.optJSONArray("vaccinations");

        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("feedings", null, null);
            db.delete("weights", null, null);
            db.delete("vaccinations", null, null);
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
            for (int i = 0; weights != null && i < weights.length(); i++) {
                JSONObject w = weights.getJSONObject(i);
                ContentValues v = new ContentValues();
                v.put("dog_id", w.getLong("dog_id"));
                v.put("date", w.getString("date"));
                v.put("weight", w.getDouble("weight"));
                v.put("note", w.optString("note", ""));
                db.insertOrThrow("weights", null, v);
            }
            for (int i = 0; vaccinations != null && i < vaccinations.length(); i++) {
                JSONObject vac = vaccinations.getJSONObject(i);
                ContentValues v = new ContentValues();
                v.put("dog_id", vac.getLong("dog_id"));
                v.put("date", vac.getString("date"));
                v.put("name", vac.getString("name"));
                v.put("next_date", vac.isNull("next_date") ? null : vac.optString("next_date"));
                v.put("note", vac.optString("note", ""));
                db.insertOrThrow("vaccinations", null, v);
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
            if ("dogs".equals(table)) {
                for (String key : new String[]{"sex", "birth_date", "photo"}) {
                    v.put(key, item.isNull(key) ? null : item.optString(key));
                }
            }
            db.insertOrThrow(table, null, v);
        }
    }
}
