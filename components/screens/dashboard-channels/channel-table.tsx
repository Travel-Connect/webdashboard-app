"use client";

/* ============================================================
   channel-table.tsx — 経路別実績一覧 (live data shape).
   The prototype shows a 経路×施設 / 経路×月 cross-tab built from raw
   report rows; the live /api/dashboard/channels endpoint returns a
   flat ChannelRow[] (already aggregated for the current filter), so
   this renders a ranked channel performance table: 売上 / 構成比 bar /
   販売室数 / 前年比 (when comparison present).
   ============================================================ */

import type { ChannelRow } from "@/lib/api/types";
import { DataTable, BarCell, type Column } from "@/components/ui/data-table";
import { MetricDelta } from "@/components/ui/primitives";
import { yen, integer, percent, EM_DASH } from "@/lib/dashboard/format";

const CH_BLUE = "var(--c-blue)";

export interface ChannelTableProps {
  rows: ChannelRow[];
  /** Whether any row carries YoY comparison fields. */
  hasYoy: boolean;
  /** Grand total revenue for the footer share. */
  totalRevenue: number;
}

export function ChannelTable({ rows, hasYoy, totalRevenue }: ChannelTableProps) {
  const totalSold = rows.reduce((s, r) => s + r.soldRoomNights, 0);

  const columns: Column<ChannelRow>[] = [
    {
      key: "channel",
      header: "経路",
      cell: (r) => (
        <span style={{ fontWeight: 600, color: "var(--text)" }}>{r.channel}</span>
      ),
      width: 220,
    },
    {
      key: "revenue",
      header: "売上",
      numeric: true,
      cell: (r) => yen(r.revenue),
      width: 140,
    },
    {
      key: "composition",
      header: "構成比",
      cell: (r) => (
        <BarCell
          pct={r.compositionRate ?? 0}
          color={CH_BLUE}
          label={r.compositionRate == null ? EM_DASH : percent(r.compositionRate)}
        />
      ),
      width: 180,
    },
    {
      key: "soldRoomNights",
      header: "販売室数",
      numeric: true,
      cell: (r) => integer(r.soldRoomNights),
      width: 110,
    },
  ];

  if (hasYoy) {
    columns.push(
      {
        key: "previousYearRevenue",
        header: "前年売上",
        numeric: true,
        cell: (r) =>
          r.previousYearRevenue == null ? EM_DASH : yen(r.previousYearRevenue),
        width: 140,
      },
      {
        key: "yoyRate",
        header: "前年比",
        align: "right",
        cell: (r) =>
          r.yoyRate == null && r.yoyDiff == null ? (
            <span style={{ color: "var(--text-3)" }}>{EM_DASH}</span>
          ) : (
            <MetricDelta value={r.yoyRate ?? null} unit="%" size="sm" />
          ),
        width: 110,
      },
    );
  }

  const footer = (
    <tr>
      <td
        style={{
          padding: "10px 12px",
          fontWeight: 700,
          background: "var(--surface-2)",
          borderTop: "2px solid var(--border-strong)",
        }}
      >
        合計
      </td>
      <td
        className="tabular"
        style={{
          padding: "10px 12px",
          textAlign: "right",
          fontWeight: 800,
          background: "var(--surface-2)",
          borderTop: "2px solid var(--border-strong)",
        }}
      >
        {yen(totalRevenue)}
      </td>
      <td
        className="tabular"
        style={{
          padding: "10px 12px",
          textAlign: "right",
          fontWeight: 700,
          background: "var(--surface-2)",
          borderTop: "2px solid var(--border-strong)",
        }}
      >
        100%
      </td>
      <td
        className="tabular"
        style={{
          padding: "10px 12px",
          textAlign: "right",
          fontWeight: 800,
          background: "var(--surface-2)",
          borderTop: "2px solid var(--border-strong)",
        }}
      >
        {integer(totalSold)}
      </td>
      {hasYoy && (
        <>
          <td
            style={{
              background: "var(--surface-2)",
              borderTop: "2px solid var(--border-strong)",
            }}
          />
          <td
            style={{
              background: "var(--surface-2)",
              borderTop: "2px solid var(--border-strong)",
            }}
          />
        </>
      )}
    </tr>
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.channel}
      stickyHeader
      footer={footer}
    />
  );
}
