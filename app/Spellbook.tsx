"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { canonicalSpellClasses, spellMatchesClassFilters } from "../domain/spell-classes";
import { restoreSpellSlot, spendSpellSlot } from "../domain/spell-slots";
import { compactSpellComponents } from "../domain/spell-components";

type Spell = { id: string; nameEn: string; nameRu: string; level: number; school: string; castingTime: string; range: string; components: string; duration: string; classesJson: string; description: string; source: string; sourceBook: string; sourcePage: number | null; known: number; prepared: number; alwaysPrepared: number; overridden: boolean; overrideConflicts: string[] };
type Slot = { pool: string; level: number; maximum: number; spent: number };

function PreparedFlame() {
  return <svg className="prepared-flame" viewBox="0 0 16 20" aria-hidden="true"><path d="M8.4 0c.5 4.1-3.2 5.2-3.2 8.5 0 1.2.6 2.2 1.5 2.8-.1-2.2 1.4-3.7 3-5.3.2 2.7 2.8 4.2 2.8 7.2 0 3.7-2.6 6.8-6.2 6.8C2.7 20 0 17.2 0 13.5 0 8.2 5.7 5.5 8.4 0Z"/></svg>;
}

function PreparationToggle({ spell, onChange }: { spell: Spell; onChange: (prepared: boolean) => void }) {
  const prepared = Boolean(spell.prepared);
  const label = prepared ? `Снять подготовку: ${spell.nameRu || spell.nameEn}` : `Подготовить: ${spell.nameRu || spell.nameEn}`;
  return <button className="preparation-toggle" type="button" aria-label={label} title={label} aria-pressed={prepared} disabled={!spell.known || Boolean(spell.alwaysPrepared)} onClick={() => onChange(!prepared)}>{prepared && <PreparedFlame/>}</button>;
}

