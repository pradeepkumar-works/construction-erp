"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Dropdown,
  Flex,
  InputNumber,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  theme,
} from "antd";
import type { MenuProps } from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  RollbackOutlined,
  StopOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  COMPLIANCE_DOC_STATUS_LABELS,
  TENDER_BID_TYPE_LABELS,
  rankLabel,
  sorPctLabel,
  type TenderBidDto,
  type TenderDetailDto,
  type TenderItemDto,
  type TenderStatus,
} from "@erp/shared";
import { useNotify } from "@/lib/notify";
import { useTender, useTenderAction } from "@/lib/queries";
import { formatDate, formatINR, toNumber } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { PageSkeleton, QueryError } from "@/components/common/QueryState";
import { LinkButton } from "@/components/common/LinkButton";
import { AttachmentGallery } from "@/components/common/AttachmentGallery";
import { useConfirmDelete } from "@/components/common/ConfirmDelete";
import {
  DueTag,
  RankTag,
  TenderStatusTag,
} from "@/components/tenders/tenderUi";
import { TenderForm } from "@/components/tenders/TenderForm";
import { TenderItemDrawer } from "@/components/tenders/TenderItemDrawer";
import {
  BidBoqImport,
  BidDialog,
  EmdReturnedDialog,
  MakeProjectDialog,
  StatusDialog,
  SubmitDialog,
} from "@/components/tenders/TenderDialogs";

type Tab = "boq" | "bids" | "details";
const today = () => new Date().toLocaleDateString("en-CA");
const money = (v: string | null | undefined) => (
  <span translate="no">
    {v === null || v === undefined ? "-" : formatINR(v, true)}
  </span>
);
const pctNote = (pct: string | null | undefined) =>
  pct === null || pct === undefined
    ? null
    : `${sorPctLabel(pct)}${Math.abs(Number(pct)) < 0.005 ? "" : " SOR"}`;

/**
 * One tender (v6 item 110): the bid BOQ priced from each item's rate analysis, the quote against the SOR (one percentage
 * on a percentage tender, the rates on an item-rate one), the bids read out at opening ranked L1, L2…, the notice and
 * EMD, and the actions its status allows: submit, record the result, return the EMD, make the project.
 */
export default function TenderPage() {
  const params = useParams<{ id: string }>();
  const { data: tender, isLoading, error, refetch } = useTender(params?.id);

  if (isLoading)
    return (
      <div className="page-container">
        <PageSkeleton shape="record" />
      </div>
    );
  if (error || !tender)
    return (
      <div className="page-container">
        <QueryError
          error={error ?? new Error("Tender not found")}
          onRetry={() => refetch()}
        />
      </div>
    );
  return <TenderView tender={tender} />;
}

