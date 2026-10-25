<?php
require __DIR__ . '/includes/bootstrap.php';
require_login();

// Beide lijsten werken hetzelfde; alleen de tabel en de teksten verschillen.
$types = [
    'dogs' => ['title' => 'Honden', 'singular' => 'hond', 'placeholder' => 'Naam van de hond'],
    'meals' => ['title' => 'Voermomenten', 'singular' => 'voermoment', 'placeholder' => 'Bijv. Ochtend, Middag, Avond'],
];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $type = $_POST['type'] ?? '';
    if (!check_csrf($_POST['csrf'] ?? null) || !isset($types[$type])) {
        http_response_code(400);
        exit('Ongeldig verzoek. Ga terug en probeer het opnieuw.');
    }
    $table = $type; // komt uit de whitelist hierboven
    $id = (int) ($_POST['id'] ?? 0);
    $name = mb_substr(trim((string) ($_POST['name'] ?? '')), 0, 100);
    $pdo = db();

    switch ($_POST['action'] ?? '') {
        case 'add':
            if ($name !== '') {
                $max = (int) $pdo->query("SELECT COALESCE(MAX(sort_order), 0) FROM $table")->fetchColumn();
                $pdo->prepare("INSERT INTO $table (name, sort_order) VALUES (?, ?)")->execute([$name, $max + 1]);
            }
            break;
        case 'rename':
            if ($name !== '') {
                $pdo->prepare("UPDATE $table SET name = ? WHERE id = ?")->execute([$name, $id]);
            }
            break;
        case 'toggle':
            $pdo->prepare("UPDATE $table SET active = 1 - active WHERE id = ?")->execute([$id]);
            break;
        case 'up':
        case 'down':
            $rows = $pdo->query("SELECT id FROM $table ORDER BY sort_order, id")->fetchAll(PDO::FETCH_COLUMN);
            $pos = array_search($id, $rows);
            $swap = $pos === false ? null : ($_POST['action'] === 'up' ? $pos - 1 : $pos + 1);
            if ($swap !== null && isset($rows[$swap])) {
                [$rows[$pos], $rows[$swap]] = [$rows[$swap], $rows[$pos]];
                $stmt = $pdo->prepare("UPDATE $table SET sort_order = ? WHERE id = ?");
                foreach ($rows as $i => $rowId) {
                    $stmt->execute([$i + 1, $rowId]);
                }
            }
            break;
        case 'delete':
            // Verwijdert ook de bijbehorende voerregistraties (ON DELETE CASCADE)
            $pdo->prepare("DELETE FROM $table WHERE id = ?")->execute([$id]);
            break;
    }
    header('Location: settings.php#' . $type);
    exit;
}

$lists = ['dogs' => get_dogs(false), 'meals' => get_meals(false)];
$csrf = csrf_token();

render_header('Instellingen', 'settings');
?>
<h1>Instellingen</h1>

<?php foreach ($types as $type => $t): ?>
<section class="card" id="<?= $type ?>">
    <h2><?= $t['title'] ?></h2>
    <?php if (!$lists[$type]): ?>
        <p class="muted">Nog geen <?= strtolower($t['title']) ?> toegevoegd.</p>
    <?php endif; ?>
    <ul class="manage">
        <?php foreach ($lists[$type] as $row): ?>
        <li class="<?= $row['active'] ? '' : 'inactive' ?>">
            <form method="post" class="rename">
                <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
                <input type="hidden" name="type" value="<?= $type ?>">
                <input type="hidden" name="id" value="<?= (int) $row['id'] ?>">
                <input type="text" name="name" value="<?= h($row['name']) ?>" maxlength="100" required aria-label="Naam">
                <button class="btn small" name="action" value="rename" title="Naam opslaan">Opslaan</button>
                <button class="btn small ghost" name="action" value="up" title="Omhoog">↑</button>
                <button class="btn small ghost" name="action" value="down" title="Omlaag">↓</button>
                <button class="btn small ghost" name="action" value="toggle" formnovalidate
                    title="<?= $row['active'] ? 'Verbergen op de vandaag-pagina; geschiedenis blijft bewaard' : 'Weer tonen' ?>">
                    <?= $row['active'] ? 'Pauzeren' : 'Activeren' ?>
                </button>
                <button class="btn small danger" name="action" value="delete" formnovalidate
                    onclick="return confirm('<?= h(ucfirst($t['singular'])) ?> &quot;<?= h(addslashes($row['name'])) ?>&quot; en alle bijbehorende voerregistraties definitief verwijderen?')">Verwijderen</button>
            </form>
        </li>
        <?php endforeach; ?>
    </ul>
    <form method="post" class="add">
        <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
        <input type="hidden" name="type" value="<?= $type ?>">
        <input type="text" name="name" placeholder="<?= h($t['placeholder']) ?>" maxlength="100" required>
        <button class="btn primary" name="action" value="add">+ Toevoegen</button>
    </form>
</section>
<?php endforeach; ?>

<section class="card">
    <h2>Account</h2>
    <p>Ingelogd als <strong><?= h(current_user_name() !== '' ? current_user_name() : '(geen naam)') ?></strong>.</p>
    <a class="btn" href="logout.php">Uitloggen</a>
</section>
<?php
render_footer();
