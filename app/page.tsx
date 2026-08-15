"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ManagementPanel } from "./ManagementPanel";
import { Spellbook } from "./Spellbook";
import { PortraitCropper } from "./PortraitCropper";
import { LevelUpPanel } from "./LevelUpPanel";
import { restoreCharacterResource, spendCharacterResource } from "../domain/character-resources";
import { getExperienceProgress } from "../domain/experience";

type SheetSections = {
  skills: Array<{ name: string; ability: string; proficient: boolean; expertise: boolean }>;
  saves: Array<{ ability: string; proficient: boolean }>;
  attacks: Array<{ name: string; attackBonus: string; damage: string }>;
  features: Array<{ name: string; description: string }>;
  proficiencies: string[];
  conditions: string[];
  hitDice: Array<{ die: string; maximum: number; spent: number }>;
  playerNotes: Array<{ id: string; text: string }>;
  gmNotes: Array<{ id: string; text: string }>;
};

type CharacterClass = { classKey?: string; className: string; subclassName?: string; level: number };
type CharacterResource = { id: string; name: string; maximum: number; spent: number };
type Campaign = { id: string; name: string; description: string; role?: string | null };
type CharacterPayload = {
  revision?: string;
  current_hp?: number; coins_json?: string; notes_json?: string; equipment_json?: string; portrait_data_url?: string;
  name: string; kind: string; species: string; background: string; alignment: string;
  experience: number; armor_class: number; speed: number; maximum_hp: number;
  strength: number; dexterity: number; constitution: number; intelligence: number; wisdom: number; charisma: number;
  classes?: CharacterClass[]; resources?: CharacterResource[]; sections?: Partial<SheetSections>;
};

function parseJson<T>(value: string | undefined, fallback: T): T {
  try { return JSON.parse(value ?? "") as T; }
  catch { return fallback; }
}

const standardSkills: SheetSections["skills"] = [
  { name: "Акробатика", ability: "dexterity", proficient: false, expertise: false },
  { name: "Анализ", ability: "intelligence", proficient: false, expertise: false },
  { name: "Атлетика", ability: "strength", proficient: true, expertise: false },
  { name: "Внимательность", ability: "wisdom", proficient: true, expertise: false },
  { name: "Выживание", ability: "wisdom", proficient: false, expertise: false },
  { name: "Выступление", ability: "charisma", proficient: false, expertise: false },
  { name: "Запугивание", ability: "charisma", proficient: true, expertise: false },
  { name: "История", ability: "intelligence", proficient: false, expertise: false },
  { name: "Ловкость рук", ability: "dexterity", proficient: false, expertise: false },
  { name: "Магия", ability: "intelligence", proficient: false, expertise: false },
  { name: "Медицина", ability: "wisdom", proficient: false, expertise: false },
  { name: "Обман", ability: "charisma", proficient: false, expertise: false },
  { name: "Природа", ability: "intelligence", proficient: false, expertise: false },
  { name: "Проницательность", ability: "wisdom", proficient: false, expertise: false },
  { name: "Религия", ability: "intelligence", proficient: false, expertise: false },
  { name: "Скрытность", ability: "dexterity", proficient: false, expertise: false },
  { name: "Убеждение", ability: "charisma", proficient: false, expertise: false },
  { name: "Уход за животными", ability: "wisdom", proficient: false, expertise: false },
];
const standardSkillNames = new Set(standardSkills.map((skill) => skill.name.toLocaleLowerCase("ru")));

function withStandardSkills(stored: SheetSections["skills"] | undefined) {
  if (!stored?.length) return standardSkills.map((skill) => ({ ...skill }));
  const byName = new Map(stored.map((skill) => [skill.name.trim().toLocaleLowerCase("ru"), skill]));
  return [
    ...standardSkills.map((skill) => ({ ...skill, ...byName.get(skill.name.toLocaleLowerCase("ru")), name: skill.name, ability: skill.ability })),
    ...stored.filter((skill) => !standardSkillNames.has(skill.name.trim().toLocaleLowerCase("ru"))),
  ];
}

