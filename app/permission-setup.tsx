import * as Camera from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

export default function PermissionSetup() {
  const router = useRouter();

  // Real hooks for permissions
  const [locationStatus, requestLocation] = Location.useForegroundPermissions();
  const [cameraStatus, requestCamera] = Camera.useCameraPermissions();
  const [photoStatus, requestPhotos] = ImagePicker.useMediaLibraryPermissions();

  // Static state for Notifications (Mocked to bypass the SDK 53 Expo Go crash)
  const [notifGranted, setNotifGranted] = useState(false);

  const handleRequest = async (id: string) => {
    if (id === 'location') await requestLocation();
    if (id === 'camera') await requestCamera();
    if (id === 'photos') await requestPhotos();
    if (id === 'notifications') {
      setNotifGranted(true);
    }
  };

  // Check if all are granted
  const allPermissionsGranted =
    locationStatus?.granted &&
    cameraStatus?.granted &&
    photoStatus?.granted &&
    notifGranted;

  const handleContinue = () => {
    if (allPermissionsGranted) {
      // EXPO ROUTER TIP: Try navigating directly to the name of the file 
      // within the group if the path string is failing.
      router.replace('/dashboard');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Permission Setup</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Help us keep Cebu safe</Text>
        <Text style={styles.subtitle}>
          Granting these permissions ensures you receive timely alerts and can report incidents accurately.
        </Text>

        <PermissionCard
          title="Location Services"
          desc="Enable location for barangay-specific alerts."
          icon="📍"
          granted={locationStatus?.granted}
          onPress={() => handleRequest('location')}
        />

        <PermissionCard
          title="Push Notifications"
          desc="Stay informed with real-time flood warnings."
          icon="🔔"
          granted={notifGranted}
          onPress={() => handleRequest('notifications')}
        />

        <PermissionCard
          title="Camera Access"
          desc="Required to capture live disaster footage."
          icon="📷"
          granted={cameraStatus?.granted}
          onPress={() => handleRequest('camera')}
        />

        <PermissionCard
          title="Photo Library"
          desc="Upload existing photos from your gallery."
          icon="🖼️"
          granted={photoStatus?.granted}
          onPress={() => handleRequest('photos')}
        />

        <TouchableOpacity
          style={[styles.continueButton, !allPermissionsGranted && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!allPermissionsGranted}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function PermissionCard({ title, desc, icon, granted, onPress }: any) {
  return (
    <View style={styles.permissionCard}>
      <View style={styles.permissionHeader}>
        <View style={styles.iconCircle}>
          <Text style={{ fontSize: 20 }}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.permissionTitle}>{title}</Text>
          <Text style={styles.permissionDescription}>{desc}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={[styles.allowButton, granted && styles.allowButtonGranted]}
        onPress={onPress}
        disabled={granted}
      >
        <Text style={[styles.allowButtonText, granted && styles.allowButtonTextGranted]}>
          {granted ? 'Allowed ✓' : 'Allow Access'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10 },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  backIcon: { fontSize: 36, color: '#1A202C', fontWeight: '300' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#1A202C' },
  headerSpacer: { width: 40 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: '#1A202C', marginTop: 10, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#718096', lineHeight: 21, marginBottom: 22 },
  permissionCard: { padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 12, backgroundColor: '#FFFFFF' },
  permissionHeader: { flexDirection: 'row', marginBottom: 14 },
  iconCircle: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EBF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  permissionTitle: { fontSize: 16, fontWeight: '700', color: '#1A202C' },
  permissionDescription: { fontSize: 13, color: '#718096', lineHeight: 18 },
  allowButton: { backgroundColor: '#2563EB', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  allowButtonGranted: { backgroundColor: '#E8F5E9' },
  allowButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  allowButtonTextGranted: { color: '#2E7D32' },
  continueButton: { backgroundColor: '#2563EB', borderRadius: 14, height: 54, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  continueButtonDisabled: { backgroundColor: '#CBD5E0', opacity: 0.7 },
  continueButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});