import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatWidget from '@/components/landing/demo-results/ChatWidget';
import FloatingPersonFrame from '@/components/FloatingPersonFrame';

// Chat-fix5 (Ron, 2026-11-16 — his annotated retest of the fix4
// build): two changes.
//  1) The "Email transcript & AI summary" block is OUT of the chat
//     panel for good. It used to stand between the thread and the
//     composer once the visitor had messaged, eating a quarter of
//     the box and shoving the current reply's Listen/copy/thumbs
//     row out of view. The offer now lives ONLY in an end-of-chat
//     pop-up: when the visitor taps the panel's close (X) after a
//     real conversation, the shell's close consults the guard this
//     widget registers (closeGuardRef) and the pop-up opens instead
//     of the panel closing. No conversation / copy already sent /
//     offer already resolved → the close proceeds untouched.
//     Minimize NEVER triggers it. The send itself is the old form's,
//     byte-identical: conversation-records chatCopy with the visit
//     capability, the typed email and consent: true.
//  2) The chat header is ONE row: her name sits BELOW the avatar
//     bubble (bolder, a step larger) and the Voice/Type toggle +
//     DRAG/−/X ride the avatar's row inside the header — the dead
//     space beside the name and the second row are gone, and the
//     reclaimed height goes to the thread.

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async (name: string) => (
    name === 'retell-web-call'
      ? { data: { content: 'Happy to help with that!' }, error: null }
      : { data: null, error: null }
  )),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: () => ({ insert: async () => ({ error: null }) }),
  },
}));
vi.mock('@/components/ai-elements/message', () => ({ Message: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageResponse: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));

const chatProps = {
  businessName: 'AI Hidden Leads',
  businessNiche: 'general',
  websiteUrl: 'https://aihiddenleads.com',
  businessInfo: 'AI voice and chat assistants.',
  embedded: true,
  active: true,
};

beforeEach(() => {
  mocks.invoke.mockClear();
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => cleanup());

const openChat = (ui: React.ReactElement) => {
  const view = render(ui);
  fireEvent.click(screen.getByText('Start chat & agree'));
  return view;
};

/** One full typed exchange against the mocked brain. */
async function completeExchange() {
  const field = screen.getByLabelText(/message aspen/i) as HTMLTextAreaElement;
  fireEvent.change(field, { target: { value: 'Tell me about pricing' } });
  fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
  await screen.findByText('Happy to help with that!');
}

/** Invoke the registered close guard the way a shell's close()
 *  would — inside act(), so the interception's state update lands. */
const runGuard = (guardRef: { current: (() => boolean) | null }): boolean => {
  let result = false;
  act(() => { result = guardRef.current!(); });
  return result;
};

const copyCalls = () => mocks.invoke.mock.calls.filter(
  ([name, opts]) => name === 'conversation-records'
    && (opts as { body?: { action?: string } } | undefined)?.body?.action === 'chatCopy',
);

describe('chat-fix5 — end-of-chat copy pop-up', () => {
  it('no conversation yet: the close guard declines — no pop-up, no interception', async () => {
    const guardRef: { current: (() => boolean) | null } = { current: null };
    const onRequestClose = vi.fn();
    openChat(<ChatWidget {...chatProps} closeGuardRef={guardRef} onRequestClose={onRequestClose} />);
    expect(guardRef.current).toBeTypeOf('function');
    // Only the canned greeting exists — that is NOT a conversation.
    expect(runGuard(guardRef)).toBe(false);
    expect(screen.queryByTestId('chat-copy-popup')).toBeNull();
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it('after a real exchange the guard intercepts: the pop-up carries the SAME form; No thanks finishes the close and sends nothing', async () => {
    const guardRef: { current: (() => boolean) | null } = { current: null };
    const onRequestClose = vi.fn();
    openChat(<ChatWidget {...chatProps} closeGuardRef={guardRef} onRequestClose={onRequestClose} />);
    await completeExchange();

    expect(runGuard(guardRef)).toBe(true);
    const popup = screen.getByTestId('chat-copy-popup');
    expect(within(popup).getByText('Email transcript & AI summary')).toBeTruthy();
    expect(within(popup).getByPlaceholderText('Your email')).toBeTruthy();
    expect(within(popup).getByRole('button', { name: 'Confirm email & send copy only' })).toBeTruthy();
    expect(within(popup).getByText('No marketing subscription. The private link expires in seven days.')).toBeTruthy();
    // The panel did NOT close behind the offer.
    expect(onRequestClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('chat-copy-no-thanks'));
    expect(screen.queryByTestId('chat-copy-popup')).toBeNull();
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(copyCalls()).toHaveLength(0);
    // The offer is resolved for this visit: a later close is clean.
    expect(runGuard(guardRef)).toBe(false);
  });

  it('successful send: the SAME chatCopy payload, the status inside the pop-up, then the X finishes the close — and the guard never fires again', async () => {
    const guardRef: { current: (() => boolean) | null } = { current: null };
    const onRequestClose = vi.fn();
    openChat(<ChatWidget {...chatProps} closeGuardRef={guardRef} onRequestClose={onRequestClose} />);
    await completeExchange();

    expect(runGuard(guardRef)).toBe(true);
    const popup = screen.getByTestId('chat-copy-popup');
    fireEvent.change(within(popup).getByLabelText('Conversation copy email'), { target: { value: 'visitor@example.com' } });
    fireEvent.click(within(popup).getByRole('button', { name: 'Confirm email & send copy only' }));
    await within(popup).findByText('Private copy requested.');

    expect(copyCalls()).toHaveLength(1);
    const [, opts] = copyCalls()[0] as unknown as [string, { body: { action: string; capability: string; email: string; consent: boolean } }];
    expect(opts.body.action).toBe('chatCopy');
    expect(opts.body.email).toBe('visitor@example.com');
    expect(opts.body.consent).toBe(true);
    expect(opts.body.capability.length).toBeGreaterThanOrEqual(32);
    // Sent: the No-thanks escape is gone; the X closes the visit.
    expect(screen.queryByTestId('chat-copy-no-thanks')).toBeNull();
    fireEvent.click(within(popup).getByRole('button', { name: 'Close chat' }));
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    // A copy already sent this visit → the next close is immediate.
    expect(runGuard(guardRef)).toBe(false);
  });

  it('backdrop dismissal finishes the close without sending', async () => {
    const guardRef: { current: (() => boolean) | null } = { current: null };
    const onRequestClose = vi.fn();
    openChat(<ChatWidget {...chatProps} closeGuardRef={guardRef} onRequestClose={onRequestClose} />);
    await completeExchange();
    expect(runGuard(guardRef)).toBe(true);
    const popup = screen.getByTestId('chat-copy-popup');
    fireEvent.click(popup.querySelector('[aria-hidden="true"]') as Element);
    expect(screen.queryByTestId('chat-copy-popup')).toBeNull();
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(copyCalls()).toHaveLength(0);
  });

  it('standalone widget: its own X intercepts the same way; minimize NEVER opens the pop-up', async () => {
    const onClose = vi.fn();
    openChat(<ChatWidget {...chatProps} embedded={false} onClose={onClose} />);
    await completeExchange();

    // Minimize: the pop-up must not appear, and nothing closes.
    fireEvent.click(screen.getByRole('button', { name: 'Minimize chat' }));
    expect(screen.queryByTestId('chat-copy-popup')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Expand chat' }));

    // The standalone header X is intercepted exactly like the shell's.
    fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));
    expect(screen.getByTestId('chat-copy-popup')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('chat-copy-no-thanks'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('chat-fix5 — chat header merge (FloatingPersonFrame)', () => {
  const noop = () => {};
  const frameProps = { name: 'Frank', onOpen: noop, onMinimize: noop, onClose: noop, onMode: noop };

  it('the name sits BELOW the avatar, bolder and larger; the control row rides INSIDE the header on the avatar row', () => {
    render(<FloatingPersonFrame {...frameProps} open mode="chat"><div>panel</div></FloatingPersonFrame>);
    const strip = screen.getByTestId('aspen-chat-header');
    const avatar = screen.getByTestId('aspen-chat-avatar');
    const name = screen.getByTestId('aspen-chat-name');
    expect(name.textContent).toBe('Frank');
    // Below the avatar (document order + the stack's column layout).
    expect(avatar.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(name.className).toContain('font-bold');
    expect(name.className).toContain('text-base');
    // The control row is INSIDE the header, pinned to the avatar's
    // height so its controls center on the avatar's centerline.
    const row = screen.getByTestId('aspen-control-row');
    expect(strip.contains(row)).toBe(true);
    expect(row.className).toContain('h-[72px]');
    expect(row.contains(screen.getByRole('group', { name: 'Conversation mode' }))).toBe(true);
    expect(row.contains(screen.getByRole('button', { name: 'End conversation' }))).toBe(true);
    // The strip's old expand button is gone: exactly ONE "Voice
    // view" affordance remains — the avatar itself.
    expect(screen.getAllByRole('button', { name: 'Voice view' })).toHaveLength(1);
  });

  it('no second row: the dock has no direct-child control row anymore', () => {
    render(<FloatingPersonFrame {...frameProps} open mode="chat"><div>panel</div></FloatingPersonFrame>);
    const dock = screen.getByTestId('aspen-chat-dock');
    expect(dock.querySelectorAll(':scope > [data-testid="aspen-control-row"]')).toHaveLength(0);
    expect(dock.querySelectorAll(':scope > [data-testid="aspen-chat-header"]')).toHaveLength(1);
  });
});
