import type React from 'react';

/** What a click inside a row keeps for itself: links, buttons, boxes, switches and menus. */
export const ROW_OWN_CONTROLS = 'a, button, input, label, .ant-dropdown, .ant-checkbox-wrapper, .ant-image, .ant-switch';

/**
 * `onRow` for a plain antd Table whose row opens something (pair it with `rowClassName="row-click"`): the row is a Tab
 * stop and Enter opens it, as a DataTable row does, so it is not a mouse-only target.
 */
export function openableRow(open: () => void): React.HTMLAttributes<HTMLElement> {
  return {
    tabIndex: 0,
    'aria-keyshortcuts': 'Enter',
    onClick: (e) => {
      if (!(e.target as HTMLElement).closest(ROW_OWN_CONTROLS)) open();
    },
    onKeyDown: (e) => {
      if (e.target === e.currentTarget && e.key === 'Enter') open();
    },
  };
}
