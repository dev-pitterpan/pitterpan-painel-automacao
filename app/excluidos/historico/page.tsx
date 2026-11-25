"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArchiveX, CheckCircle2, Clock3, RefreshCw, Search } from "lucide-react";
import styles from "./history.module.css";

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

type HistoryResponse = { rows: Entry[]; total: number; page: number; perPage: number };

const date = (value: string) =>
  new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const time = (value: string) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function AutomatedDeletionHistory() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    async function load() {
      try {
        const response = await fetch(
          "/api/shopify/auto-deletion-history?page=" + page + "&q=" + encodeURIComponent(search),
          { cache: "no-store", signal: controller.signal },
        );
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Falha ao buscar histórico.");
        if (!controller.signal.aborted) setData(json);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Falha ao buscar histórico.");
          setData(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [page, search, refreshKey]);

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / (data?.perPage || 50)));

  return (
    <div className={styles.history}>
      <header className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>Auditoria automática</div>
          <h1 className="page-title">Histórico de exclusões</h1>
          <p className={styles.description}>
            Produtos excluídos após validação do WinThor e conferência do estoque na Shopify.
          </p>
        </div>
      </header>

      <section className={styles.panel} aria-label="Registros de exclusão">
        <div className={styles.toolbar}>
          <div className={styles.toolbarTitle}>
            <strong>Produtos processados</strong>
            <span>{data?.total ?? 0} {data?.total === 1 ? "registro" : "registros"}</span>
          </div>
          <form
            className={styles.search}
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSearch(query.trim());
              setRefreshKey((key) => key + 1);
            }}
          >
            <Search size={17} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar SKU ou produto"
              aria-label="Buscar SKU ou produto"
            />
            <button type="submit" disabled={loading}>Buscar</button>
          </form>
          <button
            type="button"
            className={styles.refresh}
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={loading}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Atualizar
          </button>
        </div>

        {error && (
          <div className={styles.error} role="alert">
            <AlertCircle size={17} aria-hidden="true" /> {error}
          </div>
        )}
        {loading && <div className={styles.loading} role="status">Carregando histórico...</div>}
        {!loading && !error && !data?.rows.length && (
          <div className={styles.empty}>
            <ArchiveX size={28} aria-hidden="true" />
            <strong>{search ? "Nenhum resultado para esta busca" : "Nenhuma exclusão registrada"}</strong>
            <span>{search ? "Tente outro SKU ou nome de produto." : "Os produtos processados aparecerão aqui."}</span>
          </div>
        )}
        {!loading && !error && data && data.rows.length > 0 && (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Produto</th>
                  <th scope="col">Excluído em</th>
                  <th scope="col">Estoque</th>
                  <th scope="col">Status</th>
                  <th scope="col">ID Shopify</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const timestamp = row.completed_at || row.created_at;
                  const statusText = row.status === "deleted" ? "Excluído" : row.status === "failed" ? "Falhou" : "Em processamento";
                  return (
                    <tr key={row.shopify_id}>
                      <td data-label="Produto">
                        <div className={styles.product}>
                          <span className={styles.sku}>SKU {row.sku}</span>
                          <strong>{row.title || "Produto sem nome"}</strong>
                          {row.error_message && <span className={styles.note}>{row.error_message}</span>}
                        </div>
                      </td>
                      <td data-label="Data e hora">
                        <div className={styles.date}>
                          <strong>{date(timestamp)}</strong>
                          <span>{time(timestamp)}</span>
                        </div>
                      </td>
                      <td data-label="Estoque"><span className={styles.stock}>{row.inventory_at_check}</span></td>
                      <td data-label="Status">
                        <span className={[styles.status, styles[row.status]].join(" ")}>
                          {row.status === "deleted" ? <CheckCircle2 size={14} /> : row.status === "failed" ? <AlertCircle size={14} /> : <Clock3 size={14} />}
                          {statusText}
                        </span>
                      </td>
                      <td data-label="ID Shopify">
                        <span className={styles.shopifyId} title={row.shopify_id}>
                          #{row.shopify_id.split("/").pop()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <footer className={styles.footer}>
          <span>
            Página {page} de {totalPages}
            {data && data.total > 0 && <> · {data.total} {data.total === 1 ? "registro" : "registros"}</>}
          </span>
          <div className={styles.pagination}>
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>
              Anterior
            </button>
            <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>
              Próxima
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
