import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useApi } from '../api/hooks';
import { errorMessage } from '../api/client';
import { useSnackbar } from '../components/Snackbar';
import { useT } from '../i18n/LanguageContext';
import { shrinkPhoto } from '../offline/shrink';
import { checkInPosition } from '../utils/location';

/** No face photo came back: the person closed the camera, or the phone refused it. */
class NoPhoto extends Error {
  constructor(readonly reason: 'closed' | 'no-permission') {
    super(reason);
  }
}

/** The front camera for the person's own photo, shrunk and uploaded (`POST /uploads`); resolves to the attachment's id. */
async function takeFacePhoto(api: ReturnType<typeof useApi>): Promise<string> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new NoPhoto('no-permission');
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], cameraType: ImagePicker.CameraType.front, quality: 0.6 });
  const shot = res.canceled ? undefined : res.assets[0];
  if (!shot) throw new NoPhoto('closed');
  const small = await shrinkPhoto({ uri: shot.uri, width: shot.width, height: shot.height, name: `face-${Date.now()}.jpg`, type: shot.mimeType ?? 'image/jpeg' });
  const att = await api.upload({ uri: small.uri, name: small.name, type: small.type });
  return att.id;
}

/**
 * Face attendance: Mark in and Mark out each open the front camera, and the person's photo goes with the mark, kept on
 * the day for HR to see in the staff register. Mark in also sends where the phone is when the site has a location to
 * measure from (v5 item 97). Closing the camera marks nothing. Home's day card and My attendance and leave share it.
 */
export function useFaceMark(reload: () => Promise<unknown>) {
  const api = useApi();
  const { show } = useSnackbar();
  const t = useT();
  const [busy, setBusy] = useState(false);

  const mark = async (what: 'in' | 'out', siteHasPlace: boolean) => {
    setBusy(true);
    try {
      const photoId = await takeFacePhoto(api);
      if (what === 'in') {
        const at = siteHasPlace ? await checkInPosition() : null;
        await api.post('/staff/me/check-in', { ...(at ?? {}), photoId });
      } else await api.post('/staff/me/check-out', { photoId });
      await reload();
      show(what === 'in' ? t('Marked in') : t('Marked out'), { tone: 'success' });
    } catch (e) {
      if (e instanceof NoPhoto) show(e.reason === 'closed' ? t('Take your photo to mark your attendance.') : t('Allow the camera for this app to mark your attendance with your photo.'), { tone: 'error' });
      else show(errorMessage(e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return { busy, markIn: (siteHasPlace: boolean) => void mark('in', siteHasPlace), markOut: () => void mark('out', false) };
}
