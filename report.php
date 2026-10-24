<?php
require __DIR__ . '/includes/bootstrap.php';
require_login();

$period = ($_GET['period'] ?? 'week') === 'month' ? 'month' : 'week';
$anchor = new DateTimeImmutable(valid_date($_GET['date'] ?? null) ?? today());

if ($period === 'week') {
    $start = $anchor->modify('monday this week');
    $end = $start->modify('+6 days');
    $title = 'Week ' . (int) $start->format('W');
    $subtitle = nl_date($start->format('Y-m-d'), false) . ' t/m ' . nl_date($end->format('Y-m-d'), false);
    $prev = $start->modify('-1 week');
    $next = $start->modify('+1 week');
} else {
    $start = $anchor->modify('first day of this month');
    $end = $anchor->modify('last day of this month');
    $title = ucfirst(NL_MONTHS[(int) $start->format('n') - 1]) . ' ' . $start->format('Y');
    $subtitle = '';
    $prev = $start->modify('-1 month');
    $next = $start->modify('+1 month');
}
$from = $start->format('Y-m-d');
$to = $end->format('Y-m-d');
$today = today();

$feedings = get_feedings($from, $to);
$index = [];
foreach ($feedings as $f) {
    $index[$f['feed_date']][$f['dog_id']][$f['meal_id']] = $f;
}

// Actieve honden/voermomenten, plus inactieve die in deze periode wél registraties hebben
$usedDogs = array_column($feedings, 'dog_id', 'dog_id');
$usedMeals = array_column($feedings, 'meal_id', 'meal_id');
$dogs = array_values(array_filter(get_dogs(false), fn ($d) => $d['active'] || isset($usedDogs[$d['id']])));
$meals = array_values(array_filter(get_meals(false), fn ($m) => $m['active'] || isset($usedMeals[$m['id']])));
$dogNames = array_column($dogs, 'name', 'id');
$mealNames = array_column($meals, 'name', 'id');

// ---------- CSV-export ----------
if (($_GET['format'] ?? '') === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="voerrapport-' . $from . '-' . $to . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // BOM, zodat Excel de tekens goed toont
    fputcsv($out, ['Datum', 'Hond', 'Voermoment', 'Gevoerd', 'Tijd', 'Door'], ';');
    for ($d = $start; $d <= $end; $d = $d->modify('+1 day')) {
        $ds = $d->format('Y-m-d');
        if ($ds > $today) {
            break;
        }
        foreach ($dogs as $dog) {
            foreach ($meals as $meal) {
                $f = $index[$ds][$dog['id']][$meal['id']] ?? null;
                fputcsv($out, [
                    $ds,
                    $dog['name'],
                    $meal['name'],
                    $f ? 'ja' : 'nee',
                    $f ? substr($f['fed_at'], 11, 5) : '',
                    $f['fed_by'] ?? '',
                ], ';');
            }
        }
    }
    exit;
}

// ---------- Statistieken ----------
$daysCounted = 0;
$completeDays = 0;
$perDog = array_fill_keys(array_column($dogs, 'id'), 0);
$perPerson = [];
for ($d = $start; $d <= $end && $d->format('Y-m-d') <= $today; $d = $d->modify('+1 day')) {
    $ds = $d->format('Y-m-d');
    $daysCounted++;
    $complete = true;
    foreach ($dogs as $dog) {
        foreach ($meals as $meal) {
            if (isset($index[$ds][$dog['id']][$meal['id']])) {
                $perDog[$dog['id']]++;
            } else {
                $complete = false;
            }
        }
    }
    if ($complete && $dogs && $meals) {
        $completeDays++;
    }
}
foreach ($feedings as $f) {
    $who = $f['fed_by'] !== '' ? $f['fed_by'] : 'Onbekend';
    $perPerson[$who] = ($perPerson[$who] ?? 0) + 1;
}
arsort($perPerson);
$expectedPerDog = $daysCounted * count($meals);

function report_url(string $period, DateTimeImmutable $date, array $extra = []): string
{
    return 'report.php?' . http_build_query(['period' => $period, 'date' => $date->format('Y-m-d')] + $extra);
}

render_header('Rapport', 'report');
?>
<div class="report-head">
    <div class="tabs">
        <a href="<?= h(report_url('week', $anchor)) ?>"<?= $period === 'week' ? ' class="active"' : '' ?>>Week</a>
        <a href="<?= h(report_url('month', $anchor)) ?>"<?= $period === 'month' ? ' class="active"' : '' ?>>Maand</a>
    </div>
    <div class="daynav">
        <a class="btn ghost" href="<?= h(report_url($period, $prev)) ?>" aria-label="Vorige">‹</a>
        <div>
            <h1><?= h($title) ?></h1>
            <?php if ($subtitle): ?><span class="small"><?= h($subtitle) ?></span><?php endif; ?>
        </div>
        <?php if ($next->format('Y-m-d') <= $today): ?>
            <a class="btn ghost" href="<?= h(report_url($period, $next)) ?>" aria-label="Volgende">›</a>
        <?php else: ?>
            <span class="btn ghost disabled">›</span>
        <?php endif; ?>
    </div>
