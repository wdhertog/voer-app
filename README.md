# 🐕 Voer-app

Een kleine webapp om bij te houden of de honden vandaag al gevoerd zijn, met een week- en maandrapport.
Gemaakt met PHP, MySQL en JavaScript, zodat je hem op je eigen website kunt hosten.

## Wat kan de app?

- **Vandaag**: per hond en per voermoment (bijv. ochtend/avond) één tik om "gevoerd" te registreren.
  Je ziet meteen wie er wanneer gevoerd heeft. Nog eens tikken maakt het ongedaan.
- **Vergeten te registreren?** Met de pijltjes ga je terug naar eerdere dagen en vul je het alsnog in.
- **Rapport**: per week of per maand een overzicht met ✓ en ✗ per dag, percentages per hond,
  het aantal dagen dat alles gevoerd is, en wie er hoe vaak gevoerd heeft.
  Te downloaden als CSV (opent in Excel) of af te drukken / op te slaan als PDF.
- **Instellingen**: honden en voermomenten toevoegen, hernoemen, sorteren, pauzeren of verwijderen.
- **Meerdere mensen**: iedereen in huis logt in met hetzelfde wachtwoord en zijn of haar eigen naam.
  Je blijft standaard 180 dagen ingelogd op je telefoon.
- Werkt prettig op de telefoon, ondersteunt donkere modus en ververst vanzelf als je de app weer opent.

Liever een app op je telefoon die alles lokaal bijhoudt, zonder server? Zie [`android/`](android/README.md).

## Installatie

1. **Database aanmaken**: maak in het controlepaneel van je hosting een MySQL-database en een gebruiker aan.
2. **Tabellen aanmaken**: importeer `install.sql` in die database (bijv. via phpMyAdmin → *Importeren*).
3. **Bestanden uploaden**: zet alle bestanden in een map op je website, bijv. `https://jouwsite.nl/voeren/`.
4. **Configureren**: kopieer `config.sample.php` naar `config.php` en vul in:
   - de databasegegevens,
   - `app_password`: het wachtwoord waarmee jullie inloggen,
   - `secret`: een lange willekeurige tekst (bijv. van een wachtwoordgenerator).
5. Open de map in je browser, log in en voeg je honden toe via **Instellingen**.

Tip: voeg de pagina op je telefoon toe aan het beginscherm ("Zet op beginscherm"), dan werkt hij als een app.

### Wachtwoord als hash (optioneel)

In plaats van het wachtwoord als gewone tekst in `config.php` kun je ook een hash gebruiken:

```
php -r "echo password_hash('jouw-wachtwoord', PASSWORD_DEFAULT);"
```

Zet de uitkomst (begint met `$2y$`) bij `app_password`.

## Vereisten

- PHP 8.0 of hoger met PDO MySQL
- MySQL 5.7+ of MariaDB 10.3+
- Bij voorkeur HTTPS (de meeste hosters bieden gratis Let's Encrypt)

Op Apache-servers schermen de meegeleverde `.htaccess`-bestanden `config.php` en de map `includes/` af.
Gebruik je Nginx, blokkeer die dan zelf in de serverconfiguratie.

## Bestanden

| Bestand | Functie |
|---|---|
| `index.php` + `assets/app.js` | Vandaag-scherm |
| `api.php` | JSON-API voor het afvinken |
| `report.php` | Week-/maandrapport en CSV-export |
| `settings.php` | Honden en voermomenten beheren |
| `login.php` / `logout.php` | Inloggen en uitloggen |
| `includes/bootstrap.php` | Configuratie, database, inloggen, hulpfuncties |
| `install.sql` | Databasetabellen |
