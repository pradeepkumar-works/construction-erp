"use client";

import React, { useEffect } from "react";
import { App, Form, Input, InputNumber, Segmented, Select } from "antd";
import dayjs from "dayjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AttachmentDto,
  LabourChallanDto,
  LabourChallanKind,
  LabourPaperDto,
  LabourPaperKind,
} from "@erp/shared";
import {
  COUNTED_PAPERS,
  EXPIRING_PAPERS,
  LABOUR_CHALLAN_KINDS,
  LABOUR_CHALLAN_KIND_LABELS,
  LABOUR_PAPER_KINDS,
  LABOUR_PAPER_KIND_LABELS,
  SITE_PAPERS,
  monthWords,
} from "@erp/shared";
import { api } from "@/lib/api";
import { FAIL_NOTICE } from "@/lib/notify";
import { DatePicker } from "@/components/common/DatePicker";
import { ProjectSelect } from "@/components/common/ProjectSelect";
import { PhotoUpload } from "@/components/common/PhotoUpload";
import { VendorSelect } from "@/components/common/SearchSelect";
import { FormGrid, FormShell } from "@/components/form/FormShell";
import { MoneyInput } from "@/components/form/inputs";

const CONTRACTORS = ["LABOUR_CONTRACTOR", "SUBCONTRACTOR"] as const;
const ymd = (d: dayjs.Dayjs | null | undefined) =>
  d ? d.format("YYYY-MM-DD") : null;
const trimmed = (v: string | undefined) => v?.trim() || null;

/** A form on the register: record a paper or a challan for a contractor (prefilled when opened from their row), or correct one. */
export type LabourForm =
  | {
      kind: "paper";
      vendorId?: string;
      projectId?: string;
      paperKind?: LabourPaperKind;
      paper?: LabourPaperDto;
    }
  | {
      kind: "challan";
      vendorId?: string;
      challanKind?: LabourChallanKind;
      month?: string;
      challan?: LabourChallanDto;
    };

interface PaperValues {
  vendorId?: string;
  kind?: LabourPaperKind;
  projectId?: string | null;
  number?: string;
  validFrom?: dayjs.Dayjs | null;
  validTo?: dayjs.Dayjs | null;
  workers?: number | null;
  note?: string;
  scans?: AttachmentDto[];
}

interface ChallanValues {
  vendorId?: string;
  kind?: LabourChallanKind;
  month?: dayjs.Dayjs | null;
  amount?: number | null;
  workers?: number | null;
  paidOn?: dayjs.Dayjs | null;
  reference?: string;
  note?: string;
  scans?: AttachmentDto[];
}

