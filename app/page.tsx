"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ManagementPanel } from "./ManagementPanel";
import { Spellbook } from "./Spellbook";

type SheetSections = {
  skills: Array<{ name: string; ability: string; proficient: boolean; expertise: boolean }>;
  saves: Array<{ ability: string; proficient: boolean }>;
  attacks: Array<{ name: string; attackBonus: string; damage: string }>;
  features: Array<{ name: string; description: string }>;
  proficiencies: string[];
  conditions: string[];
  hitDice: Array<{ die: string; maximum: number; spent: number }>;
};

const defaultSections: SheetSections = {
  skills: [
    { name: "Атлетика", ability: "strength", proficient: true, expertise: false },
    { name: "Акробатика", ability: "dexterity", proficient: false, expertise: false },
    { name: "Внимательность", ability: "wisdom", proficient: true, expertise: false },
    { name: "Запугивание", ability: "charisma", proficient: true, expertise: false },
  ],
  saves: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((ability) => ({ ability, proficient: ability === "strength" || ability === "constitution" })),
  attacks: [{ name: "Двуручный меч", attackBonus: "+4", damage: "2к6 + 2 рубящий" }],
  features: [{ name: "Второе дыхание", description: "Восстановление хитов бонусным действием." }],
  proficiencies: ["Лёгкие, средние и тяжёлые доспехи", "Простое и воинское оружие"],
  conditions: [],
  hitDice: [{ die: "к10", maximum: 1, spent: 0 }],
};

