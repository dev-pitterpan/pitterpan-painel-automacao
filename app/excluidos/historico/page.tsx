"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArchiveX, RefreshCw, Search } from "lucide-react";

type Entry = {
  shopify_id: string;
  sku: string;
  title: string;
  inventory_at_check: number;
  status: "pending" | "deleted" | "failed";
  error_message: string;
  created_at: string;
  completed_at: string | null;
};
type Response = { rows: Entry[]; total: number; page: number; perPage: number };

export default function AutomatedDeletionHistory() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/shopify/auto-deletion-history?page=${page}&q=${encodeURIComponent(search)}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Falha ao buscar histórico.");
      setData(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao buscar histórico.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);
  useEffect(() => { void load(); }, [load]);
  const date = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / (data?.perPage || 50)));
  return (
    <>
      <div className="page-head excluded-page-head">
        <div>
          <h1 className="page-title">Histórico de exclusões</h1>
          <div className="page-sub">Produtos excluídos automaticamente após conferência do WinThor e da Shopify.</div>
        </div>
      </div>
      <section className="panel excluded-panel">
        <div className="excluded-filters">
          <Link href="/excluidos" className="btn">Planilha de excluídos</Link>
          <form onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(query); }} className="excluded-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar SKU ou produto" aria-label="Buscar SKU ou produto" />
          </form>
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Atualizar</button>
        </div>
        {error && <div className="users-message is-error" role="alert">{error}</div>}
        {!error && !loading && !data?.rows.length && (
          <div className="empty-results"><ArchiveX size={24} /><strong>Nenhuma exclusão registrada</strong></div>
        )}
        {data && data.rows.length > 0 && (
          <div className="table-wrap excluded-table">
            <table>
              <thead><tr><th>Data</th><th>SKU</th><th>Produto</th><th>Estoque conferido</th><th>Status</th><th>ID Shopify</th><th>Observação</th></tr></thead>
              <tbody>{data.rows.map((row) => (
                <tr key={row.shopify_id}>
                  <td data-label="Data">{date(row.completed_at || row.created_at)}</td>
                  <td data-label="SKU"><strong>{row.sku}</strong></td>
                  <td data-label="Produto">{row.title}</td>
                  <td data-label="Estoque conferido">{row.inventory_at_check}</td>
                  <td data-label="Status">{row.status === "deleted" ? "Excluído" : row.status === "failed" ? "Falhou · revisar" : "Em processamento · revisar"}</td>
                  <td data-label="ID Shopify">{row.shopify_id}</td>
                  <td data-label="Observação">{row.error_message || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="excluded-filters">
          <span>{data?.total || 0} registros · página {page} de {totalPages}</span>
          <button type="button" className="btn" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Anterior</button>
          <button type="button" className="btn" disabled={page >= totalPages || loading} onClick={() => setPage(page + 1)}>Próxima</button>
        </div>
      </section>
    </>
  );
}