/** Record or correct a contractor's labour licence, PF or ESI code, workmen's compensation policy or BOCW registration. */
export function LabourPaperForm({
  form: open,
  onClose,
}: {
  form: Extract<LabourForm, { kind: "paper" }> | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<PaperValues>();
  const kind =
    Form.useWatch("kind", form) ??
    open?.paper?.kind ??
    open?.paperKind ??
    "CLRA_LICENCE";
  const paper = open?.paper;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      paper
        ? {
            vendorId: paper.vendorId,
            kind: paper.kind,
            projectId: paper.projectId,
            number: paper.number,
            validFrom: paper.validFrom ? dayjs(paper.validFrom) : null,
            validTo: paper.validTo ? dayjs(paper.validTo) : null,
            workers: paper.workers,
            note: paper.note ?? undefined,
            scans: paper.attachments,
          }
        : {
            vendorId: open.vendorId,
            kind: open.paperKind ?? "CLRA_LICENCE",
            projectId:
              open.paperKind && !SITE_PAPERS.includes(open.paperKind)
                ? null
                : (open.projectId ?? null),
          },
    );
  }, [open, paper, form]);

  const save = useMutation({
    mutationFn: async (v: PaperValues) => {
      const fields = {
        projectId: SITE_PAPERS.includes(kind) ? (v.projectId ?? null) : null,
        number: v.number?.trim(),
        validFrom: ymd(v.validFrom),
        validTo: ymd(v.validTo),
        workers: COUNTED_PAPERS.includes(kind) ? (v.workers ?? null) : null,
        note: trimmed(v.note),
        attachmentIds: (v.scans ?? []).map((a) => a.id),
      };
      if (paper)
        return (
          await api.patch<LabourPaperDto>(`/labour-papers/${paper.id}`, fields)
        ).data;
      return (
        await api.post<LabourPaperDto>("/labour-papers", {
          vendorId: v.vendorId,
          kind: v.kind,
          ...fields,
        })
      ).data;
    },
    onSuccess: (p) => {
      message.success(
        `${LABOUR_PAPER_KIND_LABELS[p.kind]} ${p.number} saved for ${p.vendorName}`,
      );
      qc.invalidateQueries({ queryKey: ["labour-compliance"] });
      qc.invalidateQueries({ queryKey: ["subcontract-bills"] });
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={!!open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      title={
        paper
          ? `Edit ${LABOUR_PAPER_KIND_LABELS[paper.kind]} ${paper.number}`
          : "Record a labour paper"
      }
      okText="Save"
      projectDefault={false}
      onSubmit={(v) => save.mutateAsync(v)}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <FormGrid cols={2}>
          <Form.Item
            name="vendorId"
            label="Contractor"
            rules={[{ required: true, message: "Choose the contractor" }]}
          >
            <VendorSelect kinds={CONTRACTORS} disabled={!!paper} />
          </Form.Item>
          <Form.Item
            name="kind"
            label="Paper"
            rules={[{ required: true, message: "Choose which paper" }]}
          >
            <Select
              disabled={!!paper}
              options={LABOUR_PAPER_KINDS.map((k) => ({
                value: k,
                label: LABOUR_PAPER_KIND_LABELS[k],
              }))}
            />
          </Form.Item>
          <Form.Item
            name="number"
            label={kind === "WC_POLICY" ? "Policy number" : "Number"}
            rules={[
              { required: true, whitespace: true, message: "Enter its number" },
            ]}
          >
            <Input maxLength={80} />
          </Form.Item>
          {SITE_PAPERS.includes(kind) ? (
            <Form.Item
              name="projectId"
              label="Site"
              rules={[
                {
                  required: true,
                  message: "Choose the site the licence is for",
                },
              ]}
            >
              <ProjectSelect />
            </Form.Item>
          ) : null}
          <Form.Item name="validFrom" label="Valid from">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          {EXPIRING_PAPERS.includes(kind) ? (
            <Form.Item
              name="validTo"
              label="Valid to"
              rules={[
                { required: true, message: "Choose the date it is valid to" },
              ]}
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          ) : null}
          {COUNTED_PAPERS.includes(kind) ? (
            <Form.Item
              name="workers"
              label={
                kind === "WC_POLICY"
                  ? "Workers covered"
                  : "Most workers allowed"
              }
              rules={[
                { required: true, message: "Enter how many workers it covers" },
              ]}
            >
              <InputNumber
                min={1}
                max={100000}
                precision={0}
                style={{ width: "100%" }}
              />
            </Form.Item>
          ) : null}
        </FormGrid>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
        <Form.Item
          name="scans"
          label="Scans"
          extra="The licence, code letter, policy or registration (photo or PDF)"
        >
          <PhotoUpload max={4} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** Record or correct a contractor's PF or ESI challan for a wage month. */
export function LabourChallanForm({
  form: open,
  onClose,
}: {
  form: Extract<LabourForm, { kind: "challan" }> | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<ChallanValues>();
  const challan = open?.challan;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      challan
        ? {
            vendorId: challan.vendorId,
            kind: challan.kind,
            month: dayjs(`${challan.month}-01`),
            amount: Number(challan.amount),
            workers: challan.workers,
            paidOn: dayjs(challan.paidOn),
            reference: challan.reference,
            note: challan.note ?? undefined,
            scans: challan.attachments,
          }
        : {
            vendorId: open.vendorId,
            kind: open.challanKind ?? "PF",
            month: open.month
              ? dayjs(`${open.month}-01`)
              : dayjs().subtract(1, "month"),
            paidOn: dayjs(),
          },
    );
  }, [open, challan, form]);

  const save = useMutation({
    mutationFn: async (v: ChallanValues) => {
      const fields = {
        amount: String(v.amount ?? 0),
        workers: v.workers ?? null,
        paidOn: ymd(v.paidOn),
        reference: v.reference?.trim(),
        note: trimmed(v.note),
        attachmentIds: (v.scans ?? []).map((a) => a.id),
      };
      if (challan)
        return (
          await api.patch<LabourChallanDto>(
            `/labour-challans/${challan.id}`,
            fields,
          )
        ).data;
      return (
        await api.post<LabourChallanDto>("/labour-challans", {
          vendorId: v.vendorId,
          kind: v.kind,
          month: v.month?.format("YYYY-MM"),
          ...fields,
        })
      ).data;
    },
    onSuccess: (c) => {
      message.success(
        `${LABOUR_CHALLAN_KIND_LABELS[c.kind]} for ${monthWords(c.month)} saved for ${c.vendorName}`,
      );
      qc.invalidateQueries({ queryKey: ["labour-compliance"] });
      qc.invalidateQueries({ queryKey: ["subcontract-bills"] });
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={!!open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      title={
        challan
          ? `Edit ${LABOUR_CHALLAN_KIND_LABELS[challan.kind]} for ${monthWords(challan.month)}`
          : "Record a challan"
      }
      okText="Save"
      projectDefault={false}
      onSubmit={(v) => save.mutateAsync(v)}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <FormGrid cols={2}>
          <Form.Item
            name="vendorId"
            label="Contractor"
            rules={[{ required: true, message: "Choose the contractor" }]}
          >
            <VendorSelect kinds={CONTRACTORS} disabled={!!challan} />
          </Form.Item>
          <Form.Item
            name="kind"
            label="Challan"
            rules={[{ required: true, message: "Choose PF or ESI" }]}
          >
            <Segmented<LabourChallanKind>
              block
              disabled={!!challan}
              options={LABOUR_CHALLAN_KINDS.map((k) => ({
                value: k,
                label: k,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="month"
            label="Wage month"
            rules={[{ required: true, message: "Choose the wage month" }]}
          >
            <DatePicker
              picker="month"
              format="MMM YYYY"
              style={{ width: "100%" }}
              disabled={!!challan}
              disabledDate={(d) => d.isAfter(dayjs(), "month")}
            />
          </Form.Item>
          <Form.Item
            name="paidOn"
            label="Paid on"
            rules={[{ required: true, message: "Choose the day it was paid" }]}
          >
            <DatePicker
              style={{ width: "100%" }}
              disabledDate={(d) => d.isAfter(dayjs(), "day")}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label="Amount paid"
            rules={[{ required: true, message: "Enter the amount paid" }]}
          >
            <MoneyInput />
          </Form.Item>
          <Form.Item name="workers" label="Workers on it">
            <InputNumber
              min={1}
              max={100000}
              precision={0}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            name="reference"
            label="Challan or TRRN number"
            rules={[
              {
                required: true,
                whitespace: true,
                message: "Enter the challan or TRRN number",
              },
            ]}
          >
            <Input maxLength={60} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
        <Form.Item
          name="scans"
          label="Scans"
          extra="The challan and the ECR or contribution list (photo or PDF)"
        >
          <PhotoUpload max={4} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
