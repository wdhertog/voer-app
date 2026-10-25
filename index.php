<?php
require __DIR__ . '/includes/bootstrap.php';
require_login();

$date = valid_date($_GET['date'] ?? null) ?? today();
if ($date > today()) {
    $date = today();
}

render_header('Vandaag', 'index');
?>
<section id="app" data-date="<?= h($date) ?>" data-csrf="<?= h(csrf_token()) ?>">
    <div class="daynav">
        <button type="button" class="btn ghost" data-shift="-1" aria-label="Vorige dag">‹</button>
        <div>
            <h1 id="day-label"><?= h(nl_date($date)) ?></h1>
            <a href="index.php" id="to-today" class="small"<?= $date === today() ? ' hidden' : '' ?>>Naar vandaag</a>
        </div>
        <button type="button" class="btn ghost" data-shift="1" aria-label="Volgende dag"<?= $date === today() ? ' disabled' : '' ?>>›</button>
    </div>

    <p id="summary" class="summary">Laden…</p>
    <div id="dogs" class="dogs"></div>
    <p id="error" class="error" hidden></p>
</section>
<script src="assets/app.js?v=1"></script>
<?php
render_footer();
