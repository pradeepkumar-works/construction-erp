"use client";

import React from "react";
import { DatePicker } from "@/components/common/DatePicker";
import dayjs from "dayjs";
import { formatINR } from "@/lib/format";

/** The financial year (1 April to 31 March) a day falls in. */
export function fyOf(d: dayjs.Dayjs): [dayjs.Dayjs, dayjs.Dayjs] {
  const start = dayjs(`${d.month() >= 3 ? d.year() : d.year() - 1}-04-01`);
  return [start, start.add(1, "year").subtract(1, "day")];
}

/** This year so far, as the statements open. */
export const thisYearSoFar = (): [dayjs.Dayjs, dayjs.Dayjs] => [
  fyOf(dayjs())[0],
  dayjs(),
];

const PRESETS = () => {
  const t = dayjs();
  const [fy] = fyOf(t);
  const quarter =
    t.month() >= 3
      ? fy.add(Math.floor((t.month() - 3) / 3) * 3, "month")
      : fy.add(9, "month");
  return [
    { label: "This year so far", value: [fy, t] as [dayjs.Dayjs, dayjs.Dayjs] },
    { label: "Last year", value: fyOf(fy.subtract(1, "day")) },
    {
      label: "This quarter",
      value: [quarter, t] as [dayjs.Dayjs, dayjs.Dayjs],
    },
    {
      label: "This month",
      value: [t.startOf("month"), t] as [dayjs.Dayjs, dayjs.Dayjs],
    },
    {
      label: "Last month",
      value: [
        t.subtract(1, "month").startOf("month"),
        t.subtract(1, "month").endOf("month"),
      ] as [dayjs.Dayjs, dayjs.Dayjs],
    },
  ];
};

/** A period with the usual accounting presets. */
export function PeriodPicker({
  value,
  onChange,
}: {
  value: [dayjs.Dayjs, dayjs.Dayjs];
  onChange: (v: [dayjs.Dayjs, dayjs.Dayjs]) => void;
}) {
  return (
    <DatePicker.RangePicker
      aria-label="Period"
      allowClear={false}
      value={value}
      presets={PRESETS()}
      onChange={(r) => r?.[0] && r[1] && onChange([r[0], r[1]])}
    />
  );
}

/** An amount in a statement: negative in brackets, as accounts are printed. */
export function Signed({
  value,
  strong = false,
}: {
  value: string | number | null | undefined;
  strong?: boolean;
}) {
  const n = Number(value ?? 0);
  const text = n < 0 ? `(${formatINR(-n, true)})` : formatINR(n, true);
  return (
    <span translate="no" style={strong ? { fontWeight: 600 } : undefined}>
      {text}
    </span>
  );
}

export const day = (d: dayjs.Dayjs) => d.format("YYYY-MM-DD");

/** Where an account's ledger opens for a period, from a statement. */
export const ledgerHref = (accountId: string, from: string, to: string) =>
  `/books?tab=ledgers&account=${accountId}&from=${from}&to=${to}`;
