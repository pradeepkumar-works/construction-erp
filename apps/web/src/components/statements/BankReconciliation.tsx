"use client";

import React, { useMemo, useState } from "react";
import { Alert, App, Button, DatePicker, Descriptions, Form, Modal, Segmented, Select, Space, Table, Typography, Upload } from "antd";
import { AppTag } from "@/components/common/AppTag";
import type { UploadProps } from "antd";
import { SyncOutlined, UploadOutlined } from "@/components/common/icons";
import dayjs from "dayjs";
import type {
  BankBookLineDto,
  BankImportResultDto,
  BankReconciliationDto,
  BankStatementLineDto,
} from "@erp/shared";
import {
  useBankReconciliation,
  useBooksAction,
  useLedgerAccounts,
} from "@/lib/queries";
import { errorMessage } from "@/lib/api";
import { formatDate, formatINR } from "@/lib/format";
import { loadXlsx } from "@/lib/exportExcel";
import { QueryError } from "@/components/common/QueryState";
import { FormShell } from "@/components/form/FormShell";
import { Amount, Balance } from "@/components/books/booksUi";
import {
  VoucherForm,
  type VoucherPrefill,
} from "@/components/books/VoucherForm";
import { day } from "./statementsUi";

/** The statement file's cells, row by row: Excel dates as YYYY-MM-DD, CSV kept as the bank wrote it. */
async function readCells(f: File): Promise<unknown[][]> {
  const XLSX = await loadXlsx();
  const buf = await f.arrayBuffer();
  const wb = /\.(xlsx|xls)$/i.test(f.name)
    ? XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true })
    : XLSX.read(new TextDecoder().decode(buf), { type: "string", raw: true });
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    raw: false,
    dateNF: "yyyy-mm-dd",
    defval: "",
  });
}

function ImportStatement({
  open,
  onClose,
  accountId,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  accountId?: string;
  accounts: { value: string; label: string }[];
}) {
  const [form] = Form.useForm<{ accountId: string }>();
  const { message } = App.useApp();
  const act = useBooksAction<BankImportResultDto & { problems: string[] }>();
  const [file, setFile] = useState<{ name: string; cells: unknown[][] } | null>(
    null,
  );
  const [readError, setReadError] = useState<string | null>(null);
  const beforeUpload: UploadProps["beforeUpload"] = (f) => {
    setReadError(null);
    readCells(f)
      .then((cells) => setFile({ name: f.name, cells }))
      .catch(() =>
        setReadError(
          "The file could not be read. Save it as Excel or CSV and try again.",
        ),
      );
    return false;
  };
  return (
    <FormShell
      open={open}
      onClose={() => {
        setFile(null);
        onClose();
      }}
      form={form}
      layout="modal"
      width={600}
      projectDefault={false}
      title="Import a bank statement"
      okText="Import and match"
      onSubmit={async (v) => {
        if (!file) throw new Error("Choose the statement file");
        const r = await act.mutateAsync({
          path: "/statements/bank/import",
          body: { accountId: v.accountId, cells: file.cells },
        });
        const text = `${r.added} ${r.added === 1 ? "line" : "lines"} added${r.skipped ? ` (${r.skipped} already in)` : ""}, ${r.matched} matched to the books`;
        if (r.problems.length)
          message.warning(
            `${text}. ${r.problems.length === 1 ? "1 row" : `${r.problems.length} rows`} left out: ${r.problems[0]}`,
            10,
          );
        else message.success(text);
        setFile(null);
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ accountId }}>
        <Form.Item
          name="accountId"
          label="Bank account"
          rules={[{ required: true, message: "Choose the bank account" }]}
        >
          <Select
            options={accounts}
            showSearch={{ optionFilterProp: "label" }}
          />
        </Form.Item>
        <Form.Item
          label="Statement file"
          required
          extra="The statement as the bank gives it, CSV or Excel. Importing the same file again adds nothing."
        >
          <Upload.Dragger
            accept=".csv,.xlsx,.xls,.txt"
            beforeUpload={beforeUpload}
            showUploadList={false}
            maxCount={1}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p>
              {file
                ? `${file.name}: ${file.cells.length} rows`
                : "Drop the file here, or click to choose it"}
            </p>
          </Upload.Dragger>
        </Form.Item>
        {readError && <Alert type="error" showIcon title={readError} />}
      </Form>
    </FormShell>
  );
}

