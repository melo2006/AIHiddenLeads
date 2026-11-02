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

  it('converts spelled dates to digit ordinals (the promo line the owner caught)', () => {
    expect(displayNumbers('The promotion goes until November thirtieth.'))
      .toBe('The promotion goes until November 30th.');
    expect(displayNumbers('It starts on March fourth and ends April twenty-first.'))
      .toBe('It starts on March 4th and ends April 21st.');
    expect(displayNumbers('the thirtieth of November')).toBe('the 30th of November');
    expect(displayNumbers('Your trial ends on the third.')).toBe('Your trial ends on the 3rd.');
    expect(displayNumbers('December twenty-fifth')).toBe('December 25th');
  });

  it('converts every simple ordinal class with the right suffix', () => {
    expect(displayNumbers('the first call')).toBe('the 1st call');
    expect(displayNumbers('the second call')).toBe('the 2nd call');
    expect(displayNumbers('the third call')).toBe('the 3rd call');
    expect(displayNumbers('the fourth quarter')).toBe('the 4th quarter');
    expect(displayNumbers('the fifth day')).toBe('the 5th day');
    expect(displayNumbers('the eighth caller')).toBe('the 8th caller');
    expect(displayNumbers('the ninth inning')).toBe('the 9th inning');
    expect(displayNumbers('the tenth prospect')).toBe('the 10th prospect');
    // 11/12/13 take "th", never "st"/"nd"/"rd".
    expect(displayNumbers('the eleventh hour')).toBe('the 11th hour');
    expect(displayNumbers('the twelfth day')).toBe('the 12th day');
    expect(displayNumbers('the thirteenth floor')).toBe('the 13th floor');
    expect(displayNumbers('the nineteenth call')).toBe('the 19th call');
    expect(displayNumbers('took second place')).toBe('took 2nd place');
  });

  it('converts tens ordinals and compound ordinals, hyphenated and spaced', () => {
    expect(displayNumbers('the twentieth century')).toBe('the 20th century');
    expect(displayNumbers('the thirtieth day')).toBe('the 30th day');
    expect(displayNumbers('the fortieth caller')).toBe('the 40th caller');
    expect(displayNumbers('the ninetieth day')).toBe('the 90th day');
    expect(displayNumbers('twenty-first')).toBe('21st');
    expect(displayNumbers('twenty-second')).toBe('22nd');
    expect(displayNumbers('twenty-third')).toBe('23rd');
    expect(displayNumbers('twenty-ninth')).toBe('29th');
    expect(displayNumbers('thirty-first')).toBe('31st');
    expect(displayNumbers('forty-second')).toBe('42nd');
    expect(displayNumbers('the twenty first of May')).toBe('the 21st of May');
    expect(displayNumbers('the thirty second caller')).toBe('the 32nd caller');
  });

  it('keeps capitalization conventions for ordinals', () => {
    expect(displayNumbers('Thirtieth is the last day.')).toBe('30th is the last day.');
    expect(displayNumbers('Offer ends NOVEMBER THIRTIETH')).toBe('Offer ends NOVEMBER 30TH');
    expect(displayNumbers('Twenty-First of the month')).toBe('21st of the month');
  });

  it('leaves "second" spelled when it names a unit of time', () => {
    expect(displayNumbers('wait a second')).toBe('wait a second');
    expect(displayNumbers('in a second')).toBe('in a second');
    // The cardinal pass still owns the quantity: "one second" is 1 second long.
    expect(displayNumbers('one second')).toBe('1 second');
    expect(displayNumbers('per second')).toBe('per second');
    expect(displayNumbers('every second counts')).toBe('every second counts');
    expect(displayNumbers('a twenty-second spot')).toBe('a twenty-second spot');
    expect(displayNumbers('thirty seconds')).toBe('30 seconds');
  });

  it('leaves ordinal idioms and fixed phrases spelled', () => {
    expect(displayNumbers('At first, nobody answered.')).toBe('At first, nobody answered.');
    expect(displayNumbers('First of all, welcome in.')).toBe('First of all, welcome in.');
    expect(displayNumbers('a third of callers')).toBe('a third of callers');
    expect(displayNumbers('first-class service')).toBe('first-class service');
    expect(displayNumbers('a twenty-first-century business')).toBe('a twenty-first-century business');
    expect(displayNumbers('what is your first name?')).toBe('what is your first name?');
    expect(displayNumbers('on second thought')).toBe('on second thought');
    // Spoken-list enumerators and the turn-initial discourse marker are not ranks.
    expect(displayNumbers('First, she answers every call. Second, she books it.'))
      .toBe('First, she answers every call. Second, she books it.');
    expect(displayNumbers('First response')).toBe('First response');
    // Range selector, already covered above: "first" picks the initial three.
    expect(displayNumbers('the first three months')).toBe('the first 3 months');
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
