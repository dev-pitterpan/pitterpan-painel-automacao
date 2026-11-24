export type WinthorDeletionStatus = "ATIVO" | "FORA_DE_LINHA" | "PENDENTE";

export function evaluateDiscontinuedDeletion(
  status: WinthorDeletionStatus,
  inventory: number | null | undefined,
) {
  if (status !== "FORA_DE_LINHA")
    return {
      eligible: false,
      reason: status === "PENDENTE"
        ? "Status do WinThor ainda não sincronizado."
        : "Produto ativo no WinThor.",
    };
  if (inventory !== 0)
    return {
      eligible: false,
      reason: Number.isInteger(inventory)
        ? `Estoque atual na Shopify: ${inventory}.`
        : "Não foi possível confirmar estoque zero na Shopify.",
    };
  return { eligible: true, reason: "Fora de linha no WinThor e estoque zero na Shopify." };
}
