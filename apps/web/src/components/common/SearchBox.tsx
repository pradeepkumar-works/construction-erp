'use client';

import React, { useEffect, useState } from 'react';
import { Input } from 'antd';

/** Search input that reports its value 300 ms after typing stops (server-side search). */
export function SearchBox({ value, onChange, placeholder, width = 280 }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), 300);
    return () => clearTimeout(t);
  }, [text, value, onChange]);
  return <Input.Search allowClear placeholder={placeholder ?? 'Search'} value={text} onChange={(e) => setText(e.target.value)} onSearch={(v) => onChange(v)} style={{ width, maxWidth: '100%' }} />;
}
