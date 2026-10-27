(function () {
    'use strict';

    // ---------- Koppeling met de Android-app ----------

    function api(method) {
        const args = Array.prototype.slice.call(arguments, 1);
        const result = JSON.parse(window.VoerNative[method].apply(window.VoerNative, args));
        if (result.error) throw new Error(result.error);
        return result;
    }

    // ---------- Datums ----------

    const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
    const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const parse = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
    const today = () => fmt(new Date());

    function addDays(s, n) {
        const d = parse(s);
        d.setDate(d.getDate() + n);
        return fmt(d);
    }

    function nlDate(s, withDay) {
        const d = parse(s);
        const text = d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
        return withDay === false ? text : DAYS[d.getDay()] + ' ' + text;
    }

    function isoWeek(s) {
        const d = parse(s);
        d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
        const jan4 = new Date(d.getFullYear(), 0, 4);
        return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
    }

    // ---------- Hulpjes ----------

    const view = document.getElementById('view');

    function el(tag, props, children) {
        const node = document.createElement(tag);
        for (const key in props || {}) {
            if (key === 'onclick' || key === 'onchange' || key === 'onsubmit') node.addEventListener(key.slice(2), props[key]);
            else if (key in node) node[key] = props[key];
            else node.setAttribute(key, props[key]);
        }
        (children || []).forEach((c) => c != null && node.append(c));
        return node;
    }

    let toastTimer;
    function toast(message) {
        const t = document.getElementById('toast');
        t.textContent = message;
        t.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
    }

    let modalResolve = null;
    function confirmDialog(text, okLabel) {
        document.getElementById('modal-text').textContent = text;
        document.getElementById('modal-ok').textContent = okLabel || 'OK';
        document.getElementById('modal').hidden = false;
        return new Promise((resolve) => { modalResolve = resolve; });
    }
    function closeModal(answer) {
        document.getElementById('modal').hidden = true;
        if (modalResolve) modalResolve(answer);
        modalResolve = null;
    }
    document.getElementById('modal-ok').addEventListener('click', () => closeModal(true));
    document.getElementById('modal-cancel').addEventListener('click', () => closeModal(false));

    function guard(fn) {
        try {
            fn();
        } catch (e) {
            toast(e.message);
        }
    }

    const byId = (list, id) => list.find((x) => +x.id === +id);

    // ---------- Navigatie ----------

    const state = {
        view: 'today',
        date: today(),
        lastToday: today(),
        period: 'week',
        anchor: today(),
    };

    function show(name) {
        state.view = name;
        document.querySelectorAll('.tabbar button').forEach((b) =>
            b.classList.toggle('active', b.dataset.view === name)
        );
        render();
        window.scrollTo(0, 0);
    }

    function render() {
        guard(() => {
            view.replaceChildren();
            ({ today: renderToday, report: renderReport, settings: renderSettings })[state.view]();
        });
    }

    document.querySelectorAll('.tabbar button').forEach((b) =>
        b.addEventListener('click', () => {
            if (b.dataset.view === 'today') state.date = today();
            show(b.dataset.view);
        })
    );

    // ---------- Vandaag ----------

    function renderToday() {
        const data = api('getData', state.date, state.date);
        const isToday = state.date === data.today;
        const dogs = data.dogs.filter((d) => d.active);
        const meals = data.meals.filter((m) => m.active);
        const fedOf = (dog, meal) =>
            data.feedings.find((f) => +f.dog_id === +dog.id && +f.meal_id === +meal.id);

        const go = (n) => { state.date = addDays(state.date, n); render(); };
        view.append(el('div', { className: 'daynav' }, [
            el('button', { className: 'btn ghost', textContent: '‹', 'aria-label': 'Vorige dag', onclick: () => go(-1) }),
            el('div', {}, [
                el('h1', { textContent: nlDate(state.date) }),
                isToday ? null : el('button', {
                    className: 'link', textContent: 'Naar vandaag',
                    onclick: () => { state.date = today(); render(); },
                }),
            ]),
            el('button', { className: 'btn ghost', textContent: '›', 'aria-label': 'Volgende dag', disabled: isToday, onclick: () => go(1) }),
        ]));

        if (!dogs.length || !meals.length) {
            view.append(el('div', { className: 'card empty' }, [
                'Er zijn nog geen honden of voermomenten. ',
                el('button', { className: 'link', textContent: 'Voeg ze toe bij Instellingen', onclick: () => show('settings') }),
                '.',
            ]));
            return;
        }

        const total = dogs.length * meals.length;
        let done = 0;
        dogs.forEach((d) => meals.forEach((m) => { if (fedOf(d, m)) done++; }));
        const todo = total - done;
        view.append(el('p', {
            className: 'summary ' + (todo === 0 ? 'ok' : 'todo'),
            textContent: todo === 0
                ? (dogs.length === 1 ? 'Gevoerd! 🎉' : 'Alle honden zijn gevoerd! 🎉')
                : 'Nog ' + todo + ' van de ' + total + ' voerbeurten te gaan',
        }));

        view.append(el('div', { className: 'dogs' }, dogs.map((dog) =>
            el('article', { className: 'card dog' }, [
                el('h2', { textContent: dog.name }),
                el('div', { className: 'meals' }, meals.map((meal) => {
                    const fed = fedOf(dog, meal);
                    return el('button', {
                        type: 'button',
                        className: 'meal' + (fed ? ' fed' : ''),
                        'aria-pressed': fed ? 'true' : 'false',
                        onclick: () => toggleFed(dog, meal, !fed),
                    }, [
                        el('span', { className: 'icon', textContent: fed ? '✓' : '🍖' }),
                        el('span', { className: 'meal-name', textContent: meal.name }),
                        el('span', { className: 'meal-detail', textContent: fed ? fed.fed_at.slice(11, 16) : 'nog niet' }),
                    ]);
                })),
            ])
        )));
    }

    async function toggleFed(dog, meal, fed) {
        if (!fed && !(await confirmDialog('Voerbeurt "' + meal.name + '" van ' + dog.name + ' ongedaan maken?', 'Ongedaan maken'))) return;
        guard(() => api('setFed', dog.id, meal.id, state.date, fed));
        render();
    }

    // ---------- Rapport ----------

    function period() {
        const a = state.anchor;
        if (state.period === 'week') {
            const start = addDays(a, -((parse(a).getDay() + 6) % 7));
            const end = addDays(start, 6);
            return {
                start, end,
                title: 'Week ' + isoWeek(start),
                subtitle: nlDate(start, false) + ' t/m ' + nlDate(end, false),
                prev: addDays(start, -7), next: addDays(start, 7),
            };
        }
        const d = parse(a);
        const start = fmt(new Date(d.getFullYear(), d.getMonth(), 1));
        const end = fmt(new Date(d.getFullYear(), d.getMonth() + 1, 0));
        const name = MONTHS[d.getMonth()];
        return {
            start, end,
            title: name.charAt(0).toUpperCase() + name.slice(1) + ' ' + d.getFullYear(),
            subtitle: '',
            prev: fmt(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
            next: fmt(new Date(d.getFullYear(), d.getMonth() + 1, 1)),
        };
    }

    function reportData() {
        const p = period();
        const data = api('getData', p.start, p.end);
        const index = {};
        data.feedings.forEach((f) => { index[f.feed_date + '|' + f.dog_id + '|' + f.meal_id] = f; });
        // Actieve honden/voermomenten, plus inactieve die in deze periode wél registraties hebben
        const used = (key, id) => data.feedings.some((f) => +f[key] === +id);
        const dogs = data.dogs.filter((d) => d.active || used('dog_id', d.id));
        const meals = data.meals.filter((m) => m.active || used('meal_id', m.id));
        const days = [];
        for (let d = p.start; d <= p.end; d = addDays(d, 1)) days.push(d);
        return { p, today: data.today, index, dogs, meals, days, get: (d, dog, meal) => index[d + '|' + dog.id + '|' + meal.id] };
    }

    function renderReport() {
        const r = reportData();
        const { p, dogs, meals, days } = r;
        const shortDay = (d) => { const n = DAYS[parse(d).getDay()]; return n.charAt(0).toUpperCase() + n.charAt(1) + ' ' + parse(d).getDate(); };

        view.append(el('div', { className: 'tabs' }, ['week', 'month'].map((per) =>
            el('button', {
                type: 'button', className: state.period === per ? 'active' : '',
                textContent: per === 'week' ? 'Week' : 'Maand',
                onclick: () => { state.period = per; render(); },
            })
        )));
        view.append(el('div', { className: 'daynav' }, [
            el('button', { className: 'btn ghost', textContent: '‹', 'aria-label': 'Vorige', onclick: () => { state.anchor = p.prev; render(); } }),
            el('div', {}, [
                el('h1', { textContent: p.title }),
                p.subtitle ? el('span', { className: 'small', textContent: p.subtitle }) : null,
            ]),
            el('button', {
                className: 'btn ghost', textContent: '›', 'aria-label': 'Volgende', disabled: p.next > r.today,
                onclick: () => { state.anchor = p.next; render(); },
            }),
        ]));

        if (!dogs.length || !meals.length) {
            view.append(el('div', { className: 'card empty', textContent: 'Er zijn nog geen honden of voermomenten.' }));
            return;
        }

        // Statistieken (alleen dagen tot en met vandaag tellen mee)
        const counted = days.filter((d) => d <= r.today);
        let completeDays = 0;
        const perDog = {};
        dogs.forEach((dog) => { perDog[dog.id] = 0; });
        counted.forEach((d) => {
            let complete = true;
            dogs.forEach((dog) => meals.forEach((meal) => {
                if (r.get(d, dog, meal)) perDog[dog.id]++;
                else complete = false;
            }));
            if (complete) completeDays++;
        });
        const expected = counted.length * meals.length;

        view.append(el('section', { className: 'stats' }, [
            el('div', { className: 'stat card' }, [
                el('span', { className: 'stat-value', textContent: completeDays + '/' + counted.length }),
                el('span', { className: 'stat-label', textContent: 'dagen alles gevoerd' }),
            ]),
        ].concat(dogs.map((dog) => {
            const pct = expected ? Math.round(perDog[dog.id] / expected * 100) : 0;
            const bar = el('span', { className: 'bar' }, [el('span')]);
            bar.firstChild.style.width = pct + '%';
            return el('div', { className: 'stat card' }, [
                el('span', { className: 'stat-value', textContent: pct + '%' }),
                el('span', { className: 'stat-label', textContent: dog.name + ' · ' + perDog[dog.id] + '/' + expected + ' voerbeurten' }),
                bar,
            ]);
        }))));

        // Tabel
        const multi = meals.length > 1;
        const head = [el('tr', {}, [el('th', { rowSpan: multi ? 2 : 1, textContent: 'Dag' })].concat(
            dogs.map((dog) => el('th', { colSpan: meals.length, className: 'dog-col', textContent: dog.name }))
        ))];
        if (multi) {
            const cells = [];
            dogs.forEach(() => meals.forEach((meal, i) =>
                cells.push(el('th', { className: 'meal-col' + (i === 0 ? ' dog-col' : ''), textContent: meal.name }))
            ));
            head.push(el('tr', {}, cells));
        }
        const rows = days.map((d) => {
            const wd = parse(d).getDay();
            const cells = [el('th', { className: 'day' }, [
                d <= r.today
                    ? el('button', { className: 'link', textContent: shortDay(d), onclick: () => { state.date = d; show('today'); } })
                    : shortDay(d),
            ])];
            dogs.forEach((dog) => meals.forEach((meal, i) => {
                const f = r.get(d, dog, meal);
                const cls = 'cell' + (i === 0 ? ' dog-col' : '');
                if (f) cells.push(el('td', { className: cls + ' fed' }, ['✓', el('small', { textContent: f.fed_at.slice(11, 16) })]));
                else if (d < r.today) cells.push(el('td', { className: cls + ' missed', textContent: '✗' }));
                else if (d === r.today) cells.push(el('td', { className: cls + ' open', textContent: '·' }));
                else cells.push(el('td', { className: cls + ' future' }));
            }));
            return el('tr', { className: (d === r.today ? 'today' : '') + (wd === 0 || wd === 6 ? ' weekend' : '') }, cells);
        });
        view.append(el('div', { className: 'card table-wrap' }, [
            el('table', { className: 'grid' }, [el('thead', {}, head), el('tbody', {}, rows)]),
        ]));

        view.append(el('div', { className: 'actions' }, [
            el('button', { className: 'btn', textContent: '⬇ Opslaan als CSV', onclick: () => exportCsv(r) }),
        ]));
    }

    function exportCsv(r) {
        const q = (v) => /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
        const lines = [['Datum', 'Hond', 'Voermoment', 'Gevoerd', 'Tijd']];
        r.days.filter((d) => d <= r.today).forEach((d) => r.dogs.forEach((dog) => r.meals.forEach((meal) => {
            const f = r.get(d, dog, meal);
            lines.push([d, dog.name, meal.name, f ? 'ja' : 'nee', f ? f.fed_at.slice(11, 16) : '']);
        })));
        // BOM zodat Excel de tekens goed toont
        const csv = '﻿' + lines.map((l) => l.map(q).join(';')).join('\r\n') + '\r\n';
        guard(() => api('saveFile', 'voerrapport-' + r.p.start + '-' + r.p.end + '.csv', 'text/csv', csv));
    }

    // ---------- Instellingen ----------

    const TYPES = {
        dogs: { title: 'Honden', singular: 'hond', placeholder: 'Naam van de hond' },
        meals: { title: 'Voermomenten', singular: 'voermoment', placeholder: 'Bijv. Ochtend, Middag, Avond' },
    };

    function renderSettings() {
        const data = api('getData', today(), today());
        view.append(el('h1', { textContent: 'Instellingen', style: 'margin-bottom: 12px' }));

        Object.keys(TYPES).forEach((type) => {
            const t = TYPES[type];
            const rows = data[type];
            const act = (method, ...args) => { guard(() => api(method, type, ...args)); render(); };

            const list = el('ul', { className: 'manage' }, rows.map((row) => {
                const input = el('input', { type: 'text', value: row.name, maxLength: 100, 'aria-label': 'Naam' });
                input.addEventListener('change', () => {
                    const name = input.value.trim();
                    if (name) { act('renameItem', row.id, name); toast('Naam opgeslagen'); } else input.value = row.name;
                });
                return el('li', { className: row.active ? '' : 'inactive' }, [
                    input,
                    el('div', { className: 'row-actions' }, [
                        el('button', { className: 'btn small ghost', textContent: '↑', 'aria-label': 'Omhoog', onclick: () => act('moveItem', row.id, -1) }),
                        el('button', { className: 'btn small ghost', textContent: '↓', 'aria-label': 'Omlaag', onclick: () => act('moveItem', row.id, 1) }),
                        el('button', { className: 'btn small ghost', textContent: row.active ? 'Pauzeren' : 'Activeren', onclick: () => act('toggleActive', row.id) }),
                        el('button', {
                            className: 'btn small danger', textContent: 'Verwijderen',
                            onclick: async () => {
                                const ok = await confirmDialog(
                                    t.singular.charAt(0).toUpperCase() + t.singular.slice(1) + ' "' + row.name +
                                    '" en alle bijbehorende voerregistraties definitief verwijderen?', 'Verwijderen');
                                if (ok) act('deleteItem', row.id);
                            },
                        }),
                    ]),
                ]);
            }));

            const addInput = el('input', { type: 'text', placeholder: t.placeholder, maxLength: 100, required: true });
            view.append(el('section', { className: 'card' }, [
                el('h2', { textContent: t.title }),
                rows.length ? null : el('p', { className: 'muted', textContent: 'Nog geen ' + t.title.toLowerCase() + ' toegevoegd.' }),
                list,
                el('form', {
                    className: 'add',
                    onsubmit: (e) => {
                        e.preventDefault();
                        const name = addInput.value.trim();
                        if (name) act('addItem', name);
                    },
                }, [addInput, el('button', { type: 'submit', className: 'btn primary', textContent: '+ Toevoegen' })]),
            ]));
        });

        view.append(el('section', { className: 'card' }, [
            el('h2', { textContent: 'Back-up' }),
            el('p', {
                className: 'muted',
                textContent: 'Alle gegevens staan alleen op deze telefoon. Maak af en toe een back-up, ' +
                    'bijvoorbeeld naar Google Drive, zodat je niets kwijtraakt bij een nieuwe telefoon.',
            }),
            el('div', { className: 'actions', style: 'justify-content: flex-start' }, [
                el('button', { className: 'btn', textContent: '⬇ Back-up maken', onclick: () => guard(() => api('exportBackup')) }),
                el('button', {
                    className: 'btn', textContent: '⬆ Back-up terugzetten',
                    onclick: async () => {
                        const ok = await confirmDialog('Een back-up terugzetten vervangt alle huidige gegevens op deze telefoon. Doorgaan?', 'Kies bestand');
                        if (ok) guard(() => api('importBackup'));
                    },
                }),
            ]),
        ]));
    }

    // ---------- Aangeroepen door de Android-app ----------

    window.voerToast = toast;
    window.voerReload = render;

    window.voerResume = function () {
        // Stond de app nog op "vandaag" van gisteren? Dan door naar de nieuwe dag.
        const now = today();
        if (state.lastToday !== now) {
            if (state.date === state.lastToday) state.date = now;
            if (state.anchor === state.lastToday) state.anchor = now;
            state.lastToday = now;
        }
        render();
    };

    window.voerBack = function () {
        if (!document.getElementById('modal').hidden) { closeModal(false); return true; }
        if (state.view !== 'today') { state.date = today(); show('today'); return true; }
        if (state.date !== today()) { state.date = today(); render(); return true; }
        return false;
    };

    show('today');
})();
