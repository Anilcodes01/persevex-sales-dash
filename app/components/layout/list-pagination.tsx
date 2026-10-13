"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ListPagination({
  total,
  page,
  pageSize,
  loading,
  onPage,
  noun,
}: {
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPage: (page: number) => void;
  noun: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);
  return (
    <footer
      className="list-pagination"
      aria-label={`${noun} pagination`}
      aria-busy={loading}
    >
      <span className="pagination-range">
        {loading ? "Loading…" : `Showing ${first}–${last} of ${total} ${noun}`}
      </span>
      <nav className="pagination-controls" aria-label={`${noun} pages`}>
        <Button
          type="button"
          variant="outline"
          disabled={loading || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <span className="pagination-page" aria-live="polite">
          Page <strong>{page}</strong> of {pages}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={loading || page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </nav>
    </footer>
  );
}