/** Pick the bank book entry a statement line is: same side, not yet matched, nearest amount and day first. */
function MatchPicker({
  line,
  book,
  onClose,
}: {
  line: BankStatementLineDto | null;
  book: BankBookLineDto[];
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const act = useBooksAction();
  const [picked, setPicked] = useState<string | null>(null);
  const candidates = useMemo(() => {
    if (!line) return [];
    const amount = Number(line.deposit ?? line.withdrawal);
    return book
      .filter(
        (b) => !b.statementLineId && (line.deposit ? b.deposit : b.withdrawal),
      )
      .map((b) => ({
        ...b,
        gap: Math.abs(Number(line.deposit ? b.deposit : b.withdrawal) - amount),
        days: Math.abs(dayjs(b.date).diff(dayjs(line.date), "day")),
      }))
      .sort((a, b) => a.gap - b.gap || a.days - b.days);
  }, [line, book]);
  return (
    <Modal
      open={!!line}
      title={
        line
          ? `Match ${formatINR(line.deposit ?? line.withdrawal, true)} ${line.deposit ? "received" : "paid"} on ${formatDate(line.date)}`
          : ""
      }
      okText="Match"
      okButtonProps={{ disabled: !picked, loading: act.isPending }}
      onCancel={() => (setPicked(null), onClose())}
      onOk={async () => {
        try {
          await act.mutateAsync({
            path: "/statements/bank/match",
            body: { statementLineId: line!.id, bookLineId: picked },
          });
          message.success("Matched");
          setPicked(null);
          onClose();
        } catch (e) {
          message.error(errorMessage(e));
        }
      }}
      width={760}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary" translate="no">
        {line?.description}
      </Typography.Paragraph>
      <Table
        rowKey="lineId"
        size="small"
        dataSource={candidates}
        pagination={{
          pageSize: 8,
          hideOnSinglePage: true,
          showSizeChanger: false,
        }}
        scroll={{ x: 640 }}
        locale={{
          emptyText: `Nothing ${line?.deposit ? "received" : "paid"} in the books is waiting. Make a voucher for it instead.`,
        }}
        rowSelection={{
          type: "radio",
          selectedRowKeys: picked ? [picked] : [],
          onChange: (k) => setPicked(String(k[0])),
          columnTitle: "Pick",
        }}
        onRow={(b) => ({
          onClick: () => setPicked(b.lineId),
          style: { cursor: "pointer" },
        })}
        columns={[
          {
            title: "Date",
            dataIndex: "date",
            width: 110,
            render: (d: string) => formatDate(d),
          },
          {
            title: "Voucher",
            dataIndex: "voucherNo",
            width: 170,
            render: (n: string) => <span translate="no">{n}</span>,
          },
          {
            title: "Against",
            dataIndex: "against",
            ellipsis: true,
            render: (a: string) => <span translate="no">{a}</span>,
          },
          {
            title: "Amount",
            key: "amount",
            align: "right",
            width: 140,
            render: (_, b) => <Amount value={b.deposit ?? b.withdrawal} />,
          },
        ]}
      />
    </Modal>
  );
}

function Summary({ d }: { d: BankReconciliationDto }) {
  const items = [
    {
      key: "books",
      label: `Balance in the books on ${formatDate(d.asOn)}`,
      children: <Balance value={d.booksBalance} />,
    },
    {
      key: "np",
      label: "Add: paid in the books, not yet through the bank",
      children: <Amount value={d.notPresented} />,
    },
    {
      key: "nc",
      label: "Less: received in the books, not yet credited by the bank",
      children: <Amount value={d.notCleared} />,
    },
    {
      key: "bi",
      label: "Add: credited by the bank, not in the books",
      children: <Amount value={d.bankOnlyDeposits} />,
    },
    {
      key: "bo",
      label: "Less: debited by the bank, not in the books",
      children: <Amount value={d.bankOnlyWithdrawals} />,
    },
    {
      key: "exp",
      label: "Balance the bank should show",
      children: (
        <Typography.Text strong>
          <Amount value={d.expectedBankBalance} />
        </Typography.Text>
      ),
    },
    ...(d.statementBalance !== null
      ? [
          {
            key: "st",
            label: "Balance on the statement",
            children: <Amount value={d.statementBalance} />,
          },
        ]
      : []),
  ];
  return (
    <>
      <Descriptions
        size="small"
        bordered
        column={1}
        items={items}
        style={{ marginBottom: 12, maxWidth: 720 }}
        styles={{ content: { textAlign: "right" } }}
      />
      {d.difference !== null && Number(d.difference) !== 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12, maxWidth: 720 }}
          title={`The statement differs by ${formatINR(Math.abs(Number(d.difference)), true)}`}
          description={`Import the statement from ${d.statementFrom ? formatDate(d.statementFrom) : "the day the books begin"} without gaps, and check the lines matched by hand. Book entries before the statement's first day are taken as cleared.`}
        />
      )}
      {d.difference !== null && Number(d.difference) === 0 && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 12, maxWidth: 720 }}
          title="The books agree with the bank"
        />
      )}
    </>
  );
}

