"use client";

import React, { useState } from "react";
import { Button, Segmented, Space, Table, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { DownloadOutlined } from "@/components/common/icons";
import type {
  AccountGroup,
  TrialBalanceByProjectDto,
  TrialBalanceDto,
  TrialBalanceRowDto,
} from "@erp/shared";
import { ACCOUNT_GROUPS, ACCOUNT_GROUP_LABELS } from "@erp/shared";
import { useTrialBalance } from "@/lib/queries";
import { useProjectScope } from "@/lib/project-scope";
import { formatINR } from "@/lib/format";
import { downloadXlsx, exportFileName } from "@/lib/exportExcel";
import { QueryError } from "@/components/common/QueryState";
import { LinkButton } from "@/components/common/LinkButton";
import { ProjectSelect } from "@/components/common/ProjectSelect";
import { Amount, Balance } from "@/components/books/booksUi";
import { PeriodPicker, day, ledgerHref, thisYearSoFar } from "./statementsUi";

interface Row {
  key: string;
  accountId?: string;
  name: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  children?: Row[];
}

const n = (s: string) => Number(s);

/** Accounts under their groups (in Tally's order), each group with its totals. */
function grouped(rows: TrialBalanceRowDto[]): Row[] {
  return ACCOUNT_GROUPS.flatMap((g: AccountGroup) => {
    const inGroup = rows.filter((r) => r.group === g);
    if (!inGroup.length) return [];
    const children = inGroup.map((r) => ({
      key: r.accountId,
      accountId: r.accountId,
      name: r.code ? `${r.code} · ${r.name}` : r.name,
      opening: n(r.opening),
      debit: n(r.debit),
      credit: n(r.credit),
      closing: n(r.closing),
    }));
    const total = (k: "opening" | "debit" | "credit" | "closing") =>
      Math.round(children.reduce((s, c) => s + c[k], 0) * 100) / 100;
    return [
      {
        key: g,
        name: ACCOUNT_GROUP_LABELS[g],
        opening: total("opening"),
        debit: total("debit"),
        credit: total("credit"),
        closing: total("closing"),
        children,
      },
    ];
  });
}

/** The trial balance: every account's opening, debits, credits and closing in a period, by group or by project. */
export function TrialBalance() {
  const [range, setRange] = useState(thisYearSoFar);
  const [view, setView] = useState<"grouped" | "projects">("grouped");
  const [projectId, setProjectId] = useProjectScope();
  const from = day(range[0]);
  const to = day(range[1]);
  const byProject = view === "projects";
  const { data, isLoading, isFetching, error, refetch } = useTrialBalance(
    { from, to, projectId: byProject ? undefined : projectId },
    byProject,
  );
  const name = (r: { accountId?: string; name: string }) =>
    r.accountId ? (
      <LinkButton
        href={ledgerHref(r.accountId, from, to)}
        type="link"
        size="small"
        style={{ padding: 0 }}
      >
        <span translate="no">{r.name}</span>
      </LinkButton>
    ) : (
      <Typography.Text strong>{r.name}</Typography.Text>
    );

  const download = () => {
    if (!data) return;
    if (byProject) {
      const d = data as TrialBalanceByProjectDto;
      const cols = [
        ...d.projects.map((p) => ({ id: p.id, header: p.code })),
        { id: "none", header: "Head office" },
      ];
      return downloadXlsx(
        exportFileName("trial-balance-by-project"),
        "By project",
        [
          {
            header: "Account",
            value: (r: TrialBalanceByProjectDto["rows"][number]) => r.name,
            width: 40,
          },
          {
            header: "Group",
            value: (r) => ACCOUNT_GROUP_LABELS[r.group],
            width: 24,
          },
          ...cols.map((c) => ({
            header: `${c.header} (Dr +)`,
            value: (r: TrialBalanceByProjectDto["rows"][number]) =>
              Number(r.cells[c.id] ?? 0),
            width: 16,
          })),
          { header: "Total (Dr +)", value: (r) => Number(r.total), width: 16 },
        ],
        d.rows,
      );
    }
    const d = data as TrialBalanceDto;
    return downloadXlsx(
      exportFileName("trial-balance"),
      "Trial balance",
      [
        {
          header: "Account",
          value: (r: TrialBalanceRowDto) => r.name,
          width: 40,
        },
        {
          header: "Group",
          value: (r) => ACCOUNT_GROUP_LABELS[r.group],
          width: 24,
        },
        {
          header: "Opening (Dr +)",
          value: (r) => Number(r.opening),
          width: 16,
        },
        { header: "Debits", value: (r) => Number(r.debit), width: 16 },
        { header: "Credits", value: (r) => Number(r.credit), width: 16 },
        {
          header: "Closing debit",
          value: (r) => (Number(r.closing) > 0 ? Number(r.closing) : null),
          width: 16,
        },
        {
          header: "Closing credit",
          value: (r) => (Number(r.closing) < 0 ? -Number(r.closing) : null),
          width: 16,
        },
      ],
      d.rows,
    );
  };

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
          <PeriodPicker value={range} onChange={setRange} />
          <Segmented
            aria-label="How to show"
            value={view}
            onChange={(v) => setView(v as "grouped" | "projects")}
            options={[
              { value: "grouped", label: "By group" },
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
        <Button icon={<DownloadOutlined />} onClick={download} disabled={!data}>
          Download
        </Button>
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : byProject ? (
        <ByProject
          data={data as TrialBalanceByProjectDto | undefined}
          loading={isLoading || isFetching}
          from={from}
          to={to}
        />
      ) : (
        <Grouped
          data={data as TrialBalanceDto | undefined}
          loading={isLoading || isFetching}
          name={name}
        />
      )}
    </div>
  );
}

function Grouped({
  data,
  loading,
  name,
}: {
  data: TrialBalanceDto | undefined;
  loading: boolean;
  name: (r: Row) => React.ReactNode;
}) {
  const rows =
    data && "rows" in data && "totals" in data ? grouped(data.rows) : [];
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return (
    <Table<Row>
      className="statement-table"
      rowKey="key"
      size="small"
      loading={loading}
      dataSource={rows}
      pagination={false}
      scroll={{ x: 900 }}
      expandable={{
        expandedRowKeys: rows
          .filter((r) => !collapsed.has(r.key))
          .map((r) => r.key),
        onExpand: (open, r) =>
          setCollapsed((c) => {
            const next = new Set(c);
            if (open) next.delete(r.key);
            else next.add(r.key);
            return next;
          }),
      }}
      locale={{ emptyText: "Nothing in the books in this period" }}
      columns={[
        { title: "Account", key: "name", render: (_, r) => name(r) },
        {
          title: "Opening",
          dataIndex: "opening",
          align: "right",
          width: 170,
          render: (x: number) => <Balance value={x} />,
        },
        {
          title: "Debits",
          dataIndex: "debit",
          align: "right",
          width: 160,
          render: (x: number) => <Amount value={x} />,
        },
        {
          title: "Credits",
          dataIndex: "credit",
          align: "right",
          width: 160,
          render: (x: number) => <Amount value={x} />,
        },
        {
          title: "Closing",
          dataIndex: "closing",
          align: "right",
          width: 170,
          render: (x: number) => <Balance value={x} />,
        },
      ]}
      summary={() =>
        data?.totals ? (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>
                <Typography.Text strong>Total</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <Typography.Text
                  type="secondary"
                  translate="no"
                >{`Dr ${formatINR(data.totals.openingDebit, true)}`}</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right">
                <Typography.Text strong>
                  <Amount value={data.totals.debit} />
                </Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">
                <Typography.Text strong>
                  <Amount value={data.totals.credit} />
                </Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                <Typography.Text
                  strong
                  translate="no"
                >{`Dr ${formatINR(data.totals.closingDebit, true)}`}</Typography.Text>
              </Table.Summary.Cell>
            </Table.Summary.Row>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} />
              <Table.Summary.Cell index={1} align="right">
                <Typography.Text
                  type="secondary"
                  translate="no"
                >{`Cr ${formatINR(data.totals.openingCredit, true)}`}</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} colSpan={2} align="right">
                <Typography.Text
                  type={
                    data.totals.debit === data.totals.credit
                      ? "secondary"
                      : "danger"
                  }
                >
                  {data.totals.debit === data.totals.credit
                    ? "Debits equal credits"
                    : "Debits and credits differ"}
                </Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                <Typography.Text
                  strong
                  translate="no"
                >{`Cr ${formatINR(data.totals.closingCredit, true)}`}</Typography.Text>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        ) : null
      }
    />
  );
}

