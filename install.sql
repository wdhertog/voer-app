-- Voer-app: databasetabellen
-- Importeer dit bestand één keer, bijvoorbeeld via phpMyAdmin (tabblad "Importeren").

CREATE TABLE IF NOT EXISTS dogs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meals (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feedings (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    dog_id INT UNSIGNED NOT NULL,
    meal_id INT UNSIGNED NOT NULL,
    feed_date DATE NOT NULL,
    fed_at DATETIME NOT NULL,
    fed_by VARCHAR(100) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    UNIQUE KEY uniq_feeding (dog_id, meal_id, feed_date),
    KEY idx_date (feed_date),
    CONSTRAINT fk_feedings_dog FOREIGN KEY (dog_id) REFERENCES dogs (id) ON DELETE CASCADE,
    CONSTRAINT fk_feedings_meal FOREIGN KEY (meal_id) REFERENCES meals (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Standaard voermomenten (aan te passen in de app via "Instellingen")
INSERT INTO meals (name, sort_order)
SELECT * FROM (SELECT 'Ochtend' AS name, 1 AS sort_order UNION ALL SELECT 'Avond', 2) AS defaults
WHERE NOT EXISTS (SELECT 1 FROM meals);
