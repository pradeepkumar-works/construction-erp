"use client";

import React, { useState } from "react";
import { Button, Flex, Table } from "antd";
import type { TableProps } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LabourChallanDto,
  LabourPaperDto,
  LabourProblem,
  LabourStandingDto,
} from "@erp/shared";
import {
  LABOUR_CHALLAN_KINDS,
  LABOUR_CHALLAN_KIND_LABELS,
  LABOUR_PAPER_KIND_LABELS,
  canKeepLabourCompliance,
  monthWords,
  plural,
} from "@erp/shared";
import { tk } from "@/ds";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useProjectScope } from "@/lib/project-scope";
import { useLabourCompliance } from "@/lib/queries";
import { useIsPhone } from "@/lib/screen";
import { formatDate, NO_VALUE } from "@/lib/format";
import { AppTag } from "@/components/common/AppTag";
import { AppTabs } from "@/components/common/AppTabs";
import { CardToolbar } from "@/components/common/CardToolbar";
import { Money } from "@/components/common/Money";
import { ProjectSelect } from "@/components/common/ProjectSelect";
import { PlusOutlined } from "@/components/common/icons";
import { Loading, QueryError } from "@/components/common/QueryState";
import { useConfirmDelete } from "@/components/common/ConfirmDelete";
import {
  LabourChallanForm,
  LabourPaperForm,
  type LabourForm,
} from "./LabourComplianceForms";

const isChallan = (
  k: LabourProblem["kind"],
): k is (typeof LABOUR_CHALLAN_KINDS)[number] =>
  (LABOUR_CHALLAN_KINDS as readonly string[]).includes(k);
const validity = (p: LabourPaperDto) =>
  p.validFrom
    ? `${formatDate(p.validFrom)} to ${p.validTo ? formatDate(p.validTo) : "no end"}`
    : p.validTo
      ? `To ${formatDate(p.validTo)}`
      : "No end date";
const docs = (n: number) =>
  n ? <span className="text-muted">{plural(n, "scan")}</span> : null;

/**
 * Contract labour compliance (ARCHITECTURE "Contract labour compliance"): each contractor with men on our sites over the
 * last six months, what they have not shown, and their papers and challans. A subcontractor bill is paid only once
 * nothing is missing, or after management releases its hold.
 */
