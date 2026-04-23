import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { profilesService, type Profile } from '@/services/profilesService';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  needsPasswordReset: boolean;   // admin email recovery flow
  needsFirstTimeSetup: boolean;  // phone user — must set password + security Q
  isAdmin: boolean;
  isMediator: boolean;
  isBorrower: boolean;
  isDisabled: boolean;           // phone user whose account has been disabled by admin
  hasFullAccess: boolean;        // isAdmin OR phone user who has set a custom password
  userPhone: string;
  adminPhone: string;
  displayName: string;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithPhone: (phone: string, password?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
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
  const [user, setUser]                     = useState<User | null>(null);
  const [session, setSession]               = useState<Session | null>(null);
  const [profile, setProfile]               = useState<Profile | null>(null);
  const [loading, setLoading]               = useState(true);
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
      // Only update loading after initial getSession() has resolved to avoid flicker
      if (initializedRef.current) setLoading(false);
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  // Phone login — password is optional
  // No password = sign in with phone-as-default (view-only until setup)
  // With password = full access
  const signInWithPhone = useCallback(async (phone: string, password?: string) => {
    const cleaned = phone.replace(/\D/g, '').slice(-10);
    if (cleaned.length < 10) return { error: 'Enter a valid 10-digit phone number' };

    const email = `${cleaned}@user.local`;

    if (password) {
      // Try with the provided custom password
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) return { error: null };
      // Wrong password
      return { error: 'Incorrect password. Use "Forgot password?" if you need to reset it.' };
    }

    // No password — try with phone-as-default password (view-only / first-time mode)
    const { error: e1 } = await supabase.auth.signInWithPassword({ email, password: cleaned });
    if (!e1) return { error: null };

    // First attempt failed — account either has a custom password or doesn't exist
    // Never call signUp here: doing so would reset an existing custom password (security hole)
    if (e1.message?.toLowerCase().includes('email not confirmed')) {
      return { error: 'Login blocked by email confirmation. Go to Supabase → Auth → Settings and disable "Enable email confirmations".' };
    }

    // Distinguish: if they've likely set a custom password vs. account doesn't exist
    // We can't tell from the error alone, so show a helpful message with both options
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

  // Phone user first-time setup: set password + save security Q&A to profile
  const updatePasswordWithSecurity = useCallback(async (
    newPassword: string,
    question: string,
    answer: string,
  ) => {
    // Update password and mark as changed in metadata
    const { error, data } = await supabase.auth.updateUser({
      password: newPassword,
      data: { password_changed: true },
    });
    if (error) return { error: error.message };

    // Save security Q&A to profiles table — normalize answer for consistent comparison
    if (data.user) {
      await supabase
        .from('profiles')
        .update({ security_question: question, security_answer: answer.trim().toLowerCase() })
        .eq('id', data.user.id);
      setUser(data.user);
    }

    return { error: null };
  }, []);

  const updateProfile = useCallback(async (name: string, phone?: string) => {
    const meta: Record<string, string> = { full_name: name.trim() };
    if (phone !== undefined) meta.admin_phone = phone.replace(/\D/g, '').slice(-10);
    const { error, data } = await supabase.auth.updateUser({ data: meta });
    if (error) return { error: error.message };
    setUser(data.user);
    return { error: null };
  }, []);

  const isPhoneUser        = user?.email?.endsWith('@user.local') ?? false;
  const isAdmin            = !!user && !isPhoneUser;
  const isMediator         = isPhoneUser;
  const isBorrower         = isPhoneUser;
  const isDisabled         = isPhoneUser && profile?.isActive === false;
  const passwordChanged    = user?.user_metadata?.password_changed === true;
  const needsFirstTimeSetup = isPhoneUser && !passwordChanged && !isDisabled;
  const hasFullAccess      = isAdmin || (isPhoneUser && passwordChanged && !isDisabled);

  const userPhone   = isPhoneUser ? (user?.email?.split('@')[0] ?? '') : '';
  const adminPhone  = isAdmin ? ((user?.user_metadata?.admin_phone as string | undefined) ?? '') : '';
  const displayName = (user?.user_metadata?.full_name as string | undefined)
    || (isPhoneUser ? userPhone : (user?.email ?? ''));

  return (
    <AuthContext.Provider value={{
      user, session, profile, loading,
      needsPasswordReset, needsFirstTimeSetup,
      isAdmin, isMediator, isBorrower, isDisabled, hasFullAccess,
      userPhone, adminPhone, displayName,
      signIn, signInWithPhone, signOut,
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
