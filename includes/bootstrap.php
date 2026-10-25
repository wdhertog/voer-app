<?php
declare(strict_types=1);

$configFile = __DIR__ . '/../config.php';
if (!is_file($configFile)) {
    http_response_code(500);
    exit('config.php ontbreekt. Kopieer config.sample.php naar config.php en vul je gegevens in.');
}
$config = require $configFile;

date_default_timezone_set($config['timezone'] ?? 'Europe/Amsterdam');

$https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $https,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_name('voer_sess');
session_start();

const REMEMBER_COOKIE = 'voer_auth';

function config(string $key, $default = null)
{
    global $config;
    return $config[$key] ?? $default;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', config('db_host'), config('db_name'));
        $pdo = new PDO($dsn, config('db_user'), config('db_pass'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}

function h(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

// ---------- Authenticatie ----------

function check_password(string $input): bool
{
    $stored = (string) config('app_password', '');
    if ($stored === '') {
        return false;
    }
    if (str_starts_with($stored, '$2y$') || str_starts_with($stored, '$argon2')) {
        return password_verify($input, $stored);
    }
    return hash_equals($stored, $input);
}

function remember_signature(string $payload): string
{
    // Wachtwoord zit in de sleutel: na een wachtwoordwijziging vervallen alle cookies.
    $key = config('secret', '') . '|' . config('app_password', '');
    return hash_hmac('sha256', $payload, $key);
}

function set_remember_cookie(string $name): void
{
    $expires = time() + 86400 * (int) config('remember_days', 180);
    $payload = base64_encode($name) . '|' . $expires;
    setcookie(REMEMBER_COOKIE, $payload . '|' . remember_signature($payload), [
        'expires' => $expires,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function login(string $name, bool $remember): void
{
    session_regenerate_id(true);
    $_SESSION['auth'] = true;
    $_SESSION['name'] = $name;
    if ($remember) {
        set_remember_cookie($name);
    }
}

function logout(): void
{
    $_SESSION = [];
    session_destroy();
    setcookie(REMEMBER_COOKIE, '', ['expires' => time() - 3600, 'path' => '/']);
}

function is_logged_in(): bool
{
    if (!empty($_SESSION['auth'])) {
        return true;
    }
    $cookie = $_COOKIE[REMEMBER_COOKIE] ?? '';
    $parts = explode('|', $cookie);
    if (count($parts) !== 3) {
        return false;
    }
    [$encodedName, $expires, $signature] = $parts;
    $payload = $encodedName . '|' . $expires;
    if ((int) $expires < time() || !hash_equals(remember_signature($payload), $signature)) {
        return false;
    }
    $_SESSION['auth'] = true;
    $_SESSION['name'] = (string) base64_decode($encodedName, true);
    return true;
}

function require_login(): void
{
    if (!is_logged_in()) {
        header('Location: login.php');
        exit;
    }
}

function current_user_name(): string
{
    return (string) ($_SESSION['name'] ?? '');
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function check_csrf(?string $token): bool
{
    return is_string($token) && hash_equals(csrf_token(), $token);
}

// ---------- Data ----------

function today(): string
{
    return date('Y-m-d');
}

function valid_date(?string $value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    return ($d && $d->format('Y-m-d') === $value) ? $value : null;
}

function get_dogs(bool $activeOnly = true): array
{
    $sql = 'SELECT id, name, active FROM dogs' . ($activeOnly ? ' WHERE active = 1' : '') . ' ORDER BY sort_order, name';
    return db()->query($sql)->fetchAll();
}

function get_meals(bool $activeOnly = true): array
{
    $sql = 'SELECT id, name, active FROM meals' . ($activeOnly ? ' WHERE active = 1' : '') . ' ORDER BY sort_order, id';
    return db()->query($sql)->fetchAll();
}

function get_feedings(string $from, string $to): array
{
    $stmt = db()->prepare(
        'SELECT dog_id, meal_id, feed_date, fed_at, fed_by FROM feedings
         WHERE feed_date BETWEEN ? AND ? ORDER BY feed_date, fed_at'
    );
    $stmt->execute([$from, $to]);
    return $stmt->fetchAll();
}

// ---------- Weergave ----------

const NL_DAYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const NL_MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function nl_date(string $date, bool $withDay = true): string
{
    $d = new DateTimeImmutable($date);
    $text = (int) $d->format('j') . ' ' . NL_MONTHS[(int) $d->format('n') - 1] . ' ' . $d->format('Y');
    return $withDay ? NL_DAYS[(int) $d->format('N') - 1] . ' ' . $text : $text;
}

function render_header(string $title, string $active = ''): void
{
    $nav = [
        'index' => ['index.php', 'Vandaag'],
        'report' => ['report.php', 'Rapport'],
        'settings' => ['settings.php', 'Instellingen'],
    ];
    ?>
<!doctype html>
<html lang="nl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#2f6f4f">
    <title><?= h($title) ?> · Voer-app</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🐕</text></svg>">
    <link rel="stylesheet" href="assets/style.css?v=1">
</head>
<body>
<?php if (is_logged_in()): ?>
<header class="topbar">
    <a class="brand" href="index.php">🐕 Voer-app</a>
    <nav>
        <?php foreach ($nav as $key => [$href, $label]): ?>
            <a href="<?= $href ?>"<?= $key === $active ? ' class="active"' : '' ?>><?= $label ?></a>
        <?php endforeach; ?>
    </nav>
</header>
<?php endif; ?>
<main>
<?php
}

function render_footer(): void
{
    ?>
</main>
</body>
</html>
<?php
}
