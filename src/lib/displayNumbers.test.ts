import { describe, expect, it } from 'vitest';
import { displayNumbers } from './displayNumbers';

describe('displayNumbers', () => {
  it('converts percents to digits with a % sign', () => {
    expect(displayNumbers('seventy-eight percent')).toBe('78%');
    expect(displayNumbers('eighty-five percent')).toBe('85%');
    expect(displayNumbers('Eighty-five percent of callers who hit voicemail never call back.'))
      .toBe('85% of callers who hit voicemail never call back.');
    expect(displayNumbers('sixty-seven percent hang up, and seventy-eight percent walk away'))
      .toBe('67% hang up, and 78% walk away');
    expect(displayNumbers('one hundred percent')).toBe('100%');
  });

  it('converts dollars to a $ amount and drops the word', () => {
    expect(displayNumbers('ninety-nine dollars a month')).toBe('$99 a month');
    expect(displayNumbers('It is ninety-nine dollars a month, not three ninety-nine.'))
      .toBe('It is $99 a month, not three ninety-nine.');
    expect(displayNumbers('five dollars and fifty cents')).toBe('$5 and 50 cents');
  });

  it('converts plain cardinals before their units', () => {
    expect(displayNumbers('four hundred minutes')).toBe('400 minutes');
    expect(displayNumbers('two minutes')).toBe('2 minutes');
    expect(displayNumbers('fifty B2B prospects')).toBe('50 B2B prospects');
    expect(displayNumbers('one hundred and five minutes')).toBe('105 minutes');
    expect(displayNumbers('one thousand two hundred minutes')).toBe('1200 minutes');
    expect(displayNumbers('a hundred calls a month')).toBe('100 calls a month');
    expect(displayNumbers('zero missed calls')).toBe('0 missed calls');
    expect(displayNumbers('the first three months')).toBe('the first 3 months');
  });

  it('converts quantity uses of "one"', () => {
    expect(displayNumbers('after just one unanswered call')).toBe('after just 1 unanswered call');
    expect(displayNumbers('one percent of callers')).toBe('1% of callers');
  });

  it('handles the around-the-clock phrases', () => {
    expect(displayNumbers('twenty-four seven')).toBe('24/7');
    expect(displayNumbers('We answer twenty-four seven.')).toBe('We answer 24/7.');
    expect(displayNumbers('twenty-four hours a day, seven days a week'))
      .toBe('24 hours a day, 7 days a week');
  });

  it('leaves pronoun and idiom uses of "one" alone', () => {
    expect(displayNumbers('one of the best options')).toBe('one of the best options');
    expect(displayNumbers('This one is yours.')).toBe('This one is yours.');
    expect(displayNumbers("one's own website")).toBe("one's own website");
  });

  it('never alters digits, times, phone numbers or URLs', () => {
    expect(displayNumbers('Demo time remaining: 14:50')).toBe('Demo time remaining: 14:50');
    expect(displayNumbers('85% of callers')).toBe('85% of callers');
    expect(displayNumbers('Call +1 (561) 275-5757 in two minutes')).toBe('Call +1 (561) 275-5757 in 2 minutes');
    expect(displayNumbers('See https://aihiddenleads.com/demo in two minutes'))
      .toBe('See https://aihiddenleads.com/demo in 2 minutes');
    expect(displayNumbers('Open aihiddenleads.com and save fifty dollars'))
      .toBe('Open aihiddenleads.com and save $50');
  });

  it('stays conservative on phrases it cannot parse safely', () => {
    expect(displayNumbers('hundreds of calls')).toBe('hundreds of calls');
    expect(displayNumbers('a one-time offer')).toBe('a one-time offer');
    expect(displayNumbers('three point five stars')).toBe('three point five stars');
    expect(displayNumbers('five and six people')).toBe('five and six people');
    expect(displayNumbers('Yes — whichever feels more natural.')).toBe('Yes — whichever feels more natural.');
    expect(displayNumbers('')).toBe('');
  });
});