export default function Home() {
  const [dark, setDark] = useState(false);
  const [profile, setProfile] = useState("Ори Картанг");
  const [hp, setHp] = useState(12);
  const [coins, setCoins] = useState(16);
  const [notes, setNotes] = useState("Кол-во использований «Второго дыхания»: 2");
  const [saved, setSaved] = useState({ hp, coins, notes });
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string; globalRole?: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Все изменения сохранены");
  const importInput = useRef<HTMLInputElement>(null);
  const [characters, setCharacters] = useState<Array<{ id: string; name: string; kind: string; species: string; level: number; classes: string }>>([]);
  const [characterId, setCharacterId] = useState("character-ori");
  const [character, setCharacter] = useState({ name: "Ори Картанг", kind: "PC", species: "Дварф", background: "Стражник", alignment: "Нейтральный злой", level: 1, classes: "Воин", experience: 200, armorClass: 16, speed: 30, maximumHp: 12, strength: 15, dexterity: 12, constitution: 15, intelligence: 11, wisdom: 12, charisma: 10 });
  const [savedCharacter, setSavedCharacter] = useState(character);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [resources, setResources] = useState<Array<{ id: string; name: string; maximum: number; spent: number }>>([]);
  const [savedResources, setSavedResources] = useState(resources);
  const [classesDetail, setClassesDetail] = useState<Array<{ className: string; subclassName: string; level: number }>>([{ className: "Воин", subclassName: "", level: 1 }]);
  const [savedClasses, setSavedClasses] = useState(classesDetail);
  const [sections, setSections] = useState<SheetSections>(defaultSections);
  const [savedSections, setSavedSections] = useState<SheetSections>(defaultSections);
  const dirty = useMemo(
    () => hp !== saved.hp || coins !== saved.coins || notes !== saved.notes || JSON.stringify(character) !== JSON.stringify(savedCharacter) || JSON.stringify(classesDetail) !== JSON.stringify(savedClasses) || JSON.stringify(sections) !== JSON.stringify(savedSections) || JSON.stringify(resources) !== JSON.stringify(savedResources),
    [hp, coins, notes, saved, character, savedCharacter, classesDetail, savedClasses, sections, savedSections, resources, savedResources],
  );
  const abilities = [
    ["Сила", character.strength], ["Ловкость", character.dexterity], ["Телосложение", character.constitution],
    ["Интеллект", character.intelligence], ["Мудрость", character.wisdom], ["Харизма", character.charisma],
  ] as const;
  const privileged = profile === "Мастер" || profile === "Overseer";
  const activeProfile = profiles.find((item) => item.name === profile);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function applyCharacter(data: any) {
    const nextHp = Number(data.current_hp ?? 1);
    const nextCoins = JSON.parse(String(data.coins_json ?? "{}"))?.gp ?? 0;
    const parsedNotes = JSON.parse(String(data.notes_json ?? "[]"));
    const nextNotes = typeof parsedNotes?.[0] === "string" ? parsedNotes[0] : parsedNotes?.[0]?.text ?? "";
    const classNames = (data.classes ?? []).map((item: any) => item.className).join(" / ") || "Без класса";
    const level = (data.classes ?? []).reduce((sum: number, item: any) => sum + Number(item.level), 0);
    const nextCharacter = { name: data.name, kind: data.kind, species: data.species, background: data.background, alignment: data.alignment, level, classes: classNames, experience: data.experience, armorClass: data.armor_class, speed: data.speed, maximumHp: data.maximum_hp, strength: data.strength, dexterity: data.dexterity, constitution: data.constitution, intelligence: data.intelligence, wisdom: data.wisdom, charisma: data.charisma };
    setCharacter(nextCharacter); setSavedCharacter(nextCharacter);
    setEquipment(JSON.parse(String(data.equipment_json ?? "[]")));
    setResources(data.resources ?? []); setSavedResources(data.resources ?? []);
    const nextClasses = (data.classes ?? []).map((item: any) => ({ className: item.className, subclassName: item.subclassName ?? "", level: Number(item.level) }));
    setClassesDetail(nextClasses); setSavedClasses(nextClasses);
    const nextSections = { ...defaultSections, ...(data.sections ?? {}) } as SheetSections;
    setSections(nextSections); setSavedSections(nextSections);
    setHp(nextHp); setCoins(nextCoins); setNotes(nextNotes);
    setSaved({ hp: nextHp, coins: nextCoins, notes: nextNotes });
  }

  function loadWorkspace(profileId = "profile-ori") {
    fetch(`/api/bootstrap?profileId=${encodeURIComponent(profileId)}`)
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить данные");
        return response.json();
      })
      .then((data) => {
        setProfiles(data.profiles);
        setCharacters(data.characters);
        setCharacterId(data.character.id);
        applyCharacter(data.character);
        setMessage("Все изменения сохранены");
      })
      .catch(() => setMessage("Сервер данных недоступен"));
  }

  useEffect(() => {
    loadWorkspace();
  }, []);

  async function switchCharacter(nextId: string) {
    if (dirty && !window.confirm("Отменить несохранённые изменения и открыть другого персонажа?")) return;
    const selectedProfile = profiles.find((item) => item.name === profile);
    if (!selectedProfile) return;
    const response = await fetch(`/api/characters/${encodeURIComponent(nextId)}?profileId=${encodeURIComponent(selectedProfile.id)}`);
    if (!response.ok) return setMessage("Не удалось открыть персонажа");
    setCharacterId(nextId);
    applyCharacter(await response.json());
    setMessage("Все изменения сохранены");
  }

  async function saveChanges() {
    const selectedProfile = profiles.find((item) => item.name === profile);
    if (!selectedProfile) return setMessage("Профиль ещё загружается");
    setSaving(true);
    setMessage("Сохраняем…");
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId: selectedProfile.id, currentHp: hp, coins: { gp: coins }, notes, resources, system: privileged ? character : undefined, sections: privileged ? sections : undefined }),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (privileged && JSON.stringify(classesDetail) !== JSON.stringify(savedClasses)) {
        const classResponse = await fetch(`/api/characters/${encodeURIComponent(characterId)}/classes`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ actorProfileId: selectedProfile.id, classes: classesDetail }) });
        if (!classResponse.ok) throw new Error();
      }
      setHp(result.currentHp); setCoins(result.coins.gp); setNotes(result.notes);
      setSaved({ hp: result.currentHp, coins: result.coins.gp, notes: result.notes });
      setSavedCharacter(character);
      setSavedClasses(classesDetail);
      setSavedSections(sections);
      setSavedResources(resources);
      setMessage("Все изменения сохранены");
    } catch {
      setMessage("Не удалось сохранить — изменения остались в черновике");
    } finally {
      setSaving(false);
    }
  }

  function addClassDraft() {
    const className = window.prompt("Название дополнительного класса");
    if (!className) return;
    const level = Math.max(1, Math.min(20, Number(window.prompt("Уровень в этом классе", "1") ?? 1)));
    setClassesDetail([...classesDetail, { className, subclassName: "", level }]);
  }

  const abilityScore = (key: string) => Number(character[key as keyof typeof character] ?? 10);
  const draftLevel = classesDetail.reduce((sum, item) => sum + Number(item.level), 0);
  const proficiencyBonus = Math.ceil(draftLevel / 4) + 1;
  const skillBonus = (skill: SheetSections["skills"][number]) => Math.floor((abilityScore(skill.ability) - 10) / 2) + (skill.proficient ? proficiencyBonus * (skill.expertise ? 2 : 1) : 0);

  async function importCharacter(file: File | undefined) {
    if (!file) return;
    const selectedProfile = profiles.find((item) => item.name === profile);
    if (!selectedProfile) return setMessage("Профиль ещё загружается");
    setMessage("Проверяем файл персонажа…");
    try {
      const document = JSON.parse(await file.text());
      const response = await fetch("/api/imports/long-story-short", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId: selectedProfile.id, campaignId: "campaign-lss", assignToProfileId: "profile-ori", document }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(`Импортирован персонаж «${result.name}»${result.warnings?.length ? ` · предупреждений: ${result.warnings.length}` : ""}`);
    } catch (error) {
      setMessage(error instanceof SyntaxError ? "Файл не является корректным JSON" : error instanceof Error ? error.message : "Не удалось импортировать персонажа");
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  }

  return (
    <main className={dark ? "app dark" : "app"}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="D&D Companion — главная">
          <span className="brand-mark">D</span>
          <span><strong>D&amp;D Companion</strong><small>Летопись кампании</small></span>
        </a>
        <nav aria-label="Основная навигация">
          <a className="active" href="#sheet">Персонаж</a>
          <a href="#spells">Заклинания</a>
          <a href="#campaign">Кампания</a>
        </nav>
        <div className="toolbar">
          <button className="icon-button" onClick={() => setDark(!dark)} aria-label="Переключить тему">
            {dark ? "☀" : "☾"}
          </button>
          <label className="profile-select">
            <span>Профиль</span>
            <select value={profile} onChange={(event) => { const nextName = event.target.value; setProfile(nextName); const selected = profiles.find((item) => item.name === nextName); if (selected) loadWorkspace(selected.id); }}>
              {(profiles.length ? profiles : [{ id: "ori", name: "Ори Картанг" }, { id: "gm", name: "Мастер" }, { id: "overseer", name: "Overseer" }]).map((item) => <option key={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
      </header>

      <section className="campaign-strip" id="campaign">
        <div><span className="eyebrow">Кампания</span><strong>Long Story Short</strong></div>
        <div className="campaign-meta"><span>Глава I</span><span>Туманный город</span><span className="online">3 участника в сети</span></div>
      </section>

      <div className="page" id="top">
        <aside className="sidebar">
          <div className="portrait" aria-label={`Портрет ${character.name}`}><span>{character.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span></div>
          <h1>{character.name}</h1>
          <p>{character.species} · {classesDetail.map((item) => item.className).join(" / ")} {draftLevel}</p>
          <div className="character-picker" aria-label="Персонажи кампании">
            {characters.map((item) => <button key={item.id} className={item.id === characterId ? "selected" : ""} onClick={() => switchCharacter(item.id)}><span>{item.name}</span><small>{item.kind === "NPC" ? "NPC" : `${item.classes} ${item.level}`}</small></button>)}
          </div>
          <div className="level"><span>Уровень</span><strong>{draftLevel}</strong><small>{character.experience} опыта</small></div>
          <div className="side-links">
            <a className="current" href="#sheet">Основное</a>
            <a href="#combat">Бой</a>
            <a href="#features">Особенности</a>
            <a href="#inventory">Снаряжение</a>
            <a href="#spells">Заклинания</a>
            <a href="#notes">Заметки</a>
          </div>
          <button className="secondary">Экспорт JSON</button>
          <input ref={importInput} hidden type="file" accept="application/json,.json" onChange={(event) => importCharacter(event.target.files?.[0])}/>
          <button className="secondary import-button" onClick={() => importInput.current?.click()} disabled={profile === "Ори Картанг"}>Импорт LSS</button>
        </aside>

        <section className="sheet" id="sheet">
          <div className="sheet-heading">
            <div><span className="eyebrow">{character.kind === "NPC" ? "Неигровой персонаж" : "Лист персонажа"}</span><h2>{character.name}</h2></div>
            <span className={dirty || message !== "Все изменения сохранены" ? "status dirty" : "status"}>{dirty ? "Есть несохранённые изменения" : message}</span>
          </div>

          {privileged && <section className="master-panel">
            <header><div><span className="eyebrow">Управление</span><h3>{profile === "Overseer" ? "Панель Overseer" : "Панель Мастера"}</h3></div><button className="secondary" onClick={addClassDraft}>+ Класс персонажа</button></header>
            {activeProfile && <ManagementPanel actor={activeProfile} profiles={profiles} characters={characters} onChanged={() => loadWorkspace(activeProfile.id)} onMessage={setMessage}/>} 
            <div className="system-fields">
              <label>Имя<input value={character.name} onChange={(event) => setCharacter({ ...character, name: event.target.value })}/></label>
              <label>Тип<select value={character.kind} onChange={(event) => setCharacter({ ...character, kind: event.target.value })}><option value="PC">PC</option><option value="NPC">NPC</option></select></label>
              <label>Вид<input value={character.species} onChange={(event) => setCharacter({ ...character, species: event.target.value })}/></label>
              <label>Предыстория<input value={character.background} onChange={(event) => setCharacter({ ...character, background: event.target.value })}/></label>
              <label>Мировоззрение<input value={character.alignment} onChange={(event) => setCharacter({ ...character, alignment: event.target.value })}/></label>
              <label>Опыт<input type="number" min="0" value={character.experience} onChange={(event) => setCharacter({ ...character, experience: Number(event.target.value) })}/></label>
              <label>Макс. HP<input type="number" min="1" value={character.maximumHp} onChange={(event) => setCharacter({ ...character, maximumHp: Number(event.target.value) })}/></label>
              <label>КД<input type="number" min="0" value={character.armorClass} onChange={(event) => setCharacter({ ...character, armorClass: Number(event.target.value) })}/></label>
              <label>Скорость<input type="number" min="0" value={character.speed} onChange={(event) => setCharacter({ ...character, speed: Number(event.target.value) })}/></label>
            </div>
            <div className="class-editor">{classesDetail.map((item, index) => <div key={`${item.className}-${index}`}><input value={item.className} aria-label="Класс" onChange={(event) => setClassesDetail(classesDetail.map((entry, entryIndex) => entryIndex === index ? { ...entry, className: event.target.value } : entry))}/><input value={item.subclassName} placeholder="Подкласс" aria-label="Подкласс" onChange={(event) => setClassesDetail(classesDetail.map((entry, entryIndex) => entryIndex === index ? { ...entry, subclassName: event.target.value } : entry))}/><input type="number" min="1" max="20" value={item.level} aria-label="Уровень класса" onChange={(event) => setClassesDetail(classesDetail.map((entry, entryIndex) => entryIndex === index ? { ...entry, level: Number(event.target.value) } : entry))}/>{classesDetail.length > 1 && <button onClick={() => setClassesDetail(classesDetail.filter((_, entryIndex) => entryIndex !== index))}>×</button>}</div>)}</div>
          </section>}

          <div className="ability-grid">
            {abilities.map(([name, score]) => {
              const mod = Math.floor((score - 10) / 2);
              const key = ({ Сила: "strength", Ловкость: "dexterity", Телосложение: "constitution", Интеллект: "intelligence", Мудрость: "wisdom", Харизма: "charisma" } as const)[name];
              return <article className="ability" key={name}><span>{name}</span><strong>{mod >= 0 ? "+" : ""}{mod}</strong>{privileged ? <input aria-label={name} type="number" min="1" max="30" value={score} onChange={(event) => setCharacter({ ...character, [key]: Number(event.target.value) })}/> : <small>{score}</small>}</article>;
            })}
          </div>

          <div className="sheet-grid">
            <section className="panel" id="combat">
              <header><h3>Состояние</h3><span>Игрок может изменять</span></header>
              <div className="vitals">
                <label className="hp"><span>Текущие хиты</span><input type="number" min="0" max={character.maximumHp} value={hp} onChange={(e) => setHp(Number(e.target.value))}/><small>из {character.maximumHp}</small></label>
                <div className="vital"><span>Класс доспеха</span><strong>{character.armorClass}</strong></div>
                <div className="vital"><span>Скорость</span><strong>{character.speed} <small>фт.</small></strong></div>
                <div className="vital"><span>Инициатива</span><strong>+1</strong></div>
              </div>
              <div className="death-saves"><span>Спасброски от смерти</span><label>Успехи ○ ○ ○</label><label>Провалы ○ ○ ○</label></div>
            </section>

            <section className="panel skills">
              <header><h3>Навыки</h3><span>Бонус мастерства +{proficiencyBonus}</span></header>
              {sections.skills.map((skill, index) => <div className="skill" key={`${skill.name}-${index}`}>
                <button className={skill.proficient ? "prof-dot filled" : "prof-dot"} disabled={!privileged} aria-label={`Владение: ${skill.name}`} onClick={() => setSections({ ...sections, skills: sections.skills.map((item, itemIndex) => itemIndex === index ? { ...item, proficient: !item.proficient } : item) })}/>
                {privileged ? <input value={skill.name} onChange={(event) => setSections({ ...sections, skills: sections.skills.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })}/> : <span>{skill.name}</span>}
                <strong>{skillBonus(skill) >= 0 ? "+" : ""}{skillBonus(skill)}</strong>
              </div>)}
              {privileged && <button className="inline-add" onClick={() => setSections({ ...sections, skills: [...sections.skills, { name: "Новый навык", ability: "wisdom", proficient: false, expertise: false }] })}>+ Навык</button>}
            </section>

            <section className="panel" id="features">
              <header><h3>Особенности</h3><span>Управляет Мастер</span></header>
              {sections.features.map((feature, index) => <div className="feature" key={`${feature.name}-${index}`}>{privileged ? <><input value={feature.name} onChange={(event) => setSections({ ...sections, features: sections.features.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })}/><textarea rows={2} value={feature.description} onChange={(event) => setSections({ ...sections, features: sections.features.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) })}/></> : <><strong>{feature.name}</strong><p>{feature.description}</p></>}</div>)}
              {privileged && <button className="inline-add" onClick={() => setSections({ ...sections, features: [...sections.features, { name: "Новая особенность", description: "" }] })}>+ Особенность</button>}
              {resources.map((resource) => <div className="resource-row" key={resource.id}><span>{resource.name}</span><button disabled={resource.spent <= 0} onClick={() => setResources(resources.map((item) => item.id === resource.id ? { ...item, spent: item.spent - 1 } : item))}>−</button><strong>{resource.maximum - resource.spent} / {resource.maximum}</strong><button disabled={resource.spent >= resource.maximum} onClick={() => setResources(resources.map((item) => item.id === resource.id ? { ...item, spent: item.spent + 1 } : item))}>+</button></div>)}
            </section>

            <section className="panel attacks-panel">
              <header><h3>Атаки</h3><span>Оружие и действия</span></header>
              {sections.attacks.map((attack, index) => <div className="attack-row" key={`${attack.name}-${index}`}>{privileged ? <><input value={attack.name} onChange={(event) => setSections({ ...sections, attacks: sections.attacks.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })}/><input value={attack.attackBonus} onChange={(event) => setSections({ ...sections, attacks: sections.attacks.map((item, itemIndex) => itemIndex === index ? { ...item, attackBonus: event.target.value } : item) })}/><input value={attack.damage} onChange={(event) => setSections({ ...sections, attacks: sections.attacks.map((item, itemIndex) => itemIndex === index ? { ...item, damage: event.target.value } : item) })}/></> : <><strong>{attack.name}</strong><span>{attack.attackBonus}</span><span>{attack.damage}</span></>}</div>)}
              {privileged && <button className="inline-add" onClick={() => setSections({ ...sections, attacks: [...sections.attacks, { name: "Новая атака", attackBonus: "+0", damage: "" }] })}>+ Атака</button>}
            </section>

            <section className="panel">
              <header><h3>Спасброски и владения</h3><span>Системные данные</span></header>
              <div className="save-grid">{sections.saves.map((save, index) => <label key={save.ability}><input type="checkbox" checked={save.proficient} disabled={!privileged} onChange={(event) => setSections({ ...sections, saves: sections.saves.map((item, itemIndex) => itemIndex === index ? { ...item, proficient: event.target.checked } : item) })}/>{save.ability}</label>)}</div>
              <div className="tag-list">{sections.proficiencies.map((item) => <span key={item}>{item}</span>)}</div>
              {privileged && <button className="inline-add" onClick={() => { const value = window.prompt("Новое владение"); if (value) setSections({ ...sections, proficiencies: [...sections.proficiencies, value] }); }}>+ Владение</button>}
            </section>

            <section className="panel" id="inventory">
              <header><h3>Снаряжение</h3><span>Переносимый вес</span></header>
              <ul className="equipment">{equipment.length ? equipment.slice(0, 8).map((item) => <li key={item}>{item}</li>) : <li>Снаряжение не указано</li>}</ul>
              <label className="coins"><span>Золотые монеты</span><input type="number" min="0" value={coins} onChange={(e) => setCoins(Number(e.target.value))}/></label>
            </section>

            <section className="panel notes" id="notes">
              <header><h3>Заметки персонажа</h3><span>Личные записи</span></header>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}/>
            </section>

            {activeProfile && <Spellbook profileId={activeProfile.id} characterId={characterId} privileged={privileged} onMessage={setMessage}/>} 
          </div>
        </section>
      </div>

      <footer className="savebar">
        <span>{dirty ? "Черновик хранится только на этом устройстве" : `Последнее сохранение · только что · ${profile}`}</span>
        <button className="secondary" disabled={!dirty} onClick={() => { setHp(saved.hp); setCoins(saved.coins); setNotes(saved.notes); setCharacter(savedCharacter); setClassesDetail(savedClasses); setSections(savedSections); setResources(savedResources); }}>Отменить</button>
        <button className="primary" disabled={!dirty || saving} onClick={saveChanges}>{saving ? "Сохраняем…" : "Сохранить изменения"}</button>
      </footer>
    </main>
  );
}
