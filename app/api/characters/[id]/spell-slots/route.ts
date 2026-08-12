export async function PATCH() {
  return Response.json({ error: "Раздельное сохранение ячеек больше не поддерживается. Используйте атомарный маршрут spellbook" }, { status: 410 });
}
