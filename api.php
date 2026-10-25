<?php
require __DIR__ . '/includes/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if (!is_logged_in()) {
    respond(['error' => 'Niet ingelogd'], 401);
}

$action = $_GET['action'] ?? '';

try {
    if ($action === 'day' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        $date = min(valid_date($_GET['date'] ?? null) ?? today(), today());
        respond([
            'date' => $date,
            'label' => nl_date($date),
            'today' => today(),
            'dogs' => get_dogs(),
            'meals' => get_meals(),
            'feedings' => get_feedings($date, $date),
        ]);
    }

    if ($action === 'toggle' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode((string) file_get_contents('php://input'), true) ?: [];
        if (!check_csrf($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            respond(['error' => 'Sessie verlopen, herlaad de pagina.'], 403);
        }
        $date = valid_date($input['date'] ?? null);
        $dogId = (int) ($input['dog_id'] ?? 0);
        $mealId = (int) ($input['meal_id'] ?? 0);
        if (!$date || $dogId <= 0 || $mealId <= 0) {
            respond(['error' => 'Ongeldige invoer'], 400);
        }
        if ($date > today()) {
            respond(['error' => 'Je kunt niet vooruit voeren 😉'], 400);
        }

        if (!empty($input['fed'])) {
            // INSERT IGNORE: als iemand anders net al gevoerd heeft, blijft diens registratie staan
            $stmt = db()->prepare(
                'INSERT IGNORE INTO feedings (dog_id, meal_id, feed_date, fed_at, fed_by) VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([$dogId, $mealId, $date, date('Y-m-d H:i:s'), current_user_name()]);
        } else {
            $stmt = db()->prepare('DELETE FROM feedings WHERE dog_id = ? AND meal_id = ? AND feed_date = ?');
            $stmt->execute([$dogId, $mealId, $date]);
        }
        respond(['ok' => true, 'feedings' => get_feedings($date, $date)]);
    }

    respond(['error' => 'Onbekende actie'], 404);
} catch (PDOException $e) {
    error_log('Voer-app: ' . $e->getMessage());
    respond(['error' => 'Databasefout'], 500);
}