export function LabourCompliancePanel() {
  const { user } = useAuth();
  const phone = useIsPhone();
  const keeper = !!user && canKeepLabourCompliance(user.roleKey);
  const qc = useQueryClient();
  const [projectId, setProjectId] = useProjectScope();
  const { data, isLoading, error, refetch } = useLabourCompliance({
    projectId,
  });
  const [form, setForm] = useState<LabourForm | null>(null);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const remove = useMutation({
    mutationFn: async (path: string) => (await api.delete(path)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["labour-compliance"] }),
  });

  /** The form that puts a problem right, filled in from it. */
  const fix = (s: LabourStandingDto, p: LabourProblem): LabourForm =>
    isChallan(p.kind)
      ? {
          kind: "challan",
          vendorId: s.vendorId,
          challanKind: p.kind,
          month: p.key.split(":")[2]?.split(",")[0],
        }
      : {
          kind: "paper",
          vendorId: s.vendorId,
          paperKind: p.kind,
          projectId: s.projectId,
        };

  /** What the contractor has not shown, each with the form that records it. */
  const missingOf = (s: LabourStandingDto) =>
    s.problems.length ? (
      <Flex vertical gap={tk.space[1]}>
        {s.problems.map((p) => (
          <Flex key={p.key} gap={tk.space[2]} align="center" wrap>
            <AppTag meaning="failed" style={{ margin: 0 }}>
              {isChallan(p.kind)
                ? LABOUR_CHALLAN_KIND_LABELS[p.kind]
                : LABOUR_PAPER_KIND_LABELS[p.kind]}
            </AppTag>
            <span>{p.text}</span>
            {keeper ? (
              <Button
                size="small"
                type="link"
                style={{ padding: 0 }}
                onClick={() => setForm(fix(s, p))}
                aria-label={`Record: ${p.text}`}
              >
                Record
              </Button>
            ) : null}
          </Flex>
        ))}
      </Flex>
    ) : (
      <AppTag meaning="done" style={{ margin: 0 }}>
        In order
      </AppTag>
    );

  const wideCols: TableProps<LabourStandingDto>["columns"] = [
    {
      title: "Contractor",
      key: "vendor",
      width: 260,
      render: (_, s) => (
        <div>
          <div translate="no">{s.vendorName}</div>
          <div
            className="text-muted"
            style={{ fontSize: tk.type.caption.fontSize }}
          >
            <span translate="no">{s.projectName}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Most men",
      dataIndex: "sitePeak",
      key: "peak",
      width: 110,
      align: "right",
      render: (v: number) => (
        <span className="mono" translate="no">
          {v}
        </span>
      ),
    },
    {
      title: "Last on site",
      dataIndex: "lastSeen",
      key: "seen",
      width: 130,
      render: (v: string) => formatDate(v),
    },
    {
      title: "What is missing",
      key: "problems",
      render: (_, s) => missingOf(s),
    },
  ];

  /** On a phone, one column: the contractor, their men, and what is missing under it. */
  const phoneCols: TableProps<LabourStandingDto>["columns"] = [
    {
      title: "Contractor",
      key: "vendor",
      render: (_, s) => (
        <Flex vertical gap={tk.space[2]}>
          <div>
            <div translate="no">{s.vendorName}</div>
            <div
              className="text-muted"
              style={{ fontSize: tk.type.caption.fontSize }}
            >
              <span translate="no">{s.projectName}</span> · most men{" "}
              <span translate="no">{s.sitePeak}</span> · last on site{" "}
              {formatDate(s.lastSeen)}
            </div>
          </div>
          {missingOf(s)}
        </Flex>
      ),
    },
  ];
  const standingCols = phone ? phoneCols : wideCols;

  const rowActions = (
    onEdit: () => void,
    onDelete: () => void,
    what: string,
  ) =>
    keeper ? (
      <Flex gap={tk.space[1]}>
        <Button size="small" onClick={onEdit} aria-label={`Edit ${what}`}>
          Edit
        </Button>
        <Button
          size="small"
          danger
          onClick={onDelete}
          aria-label={`Delete ${what}`}
        >
          Delete
        </Button>
      </Flex>
    ) : null;

  const paperCols: TableProps<LabourPaperDto>["columns"] = [
    {
      title: "Paper",
      key: "kind",
      width: 230,
      render: (_, p) => (
        <div>
          <AppTag variant="kind" style={{ margin: 0 }}>
            {LABOUR_PAPER_KIND_LABELS[p.kind]}
          </AppTag>
          <div style={{ marginTop: tk.space.half }}>
            <b translate="no">{p.number}</b>
          </div>
        </div>
      ),
    },
    {
      title: "Contractor",
      key: "vendor",
      render: (_, p) => (
        <div>
          <div translate="no">{p.vendorName}</div>
          <div
            className="text-muted"
            style={{ fontSize: tk.type.caption.fontSize }}
          >
            {p.projectName ? (
              <span translate="no">{p.projectName}</span>
            ) : (
              "Every site"
            )}
          </div>
        </div>
      ),
    },
    {
      title: "Valid",
      key: "valid",
      width: 220,
      render: (_, p) => (
        <div>
          <div>{validity(p)}</div>
          {p.current ? null : (
            <AppTag meaning="failed" style={{ margin: 0 }}>
              Not valid today
            </AppTag>
          )}
        </div>
      ),
    },
    {
      title: "Workers",
      dataIndex: "workers",
      key: "workers",
      width: 100,
      align: "right",
      render: (v: number | null) =>
        v === null ? (
          NO_VALUE
        ) : (
          <span className="mono" translate="no">
            {v}
          </span>
        ),
    },
    {
      title: "Scans",
      key: "scans",
      width: 90,
      render: (_, p) => docs(p.attachments.length),
    },
    ...(keeper
      ? [
          {
            title: <span className="visually-hidden">Actions</span>,
            key: "actions",
            width: 150,
            render: (_: unknown, p: LabourPaperDto) =>
              rowActions(
                () => setForm({ kind: "paper", paper: p }),
                () =>
                  askDelete({
                    what: `${LABOUR_PAPER_KIND_LABELS[p.kind]} ${p.number}`,
                    onConfirm: () =>
                      remove.mutateAsync(`/labour-papers/${p.id}`),
                  }),
                `${LABOUR_PAPER_KIND_LABELS[p.kind]} ${p.number}`,
              ),
          },
        ]
      : []),
  ];

  const challanCols: TableProps<LabourChallanDto>["columns"] = [
    {
      title: "Month",
      key: "month",
      width: 130,
      render: (_, c) => (
        <div>
          <div>{monthWords(c.month)}</div>
          <div
            className="text-muted"
            style={{ fontSize: tk.type.caption.fontSize }}
          >
            {LABOUR_CHALLAN_KIND_LABELS[c.kind]}
          </div>
        </div>
      ),
    },
    {
      title: "Contractor",
      dataIndex: "vendorName",
      key: "vendor",
      render: (v: string) => <span translate="no">{v}</span>,
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      width: 140,
      align: "right",
      render: (v: string) => <Money value={v} paise />,
    },
    {
      title: "Workers",
      dataIndex: "workers",
      key: "workers",
      width: 100,
      align: "right",
      render: (v: number | null) =>
        v === null ? (
          NO_VALUE
        ) : (
          <span className="mono" translate="no">
            {v}
          </span>
        ),
    },
    {
      title: "Paid on",
      key: "paid",
      width: 170,
      render: (_, c) => (
        <Flex gap={tk.space[2]} align="center" wrap>
          {formatDate(c.paidOn)}
          {c.late ? (
            <AppTag meaning="waiting" style={{ margin: 0 }}>
              Late
            </AppTag>
          ) : null}
        </Flex>
      ),
    },
    {
      title: "Challan or TRRN",
      dataIndex: "reference",
      key: "ref",
      width: 180,
      render: (v: string) => <span translate="no">{v}</span>,
    },
    ...(keeper
      ? [
          {
            title: <span className="visually-hidden">Actions</span>,
            key: "actions",
            width: 150,
            render: (_: unknown, c: LabourChallanDto) =>
              rowActions(
                () => setForm({ kind: "challan", challan: c }),
                () =>
                  askDelete({
                    what: `${LABOUR_CHALLAN_KIND_LABELS[c.kind]} for ${monthWords(c.month)}`,
                    onConfirm: () =>
                      remove.mutateAsync(`/labour-challans/${c.id}`),
                  }),
                `${LABOUR_CHALLAN_KIND_LABELS[c.kind]} for ${monthWords(c.month)}`,
              ),
          },
        ]
      : []),
  ];

  const missing = data?.standing.filter((s) => s.problems.length).length ?? 0;
  const buttons = keeper ? (
    <Flex gap={tk.space[2]} wrap>
      <Button
        icon={<PlusOutlined />}
        onClick={() => setForm({ kind: "paper", projectId })}
      >
        Record paper
      </Button>
      <Button
        icon={<PlusOutlined />}
        onClick={() => setForm({ kind: "challan" })}
      >
        Record challan
      </Button>
    </Flex>
  ) : null;

  return (
    <div>
      <CardToolbar
        gap={tk.space[3]}
        wrap
        align="center"
        justify="space-between"
      >
        <ProjectSelect
          allowClear
          placeholder="All sites"
          aria-label="Site"
          value={projectId}
          onChange={(v) => setProjectId(v ?? undefined)}
          style={{ minWidth: 240 }}
        />
        {buttons}
      </CardToolbar>
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <div style={{ padding: tk.space[3] }}>
          <AppTabs
            items={[
              {
                key: "contractors",
                label: "Contractors",
                count: missing,
                countLabel: "with something missing",
                attention: true,
                children: (
                  <>
                    <Table<LabourStandingDto>
                      rowKey={(s) => `${s.vendorId}:${s.projectId}`}
                      size="small"
                      pagination={false}
                      dataSource={data.standing}
                      columns={standingCols}
                      scroll={phone ? undefined : { x: 820 }}
                      locale={{
                        emptyText: `No contractor’s men on the head counts since ${formatDate(data.from)}`,
                      }}
                    />
                  </>
                ),
              },
              {
                key: "papers",
                label: "Papers",
                count: data.papers.length,
                children: (
                  <Table<LabourPaperDto>
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 50, hideOnSinglePage: true }}
                    dataSource={data.papers}
                    columns={paperCols}
                    scroll={{ x: 900 }}
                    locale={{ emptyText: "No papers recorded" }}
                  />
                ),
              },
              {
                key: "challans",
                label: "Challans",
                count: data.challans.length,
                children: (
                  <Table<LabourChallanDto>
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 50, hideOnSinglePage: true }}
                    dataSource={data.challans}
                    columns={challanCols}
                    scroll={{ x: 900 }}
                    locale={{
                      emptyText: "No challans recorded in these months",
                    }}
                  />
                ),
              },
            ]}
          />
        </div>
      )}
      <LabourPaperForm
        form={form?.kind === "paper" ? form : null}
        onClose={() => setForm(null)}
      />
      <LabourChallanForm
        form={form?.kind === "challan" ? form : null}
        onClose={() => setForm(null)}
      />
      {deleteDialog}
    </div>
  );
}
