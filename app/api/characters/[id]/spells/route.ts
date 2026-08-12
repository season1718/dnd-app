export async function PUT() {
  return Response.json({ error: "Раздельное сохранение заклинаний больше не поддерживается. Используйте атомарный маршрут spellbook" }, { status: 410 });
}
