import { describe, it, expect } from 'vitest';
import { AVATAR_DEVICES, avatarCoordinates, deviceScale } from '@/lib/avatarLayout';
describe('avatar device layout', () => {
  it('offers phone and tablet both orientations plus desktop', () => {
    expect(AVATAR_DEVICES.map(d => [d.width,d.height])).toEqual([[390,844],[844,390],[768,1024],[1024,768],[1440,900]]);
  });
  it('scales a desktop into a 320 pixel panel', () => {
    expect(deviceScale(1440,900,320)).toBeCloseTo(320/1440);
  });
  it('places the same 200px avatar in the lower right and center', () => {
    expect(avatarCoordinates('bottom-right',200,390,844)).toEqual({left:178,top:532});
    expect(avatarCoordinates('center',200,390,844)).toEqual({left:95,top:322});
  });
});