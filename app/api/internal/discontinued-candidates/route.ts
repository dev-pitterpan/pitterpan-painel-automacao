import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { listShopifyCatalogProducts } from "@/lib/auth";

function authorized(request: NextRequest) {
  const expected = String(process.env.WINTHOR_SYNC_TOKEN || "").trim();
  const received = String(request.headers.get("x-pitterpan-token") || "").trim();
  if (!expected || !received) return false;
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(received).digest();
  return timingSafeEqual(left, right);
}

// Retorna apenas IDs candidatos do lote WinThor atualmente sincronizado.
// O estoque aqui e uma triagem: a exclusao exige consulta atualizada na Shopify.
export async function GET(request: NextRequest) {
  if (!authorized(request))
    return NextResponse.json({ error: "Token invalido." }, { status: 401 });
  const rawPage = Number(request.nextUrl.searchParams.get("page") || "1");
  if (!Number.isSafeInteger(rawPage) || rawPage < 1 || rawPage > 1000)
    return NextResponse.json({ error: "Pagina invalida." }, { status: 400 });

  try {
    const result = await listShopifyCatalogProducts({
      winthorStatus: "FORA_DE_LINHA",
      page: rawPage,
      perPage: 500,
    });
    return NextResponse.json({
      page: result.page,
      totalPages: result.totalPages,
      totalOutOfLine: result.total,
      candidates: result.products
        .filter((product) =>
          product.sku && product.totalInventory === 0 && product.variants.length === 1
        )
        .map((product) => ({
          shopifyId: product.shopifyId,
          sku: product.sku,
          title: product.title,
        })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Falha ao consultar candidatos." }, { status: 500 });
  }
}
