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
        const tab = ['dog', 'plan', 'complete'].includes(name) ? 'dogs' : name;
        document.querySelectorAll('.tabbar button').forEach((b) =>
            b.classList.toggle('active', b.dataset.view === tab)
        );
        render();
        window.scrollTo(0, 0);
    }

    function render() {
        guard(() => {
            view.replaceChildren();
            ({
                today: renderToday, dogs: renderDogs, dog: renderDog, plan: renderPlan, complete: renderComplete,
                report: renderReport, settings: renderSettings,
            })[state.view]();
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

        renderReminders(dogs);

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
                el('h2', { className: 'dog-title' }, [avatar(dog, 'small'), dog.name]),
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

    // ---------- Honden: overzicht, gegevens, gewicht en inentingen ----------

    const SEX = { teef: '♀ Teef', reu: '♂ Reu' };
    const VACCINES = ['Cocktail (DHP)', 'Leptospirose', 'Kennelhoest', 'Rabiës', 'Ziekte van Weil'];

    const kg = (n) => (+n).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' kg';
    const SHORT_MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    const shortDate = (s) => { const d = parse(s); return d.getDate() + ' ' + SHORT_MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
    const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

    function age(birth, now) {
        const b = parse(birth);
        const n = parse(now);
        let months = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth();
        if (n.getDate() < b.getDate()) months--;
        if (months < 0) return '';
        if (months === 0) { const w = Math.floor(daysBetween(birth, now) / 7); return w === 1 ? '1 week' : w + ' weken'; }
        const y = Math.floor(months / 12);
        const m = months % 12;
        const mText = m === 1 ? '1 maand' : m + ' maanden';
        if (y === 0) return mText;
        return y + ' jaar' + (m ? ' en ' + mText : '');
    }

    function avatar(dog, size) {
        if (dog.photo) return el('img', { className: 'avatar ' + size, src: dog.photo, alt: '' });
        return el('span', { className: 'avatar placeholder ' + size, textContent: '🐕' });
    }

    function openDog(id) {
        state.dogId = id;
        show('dog');
    }

    function reminderText(r, now) {
        const diff = daysBetween(now, r.next_date);
        if (diff < 0) return 'verlopen sinds ' + shortDate(r.next_date);
        if (diff === 0) return 'vandaag';
        return 'over ' + diff + (diff === 1 ? ' dag' : ' dagen') + ' (' + shortDate(r.next_date) + ')';
    }

    function appointmentWhen(a, now) {
        const diff = daysBetween(now, a.date);
        const day = diff === 0 ? 'vandaag' : diff === 1 ? 'morgen' : DAYS[parse(a.date).getDay()] + ' ' + shortDate(a.date);
        return day + (a.time ? ' om ' + a.time : '');
    }

    // Inentingen die binnen 30 dagen verlopen zonder afspraak, en afspraken in de komende week
    function renderReminders(dogs) {
        const now = today();
        const due = api('getReminders').filter((r) =>
            !r.appointment_date && r.next_date <= addDays(now, 30) && byId(dogs, r.dog_id));
        const upcoming = api('getAppointments').filter((a) => a.date <= addDays(now, 7));
        if (due.length) {
            view.append(el('div', { className: 'card reminders' }, due.map((r) => {
                const dog = byId(dogs, r.dog_id);
                return el('button', {
                    type: 'button', className: 'reminder' + (r.next_date < now ? ' overdue' : ''),
                    onclick: () => openDog(dog.id),
                }, ['💉 ', el('strong', { textContent: r.name }), ' van ' + dog.name + ': ' + reminderText(r, now)]);
            }).concat([el('button', { type: 'button', className: 'btn small', textContent: '📅 Afspraak plannen', onclick: () => show('plan') })])));
        }
        if (upcoming.length) {
            view.append(el('div', { className: 'card appointments-note' }, upcoming.map((a) =>
                el('button', { type: 'button', className: 'reminder', onclick: () => show('dogs') }, [
                    '📅 ', el('strong', { textContent: 'Dierenarts ' + appointmentWhen(a, now) }),
                    ': ' + a.items.map((i) => i.name + ' (' + ((byId(dogs, i.dog_id) || {}).name || '?') + ')').join(', '),
                ])
            )));
        }
    }

    function renderDogs() {
        const data = api('getData', today(), today());
        view.append(el('h1', { textContent: 'Honden', style: 'margin-bottom: 12px' }));
        if (!data.dogs.length) {
            view.append(el('div', { className: 'card empty' }, [
                'Nog geen honden. ',
                el('button', { className: 'link', textContent: 'Voeg ze toe bij Instellingen', onclick: () => show('settings') }),
                '.',
            ]));
            return;
        }
        view.append(el('div', { className: 'dog-list' }, data.dogs.map((dog) => {
            const d = api('getDog', dog.id);
            const facts = [];
            if (dog.sex) facts.push(SEX[dog.sex]);
            if (dog.birth_date) facts.push(age(dog.birth_date, data.today));
            if (d.weights.length) facts.push(kg(d.weights[0].weight));
            return el('button', { type: 'button', className: 'card dog-card' + (dog.active ? '' : ' inactive'), onclick: () => openDog(dog.id) }, [
                avatar(dog, 'medium'),
                el('span', { className: 'dog-card-text' }, [
                    el('strong', { textContent: dog.name + (dog.active ? '' : ' (gepauzeerd)') }),
                    el('span', { className: 'muted', textContent: facts.join(' · ') || 'Tik om gegevens in te vullen' }),
                ]),
                el('span', { className: 'chevron', textContent: '›' }),
            ]);
        })));
        renderAppointments(data.dogs);
    }

    // ---------- Afspraken bij de dierenarts ----------

    function renderAppointments(dogs) {
        const now = today();
        const list = api('getAppointments');
        view.append(el('section', { className: 'card', style: 'margin-top: 16px' }, [
            el('h2', { textContent: 'Afspraken dierenarts' }),
            list.length ? null : el('p', { className: 'muted', textContent: 'Geen afspraken gepland.' }),
            el('div', { className: 'appointment-list' }, list.map((a) => el('article', { className: 'appointment' }, [
                el('strong', { className: 'appointment-when', textContent: '📅 ' + appointmentWhen(a, now).replace(/^./, (c) => c.toUpperCase()) }),
                a.note ? el('span', { className: 'muted', textContent: a.note }) : null,
                el('div', { className: 'chips' }, a.items.map((i) =>
                    el('span', { className: 'chip', textContent: ((byId(dogs, i.dog_id) || {}).name || '?') + ': ' + i.name })
                )),
                el('div', { className: 'row-actions' }, [
                    el('button', { className: 'btn small primary', textContent: '✓ Afronden', onclick: () => { state.appointmentId = a.id; show('complete'); } }),
                    el('button', {
                        className: 'btn small danger', textContent: 'Verwijderen',
                        onclick: async () => {
                            if (await confirmDialog('Afspraak van ' + shortDate(a.date) + ' verwijderen?', 'Verwijderen')) {
                                guard(() => api('deleteAppointment', a.id));
                                render();
                            }
                        },
                    }),
                ]),
            ]))),
            el('button', { className: 'btn', textContent: '+ Afspraak plannen', onclick: () => show('plan') }),
        ]));
    }

    function askForNotifications() {
        if (JSON.parse(window.VoerNative.notificationStatus()) === 'ask') api('requestNotifications');
    }

    function renderPlan() {
        const now = today();
        const data = api('getData', now, now);
        const dogs = data.dogs.filter((d) => d.active);
        const reminders = api('getReminders');
        view.append(el('button', { className: 'link back', textContent: '‹ Honden', onclick: () => show('dogs') }));
        view.append(el('h1', { textContent: 'Afspraak plannen', style: 'margin-bottom: 12px' }));

        const dateInput = el('input', { type: 'date', value: addDays(now, 7), min: now, required: true });
        const timeInput = el('input', { type: 'time' });
        const noteInput = el('input', { type: 'text', placeholder: 'Bijv. naam dierenarts', maxLength: 200 });
        const checks = [];

        function checkbox(dog, name, checked, hint, hintClass) {
            const box = el('input', { type: 'checkbox', checked: checked });
            checks.push({ box, dog_id: dog.id, name });
            return el('label', { className: 'check-row' }, [
                box, el('span', {}, [el('strong', { textContent: name }), hint ? el('small', { className: 'block ' + (hintClass || 'muted'), textContent: hint }) : null]),
            ]);
        }

        const groups = dogs.map((dog) => {
            // Per soort inenting de laatste, met de datum waarop hij verloopt
            const latest = {};
            api('getDog', dog.id).vaccinations.forEach((v) => {
                const key = v.name.toLowerCase();
                if (!latest[key]) latest[key] = v;
            });
            const list = el('div', { className: 'check-list' }, Object.values(latest).map((v) => {
                const r = reminders.find((x) => +x.dog_id === +dog.id && x.name.toLowerCase() === v.name.toLowerCase());
                if (r && r.appointment_date) return checkbox(dog, v.name, false, 'Al gepland op ' + shortDate(r.appointment_date));
                if (!v.next_date) return checkbox(dog, v.name, false, '');
                const diff = daysBetween(now, v.next_date);
                return checkbox(dog, v.name, diff <= 30,
                    diff < 0 ? 'Verlopen sinds ' + shortDate(v.next_date) : 'Verloopt ' + shortDate(v.next_date),
                    diff < 0 ? 'danger-text' : diff <= 30 ? 'warn-text' : 'muted');
            }));
            const other = el('input', { type: 'text', placeholder: 'Andere inenting', maxLength: 100 });
            other.setAttribute('list', 'vaccine-names');
            const addOther = () => {
                const name = other.value.trim();
                if (!name) return;
                list.append(checkbox(dog, name, true, ''));
                other.value = '';
            };
            other.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addOther(); } });
            return el('div', { className: 'check-group' }, [
                el('h3', { className: 'dog-title' }, [avatar(dog, 'small'), dog.name]),
                list,
                el('span', { className: 'with-button' }, [other, el('button', { type: 'button', className: 'btn small ghost', textContent: '+ Toevoegen', onclick: addOther })]),
            ]);
        });

        view.append(el('form', {
            className: 'card form',
            onsubmit: (e) => {
                e.preventDefault();
                const items = checks.filter((c) => c.box.checked).map((c) => ({ dog_id: c.dog_id, name: c.name }));
                if (!items.length) { toast('Vink minstens één inenting aan'); return; }
                if (!dateInput.value) { toast('Kies een datum'); return; }
                try {
                    api('addAppointment', dateInput.value, timeInput.value, noteInput.value.trim(), JSON.stringify(items));
                } catch (err) {
                    toast(err.message);
                    return;
                }
                toast('Afspraak gepland');
                askForNotifications();
                show('dogs');
            },
        }, [
            el('div', { className: 'form inline' }, [field('Datum', dateInput), field('Tijd (optioneel)', timeInput), field('Notitie', noteInput, true)]),
            el('h2', { textContent: 'Welke inentingen worden gezet?', style: 'margin: 8px 0 0' }),
            el('datalist', { id: 'vaccine-names' }, VACCINES.map((n) => el('option', { value: n }))),
            dogs.length ? null : el('p', { className: 'muted', textContent: 'Er zijn nog geen honden.' }),
        ].concat(groups, [el('button', { type: 'submit', className: 'btn primary', textContent: 'Afspraak opslaan' })])));
    }

    function renderComplete() {
        const now = today();
        const a = api('getAppointments').find((x) => +x.id === +state.appointmentId);
        if (!a) { show('dogs'); return; }
        const dogs = api('getData', now, now).dogs;
        view.append(el('button', { className: 'link back', textContent: '‹ Honden', onclick: () => show('dogs') }));
        view.append(el('h1', { textContent: 'Afspraak afronden', style: 'margin-bottom: 4px' }));
        view.append(el('p', { className: 'muted', textContent: 'De aangevinkte inentingen komen op deze datum in de lijst van de hond.' }));

        const dateInput = el('input', { type: 'date', value: a.date <= now ? a.date : now, max: now, required: true });
        const nextYear = (date) => { const x = parse(date); x.setFullYear(x.getFullYear() + 1); return fmt(x); };
        const rows = a.items.map((i) => {
            const box = el('input', { type: 'checkbox', checked: true });
            const next = el('input', { type: 'date', value: nextYear(dateInput.value) });
            return { item: i, box, next, node: el('div', { className: 'complete-row' }, [
                el('label', { className: 'check-row' }, [box, el('span', {}, [
                    el('strong', { textContent: i.name }), el('small', { className: 'block muted', textContent: ((byId(dogs, i.dog_id) || {}).name || '?') }),
                ])]),
                field('Volgende inenting', next),
            ]) };
        });
        dateInput.addEventListener('change', () => rows.forEach((r) => { if (dateInput.value) r.next.value = nextYear(dateInput.value); }));

        view.append(el('form', {
            className: 'card form',
            onsubmit: (e) => {
                e.preventDefault();
                const items = rows.filter((r) => r.box.checked).map((r) => ({ dog_id: r.item.dog_id, name: r.item.name, next_date: r.next.value }));
                if (items.some((i) => i.next_date && i.next_date <= dateInput.value)) { toast('De volgende inenting moet na de datum van de afspraak liggen'); return; }
                try {
                    api('completeAppointment', a.id, dateInput.value, JSON.stringify(items));
                } catch (err) {
                    toast(err.message);
                    return;
                }
                toast(items.length === 1 ? 'Inenting toegevoegd' : items.length + ' inentingen toegevoegd');
                show('dogs');
            },
        }, [field('Datum van de afspraak', dateInput)].concat(rows.map((r) => r.node), [
            el('button', { type: 'submit', className: 'btn primary', textContent: '✓ Afronden' }),
        ])));
    }

    // Foto verkleinen en vierkant bijsnijden, zodat hij weinig ruimte inneemt
    async function photoToDataUrl(file) {
        let source;
        try {
            source = await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch (e) {
            source = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Deze foto kan niet worden geopend'));
                img.src = URL.createObjectURL(file);
            });
        }
        const size = 400;
        const side = Math.min(source.width, source.height);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(source, (source.width - side) / 2, (source.height - side) / 2, side, side, 0, 0, size, size);
        return canvas.toDataURL('image/jpeg', 0.85);
    }

    function field(label, input, wide) {
        return el('label', { className: 'field' + (wide ? ' wide' : '') }, [el('span', { textContent: label }), input]);
    }

    function renderDog() {
        const d = api('getDog', state.dogId);
        const dog = d.dog;
        const now = d.today;
        const reload = () => render();

        view.append(el('button', { className: 'link back', textContent: '‹ Alle honden', onclick: () => show('dogs') }));

        // Foto
        const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files[0];
            if (!file) return;
            try {
                api('setDogPhoto', dog.id, await photoToDataUrl(file));
                reload();
            } catch (e) {
                toast(e.message);
            }
        });
        view.append(el('section', { className: 'dog-header' }, [
            el('button', { type: 'button', className: 'photo-button', 'aria-label': 'Foto kiezen', onclick: () => fileInput.click() }, [
                avatar(dog, 'large'),
                el('span', { className: 'photo-edit', textContent: '📷' }),
            ]),
            fileInput,
            el('h1', { textContent: dog.name }),
            el('p', { className: 'muted', textContent: [dog.sex ? SEX[dog.sex] : '', dog.birth_date ? age(dog.birth_date, now) : ''].filter(Boolean).join(' · ') }),
            dog.photo ? el('button', {
                className: 'link small', textContent: 'Foto verwijderen',
                onclick: async () => {
                    if (await confirmDialog('Foto van ' + dog.name + ' verwijderen?', 'Verwijderen')) {
                        guard(() => api('setDogPhoto', dog.id, ''));
                        reload();
                    }
                },
            }) : null,
        ]));

        // Gegevens
        const nameInput = el('input', { type: 'text', value: dog.name, maxLength: 100, required: true });
        const sexChoice = el('div', { className: 'segmented' }, [['teef', '♀ Teef'], ['reu', '♂ Reu'], ['', 'Onbekend']].map(([value, label]) =>
            el('label', {}, [el('input', { type: 'radio', name: 'sex', value: value, checked: (dog.sex || '') === value }), el('span', { textContent: label })])
        ));
        const birthInput = el('input', { type: 'date', value: dog.birth_date || '', max: now });
        view.append(el('form', {
            className: 'card form',
            onsubmit: (e) => {
                e.preventDefault();
                const name = nameInput.value.trim();
                if (!name) return;
                const sex = sexChoice.querySelector('input:checked');
                guard(() => { api('updateDog', dog.id, name, sex ? sex.value : '', birthInput.value); toast('Gegevens opgeslagen'); });
                reload();
            },
        }, [
            el('h2', { textContent: 'Gegevens' }),
            field('Naam', nameInput),
            field('Geslacht', sexChoice),
            field('Geboortedatum', birthInput),
            el('button', { type: 'submit', className: 'btn primary', textContent: 'Opslaan' }),
        ]));

        const remove = (type, id, text) => async () => {
            if (await confirmDialog(text, 'Verwijderen')) {
                guard(() => api('deleteRecord', type, id));
                reload();
            }
        };

        // Gewicht
        const wDate = el('input', { type: 'date', value: now, max: now, required: true });
        const wValue = el('input', { type: 'text', inputMode: 'decimal', placeholder: 'bijv. 12,5', required: true });
        const wNote = el('input', { type: 'text', placeholder: 'Notitie (optioneel)', maxLength: 200 });
        const weightRows = d.weights.map((w, i) => {
            const prev = d.weights[i + 1];
            const diff = prev ? w.weight - prev.weight : null;
            return el('tr', {}, [
                el('td', { textContent: shortDate(w.date) }),
                el('td', { className: 'num', textContent: kg(w.weight) }),
                el('td', {
                    className: 'num muted',
                    textContent: diff === null || Math.abs(diff) < 0.005 ? (diff === null ? '' : '±0') : (diff > 0 ? '+' : '−') + kg(Math.abs(diff)).replace(' kg', ''),
                }),
                el('td', { className: 'note', textContent: w.note }),
                el('td', {}, [el('button', { className: 'icon-btn', 'aria-label': 'Verwijderen', textContent: '🗑', onclick: remove('weights', w.id, 'Meting van ' + shortDate(w.date) + ' verwijderen?') })]),
            ]);
        });
        view.append(el('section', { className: 'card' }, [
            el('h2', { textContent: 'Gewicht' }),
            el('form', {
                className: 'form inline',
                onsubmit: (e) => {
                    e.preventDefault();
                    const value = parseFloat(wValue.value.replace(',', '.'));
                    if (!(value > 0)) { toast('Vul een geldig gewicht in'); return; }
                    guard(() => api('addWeight', dog.id, wDate.value, value, wNote.value.trim()));
                    reload();
                },
            }, [field('Datum', wDate), field('Gewicht (kg)', wValue), field('Notitie', wNote, true),
                el('button', { type: 'submit', className: 'btn primary', textContent: '+ Toevoegen' })]),
            d.weights.length >= 2 ? weightChart(d.weights) : null,
            d.weights.length
                ? el('div', { className: 'table-wrap' }, [el('table', { className: 'list' }, [
                    el('thead', {}, [el('tr', {}, ['Datum', 'Gewicht', 'Verschil', 'Notitie', ''].map((t) => el('th', { textContent: t })))]),
                    el('tbody', {}, weightRows),
                ])])
                : el('p', { className: 'muted', textContent: 'Nog geen metingen.' }),
        ]));

        // Inentingen
        const vDate = el('input', { type: 'date', value: now, max: now, required: true });
        const vName = el('input', { type: 'text', placeholder: 'bijv. Cocktail', maxLength: 100, required: true });
        vName.setAttribute('list', 'vaccine-names');
        const vNext = el('input', { type: 'date' });
        const vNote = el('input', { type: 'text', placeholder: 'Bijv. dierenarts, batchnummer', maxLength: 200 });
        const plusYear = el('button', {
            type: 'button', className: 'btn small ghost', textContent: '+1 jaar',
            onclick: () => { const x = parse(vDate.value || now); x.setFullYear(x.getFullYear() + 1); vNext.value = fmt(x); },
        });
        const reminders = api('getReminders');
        const isLatest = (v) => reminders.some((r) => +r.dog_id === +dog.id && r.name.toLowerCase() === v.name.toLowerCase() && r.next_date === v.next_date);
        const vacRows = d.vaccinations.map((v) => {
            let status = '';
            const latest = v.next_date && isLatest(v);
            const planned = latest && reminders.find((r) => +r.dog_id === +dog.id && r.name.toLowerCase() === v.name.toLowerCase()).appointment_date;
            if (latest && !planned) {
                const diff = daysBetween(now, v.next_date);
                status = diff < 0 ? ' overdue' : diff <= 30 ? ' soon' : '';
            }
            return el('tr', {}, [
                el('td', { textContent: shortDate(v.date) }),
                el('td', {}, [el('strong', { textContent: v.name }), v.note ? el('small', { className: 'muted block', textContent: v.note }) : null]),
                el('td', { className: 'next' + status }, [v.next_date ? shortDate(v.next_date) : '–',
                    planned ? el('small', { className: 'block muted', textContent: '📅 gepland ' + shortDate(planned) }) : null]),
                el('td', {}, [el('button', { className: 'icon-btn', 'aria-label': 'Verwijderen', textContent: '🗑', onclick: remove('vaccinations', v.id, v.name + ' van ' + shortDate(v.date) + ' verwijderen?') })]),
            ]);
        });
        view.append(el('section', { className: 'card' }, [
            el('h2', { textContent: 'Inentingen' }),
            el('datalist', { id: 'vaccine-names' }, VACCINES.map((n) => el('option', { value: n }))),
            el('form', {
                className: 'form inline',
                onsubmit: (e) => {
                    e.preventDefault();
                    const name = vName.value.trim();
                    if (!name) return;
                    if (vNext.value && vNext.value <= vDate.value) { toast('De volgende inenting moet na de inentingsdatum liggen'); return; }
                    guard(() => api('addVaccination', dog.id, vDate.value, name, vNext.value, vNote.value.trim()));
                    if (vNext.value) askForNotifications();
                    reload();
                },
            }, [field('Datum', vDate), field('Inenting', vName),
                field('Volgende inenting (optioneel)', el('span', { className: 'with-button' }, [vNext, plusYear]), true),
                field('Notitie', vNote, true),
                el('button', { type: 'submit', className: 'btn primary', textContent: '+ Toevoegen' })]),
            d.vaccinations.length
                ? el('div', { className: 'table-wrap' }, [el('table', { className: 'list' }, [
                    el('thead', {}, [el('tr', {}, ['Datum', 'Inenting', 'Volgende', ''].map((t) => el('th', { textContent: t })))]),
                    el('tbody', {}, vacRows),
                ])])
                : el('p', { className: 'muted', textContent: 'Nog geen inentingen.' }),
        ]));
    }

    // ---------- Grafiek van het gewicht ----------

    function svg(tag, attrs, children) {
        const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const key in attrs || {}) node.setAttribute(key, attrs[key]);
        (children || []).forEach((c) => c != null && node.append(c));
        return node;
    }

    function weightChart(weights) {
        const points = weights.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
        const width = Math.max(240, view.clientWidth - 66);
        const height = 150;
        const pad = { top: 22, right: 12, bottom: 24, left: 40 };
        const values = points.map((p) => p.weight);
        const spread = Math.max(...values) - Math.min(...values);
        const margin = Math.max(0.5, spread * 0.2);
        const lo = Math.floor(Math.min(...values) - margin);
        const hi = Math.ceil(Math.max(...values) + margin);
        const first = points[0].date;
        const span = Math.max(1, daysBetween(first, points[points.length - 1].date));
        const x = (p) => pad.left + (daysBetween(first, p.date) / span) * (width - pad.left - pad.right);
        const y = (v) => pad.top + (1 - (v - lo) / (hi - lo)) * (height - pad.top - pad.bottom);
        const num = (v) => (+v).toLocaleString('nl-NL', { maximumFractionDigits: 1 });
        const dayMonth = (s) => { const d = parse(s); return d.getDate() + ' ' + SHORT_MONTHS[d.getMonth()]; };

        const ticks = [lo, (lo + hi) / 2, hi];
        const last = points[points.length - 1];
        const hair = svg('line', { class: 'hair', y1: pad.top - 6, y2: height - pad.bottom, visibility: 'hidden' });
        const dots = points.map((p) => svg('circle', { class: 'dot', cx: x(p), cy: y(p.weight), r: 4 }));
        const chart = svg('svg', {
            class: 'chart', width: width, height: height, viewBox: '0 0 ' + width + ' ' + height, role: 'img',
            'aria-label': 'Gewicht van ' + kg(points[0].weight) + ' op ' + shortDate(first) + ' naar ' + kg(last.weight) + ' op ' + shortDate(last.date),
        }, ticks.map((t) => svg('g', {}, [
            svg('line', { class: 'grid', x1: pad.left, x2: width - pad.right, y1: y(t), y2: y(t) }),
            svg('text', { class: 'axis', x: pad.left - 6, y: y(t) + 4, 'text-anchor': 'end' }, [num(t)]),
        ])).concat([
            svg('text', { class: 'axis', x: pad.left, y: height - 6 }, [dayMonth(first)]),
            svg('text', { class: 'axis', x: width - pad.right, y: height - 6, 'text-anchor': 'end' }, [dayMonth(last.date)]),
            svg('path', { class: 'line', d: points.map((p, i) => (i ? 'L' : 'M') + x(p) + ',' + y(p.weight)).join(' ') }),
            hair,
        ], dots, [
            // Onzichtbaar tikvlak over de hele grafiek
            svg('rect', { class: 'hit', x: 0, y: 0, width: width, height: height }),
            svg('text', { class: 'value', x: Math.min(x(last), width - pad.right), y: y(last.weight) - 10, 'text-anchor': 'end' }, [kg(last.weight)]),
        ]));

        // Tikken of bewegen: dichtstbijzijnde meting tonen
        const tip = el('div', { className: 'chart-tip', hidden: true });
        const wrap = el('div', { className: 'chart-wrap' }, [chart, tip]);
        const pick = (e) => {
            const box = chart.getBoundingClientRect();
            const px = e.clientX - box.left;
            let best = 0;
            points.forEach((p, i) => { if (Math.abs(x(p) - px) < Math.abs(x(points[best]) - px)) best = i; });
            const p = points[best];
            hair.setAttribute('x1', x(p)); hair.setAttribute('x2', x(p)); hair.setAttribute('visibility', 'visible');
            dots.forEach((d, i) => d.classList.toggle('active', i === best));
            tip.textContent = shortDate(p.date) + ' · ' + kg(p.weight);
            tip.hidden = false;
            tip.style.left = Math.min(Math.max(x(p), 60), width - 60) + 'px';
        };
        chart.addEventListener('pointermove', pick);
        chart.addEventListener('pointerdown', pick);
        chart.addEventListener('pointerleave', (e) => {
            if (e.pointerType !== 'mouse') return;
            hair.setAttribute('visibility', 'hidden'); tip.hidden = true; dots.forEach((d) => d.classList.remove('active'));
        });
        return wrap;
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
                        type === 'dogs' ? el('button', { className: 'btn small ghost', textContent: 'Gegevens', onclick: () => openDog(row.id) }) : null,
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

        const status = JSON.parse(window.VoerNative.notificationStatus());
        view.append(el('section', { className: 'card' }, [
            el('h2', { textContent: 'Meldingen' }),
            el('p', {
                className: 'muted',
                textContent: status === 'on'
                    ? 'Meldingen staan aan. Verloopt een inenting binnen 30 dagen en is er nog geen afspraak, dan krijg je een melding: eerst elke week, en in de laatste week elke dag.'
                    : 'Meldingen staan uit. Zet ze aan om een seintje te krijgen als een inenting bijna verloopt.',
            }),
            status === 'on' ? null : el('button', { className: 'btn primary', textContent: '🔔 Meldingen aanzetten', onclick: () => guard(() => api('requestNotifications')) }),
        ]));

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
        if (['dog', 'plan', 'complete'].includes(state.view)) { show('dogs'); return true; }
        if (state.view !== 'today') { state.date = today(); show('today'); return true; }
        if (state.date !== today()) { state.date = today(); render(); return true; }
        return false;
    };

    window.voerShow = show;

    // Vanuit een melding opent de app direct het juiste scherm (index.html#dogs)
    show(location.hash === '#dogs' ? 'dogs' : 'today');
})();