/** The bank reconciliation: import the bank's statement, match it to the bank book, and see what is still in transit. */
export function BankReconciliation() {
  const { message } = App.useApp();
  const { data: accounts } = useLedgerAccounts();
  const banks = (accounts ?? [])
    .filter((a) => a.group === "BANK_ACCOUNTS")
    .map((a) => ({ value: a.id, label: a.name }));
  const [picked, setPicked] = useState<string | undefined>();
  const accountId = picked ?? banks[0]?.value;
  const [asOn, setAsOn] = useState(() => dayjs());
  const [view, setView] = useState<"statement" | "book">("statement");
  const [only, setOnly] = useState<"open" | "all">("open");
  const [importing, setImporting] = useState(false);
  const [matching, setMatching] = useState<BankStatementLineDto | null>(null);
  const [prefill, setPrefill] = useState<VoucherPrefill | null>(null);
  const act = useBooksAction<BankImportResultDto>();
  const { data, isLoading, isFetching, error, refetch } = useBankReconciliation(
    { accountId, asOn: day(asOn) },
  );
  const statement = (data?.statement ?? []).filter(
    (s) => only === "all" || !s.bookLineId,
  );
  const book = (data?.book ?? []).filter(
    (b) =>
      only === "all" ||
      !b.statementLineId ||
      (b.statementDate ?? "") > (data?.asOn ?? ""),
  );
  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      message.success(done);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  const voucherFor = (s: BankStatementLineDto) =>
    setPrefill({
      type: s.deposit ? "RECEIPT" : "PAYMENT",
      date: s.date,
      reference: s.reference,
      narration: s.description,
      lines: s.deposit
        ? [
            { accountId, debit: Number(s.deposit) },
            { credit: Number(s.deposit) },
          ]
        : [
            { debit: Number(s.withdrawal) },
            { accountId, credit: Number(s.withdrawal) },
          ],
    });

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
          <Select
            aria-label="Bank account"
            placeholder="Bank account"
            showSearch={{ optionFilterProp: "label" }}
            value={accountId}
            onChange={setPicked}
            options={banks}
            style={{ minWidth: 240 }}
          />
          <DatePicker
            aria-label="As on"
            format="DD MMM YYYY"
            allowClear={false}
            value={asOn}
            onChange={(d) => d && setAsOn(d)}
          />
        </Space>
        <Space wrap>
          <Button
            icon={<SyncOutlined />}
            disabled={!accountId}
            loading={act.isPending}
            onClick={() =>
              run(async () => {
                const r = await act.mutateAsync({
                  path: "/statements/bank/auto-match",
                  body: { accountId },
                });
                if (!r.matched)
                  throw new Error(
                    "Nothing more matched by amount and day. Match the rest by hand.",
                  );
              }, "Matched what agrees by amount and day")
            }
          >
            Match automatically
          </Button>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            disabled={!banks.length}
            onClick={() => setImporting(true)}
          >
            Import statement
          </Button>
        </Space>
      </div>
      {!banks.length && accounts ? (
        <Alert
          type="info"
          showIcon
          title="There is no bank account in the chart of accounts yet"
          description="Add one under Bank Accounts in Books, Chart of accounts, then import its statement here."
        />
      ) : error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : data ? (
        <>
          <Summary d={data} />
          {!data.statementFrom && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12, maxWidth: 720 }}
              title="No statement imported for this account yet"
              description="Download the statement from the bank's net banking as CSV or Excel and import it. Lines that agree by amount and day are matched at once."
            />
          )}
          <Space wrap style={{ marginBottom: 12 }}>
            <Segmented
              aria-label="Which side"
              value={view}
              onChange={(v) => setView(v as "statement" | "book")}
              options={[
                {
                  value: "statement",
                  label: `Bank statement (${data.statement.filter((s) => !s.bookLineId).length} to match)`,
                },
                {
                  value: "book",
                  label: `Bank book (${data.book.filter((b) => !b.statementLineId).length} not cleared)`,
                },
              ]}
            />
            <Segmented
              aria-label="Which lines"
              value={only}
              onChange={(v) => setOnly(v as "open" | "all")}
              options={[
                { value: "open", label: "Still open" },
                { value: "all", label: "All of the last 60 days" },
              ]}
            />
          </Space>
          {view === "statement" ? (
            <Table<BankStatementLineDto>
              rowKey="id"
              size="small"
              loading={isLoading || isFetching}
              dataSource={statement}
              pagination={{
                pageSize: 50,
                hideOnSinglePage: true,
                showSizeChanger: false,
              }}
              scroll={{ x: 1100 }}
              locale={{
                emptyText:
                  only === "open"
                    ? "Every statement line is matched"
                    : "No statement lines in this period",
              }}
              columns={[
                {
                  title: "Date",
                  dataIndex: "date",
                  width: 110,
                  render: (d: string) => formatDate(d),
                },
                {
                  title: "Narration",
                  dataIndex: "description",
                  ellipsis: true,
                  render: (t: string) => <span translate="no">{t}</span>,
                },
                {
                  title: "Reference",
                  dataIndex: "reference",
                  width: 130,
                  ellipsis: true,
                  render: (t: string | null) =>
                    t ? <span translate="no">{t}</span> : null,
                },
                {
                  title: "Withdrawal",
                  dataIndex: "withdrawal",
                  align: "right",
                  width: 140,
                  render: (x: string | null) => <Amount value={x} />,
                },
                {
                  title: "Deposit",
                  dataIndex: "deposit",
                  align: "right",
                  width: 140,
                  render: (x: string | null) => <Amount value={x} />,
                },
                {
                  title: "In the books",
                  key: "match",
                  width: 330,
                  render: (_, s) =>
                    s.bookLineId ? (
                      <Space size={4} wrap>
                        <AppTag color={s.matchedBy === "HAND" ? "blue" : "green"}>
                          {s.matchedBy === "HAND"
                            ? "Matched by hand"
                            : "Matched"}
                        </AppTag>
                        <span translate="no">{`${s.voucherNo} · ${formatDate(s.voucherDate)}`}</span>
                        <Button
                          size="small"
                          type="link"
                          onClick={() =>
                            run(
                              () =>
                                act.mutateAsync({
                                  path: "/statements/bank/unmatch",
                                  body: { statementLineId: s.id },
                                }),
                              "Unmatched",
                            )
                          }
                        >
                          Unmatch
                        </Button>
                      </Space>
                    ) : (
                      <Space size={4} wrap>
                        <Button size="small" onClick={() => setMatching(s)}>
                          Match…
                        </Button>
                        <Button size="small" onClick={() => voucherFor(s)}>
                          Make voucher
                        </Button>
                        <Button
                          size="small"
                          type="text"
                          danger
                          onClick={() =>
                            run(
                              () =>
                                act.mutateAsync({
                                  method: "delete",
                                  path: `/statements/bank/lines/${s.id}`,
                                }),
                              "Statement line deleted",
                            )
                          }
                          aria-label={`Delete statement line ${s.description}`}
                        >
                          Delete
                        </Button>
                      </Space>
                    ),
                },
              ]}
            />
          ) : (
            <Table<BankBookLineDto>
              rowKey="lineId"
              size="small"
              loading={isLoading || isFetching}
              dataSource={book}
              pagination={{
                pageSize: 50,
                hideOnSinglePage: true,
                showSizeChanger: false,
              }}
              scroll={{ x: 1000 }}
              locale={{
                emptyText:
                  only === "open"
                    ? "Everything in the bank book has cleared"
                    : "No bank book entries in this period",
              }}
              columns={[
                {
                  title: "Date",
                  dataIndex: "date",
                  width: 110,
                  render: (d: string) => formatDate(d),
                },
                {
                  title: "Voucher",
                  dataIndex: "voucherNo",
                  width: 170,
                  render: (n: string) => <span translate="no">{n}</span>,
                },
                {
                  title: "Against",
                  dataIndex: "against",
                  width: 200,
                  ellipsis: true,
                  render: (a: string) => <span translate="no">{a}</span>,
                },
                { title: "Narration", dataIndex: "narration", ellipsis: true },
                {
                  title: "Paid",
                  dataIndex: "withdrawal",
                  align: "right",
                  width: 140,
                  render: (x: string | null) => <Amount value={x} />,
                },
                {
                  title: "Received",
                  dataIndex: "deposit",
                  align: "right",
                  width: 140,
                  render: (x: string | null) => <Amount value={x} />,
                },
                {
                  title: "Cleared",
                  dataIndex: "statementDate",
                  width: 130,
                  render: (d: string | null) =>
                    d ? formatDate(d) : <AppTag tone="pending">Not yet</AppTag>,
                },
              ]}
            />
          )}
        </>
      ) : null}
      <ImportStatement
        open={importing}
        onClose={() => setImporting(false)}
        accountId={accountId}
        accounts={banks}
      />
      <MatchPicker
        line={matching}
        book={data?.book ?? []}
        onClose={() => setMatching(null)}
      />
      <VoucherForm
        open={!!prefill}
        onClose={() => setPrefill(null)}
        prefill={prefill}
        initialType={prefill?.type}
      />
    </div>
  );
}
