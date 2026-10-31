'use client';

import React, { useEffect, useRef, useState } from 'react';
import { App, Button, Checkbox, Flex, Form, Input, InputNumber, Select, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { AimOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import type { BreakdownPick, ContractModel, ProjectDetail, ProjectStatus, ProjectType, ProjectTypeDto } from '@erp/shared';
import { CONTRACT_MODELS, CONTRACT_MODEL_LABELS, DEFAULT_SITE_RADIUS_M, MAX_COMPONENT_COUNT, STANDARD_TERMS, PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, defaultPicks, readNumber, readText, typeCodeOf, verticalOfType, workOrderEnd } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useActivityTemplates, useMasterList, useNextProjectCode, useProjectTypes } from '@/lib/queries';
import { ClientSelect, UserSelect } from '@/components/common/SearchSelect';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { useAuth } from '@/lib/auth';
import { inSentence } from '@/lib/format';
import { afterFormLeaves, FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { currentPosition } from '@/components/staff/staffUi';
import { ReadDocumentButton, ReadPreview, readFieldProps, type ReadState } from '@/components/ai/ReadDocument';
import { ClientFormModal } from '@/components/clients/ClientFormModal';

interface FormValues {
  code: string;
  name: string;
  /** A project type's code (item 134), or `kind:PLANT` / `kind:STORE` for the built-in kinds that have no type */
  typeChoice: string;
  /** Its vertical (item 167), a code of the vertical master */
  verticalCode?: string | null;
  /** New projects: how many of each top-level component of the type's starting breakdown (0 leaves it out) */
  breakdown?: Record<string, number | null>;
  status?: ProjectStatus;
  contractModel?: ContractModel;
  clientId?: string | null;
  consultantName?: string;
  location?: string;
  siteAddress?: string;
  workOrderNo?: string;
  /** New projects: the agreement, when the work order gives one apart (later on the Contract tab) */
  agreementNo?: string;
  agreementDate?: dayjs.Dayjs | null;
  description?: string;
  dates?: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  contractValue?: number | null;
  projectManagerId?: string;
  applyTemplate?: boolean;
  /** Copy the team and the contract terms from this project (finding 6 of the October review) */
  copyFromProjectId?: string;
  /** Attendance extras (v5 item 97): where the site is, for GPS check-in */
  siteLat?: number | null;
  siteLng?: number | null;
  siteRadiusM?: number | null;
  siteCheckInStrict?: boolean;
}

/** Built-in kinds that are not a project type: a plant and a store have no breakdown or DPR of their own. */
const KIND_CHOICES = ['PLANT', 'STORE'] as const satisfies readonly ProjectType[];
const kindChoice = (t: ProjectType) => `kind:${t}`;

/** The built-in kind behind a choice, and its project type when it has one. */
function typeOfChoice(choice: string | undefined, types: ProjectTypeDto[] | undefined): { type: ProjectType | undefined; def: ProjectTypeDto | undefined } {
  if (!choice) return { type: undefined, def: undefined };
  if (choice.startsWith('kind:')) return { type: choice.slice(5) as ProjectType, def: undefined };
  const def = types?.find((t) => t.code === choice);
  return { type: def?.baseType, def };
}

/** Who can manage a project. */
const MANAGER_ROLES = ['PROJECT_MANAGER', 'MANAGEMENT', 'ADMIN'] as const;

export function ProjectFormModal({
  open,
  onClose,
  project,
  onSaved,
  initialType,
}: {
  open: boolean;
  onClose: () => void;
  project?: ProjectDetail | null;
  onSaved?: (id: string) => void;
  /** A new project's type to start with, e.g. a central store from Central stores (v6 item 106) */
  initialType?: ProjectType;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const notify = useNotify();
  const isEdit = !!project;
  const { user } = useAuth();
  const { data: templates } = useActivityTemplates(open && !project);
  const { data: types } = useProjectTypes(open);
  const typeChoice = Form.useWatch('typeChoice', form);
  const { type, def: typeDef } = typeOfChoice(typeChoice, types);
  const template = typeDef ? templates?.find((t) => t.typeCode === typeDef.code) : undefined;
  // What a change of type filled in (the contract, the breakdown picks, the activities box), so a box someone set stays.
  const typeFilled = useRef<{ contractModel?: ContractModel; applyTemplate?: boolean }>({});
  // The next code in the company's series (finding 17 of the October review); `filledCode` keeps the one we filled in,
  // so a code typed by hand is never written over, and a change of type moves our own suggestion along.
  const mayCreate = !!user && (MANAGER_ROLES as readonly string[]).includes(user.roleKey);
  const { data: nextCode } = useNextProjectCode(type as ProjectType | undefined, open && !isEdit && mayCreate);
  const filledCode = useRef<string | null>(null);
  // The company's verticals (item 167); a new project's type fills its usual one, and `filledVertical` keeps what we
  // filled, so a vertical chosen by hand stays when the type changes.
  const { data: verticals } = useMasterList('vertical', false, open);
  const filledVertical = useRef<string | null>(null);
  // The saved project, handed to `onSaved` once the form has closed (e.g. to open it).
  const saved = useRef<string | null>(null);
  // A work order or LoA read to fill a new project (finding 10 of the October review).
  const [readState, setReadState] = useState<ReadState | null>(null);
  const [activeRead, setActiveRead] = useState<string | null>(null);
  const [addClient, setAddClient] = useState(false);
  const read = (key: string) => readFieldProps(readState, key, setActiveRead);
  const readClient = readState ? readText(readState.result.fields.clientName) : null;

  /** Name, client, numbers, value, dates and place from the work order; the type, code and team stay the person's. */
  const applyRead = (s: ReadState) => {
    setReadState(s);
    const f = s.result.fields;
    const start = readText(f.startDate);
    const end = workOrderEnd(start, readText(f.completionDate), readNumber(f.durationMonths));
    const agreementDate = readText(f.agreementDate);
    const filled: Partial<FormValues> = {
      ...(readText(f.nameOfWork) ? { name: readText(f.nameOfWork)!.slice(0, 200) } : {}),
      ...(readText(f.workOrderNo) || readText(f.agreementNo) ? { workOrderNo: (readText(f.workOrderNo) ?? readText(f.agreementNo))! } : {}),
      ...(readText(f.agreementNo) ? { agreementNo: readText(f.agreementNo)! } : {}),
      ...(agreementDate ? { agreementDate: dayjs(agreementDate) } : {}),
      ...(readNumber(f.contractValue) !== null ? { contractValue: readNumber(f.contractValue) } : {}),
      ...(readText(f.location) ? { location: readText(f.location)! } : {}),
      ...(start || end ? { dates: [start ? dayjs(start) : null, end ? dayjs(end) : null] as FormValues['dates'] } : {}),
      ...(s.result.client ? { clientId: s.result.client.id } : {}),
    };
    form.setFieldsValue(filled);
  };

  useEffect(() => {
    if (!open) return;
    if (project) {
      form.setFieldsValue({
        code: project.code,
        name: project.name,
        typeChoice: project.type === 'PLANT' || project.type === 'STORE' ? kindChoice(project.type) : (project.typeCode ?? typeCodeOf(project) ?? undefined),
        verticalCode: project.verticalCode,
        status: project.status,
        contractModel: project.contractModel,
        clientId: project.clientId,
        consultantName: project.consultantName ?? undefined,
        location: project.location ?? undefined,
        siteAddress: project.siteAddress ?? undefined,
        workOrderNo: project.workOrderNo ?? undefined,
        description: project.description ?? undefined,
        dates: [project.startDate ? dayjs(project.startDate) : null, project.endDate ? dayjs(project.endDate) : null],
        contractValue: project.contractValue ? Number(project.contractValue) : null,
        projectManagerId: project.projectManagerId ?? undefined,
        siteLat: project.siteLat === null ? null : Number(project.siteLat),
        siteLng: project.siteLng === null ? null : Number(project.siteLng),
        siteRadiusM: project.siteRadiusM,
        siteCheckInStrict: project.siteCheckInStrict,
      });
    } else {
      form.resetFields();
      filledCode.current = null;
      filledVertical.current = null;
      typeFilled.current = {};
      // A project manager making a project manages it, or would not see it once made.
      form.setFieldsValue({
        status: initialType === 'STORE' ? 'ACTIVE' : 'PLANNED',
        typeChoice: initialType === 'STORE' || initialType === 'PLANT' ? kindChoice(initialType) : typeCodeOf({ type: initialType ?? 'ROAD' }) ?? undefined,
        applyTemplate: initialType !== 'STORE',
        projectManagerId: user?.roleKey === 'PROJECT_MANAGER' ? user.id : undefined,
      });
    }
  }, [open, project, form, initialType, user]);

  // A new project's type fills the usual contract, its starting breakdown and whether to add its loose activities
  // (off when it has components, whose activities are laid out with them); a box someone changed keeps their choice.
  const typeKey = typeDef ? `${typeDef.code}:${typeDef.version}` : (typeChoice ?? '');
  useEffect(() => {
    if (!open || isEdit || !typeDef) return;
    const was = typeFilled.current;
    const now = form.getFieldsValue(['contractModel', 'applyTemplate']) as Pick<FormValues, 'contractModel' | 'applyTemplate'>;
    const next: Partial<FormValues> = { breakdown: Object.fromEntries(defaultPicks(typeDef).map((p) => [p.key, p.count])) };
    if (!now.contractModel || now.contractModel === was.contractModel) next.contractModel = typeDef.contractModel;
    if (now.applyTemplate === undefined || now.applyTemplate === was.applyTemplate) next.applyTemplate = typeDef.breakdown.length === 0;
    typeFilled.current = { contractModel: next.contractModel ?? was.contractModel, applyTemplate: next.applyTemplate ?? was.applyTemplate };
    form.setFieldsValue(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per type (and version), not on every refetch
  }, [open, isEdit, typeKey, form]);

  useEffect(() => {
    if (!open || isEdit || !type || !verticals) return;
    const now = form.getFieldValue('verticalCode') ?? null;
    if (now && now !== filledVertical.current) return;
    const next = verticalOfType(type, verticals.entries);
    form.setFieldValue('verticalCode', next);
    filledVertical.current = next;
  }, [open, isEdit, type, verticals, form]);

  useEffect(() => {
    if (!open || isEdit || !nextCode?.code) return;
    const typed = form.getFieldValue('code');
    if (typed && typed !== filledCode.current) return;
    form.setFieldValue('code', nextCode.code);
    filledCode.current = nextCode.code;
  }, [open, isEdit, nextCode, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const body = {
        code: values.code.trim(),
        name: values.name.trim(),
        ...(() => {
          const t = typeOfChoice(values.typeChoice, types);
          return { type: t.type, typeCode: t.def?.code ?? null };
        })(),
        verticalCode: values.verticalCode || null,
        status: values.status,
        contractModel: values.contractModel,
        // Without a client from the master an older free-text client name is left as it is.
        ...(values.clientId ? { clientId: values.clientId } : isEdit && project?.clientId ? { clientId: null } : {}),
        consultantName: values.consultantName || undefined,
        location: values.location || undefined,
        siteAddress: values.siteAddress?.trim() || undefined,
        workOrderNo: values.workOrderNo || undefined,
        ...(isEdit ? {} : { agreementNo: values.agreementNo?.trim() || undefined, agreementDate: values.agreementDate ? values.agreementDate.format('YYYY-MM-DD') : undefined }),
        description: values.description || undefined,
        startDate: values.dates?.[0] ? values.dates[0].format('YYYY-MM-DD') : undefined,
        endDate: values.dates?.[1] ? values.dates[1].format('YYYY-MM-DD') : undefined,
        contractValue: values.contractValue !== null && values.contractValue !== undefined ? String(values.contractValue) : undefined,
        projectManagerId: values.projectManagerId || undefined,
        ...(isEdit
          ? {}
          : {
              applyTemplate: !!values.applyTemplate && !values.typeChoice.startsWith('kind:'),
              copyFromProjectId: values.copyFromProjectId || undefined,
              breakdown: Object.entries(values.breakdown ?? {})
                .filter(([, n]) => (n ?? 0) > 0)
                .map(([key, count]): BreakdownPick => ({ key, count: count! })),
            }),
        siteLat: values.siteLat ?? (isEdit ? null : undefined),
        siteLng: values.siteLng ?? (isEdit ? null : undefined),
        siteRadiusM: values.siteRadiusM ?? (isEdit ? null : undefined),
        siteCheckInStrict: !!values.siteCheckInStrict,
      };
      if (isEdit && project) return (await api.patch<ProjectDetail>(`/projects/${project.id}`, body)).data;
      return (await api.post<ProjectDetail>('/projects', body)).data;
    },
    onSuccess: (data) => {
      notify.saved(isEdit ? `${data.name} updated` : `${data.name} created`, `/projects/${data.id}`);
      qc.invalidateQueries();
      saved.current = data.id;
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={open}
      onClose={() => {
        setReadState(null);
        onClose();
        const id = saved.current;
        saved.current = null;
        if (id && onSaved) afterFormLeaves(() => onSaved(id));
      }}
      form={form}
      layout="drawer"
      title={isEdit ? (project?.type === 'STORE' ? 'Edit store' : 'Edit project') : initialType === 'STORE' ? 'New central store' : 'New project'}
      okText="Save"
      onSubmit={(v) => mutation.mutateAsync(v)}
    >
      <Form form={form} layout="vertical">
        {!isEdit && initialType !== 'STORE' && !readState ? (
          <Flex justify="flex-end" style={{ marginBottom: 8 }}>
            <ReadDocumentButton kind="workOrder" label="Fill from work order" onRead={applyRead} />
          </Flex>
        ) : null}
        {readState ? (
          <ReadPreview state={readState} active={activeRead} onClear={() => setReadState(null)}>
            {readClient && !readState.result.client ? (
              <Typography.Paragraph style={{ margin: '8px 0 0' }}>
                {readClient} is not in the client master.{' '}
                <Button size="small" onClick={() => setAddClient(true)}>
                  Add client
                </Button>
              </Typography.Paragraph>
            ) : null}
          </ReadPreview>
        ) : null}
        <FormSection title="Project">
          <FormGrid cols={2}>
            <Form.Item
              name="code"
              label="Project code"
              extra={!isEdit && nextCode?.code ? 'The next in your series. Change it if you number projects another way.' : undefined}
              rules={[{ required: true, whitespace: true, message: 'Enter the project code, e.g. RD-2026-01' }]}
            >
              <Input placeholder="RD-2026-01" />
            </Form.Item>
            <Form.Item name="name" label="Project name" rules={[{ required: true, whitespace: true, message: 'Enter the project name' }]} {...read('nameOfWork')}>
              <Input placeholder="Highway widening Km 12 to Km 28" />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="typeChoice" label="Type" rules={[{ required: true, message: 'Choose the type, e.g. Road' }]} extra={typeDef?.description || undefined}>
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                loading={!types}
                options={[
                  ...(types ?? []).filter((t) => t.active || t.code === typeChoice).map((t) => ({ value: t.code, label: t.name })),
                  ...KIND_CHOICES.map((k) => ({ value: kindChoice(k), label: PROJECT_TYPE_LABELS[k] })),
                ]}
              />
            </Form.Item>
            <Form.Item name="verticalCode" label="Vertical" extra="The business line it reports under. Keep the list in Masters › Verticals.">
              <Select
                allowClear
                placeholder="No vertical"
                loading={!verticals}
                options={(verticals?.entries ?? []).filter((e) => e.isActive || e.code === project?.verticalCode).map((e) => ({ value: e.code, label: e.name }))}
              />
            </Form.Item>
            <Form.Item name="status" label="Status">
              <Select options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))} />
            </Form.Item>
            <Form.Item name="projectManagerId" label="Project manager">
              <UserSelect
                roles={MANAGER_ROLES}
                allowClear
                selected={project?.projectManagerId && project.projectManagerName ? { value: project.projectManagerId, label: project.projectManagerName } : null}
              />
            </Form.Item>
          </FormGrid>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
        </FormSection>
        <FormSection title="Client and contract">
          <FormGrid cols={2}>
            <Form.Item name="clientId" label="Client" extra={!project?.clientId && project?.clientName ? `Now: ${project.clientName} (not in the client master)` : 'Add clients under Client billing › Clients, or from the Contract tab.'} {...(readState?.result.client ? read('clientName') : {})}>
              <ClientSelect allowClear />
            </Form.Item>
            <Form.Item name="consultantName" label="Consultant / PMC">
              <Input />
            </Form.Item>
            <Form.Item name="location" label="Location" {...read('location')}>
              <Input />
            </Form.Item>
            <Form.Item name="siteAddress" label="Delivery address" extra="Where suppliers deliver: the site store. A purchase order with no address of its own takes it.">
              <Input.TextArea rows={2} maxLength={500} />
            </Form.Item>
            <Form.Item name="workOrderNo" label="Work order no." {...read(readText(readState?.result.fields.workOrderNo) ? 'workOrderNo' : 'agreementNo')}>
              <Input />
            </Form.Item>
            {!isEdit ? (
              <>
                <Form.Item name="agreementNo" label="Agreement no." {...read('agreementNo')}>
                  <Input />
                </Form.Item>
                <Form.Item name="agreementDate" label="Agreement date" {...read('agreementDate')}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </>
            ) : null}
            <Form.Item name="dates" label="Start and completion dates" {...read(readText(readState?.result.fields.completionDate) || !readText(readState?.result.fields.startDate) ? 'completionDate' : 'startDate')}>
              <DatePicker.RangePicker style={{ width: '100%' }} allowEmpty={[true, true]} />
            </Form.Item>
            <Form.Item name="contractValue" label="Contract value" {...read('contractValue')}>
              <MoneyInput />
            </Form.Item>
            <Form.Item name="contractModel" label="Contract type" tooltip="Item rate pays measured BOQ quantities. Lump sum and EPC pay in stages; each component's weight is its share in the contract's payment schedule.">
              <Select options={CONTRACT_MODELS.map((m) => ({ value: m, label: CONTRACT_MODEL_LABELS[m] }))} placeholder="Item rate" />
            </Form.Item>
          </FormGrid>
          {!isEdit && typeDef ? (
            <Form.Item
              name="applyTemplate"
              valuePropName="checked"
              style={{ marginBottom: 0 }}
              extra={`Scheduled across the start and end dates; planned quantities are filled in later. ${typeDef.breakdown.length ? 'Off by default: the components below bring their own activities. ' : ''}Set them under Project types.`}
            >
              <Checkbox>Add the {template ? `${template.items.length} ` : ''}{inSentence(typeDef.name)} activities</Checkbox>
            </Form.Item>
          ) : null}
          {!isEdit && type !== 'STORE' ? (
            <Form.Item
              name="copyFromProjectId"
              label="Copy from project"
              style={{ marginTop: 16, marginBottom: 0 }}
              extra={`Its team and contract terms: deductions, GST, liquidated damages and periods. Without one, the client's usual terms, else ${STANDARD_TERMS.retentionPct}% retention, ${STANDARD_TERMS.tdsPct}% TDS, ${STANDARD_TERMS.gstTdsPct}% GST TDS and ${STANDARD_TERMS.labourCessPct}% cess.`}
            >
              <ProjectSelect placeholder="None" style={{ width: '100%' }} aria-label={undefined} />
            </Form.Item>
          ) : null}
        </FormSection>
        {!isEdit && typeDef && typeDef.breakdown.some((b) => !b.parentKey) ? (
          <FormSection title="Starting components">
            <Typography.Paragraph type="secondary">
              Laid out on the Components tab with their activities and weights. Set how many of each this project has; 0 leaves one out. More can be added later.
            </Typography.Paragraph>
            <FormGrid cols={3}>
              {typeDef.breakdown
                .filter((b) => !b.parentKey)
                .map((b) => {
                  const subs = typeDef.breakdown.filter((x) => x.parentKey === b.key).length;
                  return (
                    <Form.Item key={b.key} name={['breakdown', b.key]} label={b.name} extra={subs ? `With ${subs} sub-component${subs === 1 ? '' : 's'}` : undefined}>
                      <InputNumber min={0} max={MAX_COMPONENT_COUNT} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                  );
                })}
            </FormGrid>
          </FormSection>
        ) : null}
        <FormSection title="Site location for check-in">
          <Typography.Paragraph type="secondary">Staff check-ins record where the phone is; one further from the site than the radius is flagged.</Typography.Paragraph>
          <FormGrid cols={3}>
            <Form.Item
              name="siteLat"
              label="Latitude"
              dependencies={['siteLng']}
              rules={[{ validator: (_, v) => (v == null && form.getFieldValue('siteLng') != null ? Promise.reject(new Error('Enter the latitude too, or clear the longitude')) : Promise.resolve()) }]}
            >
              <InputNumber style={{ width: '100%' }} min={-90} max={90} precision={6} step={0.0001} placeholder="20.296100" />
            </Form.Item>
            <Form.Item
              name="siteLng"
              label="Longitude"
              dependencies={['siteLat']}
              rules={[{ validator: (_, v) => (v == null && form.getFieldValue('siteLat') != null ? Promise.reject(new Error('Enter the longitude too, or clear the latitude')) : Promise.resolve()) }]}
            >
              <InputNumber style={{ width: '100%' }} min={-180} max={180} precision={6} step={0.0001} placeholder="85.824500" />
            </Form.Item>
            <Form.Item name="siteRadiusM" label="Radius" extra={`Default ${DEFAULT_SITE_RADIUS_M} m`}>
              <InputNumber style={{ width: '100%' }} min={25} max={10000} step={50} precision={0} suffix="m" placeholder={String(DEFAULT_SITE_RADIUS_M)} />
            </Form.Item>
          </FormGrid>
          <Button
            icon={<AimOutlined />}
            style={{ marginBottom: 16 }}
            onClick={async () => {
              const at = await currentPosition();
              if (!at) {
                message.warning('Could not get your location. Allow location for this site in the browser, or type the coordinates.');
                return;
              }
              form.setFieldsValue({ siteLat: at.lat, siteLng: at.lng });
              message.success(`Location set, accurate to about ${at.accuracyM} m`);
            }}
          >
            Use my location
          </Button>
          <Form.Item
            name="siteCheckInStrict"
            valuePropName="checked"
            style={{ marginBottom: 0 }}
            dependencies={['siteLat']}
            rules={[{ validator: (_, v) => (v && form.getFieldValue('siteLat') == null ? Promise.reject(new Error('Set the site location first')) : Promise.resolve()) }]}
            extra="The site manager can still mark anyone in the staff register."
          >
            <Checkbox>Refuse a check-in from outside the radius</Checkbox>
          </Form.Item>
        </FormSection>
      </Form>
      <ClientFormModal
        open={addClient}
        initialName={readClient ?? undefined}
        onClose={() => setAddClient(false)}
        onSaved={(c) => {
          form.setFieldValue('clientId', c.id);
          setReadState((s) => (s ? { ...s, result: { ...s.result, client: { id: c.id, name: c.name } } } : s));
          setAddClient(false);
        }}
      />
    </FormShell>
  );
}
