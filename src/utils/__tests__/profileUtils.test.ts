import { describe, it, expect } from 'vitest';
import { resolveProfileName } from '../profileUtils';

describe('resolveProfileName', () => {
  const map = new Map([
    ['9876543210', 'Registered User'],
    ['8888888888', 'Another User'],
  ]);

  it('returns profile name when phone matches', () => {
    expect(resolveProfileName('Old Name', '9876543210', map)).toBe('Registered User');
  });

  it('returns stored name when phone not in map', () => {
    expect(resolveProfileName('Loan Name', '7777777777', map)).toBe('Loan Name');
  });

  it('returns stored name when phone is undefined', () => {
    expect(resolveProfileName('Loan Name', undefined, map)).toBe('Loan Name');
  });

  it('returns "—" when storedName is empty and no phone match', () => {
    expect(resolveProfileName('', '7777777777', map)).toBe('—');
  });

  it('returns "—" when storedName is undefined and no phone match', () => {
    expect(resolveProfileName(undefined, undefined, map)).toBe('—');
  });

  it('normalizes phone with country code (+91) before lookup', () => {
    // +919876543210 → last 10 digits → 9876543210 → should match
    expect(resolveProfileName('Old Name', '+919876543210', map)).toBe('Registered User');
  });

  it('normalizes phone with spaces/dashes', () => {
    expect(resolveProfileName('Old Name', '98-765-43210', map)).toBe('Registered User');
  });

  it('empty map → always returns storedName or "—"', () => {
    const empty = new Map<string, string>();
    expect(resolveProfileName('Someone', '9876543210', empty)).toBe('Someone');
    expect(resolveProfileName('', '9876543210', empty)).toBe('—');
  });
});
