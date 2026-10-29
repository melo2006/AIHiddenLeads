import { useEffect } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FloatingPersonFrame from '@/components/FloatingPersonFrame';

afterEach(cleanup);
describe('floating person call lifecycle', () => {
  it('keeps the conversation alive when minimized and releases it when closed', () => {
    const connected = vi.fn();
    const disconnect = vi.fn();
    function Conversation() { useEffect(() => { connected(); return disconnect; }, []); return null; }
    const props = { mode: 'voice' as const, onOpen: vi.fn(), onClose: vi.fn(), onMinimize: vi.fn(), onMode: vi.fn() };
    const { rerender, unmount } = render(<FloatingPersonFrame {...props} open><Conversation /></FloatingPersonFrame>);
    expect(connected).toHaveBeenCalledTimes(1);
    rerender(<FloatingPersonFrame {...props} open={false}><Conversation /></FloatingPersonFrame>);
    expect(disconnect).toHaveBeenCalledTimes(0);
    expect(connected).toHaveBeenCalledTimes(1);
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});