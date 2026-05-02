import { supabase } from '@/lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64  = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw  = atob(b64);
  const out  = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[Push] VITE_VAPID_PUBLIC_KEY not set — push disabled');
    return null;
  }
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
}

export async function saveSubscription(userId: string, sub: PushSubscription): Promise<void> {
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: 'user_id,endpoint' }
  );
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const { endpoint } = sub;
  await sub.unsubscribe();
  await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
}

const storageKey = (userId: string) => `push_reg_${userId}`;

/** Call once on app load — silently sets up push if permission already granted or requests it. */
export async function initPushNotifications(userId: string): Promise<void> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return;

  // Already registered in this browser and permission still granted — skip DB call
  const alreadySaved = localStorage.getItem(storageKey(userId)) === '1';
  if (alreadySaved && Notification.permission === 'granted') return;

  // Permission was revoked since last save — clear stale flag
  if (alreadySaved) localStorage.removeItem(storageKey(userId));

  const permission = await requestPermission();
  if (permission !== 'granted') return;

  const sub = await subscribeToPush();
  if (sub) {
    await saveSubscription(userId, sub);
    localStorage.setItem(storageKey(userId), '1');
  }
}
