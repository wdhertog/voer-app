<?php
// Kopieer dit bestand naar config.php en vul je eigen gegevens in.

return [
    // MySQL-gegevens (vind je in het controlepaneel van je hostingpartij)
    'db_host' => 'localhost',
    'db_name' => 'voer_app',
    'db_user' => 'gebruikersnaam',
    'db_pass' => 'wachtwoord',

    // Wachtwoord om in te loggen in de app (gedeeld binnen het huishouden).
    // Mag als gewone tekst, of als hash gemaakt met password_hash().
    'app_password' => 'kies-een-sterk-wachtwoord',

    // Willekeurige geheime tekst (minstens 32 tekens) voor het "ingelogd blijven"-cookie.
    // Pas je dit aan, dan moet iedereen opnieuw inloggen.
    'secret' => 'vervang-dit-door-een-lange-willekeurige-tekst',

    // Hoe lang je ingelogd blijft op een apparaat (in dagen)
    'remember_days' => 180,

    'timezone' => 'Europe/Amsterdam',
];
