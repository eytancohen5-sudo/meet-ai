import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '../../stores/auth';

export default function MemberLayout() {
  const { user, isLoading } = useAuth();
  useEffect(() => {
    if (!isLoading && !user) router.replace('/auth/login');
  }, [user, isLoading]);
  return <Stack screenOptions={{ headerShown: false }} />;
}
