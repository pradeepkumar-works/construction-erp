"use client";

import React, { useState } from "react";
import { Button, Dropdown, Space, Tabs } from "antd";
import {
  DownOutlined,
  ExportOutlined,
  ImportOutlined,
  SlidersOutlined,
} from "@ant-design/icons";
import {
  canAdjustStock,
  canKeepStock,
  canManageStore,
  canViewCost,
} from "@erp/shared";
import { useAuth } from "@/lib/auth";
import { StockBalances } from "./StockBalances";
import { StockEntries } from "./StockEntries";
import { ItemsTable } from "./ItemsTable";
import { ReceiptModal } from "./ReceiptModal";
import { IssueModal } from "./IssueModal";
import { AdjustmentModal } from "./AdjustmentModal";
import { StockMoveModal } from "./StockMoveModal";
import { StockCountModal } from "./StockCountModal";
import { StockValuation } from "./StockValuation";
import { IncomingTransfers } from "./IncomingTransfers";

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
            Receive (GRN)
          </Button>
        ) : null}
        {keeper ? (
          <Button icon={<ExportOutlined />} onClick={() => setOpen("issue")}>
            Issue
          </Button>
        ) : null}
        {adjuster ? (
          <Button icon={<SlidersOutlined />} onClick={() => setOpen("adjust")}>
            Adjust
          </Button>
        ) : null}
        <Dropdown
          trigger={["click"]}
          menu={{
            onClick: ({ key }) => setOpen(key as Action),
            items: [
              ...(keeper
                ? [
                    { key: "transfer", label: "Transfer to another project" },
                    { key: "site", label: "Return from site" },
                    { key: "vendor", label: "Return to supplier" },
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
}: {
  projectId?: string;
  initialLow?: boolean;
  initialProject?: string;
}) {
  const [tab, setTab] = useState("balances");
  const { user } = useAuth();
  const valuer =
    !!user && (canManageStore(user.roleKey) || canViewCost(user.roleKey));
  return (
    <>
      <IncomingTransfers projectId={projectId} />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        tabBarStyle={{ padding: "0 12px", marginBottom: 0 }}
        tabBarExtraContent={
          projectId ? <StockActions projectId={projectId} /> : undefined
        }
        items={[
          {
            key: "balances",
            label: "Stock on hand",
            children: (
              <StockBalances
                projectId={projectId}
                initialLow={initialLow}
                initialProject={initialProject}
              />
            ),
          },
          {
            key: "register",
            label: "Register",
            children: <StockEntries projectId={projectId} />,
          },
          ...(valuer
            ? [
                {
                  key: "valuation",
                  label: "Value & ageing",
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
              ]),
        ]}
      />
    </>
  );
}
