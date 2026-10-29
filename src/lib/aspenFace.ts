import { ASPEN_SIMLI_FACE, type VideoAvatar } from '../../supabase/functions/_shared/video-avatar';

// The legacy preset is a different person; never swap it over the new public Aspen portrait.
export function matchingAspenVideo(avatar?: VideoAvatar): VideoAvatar | undefined {
  return avatar?.faceId === ASPEN_SIMLI_FACE ? undefined : avatar;
}