import { NextRequest, NextResponse } from "next/server";
import {
  deleteShopifyCatalogProducts,
  getCurrentUser,
  getShopifyDeletionStatus,
} from "@/lib/auth";
import {
  deleteShopifyProduct,
  getShopifyProductInventory,
} from "@/lib/shopify-admin";
import { evaluateDiscontinuedDeletion } from "@/lib/discontinued-deletion";

type Selection = { shopifyId: string; title: string };

function parseSelection(value: unknown): Selection[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) return null;
  const products = value.map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      shopifyId: String(row.shopifyId || "").trim(),
      title: String(row.title || "").trim().slice(0, 255),
    };
  });
  if (
    products.some((product) => !/^gid:\/\/shopify\/Product\/\d+$/.test(product.shopifyId)) ||
    new Set(products.map((product) => product.shopifyId)).size !== products.length
  ) return null;
  return products;
}

async function inspectProduct(product: Selection) {
  const catalog = await getShopifyDeletionStatus(product.shopifyId);
  if (!catalog) return { eligible: false, reason: "Produto ausente do catálogo sincronizado." };
  if (!catalog.sku) return { eligible: false, reason: "Produto sem SKU principal para conferir no WinThor." };
  if (catalog.status !== "FORA_DE_LINHA")
    return evaluateDiscontinuedDeletion(catalog.status, null);

  const shopify = await getShopifyProductInventory(product.shopifyId);
  if (!shopify) return { eligible: false, reason: "Produto não encontrado na Shopify." };
  return evaluateDiscontinuedDeletion(catalog.status, shopify.totalInventory);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Apenas administradores podem excluir produtos." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const mode = body?.mode;
  const products = parseSelection(body?.products);
  if ((mode !== "preview" && mode !== "execute") || !products)
    return NextResponse.json({ error: "Solicitação inválida. Envie até 5 produtos por lote." }, { status: 400 });

  const results = [];
  for (const product of products) {
    try {
      // A confirmação faz uma nova consulta; nenhuma informação enviada pela tela
      // autoriza a exclusão sem status e estoque atuais.
      const inspection = await inspectProduct(product);
      if (!inspection.eligible || mode === "preview") {
        results.push({ ...product, ...inspection, deleted: false });
        continue;
      }

      await deleteShopifyProduct(product.shopifyId);
      await deleteShopifyCatalogProducts([product.shopifyId]);
      results.push({ ...product, eligible: true, deleted: true, reason: "Excluído da Shopify." });
    } catch (cause) {
      results.push({
        ...product,
        eligible: false,
        deleted: false,
        error: cause instanceof Error ? cause.message : "Falha na conferência ou exclusão.",
      });
    }
  }
  return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
}
