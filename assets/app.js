(function () {
    'use strict';

    const app = document.getElementById('app');
    if (!app) return;

    const csrf = app.dataset.csrf;
    const els = {
        label: document.getElementById('day-label'),
        toToday: document.getElementById('to-today'),
        summary: document.getElementById('summary'),
        dogs: document.getElementById('dogs'),
        error: document.getElementById('error'),
        next: app.querySelector('[data-shift="1"]'),
    };
    let state = null;
    let date = app.dataset.date;

    function el(tag, props, children) {
        const node = document.createElement(tag);
        Object.assign(node, props || {});
        (children || []).forEach((c) => node.append(c));
        return node;
    }

    function showError(message) {
        els.error.textContent = message;
        els.error.hidden = !message;
    }

    async function request(url, options) {
        const res = await fetch(url, Object.assign({ credentials: 'same-origin' }, options));
        if (res.status === 401) {
            window.location.href = 'login.php';
            throw new Error('Niet ingelogd');
        }
        const data = await res.json().catch(() => ({ error: 'Onverwacht antwoord van de server' }));
        if (!res.ok) throw new Error(data.error || 'Er ging iets mis');
        return data;
    }

    async function load() {
        try {
            state = await request('api.php?action=day&date=' + encodeURIComponent(date));
            showError('');
            render();
        } catch (e) {
            showError(e.message);
        }
    }

    function isFed(dogId, mealId) {
        return state.feedings.find((f) => +f.dog_id === +dogId && +f.meal_id === +mealId);
    }

    function render() {
        const isToday = state.date === state.today;
        els.label.textContent = state.label;
        els.toToday.hidden = isToday;
        els.next.disabled = isToday;
        history.replaceState(null, '', isToday ? 'index.php' : 'index.php?date=' + state.date);

        els.dogs.replaceChildren();

        if (!state.dogs.length || !state.meals.length) {
            els.summary.textContent = '';
            els.dogs.append(el('div', { className: 'card empty' }, [
                'Er zijn nog geen honden of voermomenten. ',
                el('a', { href: 'settings.php', textContent: 'Voeg ze toe bij Instellingen' }),
                '.',
            ]));
            return;
        }

        const total = state.dogs.length * state.meals.length;
        const done = state.feedings.filter((f) =>
            state.dogs.some((d) => +d.id === +f.dog_id) && state.meals.some((m) => +m.id === +f.meal_id)
        ).length;
        const todo = total - done;
        els.summary.className = 'summary ' + (todo === 0 ? 'ok' : 'todo');
        els.summary.textContent = todo === 0
            ? (state.dogs.length === 1 ? 'Gevoerd! 🎉' : 'Alle honden zijn gevoerd! 🎉')
            : `Nog ${todo} van de ${total} voerbeurten te gaan`;

        state.dogs.forEach((dog) => {
            const buttons = state.meals.map((meal) => {
                const fed = isFed(dog.id, meal.id);
                const detail = fed
                    ? fed.fed_at.slice(11, 16) + (fed.fed_by ? ' · ' + fed.fed_by : '')
                    : 'nog niet';
                const btn = el('button', {
                    type: 'button',
                    className: 'meal' + (fed ? ' fed' : ''),
                }, [
                    el('span', { className: 'icon', textContent: fed ? '✓' : '🍖' }),
                    el('span', { className: 'meal-name', textContent: meal.name }),
                    el('span', { className: 'meal-detail', textContent: detail }),
                ]);
                btn.setAttribute('aria-pressed', fed ? 'true' : 'false');
                btn.addEventListener('click', () => toggle(dog, meal, !fed, btn));
                return btn;
            });
            els.dogs.append(el('article', { className: 'card dog' }, [
                el('h2', { textContent: dog.name }),
                el('div', { className: 'meals' }, buttons),
            ]));
        });
    }

    async function toggle(dog, meal, fed, btn) {
        if (!fed && !confirm(`Voerbeurt "${meal.name}" van ${dog.name} ongedaan maken?`)) return;
        btn.disabled = true;
        try {
            const data = await request('api.php?action=toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
                body: JSON.stringify({ date: state.date, dog_id: dog.id, meal_id: meal.id, fed: fed }),
            });
            state.feedings = data.feedings;
            showError('');
            render();
        } catch (e) {
            btn.disabled = false;
            showError(e.message);
        }
    }

    function shift(days) {
        const d = new Date(date + 'T12:00:00');
        d.setDate(d.getDate() + days);
        const next = d.toISOString().slice(0, 10);
        if (state && next > state.today) return;
        date = next;
        load();
    }

    app.querySelectorAll('[data-shift]').forEach((b) =>
        b.addEventListener('click', () => shift(+b.dataset.shift))
    );

    // Ververs als je de app weer opent (iemand anders kan inmiddels gevoerd hebben)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // Na middernacht automatisch naar de nieuwe dag
            if (state && date === state.today) date = new Date().toLocaleDateString('sv-SE');
            load();
        }
    });

    load();
})();