function TenderView({ tender }: { tender: TenderDetailDto }) {
  const { token } = theme.useToken();
  const { modal } = App.useApp();
  const router = useRouter();
  const notify = useNotify();
  const act = useTenderAction();
  const [tab, setTab] = useState<Tab>("boq");
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [moving, setMoving] = useState<TenderStatus | null>(null);
  const [bidding, setBidding] = useState(false);
  const [returning, setReturning] = useState(false);
  const [making, setMaking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [itemOpen, setItemOpen] = useState<{
    item: TenderItemDto | null;
  } | null>(null);
  const [askDelete, deleteDialog] = useConfirmDelete();

  const t = tender;
  const st = t.status;
  const edit = t.canEdit;
  const preparing = st === "PREPARING";
  const decided = st === "WON" || st === "LOST";
  const emdHeld = t.emd?.status === "ACTIVE";

  const stepBack = (
    to: TenderStatus,
    title: string,
    content: string,
    done: string,
  ) =>
    modal.confirm({
      title,
      content,
      okText: "Go back",
      onOk: async () => {
        await act.mutateAsync({
          path: `/tenders/${t.id}/status`,
          body: { status: to, on: today() },
        });
        notify.saved(`Tender ${t.tenderNo} ${done}`);
      },
    });

  const more: MenuProps["items"] = edit
    ? [
        ...(preparing || st === "SUBMITTED"
          ? [
              {
                key: "cancel",
                icon: <StopOutlined />,
                label: "Record cancelled by the client",
                onClick: () => setMoving("CANCELLED"),
              },
            ]
          : []),
        ...(preparing
          ? [
              {
                key: "drop",
                icon: <StopOutlined />,
                label: "Record not bidding",
                onClick: () => setMoving("DROPPED"),
              },
            ]
          : []),
        ...(st === "SUBMITTED"
          ? [
              {
                key: "back",
                icon: <RollbackOutlined />,
                label: "Back to preparing",
                onClick: () =>
                  stepBack(
                    "PREPARING",
                    `Take ${t.tenderNo} back to preparing?`,
                    "Its pricing opens again. Use it for a bid recorded as submitted by mistake.",
                    "is back to preparing",
                  ),
              },
            ]
          : []),
        ...(decided && !t.projectId
          ? [
              {
                key: "undo",
                icon: <RollbackOutlined />,
                label: "Undo the result",
                onClick: () =>
                  stepBack(
                    "SUBMITTED",
                    `Undo the result of ${t.tenderNo}?`,
                    "It goes back to awaiting the result.",
                    "is back to awaiting the result",
                  ),
              },
            ]
          : []),
        ...(st === "DROPPED" || st === "CANCELLED"
          ? [
              {
                key: "reopen",
                icon: <RollbackOutlined />,
                label: "Reopen to bid",
                onClick: () =>
                  stepBack(
                    "PREPARING",
                    `Reopen ${t.tenderNo}?`,
                    "It goes back to preparing, to be priced and bid.",
                    "is reopened",
                  ),
              },
            ]
          : []),
        ...(!t.projectId &&
        (preparing || st === "DROPPED" || st === "CANCELLED")
          ? [
              {
                key: "delete",
                icon: <DeleteOutlined />,
                danger: true,
                label: "Delete tender",
                onClick: () =>
                  askDelete({
                    what: `tender ${t.tenderNo}`,
                    description: emdHeld
                      ? "Its bid BOQ goes with it, and its EMD leaves the guarantees."
                      : "Its bid BOQ goes with it.",
                    onConfirm: () =>
                      act.mutateAsync({
                        method: "delete",
                        path: `/tenders/${t.id}`,
                      }),
                    onDone: () => router.push("/tenders"),
                  }),
              },
            ]
          : []),
      ]
    : [];

  const actions = (
    <Space wrap>
      {edit && preparing ? (
        <Button type="primary" onClick={() => setSubmitting(true)}>
          Record bid submitted
        </Button>
      ) : null}
      {edit && st === "SUBMITTED" ? (
        <>
          <Button type="primary" onClick={() => setMoving("WON")}>
            Record won
          </Button>
          <Button onClick={() => setMoving("LOST")}>Record lost</Button>
        </>
      ) : null}
      {t.canMakeProject ? (
        <Button type="primary" onClick={() => setMaking(true)}>
          Make the project
        </Button>
      ) : null}
      {t.projectId ? (
        <LinkButton
          href={`/projects/${t.projectId}`}
        >{`Open project ${t.projectCode ?? ""}`}</LinkButton>
      ) : null}
      {edit &&
      emdHeld &&
      st !== "WON" &&
      st !== "PREPARING" &&
      st !== "SUBMITTED" ? (
        <Button onClick={() => setReturning(true)}>Record EMD returned</Button>
      ) : null}
      {edit ? (
        <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
          Edit
        </Button>
      ) : null}
      {more.length ? (
        <Dropdown menu={{ items: more }} trigger={["click"]}>
          <Button icon={<MoreOutlined />} aria-label="More actions" />
        </Dropdown>
      ) : null}
    </Space>
  );

  const stat = (
    title: string,
    value: React.ReactNode,
    note?: React.ReactNode,
  ) => (
    <Col xs={12} lg={6}>
      <Card size="small" style={{ height: "100%" }}>
        <Statistic
          title={title}
          value={0}
          formatter={() => value}
          styles={{ content: { fontSize: token.fontSizeHeading4 } }}
        />
        {note ? (
          <div
            style={{
              fontSize: token.fontSizeSM,
              color: token.colorTextSecondary,
            }}
          >
            {note}
          </div>
        ) : null}
      </Card>
    </Col>
  );
  const us = t.bids.find((b) => b.us);
  const tot = t.totals;

  return (
    <div className="page-container">
      <PageHeader
        title={<span translate="no">{t.title}</span>}
        docTitle={`Tender ${t.tenderNo}`}
        crumbs={[{ title: "Tenders", href: "/tenders" }, { title: t.tenderNo }]}
        subtitle={
          <span>
            <TenderStatusTag status={st} />
            {preparing ? <DueTag days={t.daysToSubmit} /> : null}
            <span translate="no">
              {[t.tenderNo, t.nitNo, t.clientName].filter(Boolean).join(" · ")}
            </span>
          </span>
        }
        extra={actions}
      />
      <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
        {stat(
          "At SOR rates",
          money(tot.sorAmount),
          tot.sorAmount
            ? `${tot.itemCount} item${tot.itemCount === 1 ? "" : "s"}${t.sorBookName ? `, ${t.sorBookName}` : ""}`
            : t.estimatedValue
              ? "The estimate put to tender"
              : "Add the bid items",
        )}
        {stat(
          "Our quote",
          money(tot.quotedAmount),
          pctNote(tot.quotedPct) ??
            (t.bidType === "PERCENTAGE"
              ? "Enter the percentage on the SOR"
              : "Rate the items"),
        )}
        {stat(
          "Cost from the analysis",
          money(tot.costAmount),
          `${tot.analysedCount} of ${tot.itemCount} items analysed${tot.costPct ? `, ${pctNote(tot.costPct)}` : ""}`,
        )}
        {us && t.bids.length > 1
          ? stat(
              "At opening",
              <span>
                <RankTag rank={us.rank} /> {`of ${t.bids.length}`}
              </span>,
              us.rank > 1 ? (
                <span translate="no">{`L1 ${t.bids[0].bidderName} ${formatINR(t.bids[0].amount)}`}</span>
              ) : (
                "Lowest of the bids"
              ),
            )
          : stat(
              "Margin",
              tot.margin === null ? (
                "-"
              ) : (
                <Typography.Text
                  type={toNumber(tot.margin) < 0 ? "danger" : undefined}
                >
                  {money(tot.margin)}
                </Typography.Text>
              ),
              "Quote less cost and overheads",
            )}
      </Row>
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as Tab)}
        items={[
          {
            key: "boq",
            label: `Bid BOQ (${tot.itemCount})`,
            children: (
              <BoqTab
                tender={t}
                onOpen={(item) => setItemOpen({ item })}
                onAdd={() => setItemOpen({ item: null })}
                onImport={() => setImporting(true)}
              />
            ),
          },
          {
            key: "bids",
            label: `Bids at opening (${t.bids.length})`,
            children: <BidsTab tender={t} onAdd={() => setBidding(true)} />,
          },
          {
            key: "details",
            label: "Details",
            children: <DetailsTab tender={t} />,
          },
        ]}
      />
      <TenderForm open={editing} tender={t} onClose={() => setEditing(false)} />
      <SubmitDialog
        tender={t}
        open={submitting}
        onClose={() => setSubmitting(false)}
      />
      <StatusDialog
        tender={t}
        status={moving}
        onClose={() => setMoving(null)}
      />
      <BidDialog tender={t} open={bidding} onClose={() => setBidding(false)} />
      <EmdReturnedDialog
        tender={t}
        open={returning}
        onClose={() => setReturning(false)}
      />
      <MakeProjectDialog
        tender={t}
        open={making}
        onClose={() => setMaking(false)}
      />
      <BidBoqImport
        tender={t}
        open={importing}
        onClose={() => setImporting(false)}
      />
      <TenderItemDrawer
        open={!!itemOpen}
        tender={t}
        item={itemOpen?.item ?? null}
        onClose={() => setItemOpen(null)}
      />
      {deleteDialog}
    </div>
  );
}

