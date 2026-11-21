import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import en from '../i18n/locales/en.json';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const [namespace, name] = key.split('.');
      return (en as unknown as Record<string, Record<string, string>>)[namespace]?.[name] ?? key;
    },
  }),
}));

import DemoStartConfirmation from '../components/DemoStartConfirmation';
import { DEMO_CONSENT_DISCLOSURE } from '../lib/demoVerification';

const action = {
  id: 'demo-1',
  action: 'request_demo_start',
  demo: { websiteUrl: 'acme-plumbing.com', name: 'Pat Lee', email: 'pat@example.com' },
};

test('the demo card pre-fills the heard address and the captured contact', () => {
  render(<DemoStartConfirmation action={action} onAnswer={vi.fn()} />);
  expect(screen.getByLabelText('Your website address')).toHaveValue('acme-plumbing.com');
  expect(screen.getByLabelText('Confirmed full name')).toHaveValue('Pat Lee');
  expect(screen.getByLabelText('Confirmed email')).toHaveValue('pat@example.com');
});

test('consent is disclosure-by-continuing: the gate disclosure shows and there is no checkbox', () => {
  const { container } = render(<DemoStartConfirmation action={action} onAnswer={vi.fn()} />);
  expect(screen.getByText(DEMO_CONSENT_DISCLOSURE)).toBeTruthy();
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();
});

test('confirming submits the normalized address with the edited details', () => {
  const onAnswer = vi.fn();
  render(<DemoStartConfirmation action={action} onAnswer={onAnswer} />);
  fireEvent.change(screen.getByLabelText('Your website address'), { target: { value: 'acme-plumbing.com/' } });
  fireEvent.click(screen.getByRole('button', { name: 'Start my demo' }));
  expect(onAnswer).toHaveBeenCalledWith(true, {
    websiteUrl: 'https://acme-plumbing.com',
    name: 'Pat Lee',
    email: 'pat@example.com',
  });
});

test('a bad address blocks the start with an error and answers nothing', () => {
  const onAnswer = vi.fn();
  render(<DemoStartConfirmation action={action} onAnswer={onAnswer} />);
  fireEvent.change(screen.getByLabelText('Your website address'), { target: { value: 'my shop' } });
  fireEvent.click(screen.getByRole('button', { name: 'Start my demo' }));
  expect(onAnswer).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain("doesn't look right");
});

test('only the explicit buttons dismiss the card — editing never answers', () => {
  const onAnswer = vi.fn();
  render(<DemoStartConfirmation action={action} onAnswer={onAnswer} />);
  fireEvent.change(screen.getByLabelText('Your website address'), { target: { value: 'other-shop.com' } });
  fireEvent.keyDown(screen.getByLabelText('Your website address'), { key: 'Escape' });
  expect(onAnswer).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
  expect(onAnswer).toHaveBeenCalledWith(false);
});
