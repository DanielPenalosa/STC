"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";

export type ExportRow = {
  ref: string;
  title: string;
  category: string;
  barangay: string;
  department: string;
  status: string;
  priority: number;
  date: string;
};

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function downloadCsv(rows: ExportRow[]) {
  const header = ["Ref Code", "Title", "Category", "Barangay", "Department", "Status", "Priority", "Date Reported"];
  const lines = [
    header.map(csvEscape).join(","),
    ...rows.map((r) =>
      [r.ref, r.title, r.category, r.barangay, r.department, r.status, String(r.priority), r.date]
        .map(csvEscape)
        .join(",")
    ),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reports-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export dropdown: CSV (direct download) and PDF (styled print window —
 * the browser's Save-as-PDF handles rendering, so no heavy dependency).
 * Exports exactly what's on screen: the server passes the filtered rows.
 */
export default function ExportMenu({ rows }: { rows: ExportRow[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function exportPdf() {
    setOpen(false);
    const win = window.open("", "_blank", "width=980,height=720");
    if (!win) return;
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const bodyRows = rows
      .map(
        (r) => `<tr>
          <td>${esc(r.ref)}</td>
          <td>${esc(r.title)}</td>
          <td>${esc(r.category)}</td>
          <td>${esc(r.barangay)}</td>
          <td>${esc(r.department)}</td>
          <td>${esc(r.status)}</td>
          <td>${esc(String(r.priority))}</td>
          <td>${esc(r.date)}</td>
        </tr>`
      )
      .join("");

    win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Reports export — ${new Date().toLocaleDateString()}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #060606; margin: 32px; }
  header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #2333A0; padding-bottom: 12px; margin-bottom: 18px; }
  h1 { font-size: 18px; margin: 0; color: #2333A0; }
  .meta { font-size: 11px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; background: #F1F3FB; color: #2333A0; text-transform: uppercase; letter-spacing: 0.04em; font-size: 9px; padding: 7px 8px; border-bottom: 1px solid #e2e8f0; }
  td { padding: 7px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:nth-child(even) td { background: #fafbfe; }
  .count { font-size: 11px; color: #64748b; margin-bottom: 10px; }
  @media print { body { margin: 12px; } }
</style>
</head>
<body>
  <header>
    <div>
      <h1>Community Reports — Export</h1>
      <div class="meta">Generated ${new Date().toLocaleString()}</div>
    </div>
    <div class="meta">${rows.length} report${rows.length === 1 ? "" : "s"} (current filters applied)</div>
  </header>
  <p class="count">Use your browser's Print → “Save as PDF” to produce the PDF file.</p>
  <table>
    <thead>
      <tr><th>Ref</th><th>Title</th><th>Category</th><th>Barangay</th><th>Department</th><th>Status</th><th>Priority</th><th>Date</th></tr>
    </thead>
    <tbody>${bodyRows || `<tr><td colspan="8">No reports match the current filters.</td></tr>`}</tbody>
  </table>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
    win.document.close();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <Icon name="download" size="sm" />
        Export
        <Icon name="chevron-down" size="sm" className="opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <button
            onClick={() => {
              setOpen(false);
              downloadCsv(rows);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            <Icon name="file" size="sm" className="text-success-500" />
            Download CSV
            <span className="ml-auto text-[10px] text-slate-300">Excel-ready</span>
          </button>
          <button
            onClick={exportPdf}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            <Icon name="clipboard" size="sm" className="text-danger-500" />
            Export PDF
            <span className="ml-auto text-[10px] text-slate-300">print view</span>
          </button>
          <p className="border-t border-slate-100 px-3 py-1.5 text-[10px] leading-snug text-slate-400">
            Exports the {rows.length} report{rows.length === 1 ? "" : "s"} currently shown — filters and date range included.
          </p>
        </div>
      )}
    </div>
  );
}
