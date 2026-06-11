import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { getContexts, upsertContext, deleteContext } from '../lib/database';
import { Context } from '../types';
import { nanoid } from './_utils';
import { EmptyState } from '../components/EmptyState';

// Places list (02-screen-designs Screen 8): plain name rows, trash with a
// single confirm, name-only add with NOT NULL defaults (challenger
// amendment 8). Deliberately boring and buried — creation happens inline
// where it's needed.
export default function PlacesScreen() {
  const [places, setPlaces] = useState<Context[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      setPlaces(await getContexts());
    } catch (err) {
      console.error('Failed to load places:', err);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = () => {
    Alert.prompt(
      'Add a place',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: async (name?: string) => {
            const trimmed = name?.trim();
            if (!trimmed) return;
            // Name-only creation with the NOT NULL defaults
            // (context_type 'space', icon 📍, default color — amendment 8).
            const ctx: Context = {
              id: nanoid(),
              name: trimmed,
              icon: '📍',
              color: '#6E8FAC',
              context_type: 'space',
            };
            try {
              await upsertContext(ctx);
              await load();
            } catch (err) {
              console.error('Failed to add place:', err);
            }
          },
        },
      ],
      'plain-text'
    );
  };

  // Single confirm — exactly one Alert between tap and delete.
  const handleDelete = (place: Context) => {
    Alert.alert(
      'Delete place',
      `Delete "${place.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteContext(place.id);
              await load();
            } catch (err) {
              console.error('Failed to delete place:', err);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-bg">
      {/* Header */}
      <View className="px-5 pt-4 pb-5 flex-row items-center">
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="mr-3"
        >
          <Ionicons name="chevron-back" size={24} color="#1A1D23" />
        </TouchableOpacity>
        <Text className="text-text-primary text-2xl font-bold tracking-tight flex-1">Places</Text>
        <TouchableOpacity
          onPress={handleAdd}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add" size={26} color="#3B5BDB" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {isLoaded && places.length === 0 ? (
          <EmptyState
            icon="location-outline"
            title="No places yet"
            body="Places tag where a session happened. You can also add one right from the recording screen."
            action={{ label: 'Add a place', onPress: handleAdd }}
          />
        ) : (
          <View className="bg-white rounded-2xl border border-border divide-y divide-gray-100">
            {places.map((place) => (
              <View key={place.id} className="p-4 flex-row items-center justify-between">
                <Text className="text-text-primary font-medium flex-1 mr-3" numberOfLines={1}>
                  {place.name}
                </Text>
                <TouchableOpacity
                  onPress={() => handleDelete(place)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={18} color="#E53E3E" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