const defaultSections: SheetSections = {
  skills: standardSkills,
  saves: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((ability) => ({ ability, proficient: false })),
  attacks: [],
  features: [],
  proficiencies: [],
  conditions: [],
  hitDice: [],
  playerNotes: [],
  gmNotes: [],
};

export default function Home() {
  const [dark, setDark] = useState(false);
  const [profile, setProfile] = useState("Ори Картанг");
  const [hp, setHp] = useState(12);
  const [coins, setCoins] = useState(16);
  const [notes, setNotes] = useState("Кол-во использований «Второго дыхания»: 2");
  const [saved, setSaved] = useState({ hp, coins, notes });
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string; globalRole?: string }>>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState("");
  const [message, setMessage] = useState("Все изменения сохранены");
  const importInput = useRef<HTMLInputElement>(null);
  const portraitInput = useRef<HTMLInputElement>(null);
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [characters, setCharacters] = useState<Array<{ id: string; name: string; kind: string; species: string; level: number; classes: string }>>([]);
  const [characterId, setCharacterId] = useState("character-ori");
  const [character, setCharacter] = useState({ name: "Ори Картанг", kind: "PC", species: "Дварф", background: "Стражник", alignment: "Нейтральный злой", level: 1, classes: "Воин", experience: 200, armorClass: 16, speed: 30, maximumHp: 12, strength: 15, dexterity: 12, constitution: 15, intelligence: 11, wisdom: 12, charisma: 10, portraitDataUrl: "" });
  const [savedCharacter, setSavedCharacter] = useState(character);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [resources, setResources] = useState<CharacterResource[]>([]);
  const [savedResources, setSavedResources] = useState(resources);
  const [classesDetail, setClassesDetail] = useState<Array<{ className: string; subclassName: string; level: number }>>([{ className: "Воин", subclassName: "", level: 1 }]);
  const [savedClasses, setSavedClasses] = useState(classesDetail);
  const [sections, setSections] = useState<SheetSections>(defaultSections);
  const [savedSections, setSavedSections] = useState<SheetSections>(defaultSections);
  const [newProficiency, setNewProficiency] = useState("");
  const [experienceAmount, setExperienceAmount] = useState("50");
  const [classDraftOpen, setClassDraftOpen] = useState(false);
  const [newClassDraft, setNewClassDraft] = useState({ className: "", subclassName: "", level: 1 });
  const dirty = useMemo(
    () => hp !== saved.hp || coins !== saved.coins || notes !== saved.notes || JSON.stringify(character) !== JSON.stringify(savedCharacter) || JSON.stringify(classesDetail) !== JSON.stringify(savedClasses) || JSON.stringify(sections) !== JSON.stringify(savedSections) || JSON.stringify(resources) !== JSON.stringify(savedResources),
    [hp, coins, notes, saved, character, savedCharacter, classesDetail, savedClasses, sections, savedSections, resources, savedResources],
  );
  const abilities = [
    ["Сила", character.strength], ["Ловкость", character.dexterity], ["Телосложение", character.constitution],
    ["Интеллект", character.intelligence], ["Мудрость", character.wisdom], ["Харизма", character.charisma],
  ] as const;
  const privileged = canManage;
  const activeProfile = profiles.find((item) => item.name === profile);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function applyCharacter(data: CharacterPayload) {
    setRevision(data.revision ?? "");
    const nextHp = Number(data.current_hp ?? 1);
    const nextCoins = parseJson<{ gp?: number }>(data.coins_json, {}).gp ?? 0;
    const parsedNotes = parseJson<Array<string | { text?: string }>>(data.notes_json, []);
    const nextNotes = typeof parsedNotes?.[0] === "string" ? parsedNotes[0] : parsedNotes?.[0]?.text ?? "";
    const classNames = (data.classes ?? []).map((item) => item.className).join(" / ") || "Без класса";
    const level = (data.classes ?? []).reduce((sum, item) => sum + Number(item.level), 0);
    const nextCharacter = { name: data.name, kind: data.kind, species: data.species, background: data.background, alignment: data.alignment, level, classes: classNames, experience: data.experience, armorClass: data.armor_class, speed: data.speed, maximumHp: data.maximum_hp, strength: data.strength, dexterity: data.dexterity, constitution: data.constitution, intelligence: data.intelligence, wisdom: data.wisdom, charisma: data.charisma, portraitDataUrl: data.portrait_data_url ?? "" };
    setCharacter(nextCharacter); setSavedCharacter(nextCharacter);
    setEquipment(parseJson<string[]>(data.equipment_json, []));
    setResources(data.resources ?? []); setSavedResources(data.resources ?? []);
    const nextClasses = (data.classes ?? []).map((item) => ({ classKey: item.classKey, className: item.className, subclassName: item.subclassName ?? "", level: Number(item.level) }));
    setClassesDetail(nextClasses); setSavedClasses(nextClasses);
    const nextSections = { ...defaultSections, ...(data.sections ?? {}), skills: withStandardSkills(data.sections?.skills) } as SheetSections;
    setSections(nextSections); setSavedSections(nextSections);
    setHp(nextHp); setCoins(nextCoins); setNotes(nextNotes);
    setSaved({ hp: nextHp, coins: nextCoins, notes: nextNotes });
  }

  async function loadWorkspace(profileId = "profile-ori", campaignId?: string, allowProfileRecovery = true) {
    const campaignQuery = campaignId ? `&campaignId=${encodeURIComponent(campaignId)}` : "";
    try {
      const response = await fetch(`/api/bootstrap?profileId=${encodeURIComponent(profileId)}${campaignQuery}`);
      if (response.status === 404 && allowProfileRecovery) {
        const profileResponse = await fetch("/api/profiles");
        const profileData = await profileResponse.json();
        const fallback = profileData.profiles?.find((item: { globalRole?: string }) => item.globalRole === "OVERSEER") ?? profileData.profiles?.[0];
        if (fallback) { setProfile(fallback.name); await loadWorkspace(fallback.id, undefined, false); return; }
      }
      if (!response.ok) throw new Error("Не удалось загрузить данные");
      const data = await response.json();
      setProfiles(data.profiles);
      const selectedProfile = data.profiles.find((item: { id: string }) => item.id === profileId);
      if (selectedProfile) setProfile(selectedProfile.name);
      setCampaigns(data.campaigns ?? []);
      setCampaign(data.campaign ?? null);
      setCanManage(Boolean(data.permissions?.privileged));
      setCharacters(data.characters);
      if (data.character) {
        setCharacterId(data.character.id);
        applyCharacter(data.character);
        setMessage("Все изменения сохранены");
      } else {
        setCharacterId("");
        setMessage(data.campaign ? "В этой кампании пока нет доступных персонажей" : "Для профиля нет доступных кампаний");
      }
    } catch {
      setMessage("Сервер данных недоступен");
    }
  }

  useEffect(() => {
    loadWorkspace();
  // Initial bootstrap must run once; later profile changes call loadWorkspace explicitly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        body: JSON.stringify({ profileId: selectedProfile.id, expectedRevision: revision, currentHp: hp, coins: { gp: coins }, notes, resources, system: privileged ? { name: character.name, kind: character.kind, species: character.species, background: character.background, alignment: character.alignment, experience: character.experience, armorClass: character.armorClass, speed: character.speed, maximumHp: character.maximumHp, strength: character.strength, dexterity: character.dexterity, constitution: character.constitution, intelligence: character.intelligence, wisdom: character.wisdom, charisma: character.charisma, portraitDataUrl: character.portraitDataUrl } : undefined, sections: privileged ? sections : { playerNotes: sections.playerNotes }, classes: privileged ? classesDetail.map(({ className, subclassName, level }) => ({ className, subclassName, level })) : undefined }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось сохранить");
      setHp(result.currentHp); setCoins(result.coins.gp); setNotes(result.notes);
      setRevision(result.revision);
      setSaved({ hp: result.currentHp, coins: result.coins.gp, notes: result.notes });
      setSavedCharacter(character);
      setSavedClasses(classesDetail);
      setSavedSections(sections);
      setSavedResources(resources);
      setMessage("Все изменения сохранены");
    } catch (error) {
      setMessage(error instanceof Error ? `${error.message} — изменения остались в черновике` : "Не удалось сохранить — изменения остались в черновике");
    } finally {
      setSaving(false);
    }
  }

  function addClassDraft(event: React.FormEvent) {
    event.preventDefault();
    const className = newClassDraft.className.trim();
    if (!className) return setMessage("Укажите название класса");
    const level = Math.max(1, Math.min(20, Number(newClassDraft.level) || 1));
    setClassesDetail([...classesDetail, { className, subclassName: newClassDraft.subclassName.trim(), level }]);
    setNewClassDraft({ className: "", subclassName: "", level: 1 });
    setClassDraftOpen(false);
    setMessage(`Класс «${className}» добавлен в черновик — сохраните изменения`);
  }

  const abilityScore = (key: string) => Number(character[key as keyof typeof character] ?? 10);
  const draftLevel = classesDetail.reduce((sum, item) => sum + Number(item.level), 0);
  const proficiencyBonus = Math.ceil(draftLevel / 4) + 1;
  const experienceProgress = getExperienceProgress(draftLevel, character.experience);
  const skillBonus = (skill: SheetSections["skills"][number]) => Math.floor((abilityScore(skill.ability) - 10) / 2) + (skill.proficient ? proficiencyBonus * (skill.expertise ? 2 : 1) : 0);

  function addExperienceDraft(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(experienceAmount.trim().replace(/\s+/g, ""));
    if (!Number.isInteger(amount) || amount <= 0) return setMessage("Введите целое положительное количество опыта");
    setCharacter({ ...character, experience: character.experience + amount });
    setMessage(`Добавлено ${amount.toLocaleString("ru-RU")} опыта — сохраните изменения`);
  }

  function addProficiencyDraft(event: React.FormEvent) {
    event.preventDefault();
    const value = newProficiency.trim();
    if (!value) return;
    if (sections.proficiencies.some((item) => item.trim().toLocaleLowerCase("ru") === value.toLocaleLowerCase("ru"))) return setMessage(`Владение «${value}» уже добавлено`);
    setSections({ ...sections, proficiencies: [...sections.proficiencies, value] });
    setNewProficiency("");
    setMessage(`Владение «${value}» добавлено в черновик — сохраните изменения`);
  }

  async function importCharacter(file: File | undefined) {
    if (!file) return;
    const selectedProfile = profiles.find((item) => item.name === profile);
    if (!selectedProfile) return setMessage("Профиль ещё загружается");
    setMessage("Проверяем файл персонажа…");
    try {
      const document = JSON.parse(await file.text());
      const ownFormat = document && typeof document === "object" && document.format === "dnd-companion-character";
      const response = await fetch(ownFormat ? "/api/imports/dnd-companion" : "/api/imports/long-story-short", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId: selectedProfile.id, campaignId: campaign?.id, document }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(`Импортирован персонаж «${result.name}»${result.warnings?.length ? ` · предупреждений: ${result.warnings.length}` : ""}`);
      loadWorkspace(selectedProfile.id, campaign?.id);
    } catch (error) {
      setMessage(error instanceof SyntaxError ? "Файл не является корректным JSON" : error instanceof Error ? error.message : "Не удалось импортировать персонажа");
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  }

  async function exportCharacter() {
    if (!activeProfile) return setMessage("Профиль ещё загружается");
    const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}/export?profileId=${encodeURIComponent(activeProfile.id)}`);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      return setMessage(result.error ?? "Не удалось экспортировать персонажа");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${character.name.trim().replace(/[^\p{L}\p{N}._-]+/gu, "-") || "character"}.dnd-companion.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage(`Персонаж «${character.name}» экспортирован`);
  }

  return (
    <main className={dark ? "app dark" : "app"}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="D&D Companion — главная">
          <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 100 100" focusable="false"><polygon points="50.00,3.00 55.92,29.85 75.41,10.46 65.87,36.25 92.75,30.48 70.79,47.01 96.52,56.69 69.10,58.72 85.52,80.78 61.35,67.67 63.24,95.10 50.00,71.00 36.76,95.10 38.65,67.67 14.48,80.78 30.90,58.72 3.48,56.69 29.21,47.01 7.25,30.48 34.13,36.25 24.59,10.46 44.08,29.85"/></svg></span>
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
        <div><span className="eyebrow">Кампания</span>{campaigns.length > 1 && activeProfile ? <select aria-label="Активная кампания" value={campaign?.id ?? ""} onChange={(event) => { if (dirty && !window.confirm("Отменить несохранённые изменения и сменить кампанию?")) return; loadWorkspace(activeProfile.id, event.target.value); }}>{campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <strong>{campaign?.name ?? "Нет кампании"}</strong>}</div>
        <div className="campaign-meta"><span>{campaign?.description || "Описание не указано"}</span><span>{characters.length} персонажей доступно</span></div>
      </section>

      <div className="page" id="top">
        <aside className="sidebar">
          <div className="portrait" aria-label={`Портрет ${character.name}`} style={character.portraitDataUrl ? { backgroundImage: `url(${character.portraitDataUrl})` } : undefined}>{!character.portraitDataUrl && <span>{character.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span>}</div>
          {privileged && <div className="portrait-actions"><input ref={portraitInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (!/^image\/(?:png|jpeg|webp)$/.test(file.type) || file.size > 8_000_000) { setMessage("Выберите PNG, JPEG или WebP размером до 8 МБ"); event.target.value = ""; return; } setPortraitFile(file); }}/><button type="button" onClick={() => portraitInput.current?.click()}>{character.portraitDataUrl ? "Изменить портрет" : "+ Портрет"}</button>{character.portraitDataUrl && <button type="button" onClick={() => { if (window.confirm("Удалить портрет из черновика?")) setCharacter({ ...character, portraitDataUrl: "" }); }}>Удалить</button>}</div>}
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
          <button className="secondary" onClick={exportCharacter} disabled={!characterId}>Экспорт JSON</button>
          <input ref={importInput} hidden type="file" accept="application/json,.json" onChange={(event) => importCharacter(event.target.files?.[0])}/>
          <button className="secondary import-button" onClick={() => importInput.current?.click()} disabled={!privileged}>Импорт JSON</button>
        </aside>

        <section className="sheet" id="sheet">
          <div className="sheet-heading">
            <div><span className="eyebrow">{character.kind === "NPC" ? "Неигровой персонаж" : "Лист персонажа"}</span><h2>{character.name}</h2></div>
            <span className={dirty || message !== "Все изменения сохранены" ? "status dirty" : "status"}>{dirty ? "Есть несохранённые изменения" : message}</span>
          </div>
          <section className="experience-bar" aria-label="Прогресс опыта">
            <div className="experience-copy"><div><strong>{experienceProgress.currentExperience.toLocaleString("ru-RU")} опыта</strong>{privileged && <form className="experience-add" onSubmit={addExperienceDraft}><input aria-label="Количество добавляемого опыта" type="number" min="1" step="1" value={experienceAmount} onChange={(event) => setExperienceAmount(event.target.value)}/><button type="submit">+ Опыт</button></form>}</div><span>{experienceProgress.nextLevel === null ? "Максимальный уровень" : experienceProgress.ready ? `Доступен ${experienceProgress.nextLevel} уровень` : `До ${experienceProgress.nextLevel} уровня: ${experienceProgress.remaining.toLocaleString("ru-RU")}`}</span></div>
            <div className="experience-track" role="progressbar" aria-valuemin={experienceProgress.currentThreshold} aria-valuemax={experienceProgress.nextThreshold ?? experienceProgress.currentThreshold} aria-valuenow={Math.min(experienceProgress.currentExperience, experienceProgress.nextThreshold ?? experienceProgress.currentExperience)} aria-valuetext={`${Math.round(experienceProgress.percent)}%`}><span style={{ width: `${experienceProgress.percent}%` }}/></div>
            <small>{experienceProgress.nextThreshold === null ? "20 уровень" : `${experienceProgress.currentExperience.toLocaleString("ru-RU")} / ${experienceProgress.nextThreshold.toLocaleString("ru-RU")}`}</small>
          </section>

          {privileged && campaign && <section className="master-panel">
            <header><div><span className="eyebrow">Управление</span><h3>{profile === "Overseer" ? "Панель Overseer" : "Панель Мастера"}</h3></div><button className="secondary" onClick={() => setClassDraftOpen(!classDraftOpen)}>+ Класс персонажа</button></header>
            {classDraftOpen && <form className="new-class-form" onSubmit={addClassDraft}><input aria-label="Название нового класса" placeholder="Класс" value={newClassDraft.className} onChange={(event) => setNewClassDraft({ ...newClassDraft, className: event.target.value })}/><input aria-label="Подкласс нового класса" placeholder="Подкласс (необязательно)" value={newClassDraft.subclassName} onChange={(event) => setNewClassDraft({ ...newClassDraft, subclassName: event.target.value })}/><input aria-label="Уровень нового класса" type="number" min="1" max="20" value={newClassDraft.level} onChange={(event) => setNewClassDraft({ ...newClassDraft, level: Number(event.target.value) })}/><button type="submit">Добавить</button><button type="button" onClick={() => setClassDraftOpen(false)}>Отмена</button></form>}
            {activeProfile && <ManagementPanel key={`${activeProfile.id}:${campaign.id}`} actor={activeProfile} campaign={campaign} profiles={profiles} characters={characters} onChanged={() => loadWorkspace(activeProfile.id, campaign.id)} onCampaignCreated={(campaignId) => loadWorkspace(activeProfile.id, campaignId)} onMessage={setMessage}/>}
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
          {activeProfile && characterId && <LevelUpPanel profileId={activeProfile.id} characterId={characterId} revision={revision} classes={classesDetail} privileged={privileged} onApplied={() => loadWorkspace(activeProfile.id, campaign?.id)} onMessage={setMessage}/>}

          <div className="ability-grid">
            {abilities.map(([name, score]) => {
              const mod = Math.floor((score - 10) / 2);
              const key = ({ Сила: "strength", Ловкость: "dexterity", Телосложение: "constitution", Интеллект: "intelligence", Мудрость: "wisdom", Харизма: "charisma" } as const)[name];
              return <article className="ability" key={name}><span>{name}</span><strong>{mod >= 0 ? "+" : ""}{mod}</strong>{privileged ? <input aria-label={name} type="number" min="1" max="30" value={score} onChange={(event) => setCharacter({ ...character, [key]: Number(event.target.value) })}/> : <small>{score}</small>}</article>;
            })}
          </div>

          <div className="sheet-grid">
            <div className="sheet-column sheet-column-primary">
            <section className="panel" id="combat">
              <header><h3>Состояние</h3><span>Игрок может изменять</span></header>
              <div className="vitals">
                <label className="hp"><span>Текущие хиты</span><input type="number" min="0" max={character.maximumHp} value={hp} onChange={(e) => setHp(Number(e.target.value))}/><small>из {character.maximumHp}</small></label>
                <div className="vital"><span>Класс доспеха</span><strong>{character.armorClass}</strong></div>
                <div className="vital"><span>Скорость</span><strong>{character.speed} <small>фт.</small></strong></div>
                <div className="vital"><span>Инициатива</span><strong>+1</strong></div>
              </div>
              <div className="death-saves"><span>Спасброски от смерти</span><div>Успехи ○ ○ ○</div><div>Провалы ○ ○ ○</div></div>
            </section>

            <section className="panel" id="features">
              <header><h3>Особенности</h3><span>Управляет Мастер</span></header>
              {!sections.features.length && !resources.length && <p className="section-empty">Особенности не добавлены</p>}
              {sections.features.map((feature, index) => <div className="feature" key={`${feature.name}-${index}`}>{privileged ? <><div className="feature-heading"><input value={feature.name} onChange={(event) => setSections({ ...sections, features: sections.features.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })}/><button type="button" aria-label={`Удалить особенность: ${feature.name}`} title="Удалить особенность" onClick={() => { if (window.confirm(`Удалить особенность «${feature.name}» из черновика?`)) setSections({ ...sections, features: sections.features.filter((_, itemIndex) => itemIndex !== index) }); }}>×</button></div><textarea rows={2} value={feature.description} onChange={(event) => setSections({ ...sections, features: sections.features.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) })}/></> : <><strong>{feature.name}</strong><p>{feature.description}</p></>}</div>)}
              {privileged && <button className="inline-add" onClick={() => setSections({ ...sections, features: [...sections.features, { name: "Новая особенность", description: "" }] })}>+ Особенность</button>}
              {resources.map((resource) => <div className="resource-row" key={resource.id}><span>{resource.name}</span><button aria-label={`Восстановить ресурс: ${resource.name}`} disabled={resource.spent <= 0} onClick={() => setResources(restoreCharacterResource(resources, resource.id))}>−</button><strong>{resource.maximum - resource.spent} / {resource.maximum}</strong><button aria-label={`Потратить ресурс: ${resource.name}`} disabled={resource.spent >= resource.maximum} onClick={() => setResources(spendCharacterResource(resources, resource.id))}>+</button></div>)}
            </section>

            <section className="panel" id="inventory">
              <header><h3>Снаряжение</h3><span>Переносимый вес</span></header>
              <ul className="equipment">{equipment.length ? equipment.slice(0, 8).map((item) => <li key={item}>{item}</li>) : <li>Снаряжение не указано</li>}</ul>
              <label className="coins"><span>Золотые монеты</span><input type="number" min="0" value={coins} onChange={(e) => setCoins(Number(e.target.value))}/></label>
            </section>

            </div>
            <div className="sheet-column sheet-column-secondary">
            <section className="panel attacks-panel">
              <header><h3>Атаки</h3><span>Оружие и действия</span></header>
              {!sections.attacks.length && <p className="section-empty">Атаки не добавлены</p>}
              {sections.attacks.map((attack, index) => <div className="attack-row" key={`${attack.name}-${index}`}>{privileged ? <><input value={attack.name} onChange={(event) => setSections({ ...sections, attacks: sections.attacks.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })}/><input value={attack.attackBonus} onChange={(event) => setSections({ ...sections, attacks: sections.attacks.map((item, itemIndex) => itemIndex === index ? { ...item, attackBonus: event.target.value } : item) })}/><input value={attack.damage} onChange={(event) => setSections({ ...sections, attacks: sections.attacks.map((item, itemIndex) => itemIndex === index ? { ...item, damage: event.target.value } : item) })}/></> : <><strong>{attack.name}</strong><span>{attack.attackBonus}</span><span>{attack.damage}</span></>}</div>)}
              {privileged && <button className="inline-add" onClick={() => setSections({ ...sections, attacks: [...sections.attacks, { name: "Новая атака", attackBonus: "+0", damage: "" }] })}>+ Атака</button>}
            </section>

            <section className="panel skills">
              <header><h3>Навыки</h3></header>
              <div className="skill-grid">{sections.skills.map((skill, index) => <div className={skill.proficient ? "skill proficient" : "skill"} key={`${skill.name}-${index}`}>
                <button className={skill.proficient ? "prof-dot filled" : "prof-dot"} disabled={!privileged} aria-label={`Владение: ${skill.name}`} onClick={() => setSections({ ...sections, skills: sections.skills.map((item, itemIndex) => itemIndex === index ? { ...item, proficient: !item.proficient } : item) })}/>
                {privileged && !standardSkillNames.has(skill.name.trim().toLocaleLowerCase("ru")) ? <input value={skill.name} onChange={(event) => setSections({ ...sections, skills: sections.skills.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })}/> : <span>{skill.name}</span>}
                <strong>{skillBonus(skill) >= 0 ? "+" : ""}{skillBonus(skill)}</strong>
              </div>)}</div>
              {privileged && <button className="inline-add" onClick={() => setSections({ ...sections, skills: [...sections.skills, { name: "Новый навык", ability: "wisdom", proficient: false, expertise: false }] })}>+ Навык</button>}
            </section>

            <section className="panel" id="proficiencies">
              <header><h3>Владения</h3><span>Оружие, доспехи, инструменты и языки</span></header>
              <div className="tag-list">{sections.proficiencies.map((item, index) => <span key={`${item}-${index}`}>{item}{privileged && <button type="button" aria-label={`Удалить владение: ${item}`} title="Удалить владение" onClick={() => { if (window.confirm(`Удалить владение «${item}» из черновика?`)) setSections({ ...sections, proficiencies: sections.proficiencies.filter((_, itemIndex) => itemIndex !== index) }); }}>×</button>}</span>)}</div>
              {!sections.proficiencies.length && <p className="section-empty">Владения не добавлены</p>}
              {privileged && <form className="proficiency-add" onSubmit={addProficiencyDraft}><input aria-label="Новое владение" placeholder="Новое владение" value={newProficiency} onChange={(event) => setNewProficiency(event.target.value)}/><button type="submit">Добавить</button></form>}
            </section>

            <section className="panel notes" id="notes">
              <header><h3>Заметки персонажа</h3><span>Личные записи</span></header>
              <label className="note-entry"><span>Основная заметка</span><textarea aria-label="Основная заметка персонажа" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}/></label>
              {sections.playerNotes.map((note, index) => <label className="note-entry" key={note.id}><span>Дополнительная заметка {index + 1}</span><div><textarea aria-label={`Дополнительная заметка ${index + 1}`} value={note.text} rows={3} onChange={(event) => setSections({ ...sections, playerNotes: sections.playerNotes.map((item) => item.id === note.id ? { ...item, text: event.target.value } : item) })}/><button type="button" aria-label={`Удалить дополнительную заметку ${index + 1}`} onClick={() => setSections({ ...sections, playerNotes: sections.playerNotes.filter((item) => item.id !== note.id) })}>×</button></div></label>)}
              <button className="inline-add" type="button" onClick={() => setSections({ ...sections, playerNotes: [...sections.playerNotes, { id: crypto.randomUUID(), text: "" }] })}>+ Дополнительная заметка</button>
              {privileged && <div className="gm-notes"><header><strong>Заметки Мастера</strong><span>Видны только Мастеру и Overseer</span></header>{sections.gmNotes.map((note, index) => <label className="note-entry" key={note.id}><span>Скрытая заметка {index + 1}</span><div><textarea aria-label={`Скрытая заметка Мастера ${index + 1}`} value={note.text} rows={3} onChange={(event) => setSections({ ...sections, gmNotes: sections.gmNotes.map((item) => item.id === note.id ? { ...item, text: event.target.value } : item) })}/><button type="button" aria-label={`Удалить скрытую заметку ${index + 1}`} onClick={() => setSections({ ...sections, gmNotes: sections.gmNotes.filter((item) => item.id !== note.id) })}>×</button></div></label>)}<button className="inline-add" type="button" onClick={() => setSections({ ...sections, gmNotes: [...sections.gmNotes, { id: crypto.randomUUID(), text: "" }] })}>+ Заметка Мастера</button></div>}
            </section>

            </div>
            {activeProfile && characterId && <Spellbook profileId={activeProfile.id} characterId={characterId} privileged={privileged} onMessage={setMessage}/>}
          </div>
        </section>
      </div>

      {portraitFile && <PortraitCropper
        file={portraitFile}
        onCancel={() => { setPortraitFile(null); if (portraitInput.current) portraitInput.current.value = ""; }}
        onApply={(portraitDataUrl) => { setCharacter({ ...character, portraitDataUrl }); setPortraitFile(null); if (portraitInput.current) portraitInput.current.value = ""; setMessage("Портрет добавлен в черновик — сохраните изменения"); }}
      />}
      <footer className="savebar">
        <span>{dirty ? "Черновик хранится только на этом устройстве" : `Последнее сохранение · только что · ${profile}`}</span>
        <button className="secondary" disabled={!dirty} onClick={() => { setHp(saved.hp); setCoins(saved.coins); setNotes(saved.notes); setCharacter(savedCharacter); setClassesDetail(savedClasses); setSections(savedSections); setResources(savedResources); setMessage("Все изменения сохранены"); }}>Отменить</button>
        <button className="primary" disabled={!characterId || !dirty || saving} onClick={saveChanges}>{saving ? "Сохраняем…" : "Сохранить изменения"}</button>
      </footer>
    </main>
  );
}
