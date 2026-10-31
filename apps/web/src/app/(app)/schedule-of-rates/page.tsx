"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Col, Dropdown, Empty, Flex, Form, Input, Row, Select, Space, Table, Typography, theme } from "antd";
import { AppTag } from "@/components/common/AppTag";
import type { MenuProps } from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  UploadOutlined,
} from "@/components/common/icons";
import {
  SOR_BOOK_KINDS,
  SOR_BOOK_KIND_LABELS,
  canManageTenders,
  canViewTenders,
  type SorBookDto,
  type SorBookKind,
  type SorItemDto,
} from "@erp/shared";
import { useAuth } from "@/lib/auth";
import { useNotify } from "@/lib/notify";
import { useSorBooks, useSorItems, useTenderAction } from "@/lib/queries";
import { formatDate, formatINR, toNumber } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { PageSkeleton, QueryError } from "@/components/common/QueryState";
import { useConfirmDelete } from "@/components/common/ConfirmDelete";
import {
  afterFormLeaves,
  FormGrid,
  FormShell,
} from "@/components/form/FormShell";
import { MoneyInput } from "@/components/form/inputs";
import { SorImport } from "@/components/tenders/TenderDialogs";

const PAGE_SIZE = 50;

/**
 * Schedules of rates (v6 item 110): the state SORs, the CPWD DSR and the company's own rates that tenders are priced
 * against, each imported from Excel and searched by code, chapter or words. Kept by admin, management and the QS.
 */
