# 🐕 Voer-app voor Android

De Android-versie van de Voer-app. Hij werkt **volledig offline**: alle gegevens staan in een
SQLite-database op de telefoon zelf. Er is geen server, account of internetverbinding nodig.
De app vraagt ook geen internetpermissie aan.

## Functies

- **Vandaag**: per hond en per voermoment één tik om "gevoerd" te registreren (met tijd).
  Nog een keer tikken maakt het ongedaan. Met de pijltjes ga je terug naar eerdere dagen.
- **Rapport**: per week of per maand een overzicht met ✓ en ✗ per dag, het percentage per hond
  en het aantal dagen dat alles gevoerd is. Op te slaan als CSV, die je in Excel opent.
- **Instellingen**: honden en voermomenten toevoegen, hernoemen, sorteren, pauzeren of verwijderen.
- **Back-up**: maak een back-upbestand en zet het terug, bijvoorbeeld via Google Drive.
  Daarnaast neemt de automatische Android-back-up de gegevens mee als die aanstaat.
- Volgt de donkere modus van je telefoon.

## Installeren op je telefoon

1. Download `voer-app.apk` op je telefoon vanaf de
   [Releases-pagina](https://github.com/wdhertog/voer-app/releases) en open hem.
2. Android vraagt of je apps uit deze bron (je browser) wilt toestaan; zeg ja.
3. Open de app en voeg je honden toe bij **Instellingen**.

Werkt op Android 6.0 en hoger. Een nieuwe versie installeer je op dezelfde manier, over de oude heen;
je gegevens blijven daarbij bewaard.

> **Let op:** als je de app verwijdert, worden ook de gegevens verwijderd. Maak dus eerst een back-up.

## Bouwen via GitHub

GitHub Actions bouwt de app automatisch (`.github/workflows/android.yml`):

- **Bij elke push** die iets in `android/` verandert, komt de APK onder *Actions* bij die run te staan,
  onder *Artifacts*. Je moet daarvoor ingelogd zijn, en GitHub levert hem als zip aan.
- **Bij een versietag** (bijv. `v1.1`) maakt GitHub ook een release aan met de APK erbij.
  Die download je het makkelijkst op je telefoon.
  Een tag maak je op GitHub via *Releases → Draft a new release → Choose a tag*, of met
  `git tag v1.1 && git push origin v1.1`.

Het versienummer loopt automatisch op met elke build, zodat elke nieuwe APK als update installeert.

### Ondertekensleutel instellen (eenmalig)

Android installeert alleen updates die met dezelfde sleutel zijn ondertekend. Die sleutel staat niet in
de repository, maar in GitHub Secrets. Voeg onder *Settings → Secrets and variables → Actions* deze vier
secrets toe:

| Secret | Inhoud |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | De keystore als base64: `base64 -w0 voer-app-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | Wachtwoord van de keystore |
| `ANDROID_KEY_ALIAS` | Naam van de sleutel (`voer-app`) |
| `ANDROID_KEY_PASSWORD` | Wachtwoord van de sleutel (bij PKCS12 gelijk aan dat van de keystore) |

Zonder deze secrets bouwt GitHub een debug-APK en geeft een waarschuwing. Een release bij een versietag
mislukt dan.

Zelf een nieuwe sleutel maken:

```
keytool -genkeypair -keystore voer-app-release.jks -storetype PKCS12 -alias voer-app \
    -keyalg RSA -keysize 3072 -validity 18250 -dname "CN=Voer-app"
```

**Bewaar de keystore en het wachtwoord goed** (bijv. in je wachtwoordmanager). Zonder sleutel kun je
geen updates meer installeren zonder de app en de gegevens te verwijderen.

## Zelf bouwen

Kopieer `keystore.properties.example` naar `keystore.properties` en vul het pad naar de keystore en
de wachtwoorden in. Dat bestand staat in `.gitignore`.

- **Android Studio:** open de map `android/` en kies *Build → Build App Bundle(s) / APK(s) → Build APK(s)*,
  of voer `./gradlew assembleRelease` uit. De APK komt in `app/build/outputs/apk/release/`.
- **Zonder Android Studio (Linux):**
  ```
  sudo apt install android-sdk-platform-23 aapt dalvik-exchange zipalign apksigner
  ./build-apk.sh
  ```
  De APK komt in `build/voer-app.apk`.

## Opbouw

| Bestand | Functie |
|---|---|
| `app/src/main/assets/` | De schermen (HTML, CSS en JavaScript), die in de app worden meegeleverd |
| `app/src/main/java/nl/voerapp/MainActivity.java` | Toont de schermen en koppelt JavaScript aan de database en de bestandskiezer |
| `app/src/main/java/nl/voerapp/Database.java` | SQLite-opslag, back-up maken en terugzetten |
| `build-apk.sh` | Bouwscript zonder Gradle |
