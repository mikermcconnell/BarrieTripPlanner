import { auth } from '../config/firebase';
import runtimeConfig from '../config/runtimeConfig';

export async function deleteCurrentAccount() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    return { success: false, error: 'You must be signed in.' };
  }
  if (!runtimeConfig.proxy.apiBaseUrl) {
    return { success: false, error: 'Account deletion is not configured for this build.' };
  }

  try {
    const token = await user.getIdToken(true);
    const response = await fetch(`${runtimeConfig.proxy.apiBaseUrl}/api/account`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, error: data.error || 'Could not delete your account.' };
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Could not delete your account. Check your connection and try again.' };
  }
}
