"use client";

import React, { useState } from "react";
import { Alert, Button, Space, Table, Typography } from "antd";
import { DatePicker } from "@/components/common/DatePicker";
import { DownloadOutlined } from "@/components/common/icons";
import dayjs from "dayjs";
import type { BalanceSheetDto } from "@erp/shared";
import { useBalanceSheet } from "@/lib/queries";
import { formatDate, formatINR } from "@/lib/format";
import { downloadXlsx, exportFileName } from "@/lib/exportExcel";
import { QueryError } from "@/components/common/QueryState";
import { fyOf, day } from "./statementsUi";
import { lineRow, statementColumns, type StatementRow } from "./ProfitLoss";

const SIDES = [
  {
    side: "LIABILITY" as const,
    label: "Equity and liabilities",
    total: "totalLiabilities" as const,
  },
  { side: "ASSET" as const, label: "Assets", total: "totalAssets" as const },
];

function rows(d: BalanceSheetDto): StatementRow[] {
  return SIDES.flatMap(({ side, label, total }) => [
    { key: `h-${side}`, label, amount: null, previous: null, strong: true },
    ...d.sections
      .filter((s) => s.side === side)
      .map((s, i) => ({
        key: s.key,
        label: `${i + 1}. ${s.label}`,
        ...s.total,
        strong: true,
        children: s.lines
          .filter((l) => l.amount !== "0.00" || l.previous !== "0.00")
          .map((l, j) => ({
            ...lineRow(l, s.key),
            label: `(${String.fromCharCode(97 + j)}) ${l.label}`,
          })),
      })),
    { key: `t-${side}`, label: "Total", ...d[total], strong: true },
  ]);
}

/** The balance sheet in Schedule III order as on a day, beside the same day a year before. */
export function BalanceSheet() {
  const [asOn, setAsOn] = useState(() => dayjs());
  const { data, isLoading, isFetching, error, refetch } = useBalanceSheet(
    day(asOn),
  );
  const tableRows = data ? rows(data) : [];
  const [expanded, setExpanded] = useState<string[] | null>(null);
  const keys =
    expanded ?? tableRows.filter((r) => r.children?.length).map((r) => r.key);
  const download = () =>
    data &&
    downloadXlsx(
      exportFileName("balance-sheet"),
      "Balance sheet",
      [
        {
          header: "Particulars",
          value: (r: StatementRow) =>
            r.account
              ? `        ${r.label}`
              : r.strong
                ? r.label
                : `    ${r.label}`,
          width: 50,
        },
        {
          header: `As on ${formatDate(data.asOn)}`,
          value: (r) => (r.amount === null ? null : Number(r.amount)),
          width: 22,
        },
        {
          header: `As on ${formatDate(data.previousAsOn)}`,
          value: (r) => (r.previous === null ? null : Number(r.previous)),
          width: 22,
        },
      ],
      tableRows.flatMap((r) => [
        r,
        ...(r.children ?? []).flatMap((c) => [c, ...(c.children ?? [])]),
      ]),
    );
  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <Space wrap>
          <DatePicker
            aria-label="As on"
            allowClear={false}
            value={asOn}
            onChange={(d) => d && setAsOn(d)}
            presets={[
              { label: "Today", value: dayjs() },
              {
                label: "End of last year",
                value: fyOf(dayjs())[0].subtract(1, "day"),
              },
            ]}
          />
        </Space>
        <Button icon={<DownloadOutlined />} onClick={download} disabled={!data}>
          Download
        </Button>
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {data && Number(data.difference) !== 0 && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 12 }}
              title={`Assets and liabilities differ by ${formatINR(Math.abs(Number(data.difference)), true)}`}
              description="Every voucher balances, so this should not happen. Post the books again from Books, Day book, and tell your administrator if it stays."
            />
          )}
          <Table<StatementRow>
            className="statement-table"
            rowKey="key"
            size="small"
            loading={isLoading || isFetching}
            dataSource={tableRows}
            pagination={false}
            scroll={{ x: 680 }}
            expandable={{
              expandedRowKeys: keys,
              onExpandedRowsChange: (k) => setExpanded(k as string[]),
            }}
            columns={statementColumns(
              data ? `As on ${formatDate(data.asOn)}` : "As on",
              data ? `As on ${formatDate(data.previousAsOn)}` : "A year before",
              data ? fyOf(dayjs(data.asOn))[0].format("YYYY-MM-DD") : day(asOn),
              day(asOn),
            )}
          />
          {data && (
            <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
              {`Reserves and surplus include ${Number(data.profitNotClosed.amount) < 0 ? "a loss" : "profit"} of ${formatINR(Math.abs(Number(data.profitNotClosed.amount)), true)} from years not yet closed. Balances on the other side of their group move across, as accountants show them: an overdrawn bank under borrowings, advances to suppliers under loans and advances, GST credit under other current assets.`}
            </Typography.Paragraph>
          )}
        </>
      )}
    </div>
  );
}
