"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type Profile = { id: string; name: string; globalRole?: string };
type Character = { id: string; name: string; kind: string; classes: string; level: number };

export function ManagementPanel({ actor, campaign, profiles, characters, onChanged, onCampaignCreated, onMessage }: {
  actor: Profile;
  campaign: { id: string; name: string; description: string };
  profiles: Profile[];
  characters: Character[];
  onChanged: () => void;
  onCampaignCreated: (campaignId: string) => void;
  onMessage: (message: string) => void;
}) {
  const [members, setMembers] = useState<Array<Profile & { role: string }>>([]);
  const [newProfile, setNewProfile] = useState("");
  const [campaignName, setCampaignName] = useState(campaign.name);
  const [campaignDescription, setCampaignDescription] = useState(campaign.description);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [campaignFormOpen, setCampaignFormOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] = useState("PLAYER");
  const [characterName, setCharacterName] = useState("");
  const [characterKind, setCharacterKind] = useState("PC");
  const [assigneeId, setAssigneeId] = useState("");
  const isOverseer = actor.name === "Overseer" || actor.globalRole === "OVERSEER";

  function loadMembers() {
    fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}/members?profileId=${encodeURIComponent(actor.id)}`)
      .then((response) => response.json())
      .then((data) => setMembers(data.members ?? []));
  }
  useEffect(() => {
    loadMembers();
  // Reload the campaign-scoped panel whenever actor or campaign changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor.id, campaign.id, campaign.name, campaign.description]);

  async function send(url: string, init: RequestInit, success: string) {
    try {
      const response = await fetch(url, init);
      const result = await response.json().catch(() => ({}));
      onMessage(response.ok ? success : result.error ?? `Операция не выполнена (${response.status})`);
      if (response.ok) { loadMembers(); onChanged(); }
      return response.ok;
    } catch {
      onMessage("Сервер данных недоступен — операция не выполнена");
      return false;
    }
  }

  async function createProfile(event: FormEvent) {
    event.preventDefault();
    if (!newProfile.trim()) return;
    if (await send("/api/profiles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actorProfileId: actor.id, name: newProfile }) }, `Профиль «${newProfile}» создан`)) setNewProfile("");
  }

  async function saveCampaign(event: FormEvent) {
    event.preventDefault();
    await send(`/api/campaigns/${encodeURIComponent(campaign.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ actorProfileId: actor.id, name: campaignName, description: campaignDescription }) }, "Кампания обновлена");
  }

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    const name = newCampaignName.trim();
    if (!name) return;
    const response = await fetch("/api/campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actorProfileId: actor.id, name, description: "" }) });
    const result = await response.json();
    if (!response.ok) return onMessage(result.error ?? "Не удалось создать кампанию");
    onMessage(`Кампания «${result.name}» создана`);
    setNewCampaignName("");
    setCampaignFormOpen(false);
    onCampaignCreated(result.id);
  }

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (!memberId) return;
    await send(`/api/campaigns/${encodeURIComponent(campaign.id)}/members`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ actorProfileId: actor.id, profileId: memberId, role: memberRole }) }, "Состав кампании обновлён");
  }

  async function createCharacter(event: FormEvent) {
    event.preventDefault();
    if (!characterName.trim()) return;
    const ok = await send("/api/characters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actorProfileId: actor.id, campaignId: campaign.id, name: characterName, kind: characterKind, assignToProfileId: assigneeId || undefined }) }, `Персонаж «${characterName}» создан`);
    if (ok) setCharacterName("");
  }

  async function deleteCharacter(character: Character) {
    if (!window.confirm(`Удалить персонажа «${character.name}»? Все данные листа, ресурсы и книга заклинаний будут удалены без возможности восстановления.`)) return;
    await send(`/api/characters/${encodeURIComponent(character.id)}?profileId=${encodeURIComponent(actor.id)}`, { method: "DELETE" }, `Персонаж «${character.name}» удалён`);
  }

  async function deleteProfile(profile: Profile) {
    if (!window.confirm(`Удалить профиль «${profile.name}»? Его участие в кампаниях и назначения персонажей будут удалены. Сами персонажи останутся.`)) return;
    await send(`/api/profiles/${encodeURIComponent(profile.id)}?actorProfileId=${encodeURIComponent(actor.id)}`, { method: "DELETE" }, `Профиль «${profile.name}» удалён`);
  }

  return <section className="campaign-manager">
    <div className="manager-column">
      <h4>Кампания</h4>
      <form onSubmit={saveCampaign} className="manager-form">
        <label>Название<input value={campaignName} onChange={(event) => setCampaignName(event.target.value)}/></label>
        <label>Описание<input value={campaignDescription} onChange={(event) => setCampaignDescription(event.target.value)}/></label>
        <button type="submit">Сохранить кампанию</button>
        <button type="button" onClick={() => setCampaignFormOpen(!campaignFormOpen)}>Создать новую кампанию</button>
      </form>
      {campaignFormOpen && <form onSubmit={createCampaign} className="manager-inline"><input aria-label="Название новой кампании" placeholder="Название кампании" value={newCampaignName} onChange={(event) => setNewCampaignName(event.target.value)}/><button type="submit">Создать</button><button type="button" onClick={() => setCampaignFormOpen(false)}>Отмена</button></form>}
      <h4>Участники</h4>
      <div className="manager-list">{members.map((member) => <div key={member.id}><span>{member.name}<small>{member.role === "GM" ? "Мастер" : "Игрок"}</small></span><select value={member.role} disabled={member.id === actor.id} onChange={(event) => send(`/api/campaigns/${encodeURIComponent(campaign.id)}/members`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ actorProfileId: actor.id, profileId: member.id, role: event.target.value }) }, "Роль изменена")}><option value="PLAYER">Игрок</option><option value="GM">Мастер</option></select>{member.id !== actor.id && <button onClick={() => send(`/api/campaigns/${encodeURIComponent(campaign.id)}/members?actorProfileId=${encodeURIComponent(actor.id)}&profileId=${encodeURIComponent(member.id)}`, { method: "DELETE" }, "Участник удалён")}>×</button>}</div>)}</div>
      <form onSubmit={addMember} className="manager-inline"><select value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">Выберите профиль…</option>{profiles.filter((profile) => !members.some((member) => member.id === profile.id)).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select><select value={memberRole} onChange={(event) => setMemberRole(event.target.value)}><option value="PLAYER">Игрок</option><option value="GM">Мастер</option></select><button>Добавить</button></form>
    </div>

    <div className="manager-column">
      <h4>Новый персонаж</h4>
      <form onSubmit={createCharacter} className="manager-form">
        <label>Имя<input value={characterName} onChange={(event) => setCharacterName(event.target.value)}/></label>
        <div className="manager-inline"><select value={characterKind} onChange={(event) => setCharacterKind(event.target.value)}><option value="PC">Игровой</option><option value="NPC">NPC</option></select><select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Без владельца</option>{members.filter((member) => member.role === "PLAYER").map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><button>Создать</button></div>
      </form>
      <h4>Назначения</h4>
      <div className="manager-list">{characters.map((character) => <div key={character.id}><span>{character.name}<small>{character.kind === "NPC" ? "NPC" : `${character.classes || "Без класса"} ${character.level || ""}`}</small></span><select defaultValue="" onChange={(event) => event.target.value && send(`/api/characters/${character.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ actorProfileId: actor.id, assignedProfileIds: [event.target.value] }) }, "Назначение сохранено")}><option value="">Назначить…</option>{members.filter((member) => member.role === "PLAYER").map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><button aria-label={`Удалить персонажа: ${character.name}`} onClick={() => void deleteCharacter(character)}>×</button></div>)}</div>
      {isOverseer && <><h4>Профили</h4><div className="manager-list profile-manager-list">{profiles.map((profile) => <div key={profile.id}><span>{profile.name}<small>{profile.globalRole === "OVERSEER" ? "Overseer" : "Локальный профиль"}</small></span>{profile.id === actor.id ? <small className="active-profile-note">Активный</small> : <button aria-label={`Удалить профиль: ${profile.name}`} onClick={() => void deleteProfile(profile)}>×</button>}</div>)}</div><form onSubmit={createProfile} className="manager-inline"><input value={newProfile} placeholder="Имя нового профиля" onChange={(event) => setNewProfile(event.target.value)}/><button>Создать</button></form></>}
    </div>
  </section>;
}
