"use client";

import React from "react";
import { Card } from "antd";
import { LABOUR_LAW_FROM } from "@erp/shared";
import { PageHeader } from "@/components/common/PageHeader";
import { LabourCompliancePanel } from "@/components/labour-compliance/LabourCompliancePanel";

export default function LabourCompliancePage() {
  return (
    <div className="page-container">
      <PageHeader
        title="Labour compliance"
        help={`Each contractor with men on the head counts in the last six months, and what they have not shown. A labour licence is needed from ${LABOUR_LAW_FROM.CLRA} men on a site, PF from ${LABOUR_LAW_FROM.PF}, ESI and BOCW from ${LABOUR_LAW_FROM.ESI}, workmen’s compensation below that, and a PF and ESI challan for every month by the 15th of the next. A subcontractor’s bill is not paid while something is missing, unless management releases it.`}
      />
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <LabourCompliancePanel />
      </Card>
    </div>
  );
}
