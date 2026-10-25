<?php
require __DIR__ . '/includes/bootstrap.php';

if (is_logged_in()) {
    header('Location: index.php');
    exit;
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Kleine vertraging maakt raden van het wachtwoord onaantrekkelijk
    usleep(300000);
    $name = trim((string) ($_POST['name'] ?? ''));
    if (!check_password((string) ($_POST['password'] ?? ''))) {
        $error = 'Onjuist wachtwoord.';
    } else {
        login(mb_substr($name, 0, 100), !empty($_POST['remember']));
        header('Location: index.php');
        exit;
    }
}

render_header('Inloggen');
?>
<form method="post" class="card login">
    <h1>🐕 Voer-app</h1>
    <?php if ($error): ?><p class="error"><?= h($error) ?></p><?php endif; ?>
    <label>Jouw naam <small>(zichtbaar bij wie er gevoerd heeft)</small>
        <input type="text" name="name" maxlength="100" autocomplete="name" value="<?= h($_POST['name'] ?? '') ?>">
    </label>
    <label>Wachtwoord
        <input type="password" name="password" required autocomplete="current-password" autofocus>
    </label>
    <label class="check"><input type="checkbox" name="remember" value="1" checked> Ingelogd blijven op dit apparaat</label>
    <button type="submit" class="btn primary">Inloggen</button>
</form>
<?php
render_footer();
