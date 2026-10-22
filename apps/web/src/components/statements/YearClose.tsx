"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { FormInstance } from "antd";
import { LockOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type {
  BooksYearDto,
  FinancialYearDto,
  OpeningLineDto,
} from "@erp/shared";
import { ACCOUNT_GROUP_LABELS, ACCOUNT_GROUP_NATURE } from "@erp/shared";
import { useBooksAction, useBooksYear, useLedgerAccounts } from "@/lib/queries";
import { errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import { PageSkeleton, QueryError } from "@/components/common/QueryState";
import { FormShell } from "@/components/form/FormShell";
import { LineTable } from "@/components/form/LineTable";
import { MoneyInput } from "@/components/form/inputs";
import { Amount } from "@/components/books/booksUi";
import { Signed } from "./statementsUi";

interface OpeningValues {
  booksFrom: dayjs.Dayjs;
  lines: {
    accountId?: string;
    debit?: number | null;
    credit?: number | null;
  }[];
}

const total = (
  lines: OpeningValues["lines"] | undefined,
  k: "debit" | "credit",
) =>
  Math.round(
    (lines ?? []).reduce((s, l) => s + (Number(l?.[k]) || 0), 0) * 100,
  ) / 100;

function OpeningTotals({ form }: { form: FormInstance<OpeningValues> }) {
  const lines = Form.useWatch("lines", form);
  const dr = total(lines, "debit");
  const cr = total(lines, "credit");
  const diff = Math.round((dr - cr) * 100) / 100;
  return (
    <Typography.Text type={diff ? "warning" : "secondary"} translate="no">
      {`Debit ${formatINR(dr, true)} · Credit ${formatINR(cr, true)}`}
      {diff
        ? ` · ${formatINR(Math.abs(diff), true)} goes to Difference in opening balances`
        : ""}
    </Typography.Text>
  );
}

/** The day the books begin and the balances brought in from the old books, as on the day before. */
function OpeningForm({
  open,
  onClose,
  year,
}: {
  open: boolean;
  onClose: () => void;
  year: BooksYearDto;
}) {
  const [form] = Form.useForm<OpeningValues>();
  const { message } = App.useApp();
  const save = useBooksAction<BooksYearDto>();
  const { data: accounts } = useLedgerAccounts({}, open);
  useEffect(() => {
    if (open)
      form.setFieldsValue({
        booksFrom: year.booksFrom
          ? dayjs(year.booksFrom)
          : dayjs(
              `${dayjs().month() >= 3 ? dayjs().year() : dayjs().year() - 1}-04-01`,
            ),
        lines: year.opening.length
          ? year.opening.map((l) => ({
              accountId: l.accountId,
              debit: l.debit ? Number(l.debit) : null,
              credit: l.credit ? Number(l.credit) : null,
            }))
          : [{}, {}],
      });
  }, [open, year, form]);
  const options = (accounts ?? [])
    .filter(
      (a) =>
        ACCOUNT_GROUP_NATURE[a.group] === "ASSET" ||
        ACCOUNT_GROUP_NATURE[a.group] === "LIABILITY",
    )
    .filter((a) => a.key !== "OPENING_DIFFERENCE")
    .map((a) => ({
      value: a.id,
      label: a.name,
      title: ACCOUNT_GROUP_LABELS[a.group],
    }));
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={820}
      projectDefault={false}
      title="Opening balances"
      okText="Save opening balances"
      footerExtra={<OpeningTotals form={form} />}
      onSubmit={async (v) => {
        await save.mutateAsync({
          method: "put",
          path: "/statements/opening",
          body: {
            booksFrom: v.booksFrom.format("YYYY-MM-DD"),
            lines: (v.lines ?? [])
              .filter((l) => l.accountId)
              .map((l) => ({
                accountId: l.accountId,
                debit: l.debit || null,
                credit: l.credit || null,
              })),
          },
        });
        message.success(
          `The books begin on ${v.booksFrom.format("D MMM YYYY")}; opening balances saved`,
        );
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="booksFrom"
          label="The books begin on"
          rules={[
            { required: true, message: "Choose the day the books begin" },
          ]}
          extra="Usually 1 April. Bills, payments and other records before this day stay out of the books: the balances below stand for them."
        >
          <DatePicker
            format="DD MMM YYYY"
            style={{ width: 220 }}
            disabledDate={(d) => d.isAfter(dayjs(), "day")}
          />
        </Form.Item>
        <Typography.Paragraph type="secondary">
          Each asset and liability as your old books (or Tally) show it the day
          before: bank and cash, fixed assets, loans, capital and reserves, and
          what each vendor and client owed. Income and expenses start at
          nothing.
        </Typography.Paragraph>
        <LineTable
          name="lines"
          label="Balance"
          addText="Add an account"
          newLine={() => ({})}
          columns={[
            {
              key: "account",
              title: "Account",
              render: (field) => (
                <Form.Item
                  name={[field.name, "accountId"]}
                  rules={[{ required: true, message: "Choose the account" }]}
                  noStyle
                >
                  <Select
                    aria-label="Account"
                    showSearch={{ optionFilterProp: "label" }}
                    options={options}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              ),
            },
            {
              key: "debit",
              title: "Debit",
              width: 170,
              align: "right",
              render: (field) => (
                <Form.Item name={[field.name, "debit"]} noStyle>
                  <MoneyInput aria-label="Debit" />
                </Form.Item>
              ),
            },
            {
              key: "credit",
              title: "Credit",
              width: 170,
              align: "right",
              render: (field) => (
                <Form.Item name={[field.name, "credit"]} noStyle>
                  <MoneyInput aria-label="Credit" />
                </Form.Item>
              ),
            },
          ]}
        />
      </Form>
    </FormShell>
  );
}

/** Lock the books up to a day, or take the lock off. */
function LockForm({
  open,
  onClose,
  year,
}: {
  open: boolean;
  onClose: () => void;
  year: BooksYearDto;
}) {
  const [form] = Form.useForm<{ lockedUpTo?: dayjs.Dayjs | null }>();
  const { message } = App.useApp();
  const save = useBooksAction<BooksYearDto>();
  useEffect(() => {
    if (open)
      form.setFieldsValue({
        lockedUpTo: year.lockedUpTo ? dayjs(year.lockedUpTo) : null,
      });
  }, [open, year, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      projectDefault={false}
      title="Lock the books"
      okText="Save the lock"
      onSubmit={async (v) => {
        const r = await save.mutateAsync({
          method: "put",
          path: "/statements/lock",
          body: {
            lockedUpTo: v.lockedUpTo ? v.lockedUpTo.format("YYYY-MM-DD") : null,
          },
        });
        message.success(
          r.lockedUpTo
            ? `Books locked up to ${formatDate(r.lockedUpTo)}`
            : "The lock is off",
        );
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="lockedUpTo"
          label="Locked up to"
          extra="Nothing dated on or before this day can be posted, changed or cancelled, from the modules or by hand. Leave empty to take the lock off."
        >
          <DatePicker
            format="DD MMM YYYY"
            style={{ width: 220 }}
            disabledDate={(d) => d.isAfter(dayjs(), "day")}
          />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** The day the books begin with the opening balances, the lock, and each financial year with its close. */
export function YearClose() {
  const { message, modal } = App.useApp();
  const { data, isLoading, error, refetch } = useBooksYear();
  const act = useBooksAction<BooksYearDto>();
  const [editing, setEditing] = useState(false);
  const [locking, setLocking] = useState(false);
  if (error) return <QueryError error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <PageSkeleton shape="list" header={false} />;
  const decide = (y: FinancialYearDto, close: boolean) =>
    modal.confirm({
      title: close ? `Close ${y.code}?` : `Reopen ${y.code}?`,
      content: close
        ? `Income and expenses of ${y.code} go to the profit and loss account (${Number(y.profit) < 0 ? "a loss" : "profit"} of ${formatINR(Math.abs(Number(y.profit)), true)}) and the books are locked up to ${formatDate(y.to)}. You can reopen it later.`
        : `The closing entry is taken out and the lock moves back to ${formatDate(dayjs(y.from).subtract(1, "day").format("YYYY-MM-DD"))}, so ${y.code} can change again.`,
      okText: close ? "Close the year" : "Reopen the year",
      onOk: async () => {
        try {
          await act.mutateAsync({
            path: `/statements/years/${y.code}/${close ? "close" : "reopen"}`,
          });
          message.success(close ? `${y.code} closed` : `${y.code} reopened`);
        } catch (e) {
          message.error(errorMessage(e));
        }
      },
    });
  const diff =
    Math.round((Number(data.openingDebit) - Number(data.openingCredit)) * 100) /
    100;
  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <Card
        size="small"
        title="Opening balances"
        extra={
          data.canChangeOpening ? (
            <Button size="small" onClick={() => setEditing(true)}>
              {data.booksFrom ? "Change" : "Enter opening balances"}
            </Button>
          ) : null
        }
      >
        <Typography.Paragraph>
          {data.booksFrom
            ? `The books begin on ${formatDate(data.booksFrom)}, with the balances below brought in as on the day before. Records in the modules before that day stay out of the books.`
            : "The books take in every record in the modules. To begin from a day (usually 1 April) with the balances from your old books, enter the opening balances."}
        </Typography.Paragraph>
        {data.opening.length > 0 && (
          <Table<OpeningLineDto>
            rowKey="accountId"
            size="small"
            dataSource={data.opening}
            pagination={false}
            scroll={{ x: 640 }}
            columns={[
              {
                title: "Account",
                dataIndex: "name",
                render: (n: string) => <span translate="no">{n}</span>,
              },
              {
                title: "Group",
                dataIndex: "group",
                width: 200,
                render: (g: OpeningLineDto["group"]) => ACCOUNT_GROUP_LABELS[g],
              },
              {
                title: "Debit",
                dataIndex: "debit",
                align: "right",
                width: 160,
                render: (x: string | null) => <Amount value={x} />,
              },
              {
                title: "Credit",
                dataIndex: "credit",
                align: "right",
                width: 160,
                render: (x: string | null) => <Amount value={x} />,
              },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>
                  <Typography.Text strong>
                    {diff
                      ? `Total (${formatINR(Math.abs(diff), true)} in Difference in opening balances)`
                      : "Total"}
                  </Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <Typography.Text strong>
                    <Amount value={data.openingDebit} />
                  </Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <Typography.Text strong>
                    <Amount value={data.openingCredit} />
                  </Typography.Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        )}
        {!data.canChangeOpening && data.booksFrom && (
          <Typography.Text type="secondary">
            The opening balances are in the locked period, so they cannot
            change.
          </Typography.Text>
        )}
      </Card>

      <Card
        size="small"
        title="Lock"
        extra={
          data.canLock ? (
            <Button
              size="small"
              icon={<LockOutlined />}
              onClick={() => setLocking(true)}
            >
              {data.lockedUpTo ? "Move the lock" : "Lock the books"}
            </Button>
          ) : null
        }
      >
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          {data.lockedUpTo
            ? `The books are locked up to ${formatDate(data.lockedUpTo)}: nothing dated on or before it posts, changes or is cancelled. Records changed in the modules after that wait in the day book until the lock moves.`
            : "The books are not locked. Lock them up to the last day you filed returns for, so nothing before it changes."}
          {!data.canLock && " Management or an admin moves the lock."}
        </Typography.Paragraph>
      </Card>

      <Card size="small" title="Financial years">
        <Table<FinancialYearDto>
          rowKey="code"
          size="small"
          dataSource={data.years}
          pagination={false}
          scroll={{ x: 760 }}
          columns={[
            {
              title: "Year",
              dataIndex: "code",
              width: 110,
              render: (c: string) => <span translate="no">{c}</span>,
            },
            {
              title: "Period",
              key: "period",
              width: 220,
              render: (_, y) => `${formatDate(y.from)} to ${formatDate(y.to)}`,
            },
            {
              title: "Profit (loss)",
              dataIndex: "profit",
              align: "right",
              width: 170,
              render: (x: string) => <Signed value={x} />,
            },
            {
              title: "Status",
              key: "status",
              render: (_, y) =>
                y.closed ? (
                  <Space size={4} wrap>
                    <Tag color="success">Closed</Tag>
                    <Typography.Text type="secondary">{`${y.closedByName ?? ""}${y.closedAt ? `, ${formatDateTime(y.closedAt)}` : ""}`}</Typography.Text>
                  </Space>
                ) : (
                  <Space orientation="vertical" size={0}>
                    <Tag>Open</Tag>
                    {y.blockers.map((b) => (
                      <Typography.Text key={b} type="secondary">
                        {b}
                      </Typography.Text>
                    ))}
                  </Space>
                ),
            },
            {
              title: "",
              key: "act",
              width: 150,
              render: (_, y) =>
                y.canClose ? (
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => decide(y, true)}
                  >
                    Close the year
                  </Button>
                ) : y.canReopen ? (
                  <Button size="small" onClick={() => decide(y, false)}>
                    Reopen
                  </Button>
                ) : null,
            },
          ]}
        />
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 12 }}
          title="Closing a year"
          description="Closing empties the year's income and expenses into the Profit & Loss A/c under reserves and locks the books up to 31 March. The statements still show the year's own figures; balances carry forward on their own."
        />
      </Card>
      <OpeningForm
        open={editing}
        onClose={() => setEditing(false)}
        year={data}
      />
      <LockForm open={locking} onClose={() => setLocking(false)} year={data} />
    </div>
  );
}
