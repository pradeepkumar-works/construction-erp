'use client';

import React from 'react';
import { Flex } from 'antd';
import type { TabsProps } from 'antd';

/**
 * A tab bar with buttons beside it. antd's `tabBarExtraContent` puts them inside the bar's role="tablist", which may
 * hold only tabs (WCAG, UI roadmap item 65), so pass this as `renderTabBar` instead.
 */
export function tabBarWithExtra(extra: React.ReactNode): TabsProps['renderTabBar'] {
  // eslint-disable-next-line react/display-name
  return (props, DefaultTabBar) => (
    <Flex align="center" style={{ ...(props.style as React.CSSProperties) }}>
      <DefaultTabBar {...props} style={{ flex: 1, minWidth: 0, marginBottom: 0 }} />
      {extra}
    </Flex>
  );
}
