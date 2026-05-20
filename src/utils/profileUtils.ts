const norm = (p?: string) => (p ?? '').replace(/\D/g, '').slice(-10);

export function resolveProfileName(
  storedName: string | undefined,
  phone: string | undefined,
  profileMap: Map<string, string>
): string {
  if (phone) {
    const preferred = profileMap.get(norm(phone));
    if (preferred) return preferred;
  }
  return storedName || '—';
}
