import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import FloatingPersonFrame from '@/components/FloatingPersonFrame';

// Ron's phone test (2026-11-14, Publish #46, Frank/Martinez demo,
// Z Fold): in the panel's CHAT (Type) state Frank rendered LARGE inside
// a visible light-gray RECTANGULAR backdrop floating over the page —
// "he floats around and there's transparent there, he's not sitting on
// the base as supposed to" — with the DRAG/−/× pill row, the Voice/Type
// pill and the "Try Frank chat" card as three separate floating pieces.
// Root cause: the frame's chat branch rendered PersonPortrait +
// AspenWindowControls + AspenModeToggle as bare siblings over the page
// (no dock), and PersonPortrait's backdrop gradient — designed as the
// LIVEBOX still's in-frame backdrop (2026-11-11 black-frame fix) —
// painted its semi-transparent rectangle on the undocked portrait.
// These tests pin the fixed state→surface mapping:
//   chat     → flat (truly transparent) portrait ending at ONE dock
//              card holding controls + toggle + chat surface;
//   voice    → unchanged: livebox seated on the voice panel card;
//   focus    → the livebox still goes flat too (floats box-free, per
//              Ron's approved mockup v2);
//   closed   → keepRendered prewarm mounting untouched.
const noop = () => {};
const frameProps = { name: 'Frank', onOpen: noop, onMinimize: noop, onClose: noop, onMode: noop };
const chatSurface = <div className="aspen-panel"><p>Try Frank chat</p></div>;

afterEach(() => cleanup());

describe('chat mode: presenter seated on ONE dock, portrait truly transparent', () => {
  it('the dock holds the window controls, the mode toggle and the chat surface — in that order', () => {
    const view = render(<FloatingPersonFrame {...frameProps} open mode="chat">{chatSurface}</FloatingPersonFrame>);
    const dock = view.getByTestId('aspen-chat-dock');
    const cluster = dock.querySelector('.aspen-person-chest-cluster');
    const toggle = dock.querySelector('[role="group"][aria-label="Conversation mode"]');
    const panel = dock.querySelector('.aspen-panel');
    expect(cluster).toBeTruthy();
    expect(toggle).toBeTruthy();
    expect(panel).toBeTruthy();
    expect(panel!.textContent).toContain('Try Frank chat');
    expect(cluster!.compareDocumentPosition(toggle!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle!.compareDocumentPosition(panel!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The dock is a real card (the voice panel card's styling), not a wash.
    expect(dock.className).toContain('bg-card');
    expect(dock.className).toContain('rounded-lg');
    expect(dock.className).toContain('border-primary/40');
  });

  it('the portrait floats flat ABOVE the dock (never inside it, never gradient-backed)', () => {
    const view = render(<FloatingPersonFrame {...frameProps} open mode="chat">{chatSurface}</FloatingPersonFrame>);
    const dock = view.getByTestId('aspen-chat-dock');
    const img = view.container.querySelector('img.aspen-person-portrait');
    expect(img).toBeTruthy();
    expect(img!.classList.contains('aspen-person-portrait-flat')).toBe(true);
    expect(dock.contains(img)).toBe(false);
    // Portrait ends at the dock's top border: it precedes the dock.
    expect(img!.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The name badge still rides the portrait (Publish #38: no control
    // overlaps the face — the badge is a label, not a control).
    expect(view.getByTestId('persona-name-label').textContent).toBe('Frank');
  });

  it('the chat surface and window controls render exactly once (no double-mounted children)', () => {
    const view = render(<FloatingPersonFrame {...frameProps} open mode="chat">{chatSurface}</FloatingPersonFrame>);
    expect(view.container.querySelectorAll('.aspen-panel')).toHaveLength(1);
    expect(view.getAllByRole('button', { name: 'Minimize' })).toHaveLength(1);
    expect(view.getAllByRole('button', { name: 'End conversation' })).toHaveLength(1);
  });
});

describe('voice + closed states: untouched by the chat dock', () => {
  it('voice mode renders no chat dock and no frame portrait', () => {
    const view = render(<FloatingPersonFrame {...frameProps} open mode="voice"><div>conversation</div></FloatingPersonFrame>);
    expect(view.queryByTestId('aspen-chat-dock')).toBeNull();
    expect(view.container.querySelector('img.aspen-person-portrait')).toBeNull();
    expect(view.getByText('conversation')).toBeTruthy();
  });

  it('closed with keepRendered still prewarms the children offscreen (chat children not duplicated)', () => {
    const view = render(<FloatingPersonFrame {...frameProps} open={false} keepRendered mode="chat">{chatSurface}</FloatingPersonFrame>);
    expect(view.queryByTestId('aspen-chat-dock')).toBeNull();
    const prewarm = view.container.querySelector('.aspen-prewarm-offscreen');
    expect(prewarm).toBeTruthy();
    expect(prewarm!.textContent).toContain('Try Frank chat');
    expect(view.container.querySelectorAll('.aspen-panel')).toHaveLength(1);
  });
});

describe('CSS + conversation pins for the floating states', () => {
  const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
  const conversation = readFileSync(resolve(__dirname, '../components/GeminiConversation.tsx'), 'utf8');

  it('flat portraits carry no backdrop; the livebox gradient itself survives (black-frame contract)', () => {
    expect(css).toContain('.aspen-person-portrait.aspen-person-portrait-flat { background: none; }');
    expect(css).toContain('.aspen-person-portrait { background: radial-gradient(');
  });

  it("inside the chat dock, the chat surface's own card chrome is neutralized (one base, not nested cards)", () => {
    const rule = css.match(/\.aspen-chat-dock \.aspen-panel \{([^}]+)\}/);
    expect(rule).toBeTruthy();
    expect(rule![1]).toContain('background-color: transparent');
    expect(rule![1]).toContain('border-color: transparent');
    expect(rule![1]).toContain('box-shadow: none');
  });

  it('the voice consent portrait floats flat; the livebox still goes flat only in focus view', () => {
    expect(conversation).toContain('<PersonPortrait name={name} avatarUrl={avatarUrl} nameLabel flat />');
    expect(conversation).toContain('<PersonPortrait name={name} avatarUrl={avatarUrl} animated={false} flat={focusView} />');
  });
});
