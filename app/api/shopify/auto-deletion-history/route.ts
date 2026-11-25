import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, listAutomatedDeletionHistory } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  try {
    const page = Number(request.nextUrl.searchParams.get("page") || 1);
    const search = request.nextUrl.searchParams.get("q") || "";
    const data = await listAutomatedDeletionHistory(page, search);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar o histórico." }, { status: 500 });
  }
}