/** The quote: on a percentage tender one percentage on the SOR, set here; on an item-rate tender the items' rates. */
function PricingCard({ tender }: { tender: TenderDetailDto }) {
  const { token } = theme.useToken();
  const notify = useNotify();
  const act = useTenderAction();
  const tot = tender.totals;
  const fixed = tender.status !== "PREPARING" || !tender.canEdit;
  const [pct, setPct] = useState<number | null>(
    tender.ownPct === null ? null : toNumber(tender.ownPct),
  );
  const savePct = async (v: number | null) => {
    await act.mutateAsync({
      method: "patch",
      path: `/tenders/${tender.id}`,
      body: { quotedPct: v },
    });
    notify.saved(
      v === null
        ? "Percentage cleared"
        : `Quoting ${sorPctLabel(v)}${Math.abs(v) < 0.005 ? "" : " the SOR"}`,
    );
  };
  const row = (
    label: string,
    value: React.ReactNode,
    note?: string | null,
    strong?: boolean,
  ) => (
    <Flex justify="space-between" gap={12} style={{ padding: "4px 0" }}>
      <span>{label}</span>
      <span
        style={{ textAlign: "right", fontWeight: strong ? 600 : undefined }}
      >
        {value}
        {note ? (
          <Typography.Text
            type="secondary"
            style={{
              display: "block",
              fontSize: token.fontSizeSM,
              fontWeight: 400,
            }}
          >
            {note}
          </Typography.Text>
        ) : null}
      </span>
    </Flex>
  );
  return (
    <Card
      size="small"
      title={
        <Typography.Title
          level={2}
          style={{ fontSize: token.fontSize, margin: 0 }}
        >
          Pricing
        </Typography.Title>
      }
      style={{ height: "100%" }}
    >
      {/* One column beside the items on a wide screen, several above them on a narrower one. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          columnGap: 32,
          alignItems: "start",
        }}
      >
        {row("At SOR rates", money(tot.sorAmount), tender.sorBookName)}
        {row("Direct cost", money(tot.costAmount), pctNote(tot.costPct))}
        {row(
          `Overheads ${toNumber(tender.overheadPct)}%`,
          money(tot.overheads),
        )}
        {row(`Profit ${toNumber(tender.profitPct)}%`, money(tot.profit))}
        {row(
          "Built-up value",
          money(tot.builtUpAmount),
          pctNote(tot.builtUpPct),
          true,
        )}
        {tender.bidType === "PERCENTAGE" && !fixed ? (
          <div style={{ padding: "4px 0 8px" }}>
            <label
              htmlFor="tender-pct"
              style={{ display: "block", marginBottom: 4 }}
            >
              Percentage on the SOR (minus for below)
            </label>
            <Space.Compact style={{ width: "100%" }}>
              <InputNumber
                id="tender-pct"
                value={pct}
                onChange={(v) => setPct(v)}
                min={-99}
                max={200}
                precision={2}
                step={0.5}
                suffix="%"
                style={{ width: "100%" }}
              />
              <Button
                type="primary"
                loading={act.isPending}
                disabled={
                  pct ===
                  (tender.ownPct === null ? null : toNumber(tender.ownPct))
                }
                onClick={() => void savePct(pct)}
              >
                Save
              </Button>
            </Space.Compact>
            <Typography.Text
              type="secondary"
              style={{ fontSize: token.fontSizeSM }}
            >
              {pct === null
                ? "Not set yet"
                : `Quoting ${sorPctLabel(pct)}${Math.abs(pct) < 0.005 ? "" : " the SOR"}`}
            </Typography.Text>
            {tot.builtUpPct !== null ? (
              <div>
                <Button
                  type="link"
                  size="small"
                  style={{ paddingInline: 0 }}
                  onClick={() => void savePct(toNumber(tot.builtUpPct))}
                >
                  {`Quote the built-up value (${sorPctLabel(tot.builtUpPct)})`}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {row(
          "Our quote",
          money(tot.quotedAmount),
          pctNote(tot.quotedPct) ?? TENDER_BID_TYPE_LABELS[tender.bidType],
          true,
        )}
        {row(
          "Margin",
          tot.margin === null ? (
            "-"
          ) : (
            <Typography.Text
              type={toNumber(tot.margin) < 0 ? "danger" : undefined}
            >
              {money(tot.margin)}
            </Typography.Text>
          ),
          "Quote less cost and overheads",
        )}
      </div>
    </Card>
  );
}

function BoqTab({
  tender,
  onOpen,
  onAdd,
  onImport,
}: {
  tender: TenderDetailDto;
  onOpen: (item: TenderItemDto) => void;
  onAdd: () => void;
  onImport: () => void;
}) {
  const { token } = theme.useToken();
  const notify = useNotify();
  const act = useTenderAction();
  const [askDelete, deleteDialog] = useConfirmDelete();
  const edit = tender.canEdit && tender.status === "PREPARING";
  const unanalysed = tender.items.filter((i) => !i.lines.length).length;
  const fillAll = async () => {
    const before = tender.totals.analysedCount;
    const t = await act.mutateAsync({ path: `/tenders/${tender.id}/library` });
    const n = t.totals.analysedCount - before;
    if (n)
      notify.saved(
        `Rate analysis filled for ${n} item${n === 1 ? "" : "s"} from the starter library: check them`,
      );
    else
      notify.success(
        "The starter library knows none of the items left without an analysis. Add their lines by hand.",
      );
  };
  return (
    <Row gutter={[12, 12]}>
      <Col xs={24} xxl={{ span: 17, order: 1 }} order={2}>
        <Card
          size="small"
          title={
            <Typography.Title
              level={2}
              style={{ fontSize: token.fontSize, margin: 0 }}
            >
              Items
            </Typography.Title>
          }
        >
          {edit ? (
            <Space wrap style={{ marginBottom: token.marginSM }}>
              <Button icon={<PlusOutlined />} onClick={onAdd}>
                Add item
              </Button>
              <Button icon={<UploadOutlined />} onClick={onImport}>
                Import from Excel
              </Button>
              {unanalysed ? (
                <Button
                  icon={<ThunderboltOutlined />}
                  loading={act.isPending}
                  onClick={() => void fillAll()}
                >
                  {`Fill ${unanalysed} rate analys${unanalysed === 1 ? "is" : "es"} from the library`}
                </Button>
              ) : null}
            </Space>
          ) : null}
          <Table<TenderItemDto>
            size="small"
            rowKey="id"
            dataSource={tender.items}
            pagination={
              tender.items.length > 50
                ? { pageSize: 50, showSizeChanger: false }
                : false
            }
            scroll={{ x: 1000 }}
            locale={{
              emptyText: edit
                ? "No bid item yet. Add the items, or import the client’s BOQ from Excel."
                : "No bid item.",
            }}
            columns={[
              {
                key: "no",
                title: "No.",
                width: 60,
                render: (_, i) => <span translate="no">{i.itemNo}</span>,
              },
              {
                key: "description",
                title: "Item",
                render: (_, i) => (
                  <div style={{ minWidth: 220 }}>
                    <Button
                      type="link"
                      onClick={() => onOpen(i)}
                      style={{
                        padding: 0,
                        height: "auto",
                        minHeight: 24,
                        whiteSpace: "normal",
                        textAlign: "left",
                      }}
                    >
                      {i.description}
                    </Button>
                    <Typography.Text
                      type="secondary"
                      style={{ display: "block", fontSize: token.fontSizeSM }}
                      translate="no"
                    >
                      {[
                        i.sorCode ? `SOR ${i.sorCode}` : null,
                        i.lines.length
                          ? `${i.lines.length} analysis lines`
                          : "No rate analysis",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Typography.Text>
                    {i.unpriced ? (
                      <Tag color="warning">{`${i.unpriced} line${i.unpriced === 1 ? "" : "s"} without a rate`}</Tag>
                    ) : null}
                  </div>
                ),
              },
              {
                key: "qty",
                title: "Qty",
                align: "right",
                width: 110,
                render: (_, i) => (
                  <span translate="no">{`${toNumber(i.qty).toLocaleString("en-IN")} ${i.unit}`}</span>
                ),
              },
              {
                key: "sor",
                title: "SOR rate",
                align: "right",
                width: 110,
                render: (_, i) => money(i.sorRate),
              },
              {
                key: "cost",
                title: "Cost a unit",
                align: "right",
                width: 110,
                render: (_, i) => money(i.cost),
              },
              {
                key: "built",
                title: "Built-up rate",
                align: "right",
                width: 120,
                render: (_, i) => money(i.builtUpRate),
              },
              {
                key: "quoted",
                title: "Quoted rate",
                align: "right",
                width: 120,
                render: (_, i) => money(i.quotedRate),
              },
              {
                key: "amount",
                title: "Amount",
                align: "right",
                width: 140,
                render: (_, i) => money(i.quotedAmount),
              },
              ...(edit
                ? [
                    {
                      key: "remove",
                      title: "",
                      width: 56,
                      render: (_: unknown, i: TenderItemDto) => (
                        <Button
                          type="text"
                          size="small"
                          icon={<DeleteOutlined />}
                          aria-label={`Remove item ${i.itemNo}`}
                          onClick={() =>
                            askDelete({
                              what: `item ${i.itemNo}`,
                              verb: "Remove",
                              description: "Its rate analysis goes with it.",
                              onConfirm: () =>
                                act.mutateAsync({
                                  method: "delete",
                                  path: `/tenders/${tender.id}/items/${i.id}`,
                                }),
                            })
                          }
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Card>
      </Col>
      <Col xs={24} xxl={{ span: 7, order: 2 }} order={1}>
        <PricingCard key={tender.ownPct ?? "none"} tender={tender} />
      </Col>
      {deleteDialog}
    </Row>
  );
}

function BidsTab({
  tender,
  onAdd,
}: {
  tender: TenderDetailDto;
  onAdd: () => void;
}) {
  const { token } = theme.useToken();
  const act = useTenderAction();
  const [askDelete, deleteDialog] = useConfirmDelete();
  const edit = tender.canEdit;
  return (
    <Card size="small">
      {edit &&
      tender.status !== "PREPARING" &&
      tender.status !== "DROPPED" &&
      tender.status !== "CANCELLED" ? (
        <Button
          icon={<PlusOutlined />}
          onClick={onAdd}
          style={{ marginBottom: token.marginSM }}
        >
          Record a bidder’s price
        </Button>
      ) : null}
      {tender.status === "PREPARING" ? (
        <Typography.Paragraph type="secondary">
          The bids read out at the opening are recorded here once our bid has
          gone in.
        </Typography.Paragraph>
      ) : null}
      <Table<TenderBidDto>
        size="small"
        rowKey={(b) => b.id ?? "us"}
        dataSource={tender.bids}
        pagination={false}
        scroll={{ x: 700 }}
        locale={{ emptyText: "No bid recorded yet." }}
        columns={[
          {
            key: "rank",
            title: "Rank",
            width: 80,
            render: (_, b) => (
              <Tag color={b.rank === 1 ? "success" : undefined}>
                {rankLabel(b.rank)}
              </Tag>
            ),
          },
          {
            key: "bidder",
            title: "Bidder",
            render: (_, b) => (
              <span translate="no">
                {b.bidderName}
                {b.us ? <Tag style={{ marginLeft: 8 }}>Us</Tag> : null}
              </span>
            ),
          },
          {
            key: "amount",
            title: "Amount",
            align: "right",
            width: 160,
            render: (_, b) => money(b.amount),
          },
          {
            key: "pct",
            title: "On the SOR",
            align: "right",
            width: 140,
            render: (_, b) => (b.pct === null ? "-" : sorPctLabel(b.pct)),
          },
          {
            key: "gap",
            title: "Against L1",
            align: "right",
            width: 140,
            render: (_, b) => {
              const l1 = toNumber(tender.bids[0]?.amount);
              const gap = toNumber(b.amount) - l1;
              return b.rank === 1 || !l1 ? (
                "-"
              ) : (
                <span translate="no">{`+${formatINR(gap)} (${((gap / l1) * 100).toFixed(2)}%)`}</span>
              );
            },
          },
          { key: "note", title: "Note", render: (_, b) => b.note ?? "" },
          ...(edit
            ? [
                {
                  key: "remove",
                  title: "",
                  width: 56,
                  render: (_: unknown, b: TenderBidDto) =>
                    b.id ? (
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        aria-label={`Remove the bid of ${b.bidderName}`}
                        onClick={() =>
                          askDelete({
                            what: `the bid of ${b.bidderName}`,
                            verb: "Remove",
                            onConfirm: () =>
                              act.mutateAsync({
                                method: "delete",
                                path: `/tenders/${tender.id}/bids/${b.id}`,
                              }),
                          })
                        }
                      />
                    ) : null,
                },
              ]
            : []),
        ]}
      />
      {tender.bids.length > 1 ? (
        <Typography.Paragraph
          type="secondary"
          style={{ marginTop: token.marginSM, marginBottom: 0 }}
        >
          Ranked lowest first. Bids of the same amount share a rank.
        </Typography.Paragraph>
      ) : null}
      {deleteDialog}
    </Card>
  );
}

function DetailsTab({ tender: t }: { tender: TenderDetailDto }) {
  const { token } = theme.useToken();
  const title = (s: string) => (
    <Typography.Title level={2} style={{ fontSize: token.fontSize, margin: 0 }}>
      {s}
    </Typography.Title>
  );
  return (
    <Row gutter={[12, 12]}>
      <Col xs={24} lg={14}>
        <Card size="small" title={title("Notice")} style={{ height: "100%" }}>
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2 }}
            items={[
              {
                key: "no",
                label: "Our number",
                children: <span translate="no">{t.tenderNo}</span>,
              },
              {
                key: "nit",
                label: "NIT number",
                children: <span translate="no">{t.nitNo ?? "-"}</span>,
              },
              {
                key: "client",
                label: "Client",
                children: <span translate="no">{t.clientName ?? "-"}</span>,
              },
              {
                key: "location",
                label: "Location",
                children: t.location ?? "-",
              },
              {
                key: "published",
                label: "Published on",
                children: formatDate(t.publishedOn),
              },
              {
                key: "submitBy",
                label: "Submit by",
                children: formatDate(t.submitBy),
              },
              {
                key: "submitted",
                label: "Submitted on",
                children: formatDate(t.submittedOn),
              },
              {
                key: "months",
                label: "Time for completion",
                children: t.completionMonths
                  ? `${t.completionMonths} months`
                  : "-",
              },
              {
                key: "estimate",
                label: "Estimate",
                children: money(t.estimatedValue),
              },
              { key: "fee", label: "Tender fee", children: money(t.tenderFee) },
              {
                key: "type",
                label: "Quoted as",
                children: TENDER_BID_TYPE_LABELS[t.bidType],
              },
              {
                key: "sor",
                label: "Schedule of rates",
                children: t.sorBookId ? (
                  <Link href={`/schedule-of-rates?book=${t.sorBookId}`}>
                    {t.sorBookName}
                  </Link>
                ) : (
                  "-"
                ),
              },
              {
                key: "oh",
                label: "Overheads and profit",
                children: `${toNumber(t.overheadPct)}% and ${toNumber(t.profitPct)}% on cost`,
              },
              ...(t.resultOn
                ? [
                    {
                      key: "result",
                      label: "Result on",
                      children: formatDate(t.resultOn),
                    },
                  ]
                : []),
              ...(t.resultNote
                ? [
                    {
                      key: "resultNote",
                      label: "Result",
                      span: 2,
                      children: t.resultNote,
                    },
                  ]
                : []),
              ...(t.projectId
                ? [
                    {
                      key: "project",
                      label: "Project",
                      children: (
                        <Link href={`/projects/${t.projectId}`}>
                          {t.projectCode}
                        </Link>
                      ),
                    },
                  ]
                : []),
              {
                key: "by",
                label: "Recorded by",
                children: `${t.createdByName}, ${formatDate(t.createdAt)}`,
              },
              ...(t.note
                ? [{ key: "note", label: "Note", span: 2, children: t.note }]
                : []),
            ]}
          />
        </Card>
      </Col>
      <Col xs={24} lg={10}>
        <Flex vertical gap={12}>
          <Card size="small" title={title("EMD")}>
            {t.emd ? (
              <Descriptions
                size="small"
                column={1}
                items={[
                  {
                    key: "ref",
                    label: "DD, BG or receipt",
                    children: <span translate="no">{t.emd.reference}</span>,
                  },
                  {
                    key: "amount",
                    label: "Amount",
                    children: money(t.emd.amount),
                  },
                  { key: "bank", label: "Bank", children: t.emd.issuer ?? "-" },
                  {
                    key: "valid",
                    label: "Valid until",
                    children: formatDate(t.emd.expiresOn),
                  },
                  {
                    key: "status",
                    label: "Status",
                    children: (
                      <span>
                        {COMPLIANCE_DOC_STATUS_LABELS[t.emd.status]}
                        {t.emd.status === "ACTIVE" ? ", with the client" : ""}
                      </span>
                    ),
                  },
                ]}
              />
            ) : (
              <Typography.Text type="secondary">
                No EMD recorded.
              </Typography.Text>
            )}
          </Card>
          <Card size="small" title={title("Documents")}>
            {t.attachments.length ? (
              <AttachmentGallery attachments={t.attachments} />
            ) : (
              <Typography.Text type="secondary">
                No document attached.
              </Typography.Text>
            )}
          </Card>
        </Flex>
      </Col>
    </Row>
  );
}
