# 🐕 Voer-app voor Android

De Voer-app voor Android. Hij werkt **volledig offline**: alle gegevens staan in een
SQLite-database op de telefoon zelf. Er is geen server, account of internetverbinding nodig.
De app vraagt ook geen internetpermissie aan.

## Functies

- **Vandaag**: per hond en per voermoment één tik om "gevoerd" te registreren (met tijd).
  Nog een keer tikken maakt het ongedaan. Met de pijltjes ga je terug naar eerdere dagen.
- **Rapport**: per week of per maand een overzicht met ✓ en ✗ per dag, het percentage per hond
  en het aantal dagen dat alles gevoerd is. Op te slaan als CSV, die je in Excel opent.
- **Honden**: per hond een foto, geslacht (teef/reu), geboortedatum en leeftijd, plus:
  - een **gewichtstabel** met het verschil ten opzichte van de vorige meting;
  - een **inentingstabel** met de datum van de volgende inenting.
  - een **grafiekje** van het gewichtsverloop; tik erop om een meting te zien.

  Verloopt een inenting binnen 30 dagen, of is hij al verlopen, dan zie je dat op het vandaag-scherm.
- **Afspraken bij de dierenarts**: plan een afspraak en vink aan welke inentingen gezet worden (ook voor
  meerdere honden tegelijk). Rond je de afspraak af, dan komen die inentingen op de datum van de afspraak
  in de lijst. De volgende inenting staat standaard een jaar later, en drie jaar later voor DHP.
- **Meldingen**: verloopt een inenting binnen 30 dagen en is er nog geen afspraak voor gepland, dan krijg
  je één melding voor alle inentingen samen. Is er nog steeds geen afspraak, dan komt de melding na 7
  dagen terug. In de week voor het verlopen (en daarna) komt hij elke dag. De controle draait dagelijks
  rond 9:00.
- **Widget** voor het beginscherm: zie meteen hoeveel voerbeurten er vandaag nog open staan, met per hond
  welke voermomenten al gedaan zijn. Houd je vinger op het beginscherm, kies *Widgets* en zoek *Voer-app*.
- **Instellingen**: honden en voermomenten toevoegen, hernoemen, sorteren, pauzeren of verwijderen.
  Gepauzeerde dagen tellen in het rapport niet mee als "niet gevoerd" (ze staan er als –).
- **Back-up**: maak een back-upbestand en zet het terug, bijvoorbeeld via Google Drive. De foto's,
  het gewicht en de inentingen gaan mee. Oudere back-ups zijn ook terug te zetten.
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
- **Een nieuwe versie uitbrengen:** ga naar *Actions → Android-app bouwen → Run workflow*, vul bij
  *versie* het nummer in (bijv. `1.3`) en klik op *Run workflow*. GitHub bouwt de app en maakt een
  release `v1.3` met de APK erbij, die je het makkelijkst op je telefoon downloadt.
  Een tag `v1.3` pushen werkt ook.

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
de wachtwoorden in. Dat bestand staat in `.gitignore`. Open daarna de map `android/` in Android Studio en
kies *Build → Build App Bundle(s) / APK(s) → Build APK(s)*, of voer `./gradlew assembleRelease` uit.
De APK komt in `app/build/outputs/apk/release/`.

## Opbouw

| Bestand | Functie |
|---|---|
| `app/src/main/assets/` | De schermen (HTML, CSS en JavaScript), die in de app worden meegeleverd |
| `app/src/main/java/nl/voerapp/MainActivity.java` | Toont de schermen en koppelt JavaScript aan de database en de bestandskiezer |
| `app/src/main/java/nl/voerapp/Database.java` | SQLite-opslag, afspraken, back-up maken en terugzetten |
| `app/src/main/java/nl/voerapp/Reminders.java` | Bepaalt wanneer er een melding over inentingen komt |
| `app/src/main/java/nl/voerapp/VoerWidget.java` | De widget op het beginscherm |
| `app/src/main/java/nl/voerapp/ReminderReceiver.java` | Dagelijkse controle; opnieuw inplannen na een herstart of update |
