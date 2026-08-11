"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type Spell = { id: string; nameEn: string; nameRu: string; level: number; school: string; castingTime: string; range: string; components: string; duration: string; classesJson: string; description: string; source: string; known: number; prepared: number; alwaysPrepared: number };
type Slot = { pool: string; level: number; maximum: number; spent: number };

export function Spellbook({ profileId, characterId, privileged, onMessage }: { profileId: string; characterId: string; privileged: boolean; onMessage: (message: string) => void }) {
  const [spells, setSpells] = useState<Spell[]>([]);
  const [savedSpells, setSavedSpells] = useState<Spell[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [savedSlots, setSavedSlots] = useState<Slot[]>([]);
  const [preparedLimit, setPreparedLimit] = useState(0);
  const [savedPreparedLimit, setSavedPreparedLimit] = useState(0);
  const [catalog, setCatalog] = useState<{ source: string; version: string; count: number } | null>(null);
  const [visibleCount, setVisibleCount] = useState(48);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [school, setSchool] = useState("all");
  const [className, setClassName] = useState("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyDraft = { nameEn: "", nameRu: "", level: 1, school: "Evocation", castingTime: "Действие", range: "60 фт.", components: "V, S", duration: "Мгновенно", classesText: "", description: "" };
  const [draft, setDraft] = useState(emptyDraft);
  const dirty = JSON.stringify(spells) !== JSON.stringify(savedSpells) || JSON.stringify(slots) !== JSON.stringify(savedSlots) || preparedLimit !== savedPreparedLimit;

  async function load() {
    const response = await fetch(`/api/spells?profileId=${encodeURIComponent(profileId)}&characterId=${encodeURIComponent(characterId)}`);
    if (!response.ok) return onMessage("Не удалось загрузить книгу заклинаний");
    const data = await response.json();
    setSpells(data.spells); setSavedSpells(data.spells); setSlots(data.slots); setSavedSlots(data.slots); setPreparedLimit(data.preparedLimit ?? 0); setSavedPreparedLimit(data.preparedLimit ?? 0); setCatalog(data.catalog ?? null);
  }
  useEffect(() => { void load(); }, [profileId, characterId]);

  const visible = useMemo(() => spells.filter((spell) => {
    const text = `${spell.nameEn} ${spell.nameRu} ${spell.school}`.toLocaleLowerCase("ru");
    const classes = JSON.parse(spell.classesJson || "[]") as string[];
    return text.includes(query.toLocaleLowerCase("ru")) && (level === "all" || spell.level === Number(level)) && (school === "all" || spell.school === school) && (className === "all" || classes.includes(className)) && (!onlyMine || Boolean(spell.known));
  }), [spells, query, level, school, className, onlyMine]);
  const schools = useMemo(() => [...new Set(spells.map((spell) => spell.school))].sort((a, b) => a.localeCompare(b, "ru")), [spells]);
  const classes = useMemo(() => [...new Set(spells.flatMap((spell) => JSON.parse(spell.classesJson || "[]") as string[]))].sort((a, b) => a.localeCompare(b, "ru")), [spells]);
  const preparedCount = spells.filter((spell) => spell.known && spell.prepared).length;
  useEffect(() => setVisibleCount(48), [query, level, school, className, onlyMine]);

  function updateSpell(id: string, patch: Partial<Spell>) {
    setSpells(spells.map((spell) => spell.id === id ? { ...spell, ...patch } : spell));
  }

  async function save() {
    const [spellResponse, slotResponse] = await Promise.all([
      fetch(`/api/characters/${characterId}/spells`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId, preparedLimit, spells: spells.map((spell) => ({ spellId: spell.id, known: Boolean(spell.known), prepared: Boolean(spell.prepared) })) }) }),
      fetch(`/api/characters/${characterId}/spell-slots`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId, slots }) }),
    ]);
    if (!spellResponse.ok || !slotResponse.ok) { const data = await spellResponse.json().catch(() => ({})); return onMessage(data.error ?? "Не удалось сохранить книгу заклинаний"); }
    setSavedSpells(spells); setSavedSlots(slots); setSavedPreparedLimit(preparedLimit); onMessage("Книга заклинаний сохранена");
  }

  async function createSpell(event: FormEvent) {
    event.preventDefault();
    const url = editingId ? `/api/spells/${editingId}` : "/api/spells";
    const response = await fetch(url, { method: editingId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actorProfileId: profileId, ...draft, classes: draft.classesText.split(",").map((item) => item.trim()).filter(Boolean) }) });
    const data = await response.json();
    if (!response.ok) return onMessage(data.error ?? "Не удалось создать заклинание");
    setDraft(emptyDraft); setEditingId(null); setShowCreator(false); await load(); onMessage(`Заклинание «${data.nameEn}» ${editingId ? "обновлено" : "создано"}`);
  }

  function editSpell(spell: Spell) {
    setDraft({ nameEn: spell.nameEn, nameRu: spell.nameRu, level: spell.level, school: spell.school, castingTime: spell.castingTime, range: spell.range, components: spell.components, duration: spell.duration, classesText: (JSON.parse(spell.classesJson || "[]") as string[]).join(", "), description: spell.description });
    setEditingId(spell.id); setShowCreator(true);
  }

  return <section className="spellbook" id="spells">
    <header className="spellbook-heading"><div><span className="eyebrow">Арканный каталог</span><h3>Книга заклинаний</h3>{catalog && <small>{catalog.count} заклинаний · {catalog.source}</small>}</div><div className="spellbook-actions">{privileged && <button className="secondary" onClick={() => { setEditingId(null); setDraft(emptyDraft); setShowCreator(!showCreator); }}>+ Своё заклинание</button>}<button className="primary" disabled={!dirty} onClick={save}>Сохранить книгу</button></div></header>
    {showCreator && <form className="spell-creator" onSubmit={createSpell}>
      <input required placeholder="English name" value={draft.nameEn} onChange={(event) => setDraft({ ...draft, nameEn: event.target.value })}/><input placeholder="Русское название" value={draft.nameRu} onChange={(event) => setDraft({ ...draft, nameRu: event.target.value })}/>
      <select value={draft.level} onChange={(event) => setDraft({ ...draft, level: Number(event.target.value) })}>{Array.from({ length: 10 }, (_, value) => <option key={value} value={value}>{value === 0 ? "Заговор" : `${value} уровень`}</option>)}</select><input placeholder="Школа" value={draft.school} onChange={(event) => setDraft({ ...draft, school: event.target.value })}/>
      <input placeholder="Время накладывания" value={draft.castingTime} onChange={(event) => setDraft({ ...draft, castingTime: event.target.value })}/><input placeholder="Дистанция" value={draft.range} onChange={(event) => setDraft({ ...draft, range: event.target.value })}/><input placeholder="Компоненты" value={draft.components} onChange={(event) => setDraft({ ...draft, components: event.target.value })}/><input placeholder="Длительность" value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })}/><input className="spell-classes-input" placeholder="Классы через запятую" value={draft.classesText} onChange={(event) => setDraft({ ...draft, classesText: event.target.value })}/>
      <textarea required rows={3} placeholder="Описание" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })}/><button className="primary">{editingId ? "Сохранить" : "Создать"}</button>
    </form>}
    <div className="slot-row"><strong>Ячейки</strong>{slots.length ? slots.map((slot, index) => <div className="slot-pool" key={`${slot.pool}-${slot.level}`}><span>{slot.level} ур.</span>{privileged && <input aria-label={`Максимум ячеек ${slot.level} уровня`} type="number" min="0" value={slot.maximum} onChange={(event) => setSlots(slots.map((item, itemIndex) => itemIndex === index ? { ...item, maximum: Number(event.target.value), spent: Math.min(item.spent, Number(event.target.value)) } : item))}/>}<button disabled={slot.spent <= 0} onClick={() => setSlots(slots.map((item, itemIndex) => itemIndex === index ? { ...item, spent: item.spent - 1 } : item))}>−</button><b>{slot.maximum - slot.spent} / {slot.maximum}</b><button disabled={slot.spent >= slot.maximum} onClick={() => setSlots(slots.map((item, itemIndex) => itemIndex === index ? { ...item, spent: item.spent + 1 } : item))}>+</button></div>) : <span className="muted-copy">Нет ячеек</span>}<span className={preparedLimit > 0 && preparedCount > preparedLimit ? "prepare-count over" : "prepare-count"}>Подготовлено {preparedCount}{preparedLimit > 0 ? ` / ${preparedLimit}` : ""}</span>{privileged && <label className="prepare-limit">Лимит <input type="number" min="0" max="99" value={preparedLimit} onChange={(event) => setPreparedLimit(Number(event.target.value))}/></label>}</div>
    <div className="spell-filters"><input type="search" placeholder="Поиск по названию или школе…" value={query} onChange={(event) => setQuery(event.target.value)}/><select value={level} onChange={(event) => setLevel(event.target.value)}><option value="all">Все уровни</option>{Array.from({ length: 10 }, (_, value) => <option key={value} value={value}>{value === 0 ? "Заговоры" : `${value} уровень`}</option>)}</select><select value={school} onChange={(event) => setSchool(event.target.value)}><option value="all">Все школы</option>{schools.map((item) => <option key={item}>{item}</option>)}</select><select value={className} onChange={(event) => setClassName(event.target.value)}><option value="all">Все классы</option>{classes.map((item) => <option key={item}>{item}</option>)}</select><label><input type="checkbox" checked={onlyMine} onChange={(event) => setOnlyMine(event.target.checked)}/> Только доступные</label></div>
    <div className="spell-grid">{visible.slice(0, visibleCount).map((spell) => <article className={spell.prepared ? "spell-card prepared" : "spell-card"} key={spell.id}>
      <div className="spell-level">{spell.level === 0 ? "Заговор" : `${spell.level} круг`}</div><h4>{spell.nameEn}</h4>{spell.nameRu && <p className="spell-ru">{spell.nameRu}</p>}<div className="spell-meta"><span>{spell.school}</span><span>{spell.castingTime}</span><span>{spell.range}</span><span>{spell.components || "—"}</span></div><p>{spell.description}</p>
      <footer>{privileged && <label><input type="checkbox" checked={Boolean(spell.known)} onChange={(event) => updateSpell(spell.id, { known: event.target.checked ? 1 : 0, prepared: event.target.checked ? spell.prepared : 0 })}/> Доступно</label>}<label><input type="checkbox" disabled={!spell.known || Boolean(spell.alwaysPrepared)} checked={Boolean(spell.prepared)} onChange={(event) => updateSpell(spell.id, { prepared: event.target.checked ? 1 : 0 })}/> Подготовлено</label>{privileged && <button type="button" onClick={() => editSpell(spell)}>Изменить</button>}</footer>
    </article>)}</div>
    {visible.length > visibleCount && <button className="load-more" onClick={() => setVisibleCount(visibleCount + 48)}>Показать ещё · осталось {visible.length - visibleCount}</button>}
    {!visible.length && <div className="empty-spells"><span>✦</span><strong>Ничего не найдено</strong><p>Измените фильтры или попросите Мастера открыть заклинания.</p></div>}
  </section>;
}
