"use client";

import React, { useState } from "react";
import { Button, Segmented, Space, Table, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { DownloadOutlined } from "@/components/common/icons";
import type { ProfitLossDto, StatementLineDto } from "@erp/shared";
import { STATEMENT_LINE_LABELS } from "@erp/shared";
import { useProfitLoss } from "@/lib/queries";
import { useProjectScope } from "@/lib/project-scope";
import { formatDate } from "@/lib/format";
import { downloadXlsx, exportFileName } from "@/lib/exportExcel";
import { QueryError } from "@/components/common/QueryState";
import { LinkButton } from "@/components/common/LinkButton";
import { ProjectSelect } from "@/components/common/ProjectSelect";
import {
  PeriodPicker,
  Signed,
  day,
  ledgerHref,
  thisYearSoFar,
} from "./statementsUi";

export interface StatementRow {
  key: string;
  label: string;
  accountId?: string;
  amount: string | null;
  previous: string | null;
  /** A heading or total, in bold */
  strong?: boolean;
  /** An account under its line */
  account?: boolean;
  children?: StatementRow[];
}

/** A Schedule III line with its accounts under it (only those with a figure). */
export const lineRow = (l: StatementLineDto, prefix: string): StatementRow => ({
  key: `${prefix}:${l.line}`,
  label: l.label,
  amount: l.amount,
  previous: l.previous,
  children: l.accounts.length
    ? l.accounts.map((a) => ({
        key: `${prefix}:${l.line}:${a.accountId}`,
        accountId: a.accountId,
        label: a.name,
        amount: a.amount,
        previous: a.previous,
        account: true,
      }))
    : undefined,
});

function rows(d: ProfitLossDto): StatementRow[] {
  return [
    {
      key: "h-income",
      label: "Income",
      amount: null,
      previous: null,
      strong: true,
    },
    ...d.income.map((l, i) => ({
      ...lineRow(l, "i"),
      label: `${["I", "II"][i]}. ${l.label}`,
    })),
    {
      key: "t-income",
      label: "III. Total income (I + II)",
      ...d.totalIncome,
      strong: true,
    },
    {
      key: "h-expenses",
      label: "IV. Expenses",
      amount: null,
      previous: null,
      strong: true,
    },
    ...d.expenses.map((l) => lineRow(l, "e")),
    {
      key: "t-expenses",
      label: "Total expenses (IV)",
      ...d.totalExpenses,
      strong: true,
    },
    {
      key: "pbt",
      label: "V. Profit before tax (III − IV)",
      ...d.profitBeforeTax,
      strong: true,
    },
    { ...lineRow(d.tax, "t"), label: `VI. ${d.tax.label}` },
    {
      key: "profit",
      label: "VII. Profit (loss) for the period (V − VI)",
      ...d.profit,
      strong: true,
    },
  ];
}

/** The statement's two money columns: this period and the same period a year before. */
export function statementColumns(
  current: string,
  previous: string,
  from: string,
  to: string,
): TableColumnsType<StatementRow> {
  return [
    {
      title: "Particulars",
      key: "label",
      render: (_, r) =>
        r.accountId && r.account ? (
          <LinkButton
            href={ledgerHref(r.accountId, from, to)}
            type="link"
            size="small"
            style={{ padding: 0 }}
          >
            <span translate="no">{r.label}</span>
          </LinkButton>
        ) : (
          <Typography.Text strong={r.strong}>{r.label}</Typography.Text>
        ),
    },
    {
      title: current,
      dataIndex: "amount",
      align: "right",
      width: 190,
      render: (x: string | null, r) =>
        x === null ? null : <Signed value={x} strong={r.strong} />,
    },
    {
      title: previous,
      dataIndex: "previous",
      align: "right",
      width: 190,
      render: (x: string | null, r) =>
        x === null ? null : <Signed value={x} strong={r.strong} />,
    },
  ];
}

const range = (a: string, b: string) => `${formatDate(a)} to ${formatDate(b)}`;

/** Profit and loss in Schedule III order for a period (and a project), beside the same period a year before; or by project. */
export function ProfitLoss() {
  const [period, setPeriod] = useState(thisYearSoFar);
  const [view, setView] = useState<"statement" | "projects">("statement");
  const [projectId, setProjectId] = useProjectScope();
  const from = day(period[0]);
  const to = day(period[1]);
  const byProject = view === "projects";
  const { data, isLoading, isFetching, error, refetch } = useProfitLoss({
    from,
    to,
    projectId: byProject ? undefined : projectId,
    byProject: byProject || undefined,
  });
  const tableRows = data ? rows(data) : [];
  const download = () =>
    data &&
    downloadXlsx(
      exportFileName("profit-and-loss"),
      "Profit and loss",
      [
        {
          header: "Particulars",
          value: (r: StatementRow) => (r.account ? `    ${r.label}` : r.label),
          width: 50,
        },
        {
          header: range(data.from, data.to),
          value: (r) => (r.amount === null ? null : Number(r.amount)),
          width: 22,
        },
        {
          header: range(data.previousFrom, data.previousTo),
          value: (r) => (r.previous === null ? null : Number(r.previous)),
          width: 22,
        },
      ],
      tableRows.flatMap((r) => [r, ...(r.children ?? [])]),
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
          <PeriodPicker value={period} onChange={setPeriod} />
          <Segmented
            aria-label="How to show"
            value={view}
            onChange={(v) => setView(v as "statement" | "projects")}
            options={[
              { value: "statement", label: "Statement" },
              { value: "projects", label: "By project" },
            ]}
          />
          {!byProject && (
            <ProjectSelect
              allowClear
              placeholder="All projects"
              value={projectId}
              onChange={setProjectId}
              aria-label="Project"
              style={{ minWidth: 220 }}
            />
          )}
        </Space>
        {!byProject && (
          <Button
            icon={<DownloadOutlined />}
            onClick={download}
            disabled={!data}
          >
            Download
          </Button>
        )}
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : byProject ? (
        <ByProject data={data} loading={isLoading || isFetching} />
      ) : (
        <>
          <Table<StatementRow>
            className="statement-table"
            rowKey="key"
            size="small"
            loading={isLoading || isFetching}
            dataSource={tableRows}
            pagination={false}
            scroll={{ x: 680 }}
            columns={statementColumns(
              data ? range(data.from, data.to) : "This period",
              data
                ? range(data.previousFrom, data.previousTo)
                : "A year before",
              from,
              to,
            )}
          />
          <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
            Open a line to see its accounts, and an account for its ledger.
            Accounts choose another line for an account from the chart of
            accounts (Change, Shows in the statements as).
          </Typography.Paragraph>
        </>
      )}
    </div>
  );
}