</div>

<?php if (!$dogs || !$meals): ?>
    <div class="card empty">Er zijn nog geen honden of voermomenten. <a href="settings.php">Voeg ze toe bij Instellingen</a>.</div>
<?php elseif ($daysCounted === 0): ?>
    <div class="card empty">Deze periode ligt in de toekomst.</div>
<?php else: ?>

<section class="stats">
    <div class="stat card">
        <span class="stat-value"><?= $completeDays ?>/<?= $daysCounted ?></span>
        <span class="stat-label">dagen alles gevoerd</span>
    </div>
    <?php foreach ($dogs as $dog): $pct = $expectedPerDog ? round($perDog[$dog['id']] / $expectedPerDog * 100) : 0; ?>
        <div class="stat card">
            <span class="stat-value"><?= $pct ?>%</span>
            <span class="stat-label"><?= h($dog['name']) ?> · <?= $perDog[$dog['id']] ?>/<?= $expectedPerDog ?> voerbeurten</span>
            <span class="bar"><span style="width: <?= $pct ?>%"></span></span>
        </div>
    <?php endforeach; ?>
</section>

<div class="card table-wrap">
    <table class="grid">
        <thead>
            <tr>
                <th rowspan="<?= count($meals) > 1 ? 2 : 1 ?>">Dag</th>
                <?php foreach ($dogs as $dog): ?>
                    <th colspan="<?= count($meals) ?>" class="dog-col"><?= h($dog['name']) ?></th>
                <?php endforeach; ?>
            </tr>
            <?php if (count($meals) > 1): ?>
            <tr>
                <?php foreach ($dogs as $dog): foreach ($meals as $i => $meal): ?>
                    <th class="meal-col<?= $i === 0 ? ' dog-col' : '' ?>"><?= h($meal['name']) ?></th>
                <?php endforeach; endforeach; ?>
            </tr>
            <?php endif; ?>
        </thead>
        <tbody>
        <?php for ($d = $start; $d <= $end; $d = $d->modify('+1 day')): $ds = $d->format('Y-m-d'); ?>
            <tr class="<?= $ds === $today ? 'today' : '' ?><?= (int) $d->format('N') >= 6 ? ' weekend' : '' ?>">
                <th class="day">
                    <?php if ($ds <= $today): ?>
                        <a href="index.php?date=<?= $ds ?>"><?= ucfirst(substr(NL_DAYS[(int) $d->format('N') - 1], 0, 2)) ?> <?= (int) $d->format('j') ?></a>
                    <?php else: ?>
                        <?= ucfirst(substr(NL_DAYS[(int) $d->format('N') - 1], 0, 2)) ?> <?= (int) $d->format('j') ?>
                    <?php endif; ?>
                </th>
                <?php foreach ($dogs as $dog): foreach ($meals as $i => $meal):
                    $f = $index[$ds][$dog['id']][$meal['id']] ?? null;
                    $cls = $i === 0 ? ' dog-col' : '';
                    if ($f) {
                        $tip = $meal['name'] . ': ' . substr($f['fed_at'], 11, 5) . ($f['fed_by'] !== '' ? ' door ' . $f['fed_by'] : '');
                        echo '<td class="cell fed' . $cls . '" title="' . h($tip) . '">✓<small>' . h(substr($f['fed_at'], 11, 5)) . '</small></td>';
                    } elseif ($ds < $today) {
                        echo '<td class="cell missed' . $cls . '" title="' . h($meal['name']) . ': niet gevoerd">✗</td>';
                    } elseif ($ds === $today) {
                        echo '<td class="cell open' . $cls . '" title="' . h($meal['name']) . ': nog open">·</td>';
                    } else {
                        echo '<td class="cell future' . $cls . '"></td>';
                    }
                endforeach; endforeach; ?>
            </tr>
        <?php endfor; ?>
        </tbody>
    </table>
</div>

<?php if ($perPerson): ?>
<section class="card">
    <h2>Wie heeft er gevoerd?</h2>
    <ul class="people">
        <?php foreach ($perPerson as $who => $count): ?>
            <li><span><?= h($who) ?></span><strong><?= $count ?>×</strong></li>
        <?php endforeach; ?>
    </ul>
</section>
<?php endif; ?>

<div class="actions no-print">
    <a class="btn" href="<?= h(report_url($period, $anchor, ['format' => 'csv'])) ?>">⬇ Download CSV</a>
    <button type="button" class="btn" onclick="window.print()">🖨 Afdrukken</button>
</div>
<?php endif; ?>
<?php
render_footer();
