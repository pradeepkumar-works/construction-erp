"use client";

import React, { useState } from "react";
import { Button, Dropdown, Space } from "antd";
import { AppTabs } from "@/components/common/AppTabs";
import {
  DownOutlined,
  ExportOutlined,
  ImportOutlined,
  SlidersOutlined,
} from "@/components/common/icons";
import {
  canAdjustStock,
  canKeepStock,
  canManageStore,
  canViewCost,
} from "@erp/shared";
import { useAuth } from "@/lib/auth";
import { useUrlTab } from "@/lib/url-state";
import { StockBalances } from "./StockBalances";
import { StockEntries } from "./StockEntries";
import { ItemsTable } from "./ItemsTable";
import { UnitsTable } from "./UnitsTable";
import { ReceiptModal } from "./ReceiptModal";
import { IssueModal } from "./IssueModal";
import { AdjustmentModal } from "./AdjustmentModal";
import { StockMoveModal } from "./StockMoveModal";
import { StockCountModal } from "./StockCountModal";
import { StockValuation } from "./StockValuation";
import { IncomingTransfers } from "./IncomingTransfers";
import { DeliveriesExpected, seesDeliveries } from "./DeliveriesExpected";
import { Weighbridge } from "./Weighbridge";

type Action =
  | "receipt"
  | "issue"
  | "adjust"
  | "transfer"
  | "vendor"
  | "site"
  | "count";

/** Receive / Issue / Adjust buttons, and transfers, returns and the stock count, for the roles allowed to use them. */
export function StockActions({ projectId }: { projectId?: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState<Action | null>(null);
  if (!user) return null;
  const keeper = canKeepStock(user.roleKey);
  const adjuster = canAdjustStock(user.roleKey);
  if (!keeper && !adjuster) return null;
  return (
    <>
      <Space wrap>
        {keeper ? (
          <Button
            type="primary"
            icon={<ImportOutlined />}
            onClick={() => setOpen("receipt")}
          >
            Receive material (GRN)
          </Button>
        ) : null}
        {keeper ? (
          <Button icon={<ExportOutlined />} onClick={() => setOpen("issue")}>
            Issue material
          </Button>
        ) : null}
        {adjuster ? (
          <Button icon={<SlidersOutlined />} onClick={() => setOpen("adjust")}>
            Adjust stock
          </Button>
        ) : null}
        <Dropdown
          trigger={["click"]}
          menu={{
            onClick: ({ key }) => setOpen(key as Action),
            items: [
              ...(keeper
                ? [
                    { key: "transfer", label: "Transfer to a site or store" },
                    { key: "site", label: "Return from site" },
                    { key: "vendor", label: "Return to vendor" },
                  ]
                : []),
              ...(adjuster ? [{ key: "count", label: "Stock count" }] : []),
            ],
          }}
        >
          <Button>
            More <DownOutlined />
          </Button>
        </Dropdown>
      </Space>
      <ReceiptModal
        open={open === "receipt"}
        onClose={() => setOpen(null)}
        projectId={projectId}
      />
      <IssueModal
        open={open === "issue"}
        onClose={() => setOpen(null)}
        projectId={projectId}
      />
      <AdjustmentModal
        open={open === "adjust"}
        onClose={() => setOpen(null)}
        projectId={projectId}
      />
      {open === "transfer" || open === "vendor" || open === "site" ? (
        <StockMoveModal
          move={open}
          open
          onClose={() => setOpen(null)}
          projectId={projectId}
        />
      ) : null}
      <StockCountModal
        open={open === "count"}
        onClose={() => setOpen(null)}
        projectId={projectId}
      />
    </>
  );
}

/** Stock on hand and the store register, for one project (project tab) or all of them (Stock page, which also shows the item master). */
export function StockPanel({
  projectId,
  initialLow,
  initialProject,
  initialSearch,
}: {
  projectId?: string;
  initialLow?: boolean;
  initialProject?: string;
  /** Stock on hand opens searched for this (an item picked in Search). */
  initialSearch?: string;
}) {
  const { user } = useAuth();
  const valuer =
    !!user && (canManageStore(user.roleKey) || canViewCost(user.roleKey));
  // What is on order for the store, so the store keeper receives it from here (not from Purchase orders). The tab carries
  // no count: one arriving after the first paint would move the tab bar and its buttons under a click (My work counts them).
  const receiver = seesDeliveries(user?.roleKey);
  // The open tab is `?sub=` in the URL (UX item 84), so a reload or a link keeps it.
  const tabs = [
    "balances",
    ...(receiver ? ["deliveries", "weighbridge"] : []),
    "register",
    ...(valuer ? ["valuation"] : []),
    ...(projectId ? [] : ["items", "units"]),
  ];
  const [tab, setTab] = useUrlTab<string>(tabs, "balances");
  return (
    <>
      <IncomingTransfers projectId={projectId} />
      <AppTabs
        activeKey={tab}
        onChange={setTab}
        variant="page"
        extra={projectId ? <StockActions projectId={projectId} /> : undefined}
        items={[
          {
            key: "balances",
            label: "Stock on hand",
            children: (
              <StockBalances
                projectId={projectId}
                initialLow={initialLow}
                initialProject={initialProject}
                initialSearch={initialSearch}
              />
            ),
          },
          ...(receiver
            ? [
                {
                  key: "deliveries",
                  label: "Deliveries expected",
                  children: <DeliveriesExpected projectId={projectId} />,
                },
                {
                  key: "weighbridge",
                  label: "Weighbridge",
                  children: <Weighbridge projectId={projectId} />,
                },
              ]
            : []),
          {
            key: "register",
            label: "Stock register",
            children: <StockEntries projectId={projectId} />,
          },
          ...(valuer
            ? [
                {
                  key: "valuation",
                  label: "Value and ageing",
                  children: <StockValuation projectId={projectId} />,
                },
              ]
            : []),
          ...(projectId
            ? []
            : [
                {
                  key: "items",
                  label: "Item master",
                  children: <ItemsTable />,
                },
                {
                  key: "units",
                  label: "Units",
                  children: <UnitsTable />,
                },
              ]),
        ]}
      />
    </>
  );
}