function ByProject({
  data,
  loading,
}: {
  data: ProfitLossDto | undefined;
  loading: boolean;
}) {
  const bp = data?.byProject;
  const cols = bp
    ? [
        ...bp.projects.map((p) => ({ id: p.id, title: p.code, tip: p.name })),
        { id: "none", title: "Head office", tip: "Entries with no project" },
      ]
    : [];
  const lines = (bp?.lines ?? []).filter((l) => Object.keys(l.cells).length);
  const tableRows = [
    ...lines.map((l) => ({
      key: l.line,
      label: STATEMENT_LINE_LABELS[l.line],
      cells: l.cells,
      strong: false,
    })),
    ...(bp
      ? [
          {
            key: "profit",
            label: "Profit (loss)",
            cells: bp.profit,
            strong: true,
          },
        ]
      : []),
  ];
  return (
    <>
      <Typography.Paragraph type="secondary">
        Income and expenses booked to each project; head office is what has no
        project. Income is positive on income lines and expenses on expense
        lines.
      </Typography.Paragraph>
      <Table
        rowKey="key"
        size="small"
        loading={loading}
        dataSource={tableRows}
        pagination={false}
        scroll={{ x: 280 + cols.length * 160 }}
        locale={{ emptyText: "No income or expenses in this period" }}
        columns={[
          {
            title: "Line",
            key: "label",
            fixed: "left",
            width: 280,
            render: (_, r) => (
              <Typography.Text strong={r.strong}>{r.label}</Typography.Text>
            ),
          },
          ...cols.map((c) => ({
            title: (
              <span title={c.tip} translate="no">
                {c.title}
              </span>
            ),
            key: c.id,
            align: "right" as const,
            width: 160,
            render: (_: unknown, r: (typeof tableRows)[number]) =>
              r.cells[c.id] ? (
                <Signed value={r.cells[c.id]} strong={r.strong} />
              ) : null,
          })),
        ]}
      />
    </>
  );
}
