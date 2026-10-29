import { describe, it, expect } from 'vitest';
import { matchingAspenVideo } from '@/lib/aspenFace';
import { DEFAULT_VIDEO_AVATAR } from '../../supabase/functions/_shared/video-avatar';
describe('matching public Aspen face', () => {
  it('does not display the unrelated old preset over the blonde portrait', () => {
    expect(matchingAspenVideo({ ...DEFAULT_VIDEO_AVATAR, enabled: true })).toBeUndefined();
  });
  it('preserves a newly saved face rather than substituting a preset', () => {
    const face = { ...DEFAULT_VIDEO_AVATAR, enabled: true, faceId: 'cb9e7af5-0000-4000-8000-000000000001' };
    expect(matchingAspenVideo(face)).toBe(face);
  });
});