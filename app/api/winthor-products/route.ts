import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteShopifyCatalogProducts,
  beginAutomatedDeletion,
  finishAutomatedDeletion,
  getAutomatedDeletionSnapshot,
  getLatestWinthorSyncAt,
  getCurrentUser,
  getWinthorProductStatus,
  listShopifyCatalogProducts,
  listShopifyCatalogIdsForWinthorSkus,
  syncWinthorProductStatuses,
  type WinthorStatusProduct,
} from "@/lib/auth";
import { deleteShopifyProduct, findMissingShopifyProductIds, shopifyGraphql } from "@/lib/shopify-admin";

function normalizeSyncToken(value: unknown) {
  let token = String(value || "")
    .trim()
    .replace(/^(?:WINTHOR_SYNC_TOKEN|N8N_REPROCESS_TOKEN)\s*=\s*/i, "")
    .trim();
  if (
    token.length >= 2 &&
    ((token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'")))
  ) {
    token = token.slice(1, -1).trim();
  }
  return token;
}

function isValidDeletionToken(req: NextRequest) {
  const expected = normalizeSyncToken(process.env.WINTHOR_SYNC_TOKEN);
  const received = normalizeSyncToken(req.headers.get("x-pitterpan-token"));
  if (!expected || !received) return false;
  return timingSafeEqual(createHash("sha256").update(expected).digest(), createHash("sha256").update(received).digest());
}

function isValidSyncToken(req: NextRequest) {
  const expectedTokens = [
    ...new Set(
      [process.env.WINTHOR_SYNC_TOKEN, process.env.N8N_REPROCESS_TOKEN]
        .map(normalizeSyncToken)
        .filter(Boolean),
    ),
  ];
  const received = normalizeSyncToken(
    req.headers.get("x-pitterpan-token") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      "",
  );
  if (!expectedTokens.length || !received) return false;
  const receivedHash = createHash("sha256").update(received).digest();
  let valid = false;
  for (const expected of expectedTokens) {
    const expectedHash = createHash("sha256").update(expected).digest();
    if (timingSafeEqual(expectedHash, receivedHash)) valid = true;
  }
  return valid;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const sku = String(req.nextUrl.searchParams.get("sku") || "").trim();
  if (!sku)
    return NextResponse.json({ error: "SKU obrigatório." }, { status: 400 });
  try {
    return NextResponse.json(await getWinthorProductStatus(sku));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao consultar o status WinThor.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isValidSyncToken(req))
    return NextResponse.json(
      { error: "Token de sincronização inválido." },
      { status: 401 },
    );
  try {
    const body = await req.json();

    if (body?.action === "delete_discontinued_product") {
      if (!isValidDeletionToken(req)) return NextResponse.json({ error: "Token WinThor necessário." }, { status: 401 });
      const id = String(body?.shopifyId || "").trim();
      const sku = String(body?.sku || "").trim();
      const mode = body?.mode;
      if (!/^gid:\/\/shopify\/Product\/\d+$/.test(id) || !sku ||
          (mode !== "preview" && mode !== "execute"))
        return NextResponse.json({ error: "Produto ou modo inválido." }, { status: 400 });
      const snapshot = await getAutomatedDeletionSnapshot(id);
      if (!snapshot || snapshot.sku !== sku || !snapshot.in_winthor ||
          snapshot.variant_count !== 1)
        return NextResponse.json({ ok: true, eligible: false, reason: "SKU, variantes ou status WinThor não conferem." });
      const syncedAt = new Date(snapshot.winthor_synced_at || "").getTime();
      if (!Number.isFinite(syncedAt) || syncedAt > Date.now() ||
          Date.now() - syncedAt > 30 * 60 * 60 * 1000)
        return NextResponse.json({ error: "Sincronização WinThor ausente ou com mais de 30 horas." }, { status: 409 });
      const live = await shopifyGraphql<{
        product: { id: string; totalInventory: number; tracksInventory: boolean;
          variants: { nodes: Array<{ sku: string }> } } | null;
      }>("query ConfirmDiscontinuedInventory($id: ID!) { product(id: $id) { id totalInventory tracksInventory variants(first: 2) { nodes { sku } } } }", { id });
      const product = live.product;
      if (!product || product.id !== id || product.tracksInventory !== true ||
          product.totalInventory !== 0 || product.variants.nodes.length !== 1 ||
          product.variants.nodes[0].sku !== sku)
        return NextResponse.json({ ok: true, eligible: false, reason: "Produto, variante ou estoque atual não confere." });
      if (mode === "preview")
        return NextResponse.json({ ok: true, eligible: true, deleted: false, shopifyId: id, sku, totalInventory: 0 });
      const acquired = await beginAutomatedDeletion({ shopifyId: id, sku, title: snapshot.title, inventory: 0 });
      if (!acquired)
        return NextResponse.json({ ok: true, eligible: false, reason: "Produto já registrado no histórico para revisão; exclusão bloqueada." });
      try {
        await deleteShopifyProduct(id);
      } catch (error) {
        await finishAutomatedDeletion(id, "failed", error instanceof Error ? error.message : "Falha Shopify.");
        throw error;
      }
      await finishAutomatedDeletion(id, "deleted");
      await deleteShopifyCatalogProducts([id]);
      return NextResponse.json({ ok: true, eligible: true, deleted: true, shopifyId: id, sku });
    }
    if (body?.action === "list_discontinued_candidates") {
      const latest = new Date((await getLatestWinthorSyncAt()) || "").getTime();
      if (!Number.isFinite(latest) || latest > Date.now() || Date.now() - latest > 30 * 60 * 60 * 1000)
        return NextResponse.json({ error: "Sincronização WinThor ausente ou com mais de 30 horas." }, { status: 409 });
      const page = Number(body?.page ?? 1);
      if (!Number.isSafeInteger(page) || page < 1 || page > 1000)
        return NextResponse.json({ error: "Página inválida." }, { status: 400 });
      const result = await listShopifyCatalogProducts({
        winthorStatus: "FORA_DE_LINHA", page, perPage: 500,
      });
      return NextResponse.json({
        page: result.page,
        totalPages: result.totalPages,
        totalOutOfLine: result.total,
        candidates: result.products
          .filter((product) => product.sku && product.totalInventory === 0 && product.variants.length === 1)
          .map((product) => ({ shopifyId: product.shopifyId, sku: product.sku, title: product.title })),
      }, { headers: { "Cache-Control": "no-store" } });
    }
    if (
      !Array.isArray(body?.products) ||
      body.products.length === 0 ||
      body.products.length > 50_000
    )
      return NextResponse.json(
        { error: "Envie uma lista não vazia com até 50.000 produtos." },
        { status: 400 },
      );
    const products: WinthorStatusProduct[] = body.products.map(
      (product: Record<string, unknown>) => ({
        sku: String(product?.sku ?? product?.codigo ?? "").trim(),
        description: String(
          product?.description ?? product?.descricao ?? "",
        ).trim(),
      }),
    );
    const catalogIds = await listShopifyCatalogIdsForWinthorSkus(
      products.map((product) => product.sku),
    );
    // Se a consulta à Shopify falhar, a importação não substitui o último
    // lote válido do WinThor por uma lista que não foi conferida.
    const missingIds = await findMissingShopifyProductIds(catalogIds);
    for (let offset = 0; offset < missingIds.length; offset += 250) {
      await deleteShopifyCatalogProducts(missingIds.slice(offset, offset + 250));
    }
    const result = await syncWinthorProductStatuses(
      products,
      String(body?.sourceFile || "produtos_fora_de_linha.xls"),
    );
    return NextResponse.json({
      ok: true,
      ...result,
      checkedOnShopify: catalogIds.length,
      removedFromCatalog: missingIds.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao sincronizar os produtos do WinThor.",
      },
      { status: 500 },
    );
  }
}
