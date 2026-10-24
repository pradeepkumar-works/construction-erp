"use client";

import React, { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Col,
  Row,
  Select,
  Statistic,
  Typography,
  theme,
} from "antd";
import { PlusOutlined } from "@/components/common/icons";
import {
  TENDER_STATUS_LABELS,
  canManageTenders,
  canViewTenders,
  rankLabel,
  sorPctLabel,
  type TenderDto,
} from "@erp/shared";
import { useAuth } from "@/lib/auth";
import { useTenders } from "@/lib/queries";
import { useListPage } from "@/lib/listPage";
import { useNewIntent } from "@/lib/new-intent";
import { formatDate, formatINR } from "@/lib/format";
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
  RankTag,
  TenderStatusTag,
} from "@/components/tenders/tenderUi";
import { TenderForm } from "@/components/tenders/TenderForm";

const KEYS = ["status"] as const;
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
 * The tender register (v6 item 110): tenders being priced (soonest due first), bids awaiting their result, and those won,
 * lost or not bid, with the year's count won and the EMD still with clients. Priced by admin, management and the QS;
 * project and accounts managers look on.
 */
function TendersPage() {
  const { token } = theme.useToken();
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
  const status = (page.filters.status as string | undefined) ?? "open";
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
      width: 320,
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
            style={{ display: "block", fontSize: token.fontSizeSM }}
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
          {r.clientName ?? "-"}
          {r.location ? (
            <Typography.Text
              type="secondary"
              style={{ display: "block", fontSize: token.fontSizeSM }}
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
              style={{ display: "block", fontSize: token.fontSizeSM }}
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
      align: "right",
      width: 140,
      defaultFrom: 1280,
      render: (_, r) => (
        <span translate="no">
          {r.estimatedValue ? formatINR(r.estimatedValue) : "-"}
        </span>
      ),
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
                style={{ display: "block", fontSize: token.fontSizeSM }}
              >
                {sorPctLabel(r.quotedPct)}
              </Typography.Text>
            ) : null}
          </div>
        ) : (
          "-"
        ),
    },
    {
      key: "rank",
      title: "At opening",
      width: 190,
      render: (_, r) =>
        r.rank ? (
          <div>
            <RankTag rank={r.rank} />
            {` of ${r.bidders}`}
            {r.rank > 1 && r.l1Amount ? (
              <Typography.Text
                type="secondary"
                style={{ display: "block", fontSize: token.fontSizeSM }}
                translate="no"
              >
                {`${rankLabel(1)} ${r.l1Name ?? ""} ${formatINR(r.l1Amount)}`}
              </Typography.Text>
            ) : null}
          </div>
        ) : (
          "-"
        ),
    },
    {
      key: "emd",
      title: "EMD",
      align: "right",
      width: 130,
      defaultFrom: 1280,
      render: (_, r) => (
        <span translate="no">{r.emdAmount ? formatINR(r.emdAmount) : "-"}</span>
      ),
    },
  ];
  const choice = useColumnChoice("tenders", columns);
  const rows = data?.items ?? [];
  const s = data?.summary;

  const newButton = canManage ? (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => setAdding(true)}
    >
      Record tender
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
        <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
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
            <span translate="no">{formatINR(s.emdOut)}</span>,
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
        >
          <Select
            aria-label="Tenders to show"
            style={{ width: 180 }}
            value={status}
            onChange={(v) =>
              page.setFilter("status", v === "open" ? undefined : v)
            }
            options={STATUS_OPTIONS}
          />
        </ListToolbar>
        <DataTable<TenderDto>
          columns={columns}
          visible={choice.visible}
          onChooseColumns={choice.setChosen}
          chosenIsDefault={choice.isDefault}
          rows={rows}
          loading={isLoading || isFetching}
          table={{ pagination: false }}
          onOpen={open}
          empty={{
            filtered: !!page.params.q || status !== "open",
            clear: () => page.clear(),
          }}
          failed={!!error}
          scrollX={1300}
          emptyText={
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
          }
          emptyAction={newButton}
        />
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
