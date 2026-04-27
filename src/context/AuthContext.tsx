import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { profilesService, type Profile } from '@/services/profilesService';

interface AuthContextValue {
  user:        User | null;
  session:     Session | null;
  profile:     Profile | null;
  loading:     boolean;

  // Role flags
  isSuperAdmin: boolean;       // platform super admin (set manually in DB)
  isAdmin:      boolean;       // alias for isSuperAdmin (keeps existing guards working)
  isDisabled:   boolean;       // account disabled by admin (old phone users)

  // User info
  phone:       string;         // from profiles.phone (works for all users)
  fullName:    string;         // from profiles.full_name
  displayName: string;         // best available display name

  // Legacy — kept for backward compat with existing phone-user flow
  needsPasswordReset:   boolean;
  needsFirstTimeSetup:  boolean;
  hasFullAccess:        boolean;
  userPhone:            string;
  adminPhone:           string;
  isMediator:           boolean;
  isBorrower:           boolean;

  // Actions
  signIn:   (email: string, password: string) => Promise<{ error: string | null }>;
  signUp:   (name: string, email: string, phone: string, password: string, inviteToken?: string) => Promise<{ error: string | null }>;
  signInWithPhone: (phone: string, password?: string) => Promise<{ error: string | null }>;
  signOut:  () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  updatePasswordWithSecurity: (
    newPassword: string,
    question: string,
    answer: string
  ) => Promise<{ error: string | null }>;
  updateProfile: (name: string, phone?: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false);
  const initializedRef = useRef(false);

  async function loadProfile(u: User | null) {
    if (!u) { setProfile(null); return; }
    const p = await profilesService.getProfile(u.id);
    setProfile(p);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      loadProfile(session?.user ?? null).finally(() => {
        initializedRef.current = true;
        setLoading(false);
      });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setNeedsPasswordReset(true);
      loadProfile(session?.user ?? null);
      if (initializedRef.current) setLoading(false);
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sign in with email + password ────────────────────────────
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  // ── Register new user (invitation-only) ──────────────────────
  const signUp = useCallback(async (
    name: string,
    email: string,
    phone: string,
    password: string,
    inviteToken?: string,
  ) => {
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    // Validate invite token before creating account
    if (inviteToken) {
      const { data, error: rpcError } = await supabase
        .rpc('validate_invitation', { p_token: inviteToken });
      if (rpcError || !data?.length || !data[0].is_valid) {
        return { error: 'Invalid or expired invitation link.' };
      }
      // If invite is phone-specific, verify it matches
      const invitePhone = data[0].phone as string;
      if (invitePhone && invitePhone !== '' && invitePhone !== cleanPhone) {
        return { error: 'This invitation is for a different phone number.' };
      }
    }

    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name.trim(), phone: cleanPhone },
      },
    });

    if (error) return { error: error.message };

    // Mark invitation as used
    if (inviteToken && data.user) {
      await supabase.rpc('use_invitation', {
        p_token:   inviteToken,
        p_user_id: data.user.id,
      });
    }

    return { error: null };
  }, []);

  // ── Legacy phone login (@user.local) — kept for existing users ──
  const signInWithPhone = useCallback(async (phone: string, password?: string) => {
    const cleaned = phone.replace(/\D/g, '').slice(-10);
    if (cleaned.length < 10) return { error: 'Enter a valid 10-digit phone number' };

    const email = `${cleaned}@user.local`;

    if (password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) return { error: null };
      return { error: 'Incorrect password. Use "Forgot password?" if you need to reset it.' };
    }

    const { error: e1 } = await supabase.auth.signInWithPassword({ email, password: cleaned });
    if (!e1) return { error: null };

    if (e1.message?.toLowerCase().includes('email not confirmed')) {
      return { error: 'Login blocked by email confirmation. Disable it in Supabase → Auth → Settings.' };
    }

    return { error: 'password_required' };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    setNeedsPasswordReset(false);
    return { error: null };
  }, []);

  // Legacy: phone user first-time setup
  const updatePasswordWithSecurity = useCallback(async (
    newPassword: string,
    question: string,
    answer: string,
  ) => {
    const { error, data } = await supabase.auth.updateUser({
      password: newPassword,
      data: { password_changed: true },
    });
    if (error) return { error: error.message };

    if (data.user) {
      await supabase
        .from('profiles')
        .update({ security_question: question, security_answer: answer.trim().toLowerCase() })
        .eq('id', data.user.id);
      setUser(data.user);
    }

    return { error: null };
  }, []);

  // Update display name and optionally phone
  const updateProfile = useCallback(async (name: string, phone?: string) => {
    // Update Supabase Auth metadata
    const meta: Record<string, string> = { full_name: name.trim() };
    if (phone !== undefined) meta.admin_phone = phone.replace(/\D/g, '').slice(-10);
    const { error, data } = await supabase.auth.updateUser({ data: meta });
    if (error) return { error: error.message };

    // Also update profiles table
    if (data.user) {
      await profilesService.updateProfile(data.user.id, {
        fullName: name.trim(),
        ...(phone !== undefined ? { phone: phone.replace(/\D/g, '').slice(-10) } : {}),
      });
      // Reload profile to reflect changes
      await loadProfile(data.user);
      setUser(data.user);
    }

    return { error: null };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived state ─────────────────────────────────────────────
  const isSuperAdmin = profile?.isSuperAdmin ?? false;
  const isAdmin      = isSuperAdmin;  // keeps AdminOnly guards working

  // phone: prefer profiles table (works for all users including new registrations)
  const isPhoneUser  = user?.email?.endsWith('@user.local') ?? false;
  const phone        = profile?.phone ?? (isPhoneUser ? (user?.email?.split('@')[0] ?? '') : '');
  const fullName     = profile?.fullName ?? '';
  const displayName  = fullName || (user?.user_metadata?.full_name as string | undefined) || (isPhoneUser ? phone : (user?.email ?? ''));

  const isDisabled        = isPhoneUser && profile?.isActive === false;
  const passwordChanged   = user?.user_metadata?.password_changed === true;
  const needsFirstTimeSetup = isPhoneUser && !passwordChanged && !isDisabled;
  const hasFullAccess     = isAdmin || (isPhoneUser && passwordChanged && !isDisabled) || (!isPhoneUser && !!user);

  // Legacy
  const userPhone  = isPhoneUser ? (user?.email?.split('@')[0] ?? '') : '';
  const adminPhone = isAdmin ? ((user?.user_metadata?.admin_phone as string | undefined) ?? '') : '';

  return (
    <AuthContext.Provider value={{
      user, session, profile, loading,
      isSuperAdmin, isAdmin, isDisabled,
      phone, fullName, displayName,
      needsPasswordReset, needsFirstTimeSetup, hasFullAccess,
      userPhone, adminPhone,
      isMediator: isPhoneUser,
      isBorrower: isPhoneUser,
      signIn, signUp, signInWithPhone, signOut,
      updatePassword, updatePasswordWithSecurity, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
