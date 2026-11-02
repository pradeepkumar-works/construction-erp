"use client";

import React, { Suspense, useState } from "react";
import { tk } from '@/ds';
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Col,
  Row,
  Select,
  Statistic,
  Typography,
} from "antd";
import { PlusOutlined } from "@/components/common/icons";
import {
  TENDER_STATUS_LABELS,
  canManageTenders,
  canViewTenders,
  rankLabel,
  sorPctLabel,
  type ListViewKind,
  type TenderDto,
} from "@erp/shared";
import { useAuth } from "@/lib/auth";
import { useTenders } from "@/lib/queries";
import { useListPage } from "@/lib/listPage";
import { useNewIntent } from "@/lib/new-intent";
import { formatDate, formatINR, NO_VALUE } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { PageSkeleton, QueryError } from "@/components/common/QueryState";
import { ListToolbar } from "@/components/common/ListToolbar";
import { EmptyArt } from "@/components/common/EmptyArt";
import {
  DataTable,
  useColumnChoice,
  type ListColumn,
} from "@/components/list/DataTable";
import { RecordLink } from "@/components/record/RecordLink";
import {
  DueTag,
  RankText,
  TenderStatusTag,
} from "@/components/tenders/tenderUi";
import { TenderForm } from "@/components/tenders/TenderForm";
import { TenderBoard } from "@/components/tenders/TenderBoard";
import { ViewToggle } from "@/components/list/ListViewsOfData";
import { Money } from '@/components/common/Money';

const KEYS = ["status", "view"] as const;
/** The register opens on its board: where each bid stands, and the rupees at each stage. */
const VIEW_KINDS: readonly ListViewKind[] = ["board", "table"];
const STATUS_OPTIONS = [
  { value: "open", label: "Open tenders" },
  { value: "PREPARING", label: TENDER_STATUS_LABELS.PREPARING },
  { value: "SUBMITTED", label: "Awaiting the result" },
  { value: "closed", label: "Closed tenders" },
  { value: "WON", label: TENDER_STATUS_LABELS.WON },
  { value: "LOST", label: TENDER_STATUS_LABELS.LOST },
  { value: "all", label: "All tenders" },
];

/**
 * The tender register: tenders being priced (soonest due first), bids awaiting their result, and those won,
 * lost or not bid, with the year's count won and the EMD still with clients. Priced by admin, management and the QS;
 * project and accounts managers look on.
 */
function TendersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const canView = !!user && canViewTenders(user.roleKey);
  const canManage = !!user && canManageTenders(user.roleKey);
  const [adding, setAdding] = useState(false);
  useNewIntent("tender", canManage, () => setAdding(true));
  const page = useListPage<"submitBy">({
    keys: KEYS,
    sortBy: "submitBy",
    sortOrder: "asc",
  });
  const view: ListViewKind =
    page.filters.view === "table" ? "table" : "board";
  const setView = (v: ListViewKind) =>
    page.setFilter("view", v === VIEW_KINDS[0] ? undefined : v);
  // The board lays out every stage, decided ones too; the table opens on the tenders still open.
  const defaultStatus = view === "board" ? "all" : "open";
  const status = (page.filters.status as string | undefined) ?? defaultStatus;
  // Clearing the filters keeps the view: Board stays Board.
  const empty = {
    filtered: !!page.params.q || status !== defaultStatus,
    clear: () =>
      page.setFilters(page.filters.view ? { view: page.filters.view } : {}),
  };
  const { data, isLoading, isFetching, error, refetch } = useTenders(
    { status, q: page.params.q },
    canView,
  );
  const open = (id: string) => router.push(`/tenders/${id}`);

  const columns: ListColumn<TenderDto>[] = [
    {
      key: "tender",
      title: "Tender",
      locked: true,
      width: 280,
      render: (_, r) => (
        <div>
          <RecordLink
            href={`/tenders/${r.id}`}
            onOpen={() => open(r.id)}
            strong
          >
            {r.title}
          </RecordLink>
          <Typography.Text
            type="secondary"
            style={{ display: "block", fontSize: tk.type.caption.fontSize }}
            translate="no"
          >
            {[r.tenderNo, r.nitNo].filter(Boolean).join(" · ")}
          </Typography.Text>
        </div>
      ),
    },
    {
      key: "client",
      title: "Client",
      width: 200,
      render: (_, r) => (
        <div translate="no">
          {r.clientName ?? NO_VALUE}
          {r.location ? (
            <Typography.Text
              type="secondary"
              style={{ display: "block", fontSize: tk.type.caption.fontSize }}
            >
              {r.location}
            </Typography.Text>
          ) : null}
        </div>
      ),
    },
    {
      key: "submitBy",
      title: "Submit by",
      width: 150,
      render: (_, r) => (
        <div>
          <span translate="no">{formatDate(r.submittedOn ?? r.submitBy)}</span>
          {r.status === "PREPARING" ? (
            <div>
              <DueTag days={r.daysToSubmit} />
            </div>
          ) : r.submittedOn ? (
            <Typography.Text
              type="secondary"
              style={{ display: "block", fontSize: tk.type.caption.fontSize }}
            >
              Submitted
            </Typography.Text>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      title: "Status",
      width: 120,
      render: (_, r) => <TenderStatusTag status={r.status} />,
    },
    {
      key: "estimate",
      title: "Estimate",
      kind: "money",
      value: (r) => r.estimatedValue || null,
      width: 140,
      defaultFrom: 1280,
    },
    {
      key: "quoted",
      title: "Our quote",
      align: "right",
      width: 160,
      render: (_, r) =>
        r.quotedAmount ? (
          <div translate="no">
            {formatINR(r.quotedAmount)}
            {r.quotedPct !== null ? (
              <Typography.Text
                type="secondary"
                style={{ display: "block", fontSize: tk.type.caption.fontSize }}
              >
                {sorPctLabel(r.quotedPct)}
              </Typography.Text>
            ) : null}
          </div>
        ) : (
          NO_VALUE
        ),
    },
    {
      key: "rank",
      title: "At opening",
      width: 190,
      render: (_, r) =>
        r.rank ? (
          <div>
            <RankText rank={r.rank} />
            {` of ${r.bidders}`}
            {r.rank > 1 && r.l1Amount ? (
              <Typography.Text
                type="secondary"
                style={{ display: "block", fontSize: tk.type.caption.fontSize }}
                translate="no"
              >
                {`${rankLabel(1)} ${r.l1Name ?? ""} ${formatINR(r.l1Amount)}`}
              </Typography.Text>
            ) : null}
          </div>
        ) : (
          NO_VALUE
        ),
    },
    {
      key: "emd",
      title: "EMD",
      kind: "money",
      value: (r) => r.emdAmount || null,
      width: 130,
      defaultFrom: 1280,
    },
  ];
  const choice = useColumnChoice("tenders", columns);
  const rows = data?.items ?? [];
  const s = data?.summary;

  const emptyText = (
    <EmptyArt
      art="entries"
      title={
        page.params.q
          ? "No tender matches the search"
          : status === "open"
            ? "No open tender"
            : "No tender here yet"
      }
    />
  );
  const newButton = canManage ? (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => setAdding(true)}
    >
      New tender
    </Button>
  ) : null;
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
          styles={{ content: { fontSize: tk.type.lead.fontSize } }}
        />
        {note ? (
          <div
            style={{
              fontSize: tk.type.caption.fontSize,
              color: tk.color.text.muted,
            }}
          >
            {note}
          </div>
        ) : null}
      </Card>
    </Col>
  );

  return (
    <div className="page-container">
      <PageHeader
        title="Tenders"
        subtitle="Tenders being priced and bid, the bids read out at opening, and the result."
        extra={newButton}
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? <PageSkeleton header={false} shape="list" /> : null}
      {s ? (
        <Row gutter={[12, 12]} style={{ marginBottom: tk.space[5] }}>
          {stat(
            "Being prepared",
            s.preparing,
            s.dueThisWeek
              ? `${s.dueThisWeek} due in the next 7 days`
              : "None due this week",
          )}
          {stat(
            "Awaiting the result",
            s.awaitingResult,
            "Bids submitted, not yet opened or decided",
          )}
          {stat(
            "Won this year",
            `${s.wonCount} of ${s.wonCount + s.lostCount}`,
            <span translate="no">{`${formatINR(s.wonValue)} since 1 April`}</span>,
          )}
          {stat(
            "EMD with clients",
            <Money value={s.emdOut} />,
            "On tenders not won, to come back",
          )}
        </Row>
      ) : null}
      <Card size="small">
        <ListToolbar
          onProject={() => undefined}
          hideProject
          search={page.search}
          onSearch={page.setSearch}
          searchPlaceholder="Search name of work, number, NIT or client"
          searchLabel="Search tenders"
          view={<ViewToggle kinds={VIEW_KINDS} value={view} onChange={setView} />}
        >
          <Select
            aria-label="Tenders to show"
            style={{ width: 180 }}
            value={status}
            onChange={(v) =>
              page.setFilter("status", v === defaultStatus ? undefined : v)
            }
            options={STATUS_OPTIONS}
          />
        </ListToolbar>
        {view === "board" ? (
          <TenderBoard
            rows={rows}
            loading={isLoading}
            failed={!!error}
            onOpen={open}
            empty={empty}
            emptyText={emptyText}
            emptyAction={newButton}
          />
        ) : (
          <DataTable<TenderDto>
            columns={columns}
            visible={choice.visible}
            onChooseColumns={choice.setChosen}
            chosenIsDefault={choice.isDefault}
            rows={rows}
            loading={isLoading || isFetching}
            table={{ pagination: false }}
            onOpen={open}
            empty={empty}
            failed={!!error}
            emptyText={emptyText}
            emptyAction={newButton}
          />
        )}
      </Card>
      <TenderForm
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(id) => router.push(`/tenders/${id}`)}
      />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TendersPage />
    </Suspense>
  );
}