function ScheduleOfRatesPage() {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const canView = !!user && canViewTenders(user.roleKey);
  const canManage = !!user && canManageTenders(user.roleKey);
  const { data: books, isLoading, error, refetch } = useSorBooks(canView);
  const bookId = search?.get("book") ?? books?.[0]?.id;
  const book = books?.find((b) => b.id === bookId) ?? null;
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data: items, isFetching } = useSorItems(
    { bookId: book?.id, q: q || undefined, page, pageSize: PAGE_SIZE },
    canView,
  );
  const [bookForm, setBookForm] = useState<{ book: SorBookDto | null } | null>(
    null,
  );
  const [importing, setImporting] = useState(false);
  const [editItem, setEditItem] = useState<SorItemDto | null>(null);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const act = useTenderAction<unknown>();

  const pick = (id: string) => {
    setPage(1);
    router.replace(`${pathname}?book=${id}`, { scroll: false });
  };

  const newButton = canManage ? (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => setBookForm({ book: null })}
    >
      New schedule of rates
    </Button>
  ) : null;
  const more: MenuProps["items"] =
    canManage && book
      ? [
          {
            key: "edit",
            icon: <EditOutlined />,
            label: "Edit schedule",
            onClick: () => setBookForm({ book }),
          },
          {
            key: "delete",
            icon: <DeleteOutlined />,
            danger: true,
            disabled: book.tenderCount > 0,
            label: book.tenderCount
              ? `Delete (priced in ${book.tenderCount} tender${book.tenderCount === 1 ? "" : "s"})`
              : "Delete schedule",
            onClick: () =>
              askDelete({
                what: book.name,
                description: `Its ${book.itemCount} items go with it.`,
                onConfirm: () =>
                  act.mutateAsync({
                    method: "delete",
                    path: `/sor-books/${book.id}`,
                  }),
                onDone: () => router.replace(pathname),
              }),
          },
        ]
      : [];

  return (
    <div className="page-container">
      <PageHeader
        title="Schedule of rates"
        subtitle="The SORs and own rates tenders are priced against, imported from Excel."
        extra={newButton}
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? <PageSkeleton header={false} shape="list" /> : null}
      {books && !books.length ? (
        <Card size="small">
          <Empty description="No schedule of rates yet. Add the state SOR or the CPWD DSR your clients use, then import its items from Excel.">
            {newButton}
          </Empty>
        </Card>
      ) : null}
      {books?.length ? (
        <Row gutter={[12, 12]}>
          <Col xs={24} lg={7}>
            <Card
              size="small"
              title={
                <Typography.Title
                  level={2}
                  style={{ fontSize: token.fontSize, margin: 0 }}
                >
                  Schedules
                </Typography.Title>
              }
            >
              <Flex vertical gap={4} role="list">
                {books.map((b) => (
                  <div role="listitem" key={b.id}>
                    <Button
                      color={b.id === book?.id ? "primary" : "default"}
                      variant={b.id === book?.id ? "filled" : "text"}
                      block
                      aria-current={b.id === book?.id ? "true" : undefined}
                      onClick={() => pick(b.id)}
                      style={{
                        height: "auto",
                        minHeight: 44,
                        textAlign: "left",
                        justifyContent: "flex-start",
                        whiteSpace: "normal",
                        paddingBlock: 6,
                      }}
                    >
                      <span>
                        <span
                          translate="no"
                          style={{ display: "block", fontWeight: 500, color: token.colorText }}
                        >
                          {b.name}
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontSize: token.fontSizeSM,
                            color: token.colorTextSecondary,
                          }}
                        >
                          {`${SOR_BOOK_KIND_LABELS[b.kind]} · ${b.itemCount} item${b.itemCount === 1 ? "" : "s"}`}
                        </span>
                      </span>
                    </Button>
                  </div>
                ))}
              </Flex>
            </Card>
          </Col>
          <Col xs={24} lg={17}>
            {book ? (
              <Card
                size="small"
                title={
                  <div style={{ whiteSpace: "normal" }}>
                    <Typography.Title
                      level={2}
                      style={{ fontSize: token.fontSize, margin: 0 }}
                      translate="no"
                    >
                      {book.name}
                    </Typography.Title>
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: token.fontSizeSM, fontWeight: 400 }}
                    >
                      {[
                        SOR_BOOK_KIND_LABELS[book.kind],
                        book.edition,
                        book.region,
                        `updated ${formatDate(book.updatedAt.slice(0, 10))}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Typography.Text>
                  </div>
                }
              >
                {book.note ? (
                  <Typography.Paragraph type="secondary">
                    {book.note}
                  </Typography.Paragraph>
                ) : null}
                <Flex
                  wrap
                  gap={8}
                  align="center"
                  style={{ marginBottom: token.marginSM }}
                >
                  <Input.Search
                    allowClear
                    placeholder="Search code, chapter or words"
                    aria-label="Search the schedule"
                    onSearch={(v) => {
                      setQ(v.trim());
                      setPage(1);
                    }}
                    style={{ maxWidth: 360, flex: "1 1 220px" }}
                  />
                  {canManage ? (
                    <Space>
                      <Button
                        icon={<UploadOutlined />}
                        onClick={() => setImporting(true)}
                      >
                        Import from Excel
                      </Button>
                      <Dropdown menu={{ items: more }} trigger={["click"]}>
                        <Button
                          icon={<MoreOutlined />}
                          aria-label="More actions for the schedule"
                        />
                      </Dropdown>
                    </Space>
                  ) : null}
                </Flex>
                <Table<SorItemDto>
                  size="small"
                  rowKey="id"
                  loading={isFetching}
                  dataSource={items?.items ?? []}
                  scroll={{ x: 760 }}
                  locale={{
                    emptyText: q
                      ? "No item matches the search."
                      : canManage
                        ? "No item yet. Import the schedule from Excel."
                        : "No item yet.",
                  }}
                  pagination={
                    (items?.total ?? 0) > PAGE_SIZE
                      ? {
                          current: page,
                          pageSize: PAGE_SIZE,
                          total: items?.total,
                          showSizeChanger: false,
                          onChange: setPage,
                        }
                      : false
                  }
                  columns={[
                    {
                      key: "code",
                      title: "Code",
                      width: 90,
                      render: (_, i) => <span translate="no">{i.code}</span>,
                    },
                    {
                      key: "description",
                      title: "Description",
                      render: (_, i) => (
                        <div style={{ minWidth: 240 }}>
                          {i.description}
                          {i.chapter ? (
                            <div>
                              <AppTag style={{ marginTop: 2 }}>{i.chapter}</AppTag>
                            </div>
                          ) : null}
                        </div>
                      ),
                    },
                    {
                      key: "unit",
                      title: "Unit",
                      width: 80,
                      render: (_, i) => <span translate="no">{i.unit}</span>,
                    },
                    {
                      key: "rate",
                      title: "Rate",
                      align: "right",
                      width: 130,
                      render: (_, i) => (
                        <span translate="no">{formatINR(i.rate, true)}</span>
                      ),
                    },
                    ...(canManage
                      ? [
                          {
                            key: "actions",
                            title: "",
                            width: 56,
                            render: (_: unknown, i: SorItemDto) => (
                              <Dropdown
                                trigger={["click"]}
                                menu={{
                                  items: [
                                    {
                                      key: "edit",
                                      icon: <EditOutlined />,
                                      label: "Edit item",
                                      onClick: () => setEditItem(i),
                                    },
                                    {
                                      key: "delete",
                                      icon: <DeleteOutlined />,
                                      danger: true,
                                      label: "Delete item",
                                      onClick: () =>
                                        askDelete({
                                          what: `item ${i.code}`,
                                          description:
                                            "A bid already priced with it keeps its rate.",
                                          onConfirm: () =>
                                            act.mutateAsync({
                                              method: "delete",
                                              path: `/sor-items/${i.id}`,
                                            }),
                                        }),
                                    },
                                  ],
                                }}
                              >
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<MoreOutlined />}
                                  aria-label={`Actions for item ${i.code}`}
                                />
                              </Dropdown>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
                {items ? (
                  <Typography.Text
                    type="secondary"
                    style={{ fontSize: token.fontSizeSM }}
                  >
                    {`${items.total} item${items.total === 1 ? "" : "s"}${q ? " found" : ""}${book.tenderCount ? `; tenders priced against it: ${book.tenderCount}` : ""}`}
                  </Typography.Text>
                ) : null}
              </Card>
            ) : null}
          </Col>
        </Row>
      ) : null}
      <BookForm
        open={!!bookForm}
        book={bookForm?.book ?? null}
        onClose={() => setBookForm(null)}
        onSaved={pick}
      />
      <SorItemForm item={editItem} onClose={() => setEditItem(null)} />
      <SorImport
        book={book}
        open={importing}
        onClose={() => setImporting(false)}
      />
      {deleteDialog}
    </div>
  );
}

function BookForm({
  open,
  book,
  onClose,
  onSaved,
}: {
  open: boolean;
  book: SorBookDto | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form] = Form.useForm<{
    name: string;
    kind: SorBookKind;
    edition?: string;
    region?: string;
    note?: string;
  }>();
  const act = useTenderAction<SorBookDto>();
  const notify = useNotify();
  const saved = useRef<string | null>(null);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      book
        ? {
            name: book.name,
            kind: book.kind,
            edition: book.edition ?? undefined,
            region: book.region ?? undefined,
            note: book.note ?? undefined,
          }
        : { kind: "STATE" },
    );
  }, [open, book, form]);
  return (
    <FormShell
      open={open}
      onClose={() => {
        onClose();
        const id = saved.current;
        saved.current = null;
        if (id) afterFormLeaves(() => onSaved(id));
      }}
      form={form}
      layout="modal"
      projectDefault={false}
      title={book ? `Edit · ${book.name}` : "New schedule of rates"}
      okText="Save"
      onSubmit={async (v) => {
        const body = {
          name: v.name.trim(),
          kind: v.kind,
          edition: v.edition?.trim() || null,
          region: v.region?.trim() || null,
          note: v.note?.trim() || null,
        };
        const b = await act.mutateAsync(
          book
            ? { method: "patch", path: `/sor-books/${book.id}`, body }
            : { path: "/sor-books", body },
        );
        notify.saved(
          book
            ? `${b.name} saved`
            : `${b.name} added: import its items from Excel next`,
        );
        saved.current = b.id;
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="Name"
          rules={[
            {
              required: true,
              whitespace: true,
              message: "Name the schedule, e.g. Odisha SOR 2024-25",
            },
          ]}
        >
          <Input maxLength={120} placeholder="Odisha SOR 2024-25" />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item
            name="kind"
            label="Rates from"
            rules={[
              { required: true, message: "Choose where the rates come from" },
            ]}
          >
            <Select
              options={SOR_BOOK_KINDS.map((k) => ({
                value: k,
                label: SOR_BOOK_KIND_LABELS[k],
              }))}
            />
          </Form.Item>
          <Form.Item name="edition" label="Edition">
            <Input maxLength={40} placeholder="2024-25" />
          </Form.Item>
        </FormGrid>
        <Form.Item name="region" label="State or department">
          <Input maxLength={120} placeholder="Odisha, Works Department" />
        </Form.Item>
        <Form.Item name="note" label="Note">
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 4 }}
            maxLength={500}
            placeholder="With the corrigendum of June 2025"
          />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

function SorItemForm({
  item,
  onClose,
}: {
  item: SorItemDto | null;
  onClose: () => void;
}) {
  const [form] = Form.useForm<{
    description: string;
    unit: string;
    chapter?: string;
    rate: number;
  }>();
  const act = useTenderAction<SorItemDto>();
  const notify = useNotify();
  useEffect(() => {
    if (!item) return;
    form.resetFields();
    form.setFieldsValue({
      description: item.description,
      unit: item.unit,
      chapter: item.chapter ?? undefined,
      rate: toNumber(item.rate),
    });
  }, [item, form]);
  return (
    <FormShell
      open={!!item}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={`Edit item ${item?.code ?? ""}`}
      okText="Save"
      onSubmit={async (v) => {
        await act.mutateAsync({
          method: "patch",
          path: `/sor-items/${item!.id}`,
          body: {
            description: v.description.trim(),
            unit: v.unit.trim(),
            chapter: v.chapter?.trim() || null,
            rate: v.rate,
          },
        });
        notify.saved(`Item ${item!.code} saved`);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="description"
          label="Description"
          rules={[
            { required: true, whitespace: true, message: "Describe the item" },
          ]}
        >
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 6 }}
            maxLength={2000}
          />
        </Form.Item>
        <FormGrid cols={3}>
          <Form.Item name="chapter" label="Chapter">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item
            name="unit"
            label="Unit"
            rules={[
              {
                required: true,
                whitespace: true,
                message: "Enter the unit, e.g. Cum",
              },
            ]}
          >
            <Input maxLength={20} />
          </Form.Item>
          <Form.Item
            name="rate"
            label="Rate"
            rules={[
              { required: true, message: "Enter the rate, zero or more" },
            ]}
          >
            <MoneyInput />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ScheduleOfRatesPage />
    </Suspense>
  );
}
