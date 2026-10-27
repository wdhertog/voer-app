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

1. Zet `voer-app.apk` op je telefoon (via e-mail, Google Drive of een USB-kabel) en open hem.
2. Android vraagt of je apps uit deze bron wilt toestaan; zeg ja.
3. Open de app en voeg je honden toe bij **Instellingen**.

Werkt op Android 6.0 en hoger.

> **Let op:** als je de app verwijdert, worden ook de gegevens verwijderd. Maak dus eerst een back-up.
> Een nieuwe versie installeren over de oude heen kan wel gewoon; daarbij blijven je gegevens bewaard.

## Zelf bouwen

### Met Android Studio

Open de map `android/` in Android Studio en kies *Build → Build App Bundle(s) / APK(s) → Build APK(s)*,
of voer `./gradlew assembleRelease` uit. De APK komt in `app/build/outputs/apk/release/`.

### Zonder Android Studio (Linux)

```
sudo apt install android-sdk-platform-23 aapt dalvik-exchange zipalign apksigner
./build-apk.sh
```

De APK komt in `build/voer-app.apk`.

### Ondertekening

Beide manieren gebruiken de sleutel in `keystore/voer-app.jks` (wachtwoord `voerapp`). Daardoor kun je
elke nieuwe build over de vorige heen installeren zonder gegevens te verliezen. De sleutel staat bewust
in de repository. Dat is prima voor een app die je zelf installeert, maar zet hem niet in een publieke
repository als je de app ooit via de Play Store wilt verspreiden.

Verhoog bij een nieuwe versie `versionCode` en `versionName` in `app/build.gradle`.

## Opbouw

| Bestand | Functie |
|---|---|
| `app/src/main/assets/` | De schermen (HTML, CSS en JavaScript), die in de app worden meegeleverd |
| `app/src/main/java/nl/voerapp/MainActivity.java` | Toont de schermen en koppelt JavaScript aan de database en de bestandskiezer |
| `app/src/main/java/nl/voerapp/Database.java` | SQLite-opslag, back-up maken en terugzetten |
| `build-apk.sh` | Bouwscript zonder Gradle |