export function Spellbook({ profileId, characterId, privileged, onMessage }: { profileId: string; characterId: string; privileged: boolean; onMessage: (message: string) => void }) {
  const [spells, setSpells] = useState<Spell[]>([]);
  const [savedSpells, setSavedSpells] = useState<Spell[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [savedSlots, setSavedSlots] = useState<Slot[]>([]);
  const [preparedLimit, setPreparedLimit] = useState(0);
  const [savedPreparedLimit, setSavedPreparedLimit] = useState(0);
  const [revision, setRevision] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [catalog, setCatalog] = useState<{ source: string; version: string; count: number } | null>(null);
  const [visibleCount, setVisibleCount] = useState(48);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [school, setSchool] = useState("all");
  const [classNames, setClassNames] = useState<string[]>([]);
  const [classMenuOpen, setClassMenuOpen] = useState(false);
  const classMenuRef = useRef<HTMLDivElement>(null);
  const detailReturnFocusRef = useRef<HTMLElement | null>(null);
  const [availability, setAvailability] = useState("all");
  const [preparation, setPreparation] = useState("all");
  const [changes, setChanges] = useState("all");
  const [sort, setSort] = useState("level-name");
  const [viewMode, setViewMode] = useState<"cards" | "rows">("cards");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyDraft = { nameEn: "", nameRu: "", level: 1, school: "Evocation", castingTime: "Действие", range: "60 фт.", components: "V, S", duration: "Мгновенно", classesText: "", description: "" };
  const [draft, setDraft] = useState(emptyDraft);
  const dirty = JSON.stringify(spells) !== JSON.stringify(savedSpells) || JSON.stringify(slots) !== JSON.stringify(savedSlots) || preparedLimit !== savedPreparedLimit;

  async function load() {
    const response = await fetch(`/api/spells?profileId=${encodeURIComponent(profileId)}&characterId=${encodeURIComponent(characterId)}`);
    if (!response.ok) return onMessage("Не удалось загрузить книгу заклинаний");
    const data = await response.json();
    setSpells(data.spells); setSavedSpells(data.spells); setSlots(data.slots); setSavedSlots(data.slots); setPreparedLimit(data.preparedLimit ?? 0); setSavedPreparedLimit(data.preparedLimit ?? 0); setRevision(data.revision ?? ""); setCatalog(data.catalog ?? null);
    const storedVisibility = window.localStorage.getItem(`spellbook-expanded:${characterId}`);
    setExpanded(storedVisibility === null ? data.slots.length > 0 || data.spells.some((spell: Spell) => Boolean(spell.known)) : storedVisibility === "true");
    setViewMode(window.localStorage.getItem("spellbook-view") === "rows" ? "rows" : "cards");
  }
  // Loading is an external synchronization; state updates happen after the fetch resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load();
  // `load` is intentionally keyed by the two resource identifiers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, characterId]);
  useEffect(() => {
    if (!detailId) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setDetailId(null); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.querySelector<HTMLElement>(".spell-detail-close")?.focus();
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = previousOverflow; detailReturnFocusRef.current?.focus(); };
  }, [detailId]);
  useEffect(() => {
    if (!classMenuOpen) return;
    const closeMenu = (event: PointerEvent) => { if (!classMenuRef.current?.contains(event.target as Node)) setClassMenuOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setClassMenuOpen(false); };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("pointerdown", closeMenu); window.removeEventListener("keydown", closeOnEscape); };
  }, [classMenuOpen]);

  const visible = useMemo(() => spells.filter((spell) => {
    const text = `${spell.nameEn} ${spell.nameRu} ${spell.school} ${spell.description}`.toLocaleLowerCase("ru");
    const classes = JSON.parse(spell.classesJson || "[]") as string[];
    return text.includes(query.toLocaleLowerCase("ru")) && (level === "all" || spell.level === Number(level)) && (school === "all" || spell.school === school) && spellMatchesClassFilters(classes, classNames) && (availability === "all" || (availability === "known" ? Boolean(spell.known) : !spell.known)) && (preparation === "all" || (preparation === "prepared" ? Boolean(spell.prepared) : !spell.prepared)) && (changes === "all" || (changes === "changed" ? spell.overridden : spell.overrideConflicts.length > 0));
  }).sort((left, right) => {
    if (availability === "all" && preparation === "all") {
      const leftGroup = left.prepared ? 0 : left.known ? 1 : 2;
      const rightGroup = right.prepared ? 0 : right.known ? 1 : 2;
      if (leftGroup !== rightGroup) return leftGroup - rightGroup;
    }
    if (sort === "name") return (left.nameRu || left.nameEn).localeCompare(right.nameRu || right.nameEn, "ru");
    if (sort === "level-desc") return right.level - left.level || left.nameEn.localeCompare(right.nameEn, "en");
    if (sort === "school") return left.school.localeCompare(right.school, "ru") || left.level - right.level || left.nameEn.localeCompare(right.nameEn, "en");
    return left.level - right.level || left.nameEn.localeCompare(right.nameEn, "en");
  }), [spells, query, level, school, classNames, availability, preparation, changes, sort]);
  const schools = useMemo(() => [...new Set(spells.map((spell) => spell.school))].sort((a, b) => a.localeCompare(b, "ru")), [spells]);
  const preparedCount = spells.filter((spell) => spell.known && spell.prepared).length;
  const detailSpell = detailId ? spells.find((spell) => spell.id === detailId) ?? null : null;
  const filtersActive = Boolean(query) || level !== "all" || school !== "all" || classNames.length > 0 || availability !== "all" || preparation !== "all" || changes !== "all" || sort !== "level-name";

  function resetFilters() {
    setQuery(""); setLevel("all"); setSchool("all"); setClassNames([]); setAvailability("all"); setPreparation("all"); setChanges("all"); setSort("level-name"); setVisibleCount(48);
  }

  function toggleClassFilter(value: string) {
    setClassNames(classNames.includes(value) ? classNames.filter((item) => item !== value) : [...classNames, value]);
    setVisibleCount(48);
  }

  function openDetails(id: string, trigger: HTMLElement) {
    detailReturnFocusRef.current = trigger;
    setDetailId(id);
  }

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    setDetailId(null);
    window.localStorage.setItem(`spellbook-expanded:${characterId}`, String(next));
  }

  function changeViewMode(next: "cards" | "rows") {
    setViewMode(next);
    window.localStorage.setItem("spellbook-view", next);
  }

  function updateSpell(id: string, patch: Partial<Spell>) {
    setSpells(spells.map((spell) => spell.id === id ? { ...spell, ...patch } : spell));
  }

  async function save() {
    const response = await fetch(`/api/characters/${characterId}/spellbook`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId, expectedRevision: revision, preparedLimit, spells: spells.map((spell) => ({ spellId: spell.id, known: Boolean(spell.known), prepared: Boolean(spell.prepared) })), slots }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return onMessage(data.error ?? "Не удалось сохранить книгу заклинаний");
    setRevision(data.revision);
    setSavedSpells(spells); setSavedSlots(slots); setSavedPreparedLimit(preparedLimit); onMessage("Книга заклинаний сохранена");
  }

  async function createSpell(event: FormEvent) {
    event.preventDefault();
    const url = editingId ? `/api/spells/${editingId}` : "/api/spells";
    const { classesText, ...spellFields } = draft;
    const response = await fetch(url, { method: editingId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actorProfileId: profileId, ...spellFields, classes: classesText.split(",").map((item) => item.trim()).filter(Boolean) }) });
    const data = await response.json();
    if (!response.ok) return onMessage(data.error ?? "Не удалось создать заклинание");
    setDraft(emptyDraft); setEditingId(null); setShowCreator(false); await load(); onMessage(`Заклинание «${data.nameEn}» ${editingId ? "обновлено" : "создано"}`);
  }

  function editSpell(spell: Spell) {
    if (spell.source !== "CUSTOM" && !window.confirm(`«${spell.nameRu || spell.nameEn}» импортировано из каталога. Изменение затронет всех персонажей. Продолжить?`)) return;
    setDraft({ nameEn: spell.nameEn, nameRu: spell.nameRu, level: spell.level, school: spell.school, castingTime: spell.castingTime, range: spell.range, components: spell.components, duration: spell.duration, classesText: (JSON.parse(spell.classesJson || "[]") as string[]).join(", "), description: spell.description });
    setEditingId(spell.id); setShowCreator(true);
  }

  async function deleteSpell(spell: Spell) {
    if (!window.confirm(`Удалить пользовательское заклинание «${spell.nameRu || spell.nameEn}»? Это действие нельзя отменить.`)) return;
    const response = await fetch(`/api/spells/${encodeURIComponent(spell.id)}?actorProfileId=${encodeURIComponent(profileId)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const usage = Array.isArray(data.uses) && data.uses.length ? ` Используется: ${data.uses.map((item: { name: string; campaignName: string }) => `${item.name} (${item.campaignName})`).join(", ")}.` : "";
      return onMessage(`${data.error ?? "Не удалось удалить заклинание"}.${usage}`.replace("..", "."));
    }
    setDetailId(null); await load(); onMessage(`Заклинание «${spell.nameRu || spell.nameEn}» удалено`);
  }

  async function resetOverride(spell: Spell) {
    if (!window.confirm(`Сбросить правки «${spell.nameRu || spell.nameEn}» и вернуть версию из каталога?`)) return;
    const response = await fetch(`/api/spells/${encodeURIComponent(spell.id)}/override?actorProfileId=${encodeURIComponent(profileId)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return onMessage(data.error ?? "Не удалось сбросить правки");
    setDetailId(null); await load(); onMessage(`Правки «${spell.nameRu || spell.nameEn}» сброшены`);
  }

  return <section className={expanded ? "spellbook" : "spellbook collapsed"} id="spells">
    <header className="spellbook-heading"><div><span className="eyebrow">Арканный каталог</span><h3>Книга заклинаний</h3>{catalog && <small>{expanded ? `${catalog.count} заклинаний · ${catalog.source}` : "Раздел свёрнут для этого персонажа"}</small>}</div><div className="spellbook-actions"><button className="secondary spellbook-toggle" type="button" aria-expanded={expanded} onClick={toggleExpanded}>{expanded ? "Скрыть книгу" : "Показать книгу"}</button>{expanded && privileged && <button className="secondary" onClick={() => { setEditingId(null); setDraft(emptyDraft); setShowCreator(!showCreator); }}>+ Своё заклинание</button>}{expanded && <button className="primary" disabled={!dirty} onClick={save}>Сохранить книгу</button>}</div></header>
    {expanded && <>
    {showCreator && <form className="spell-creator" onSubmit={createSpell}>
      <input required placeholder="English name" value={draft.nameEn} onChange={(event) => setDraft({ ...draft, nameEn: event.target.value })}/><input placeholder="Русское название" value={draft.nameRu} onChange={(event) => setDraft({ ...draft, nameRu: event.target.value })}/>
      <select value={draft.level} onChange={(event) => setDraft({ ...draft, level: Number(event.target.value) })}>{Array.from({ length: 10 }, (_, value) => <option key={value} value={value}>{value === 0 ? "Заговор" : `${value} уровень`}</option>)}</select><input placeholder="Школа" value={draft.school} onChange={(event) => setDraft({ ...draft, school: event.target.value })}/>
      <input placeholder="Время накладывания" value={draft.castingTime} onChange={(event) => setDraft({ ...draft, castingTime: event.target.value })}/><input placeholder="Дистанция" value={draft.range} onChange={(event) => setDraft({ ...draft, range: event.target.value })}/><input placeholder="Компоненты" value={draft.components} onChange={(event) => setDraft({ ...draft, components: event.target.value })}/><input placeholder="Длительность" value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })}/><input className="spell-classes-input" placeholder="Классы через запятую" value={draft.classesText} onChange={(event) => setDraft({ ...draft, classesText: event.target.value })}/>
      <textarea required rows={3} placeholder="Описание" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })}/><button className="primary">{editingId ? "Сохранить" : "Создать"}</button>
    </form>}
    <div className="slot-row"><strong>Ячейки</strong>{slots.length ? slots.map((slot, index) => <div className="slot-pool" key={`${slot.pool}-${slot.level}`}><span>{slot.level} ур.</span>{privileged && <input aria-label={`Максимум ячеек ${slot.level} уровня`} type="number" min="0" value={slot.maximum} onChange={(event) => setSlots(slots.map((item, itemIndex) => itemIndex === index ? { ...item, maximum: Number(event.target.value), spent: Math.min(item.spent, Number(event.target.value)) } : item))}/>}<button aria-label={`Восстановить ячейку ${slot.level} уровня`} disabled={slot.spent <= 0} onClick={() => setSlots(restoreSpellSlot(slots, index))}>−</button><b>{slot.maximum - slot.spent} / {slot.maximum}</b><button aria-label={`Потратить ячейку ${slot.level} уровня`} disabled={slot.spent >= slot.maximum} onClick={() => setSlots(spendSpellSlot(slots, index))}>+</button></div>) : <span className="muted-copy">Нет ячеек</span>}<span className={preparedLimit > 0 && preparedCount > preparedLimit ? "prepare-count over" : "prepare-count"}>Подготовлено {preparedCount}{preparedLimit > 0 ? ` / ${preparedLimit}` : ""}</span>{privileged && <label className="prepare-limit">Лимит <input type="number" min="0" max="99" value={preparedLimit} onChange={(event) => setPreparedLimit(Number(event.target.value))}/></label>}</div>
    <div className="spell-filters"><input type="search" placeholder="Поиск по названию, школе или описанию…" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(48); }}/><select aria-label="Уровень заклинаний" value={level} onChange={(event) => { setLevel(event.target.value); setVisibleCount(48); }}><option value="all">Все уровни</option>{Array.from({ length: 10 }, (_, value) => <option key={value} value={value}>{value === 0 ? "Заговоры" : `${value} уровень`}</option>)}</select><select aria-label="Школа заклинаний" value={school} onChange={(event) => { setSchool(event.target.value); setVisibleCount(48); }}><option value="all">Все школы</option>{schools.map((item) => <option key={item}>{item}</option>)}</select><div className={classMenuOpen ? "class-filter open" : "class-filter"} ref={classMenuRef}><button type="button" className="class-filter-trigger" aria-label="Классы заклинаний" aria-haspopup="listbox" aria-expanded={classMenuOpen} onClick={() => setClassMenuOpen(!classMenuOpen)}>{classNames.length ? `Классы: ${classNames.length}` : "Все классы"}<span>▾</span></button>{classMenuOpen && <div className="class-filter-menu" role="listbox" aria-label="Выбор классов"><button type="button" className="class-filter-all" onClick={() => setClassNames([])}>Все классы</button>{canonicalSpellClasses.map(([key, label]) => <label key={key}><input type="checkbox" checked={classNames.includes(key)} onChange={() => toggleClassFilter(key)}/>{label}</label>)}<label><input type="checkbox" checked={classNames.includes("other")} onChange={() => toggleClassFilter("other")}/>Другое</label></div>}</div><select aria-label="Доступность заклинаний" value={availability} onChange={(event) => { setAvailability(event.target.value); setVisibleCount(48); }}><option value="all">Любая доступность</option><option value="known">Только доступные</option><option value="unavailable">Недоступные</option></select><select aria-label="Подготовленность заклинаний" value={preparation} onChange={(event) => { setPreparation(event.target.value); setVisibleCount(48); }}><option value="all">Любая подготовка</option><option value="prepared">Подготовленные</option><option value="unprepared">Неподготовленные</option></select><select aria-label="Сортировка заклинаний" value={sort} onChange={(event) => { setSort(event.target.value); setVisibleCount(48); }}><option value="level-name">Уровень ↑ · название</option><option value="level-desc">Уровень ↓ · название</option><option value="name">По названию</option><option value="school">По школе</option></select><button type="button" className="filter-reset" disabled={!filtersActive} onClick={resetFilters}>Сбросить</button></div>
    <div className="spell-view-row"><div className="spell-view-toggle" role="group" aria-label="Вид списка заклинаний"><button type="button" aria-pressed={viewMode === "cards"} onClick={() => changeViewMode("cards")}>Карточки</button><button type="button" aria-pressed={viewMode === "rows"} onClick={() => changeViewMode("rows")}>Строки</button></div><label>Правки каталога <select aria-label="Правки каталога" value={changes} onChange={(event) => { setChanges(event.target.value); setVisibleCount(48); }}><option value="all">Все версии</option><option value="changed">Изменённые</option><option value="conflict">С конфликтами</option></select></label></div>
    {viewMode === "cards" ? <div className="spell-grid">{visible.slice(0, visibleCount).map((spell) => <article className={spell.prepared ? "spell-card prepared" : "spell-card"} key={spell.id}>
      <div className="spell-level">{spell.level === 0 ? "Заговор" : `${spell.level} круг`}{spell.overridden && <span className={spell.overrideConflicts.length ? "spell-override conflict" : "spell-override"}>{spell.overrideConflicts.length ? "Конфликт правок" : "Изменено"}</span>}</div><h4>{spell.nameEn}</h4>{spell.nameRu && <p className="spell-ru">{spell.nameRu}</p>}<div className="spell-meta"><span>{spell.school}</span><span>{spell.castingTime}</span><span>{spell.range}</span><span>{spell.components || "—"}</span></div><p>{spell.description}</p>
      <footer>{privileged && <label><input type="checkbox" checked={Boolean(spell.known)} onChange={(event) => updateSpell(spell.id, { known: event.target.checked ? 1 : 0, prepared: event.target.checked ? spell.prepared : 0 })}/> Доступно</label>}{privileged ? <label><input type="checkbox" disabled={!spell.known || Boolean(spell.alwaysPrepared)} checked={Boolean(spell.prepared)} onChange={(event) => updateSpell(spell.id, { prepared: event.target.checked ? 1 : 0 })}/> Подготовлено</label> : <PreparationToggle spell={spell} onChange={(prepared) => updateSpell(spell.id, { prepared: prepared ? 1 : 0 })}/>}<button type="button" onClick={(event) => openDetails(spell.id, event.currentTarget)}>Подробнее</button>{privileged && <details className="spell-card-actions"><summary aria-label={`Действия: ${spell.nameRu || spell.nameEn}`}>•••</summary><div><button type="button" onClick={() => editSpell(spell)}>Изменить</button>{spell.overridden && <button type="button" onClick={() => void resetOverride(spell)}>Сбросить правки</button>}{spell.source === "CUSTOM" && <button className="spell-delete" type="button" onClick={() => void deleteSpell(spell)}>Удалить</button>}</div></details>}</footer>
    </article>)}</div> : <div className="spell-table" role="table" aria-label="Заклинания"><div className="spell-table-head" role="row"><span role="columnheader">Заклинание</span><span role="columnheader">Компоненты</span><span role="columnheader">Круг</span><span role="columnheader">Подготовлено</span></div>{visible.slice(0, visibleCount).map((spell) => {
      const components = compactSpellComponents(spell.components);
      return <div className={spell.prepared ? "spell-table-row prepared" : "spell-table-row"} role="row" key={spell.id}>
        <div role="cell"><button className="spell-row-name" type="button" onClick={(event) => openDetails(spell.id, event.currentTarget)}><strong>{spell.nameEn}</strong><span>{spell.nameRu || "—"}</span></button></div>
        <div className="spell-row-components" role="cell" aria-label={`Компоненты: ${spell.components || "не указаны"}`}>{components.verbal && <abbr title="Вербальный компонент">V</abbr>}{components.somatic && <abbr title="Соматический компонент">S</abbr>}{components.material && <details className="material-component"><summary aria-label="Показать материальные компоненты">M</summary><span role="tooltip">{components.materialText}</span></details>}{!components.verbal && !components.somatic && !components.material && <span>—</span>}</div>
        <span className="spell-row-level" role="cell">{spell.level === 0 ? "Заговор" : spell.level}</span>
        <div className="spell-row-prepared" role="cell">{privileged ? <label><input type="checkbox" disabled={!spell.known || Boolean(spell.alwaysPrepared)} checked={Boolean(spell.prepared)} onChange={(event) => updateSpell(spell.id, { prepared: event.target.checked ? 1 : 0 })}/><span>{spell.prepared ? "Да" : "Нет"}</span></label> : <PreparationToggle spell={spell} onChange={(prepared) => updateSpell(spell.id, { prepared: prepared ? 1 : 0 })}/>}</div>
      </div>;
    })}</div>}
    {visible.length > visibleCount && <button className="load-more" onClick={() => setVisibleCount(visibleCount + 48)}>Показать ещё · осталось {visible.length - visibleCount}</button>}
    {!visible.length && <div className="empty-spells"><span>✦</span><strong>Ничего не найдено</strong><p>Измените фильтры или попросите Мастера открыть заклинания.</p></div>}
    {detailSpell && <div className="spell-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailId(null); }}><article className="spell-detail" role="dialog" aria-modal="true" aria-labelledby="spell-detail-title"><button className="spell-detail-close" type="button" aria-label="Закрыть полную карточку" onClick={() => setDetailId(null)}>×</button><span className="eyebrow">{detailSpell.level === 0 ? "Заговор" : `${detailSpell.level} круг`} · {detailSpell.school}</span><h3 id="spell-detail-title">{detailSpell.nameRu || detailSpell.nameEn}</h3>{detailSpell.nameRu && <p className="spell-detail-original">{detailSpell.nameEn}</p>}{detailSpell.overridden && <p className={detailSpell.overrideConflicts.length ? "override-notice conflict" : "override-notice"}>{detailSpell.overrideConflicts.length ? `Каталог изменил те же поля: ${detailSpell.overrideConflicts.join(", ")}. Проверьте правку.` : "Применены пользовательские правки поверх каталога."}</p>}<dl><div><dt>Накладывание</dt><dd>{detailSpell.castingTime}</dd></div><div><dt>Дистанция</dt><dd>{detailSpell.range}</dd></div><div><dt>Компоненты</dt><dd>{detailSpell.components || "—"}</dd></div><div><dt>Длительность</dt><dd>{detailSpell.duration}</dd></div></dl><p className="spell-detail-description">{detailSpell.description}</p><div className="spell-detail-classes"><strong>Классы</strong><span>{(JSON.parse(detailSpell.classesJson || "[]") as string[]).join(", ") || "Не указаны"}</span></div><footer><span>{detailSpell.sourceBook || detailSpell.source}{detailSpell.sourcePage ? ` · стр. ${detailSpell.sourcePage}` : ""}</span>{Boolean(detailSpell.prepared) && <b>Подготовлено</b>}</footer></article></div>}
    </>}
  </section>;
}