function ByProject({
  data,
  loading,
  from,
  to,
}: {
  data: TrialBalanceByProjectDto | undefined;
  loading: boolean;
  from: string;
  to: string;
}) {
  const projects = data && "projects" in data ? data.projects : [];
  const rows =
    data && "projects" in data
      ? [...data.rows].sort(
          (a, b) =>
            ACCOUNT_GROUPS.indexOf(a.group) - ACCOUNT_GROUPS.indexOf(b.group) ||
            a.name.localeCompare(b.name),
        )
      : [];
  const columns: TableColumnsType<TrialBalanceByProjectDto["rows"][number]> = [
    {
      title: "Account",
      key: "name",
      fixed: "left",
      width: 240,
      render: (_, r) => (
        <LinkButton
          href={ledgerHref(r.accountId, from, to)}
          type="link"
          size="small"
          style={{ padding: 0 }}
        >
          <span translate="no">{r.name}</span>
        </LinkButton>
      ),
    },
    ...[
      ...projects.map((p) => ({ id: p.id, title: p.code, tip: p.name })),
      { id: "none", title: "Head office", tip: "Entries with no project" },
    ].map((c) => ({
      title: (
        <span title={c.tip} translate="no">
          {c.title}
        </span>
      ),
      key: c.id,
      align: "right" as const,
      width: 160,
      render: (_: unknown, r: TrialBalanceByProjectDto["rows"][number]) =>
        r.cells[c.id] ? <Balance value={r.cells[c.id]} /> : null,
    })),
    {
      title: "Total",
      dataIndex: "total",
      align: "right",
      width: 170,
      render: (x: string) => <Balance value={x} />,
    },
  ];
  return (
    <>
      <Typography.Paragraph type="secondary">
        Each account&apos;s movement in the period on each project (the cost
        centres), debit or credit; head office is entries with no project.
      </Typography.Paragraph>
      <Table
        rowKey="accountId"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 400 + (projects.length + 1) * 160 }}
        locale={{ emptyText: "Nothing in the books in this period" }}
        columns={columns}
      />
    </>
  );
}
