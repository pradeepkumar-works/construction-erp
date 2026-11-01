'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import type { MaterialPriority, ProjectStatus, ProjectType, SubmissionStatus } from '@erp/shared';
import { MATERIAL_PRIORITY_LABELS, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, SUBMISSION_STATUS_LABELS } from '@erp/shared';

/** `labels` words the status for one kind of entry (an inspection is "Passed" rather than "Approved"). */
export function StatusTag({ status, labels = SUBMISSION_STATUS_LABELS }: { status: SubmissionStatus; labels?: Record<SubmissionStatus, string> }) {
  return (
    <AppTag kind="submission" status={status} style={{ margin: 0 }}>
      {labels[status] ?? status}
    </AppTag>
  );
}

export function ProjectStatusTag({ status }: { status: ProjectStatus }) {
  return (
    <AppTag kind="project" status={status} style={{ margin: 0 }}>
      {PROJECT_STATUS_LABELS[status] ?? status}
    </AppTag>
  );
}

/** `name` is the company's own type (a Bridge on the road kind). A type is a category, so it is outlined with no colour. */
export function ProjectTypeTag({ type, name }: { type: ProjectType; name?: string | null }) {
  return (
    <AppTag variant="kind" style={{ margin: 0 }}>
      {name || PROJECT_TYPE_LABELS[type] || type}
    </AppTag>
  );
}

/** A request's priority is a grade, not a state: outlined, with no colour. */
export function PriorityTag({ priority }: { priority: MaterialPriority }) {
  return (
    <AppTag variant="kind" style={{ margin: 0 }}>
      {MATERIAL_PRIORITY_LABELS[priority] ?? priority}
    </AppTag>
  );
}
