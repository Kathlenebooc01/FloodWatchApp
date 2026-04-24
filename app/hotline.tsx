import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    Linking,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Navbar from '../components/navbar'; // Make sure the path to your Navbar is correct

const REGIONAL_AGENCIES = [
    {
        name: "Cebu City Disaster Risk Reduction and Management Office",
        service: "Disaster Monitoring & Response",
        number: "0917-839-8292",
    },
    {
        name: "Bureau of Fire Protection (BFP) Region VII",
        service: "Fire & Rescue Services",
        number: "(032) 256-0544",
    },
    {
        name: "Philippine Red Cross - Cebu Chapter",
        service: "Medical & Blood Services",
        number: "(032) 253-4611",
    },
    {
        name: "Cebu City Police Office (CCPO)",
        service: "Law Enforcement & Safety",
        number: "166 / (032) 233-0202",
    },
    {
        name: "ERUF - Emergency Rescue Unit Foundation",
        service: "Paramedic & Ambulance",
        number: "161 / (032) 233-9300",
    }
];

export default function HotlineScreen() {
    const [searchQuery, setSearchQuery] = useState('');

    const makeCall = (number: string) => {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        Linking.openURL(`tel:${cleanNumber}`);
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Search Bar Area */}
            <View style={styles.searchSection}>
                <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color="#94A3B8" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search for an agency or service..."
                        placeholderTextColor="#94A3B8"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* PRIORITY SERVICES */}
                <Text style={styles.sectionLabel}>PRIORITY SERVICES</Text>
                <View style={styles.priorityCard}>
                    <View style={styles.priorityTextContent}>
                        <Text style={styles.priorityTitle}>National Emergency</Text>
                        <Text style={styles.prioritySubtitle}>Direct line to 911</Text>
                        <Text style={styles.priorityNumber}>911</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.priorityCallButton}
                        onPress={() => makeCall('911')}
                    >
                        <Ionicons name="call" size={24} color="white" />
                    </TouchableOpacity>
                </View>

                {/* REGIONAL AGENCIES */}
                <Text style={styles.sectionLabel}>REGIONAL AGENCIES</Text>
                {REGIONAL_AGENCIES.filter(agency =>
                    agency.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    agency.service.toLowerCase().includes(searchQuery.toLowerCase())
                ).map((agency, index) => (
                    <View key={index} style={styles.agencyCard}>
                        <View style={styles.agencyTextContent}>
                            <Text style={styles.agencyName}>{agency.name}</Text>
                            <Text style={styles.agencyService}>{agency.service}</Text>
                            <Text style={styles.agencyNumber}>{agency.number}</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.agencyCallButton}
                            onPress={() => makeCall(agency.number)}
                        >
                            <Ionicons name="call" size={20} color="white" />
                        </TouchableOpacity>
                    </View>
                ))}

                {/* Spacer so content doesn't get hidden behind the floating Navbar */}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* THE MISSING NAVBAR */}
            <Navbar />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    searchSection: {
        paddingTop: Platform.OS === 'android' ? 40 : 10,
        paddingHorizontal: 20,
        paddingBottom: 15,
        backgroundColor: '#FFFFFF',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        paddingHorizontal: 15,
        height: 50,
    },
    searchIcon: { marginRight: 10 },
    searchInput: { flex: 1, fontSize: 14, color: '#1E293B' },
    scrollContent: {
        padding: 20,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748B',
        letterSpacing: 0.5,
        marginBottom: 12,
        marginTop: 10,
    },
    priorityCard: {
        backgroundColor: '#FEF2F2',
        borderRadius: 16,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FEE2E2',
        marginBottom: 25,
    },
    priorityTextContent: { flex: 1 },
    priorityTitle: { fontSize: 16, fontWeight: '800', color: '#B91C1C' },
    prioritySubtitle: { fontSize: 12, color: '#EF4444', marginBottom: 8 },
    priorityNumber: { fontSize: 28, fontWeight: '900', color: '#B91C1C' },
    priorityCallButton: {
        backgroundColor: '#EF4444',
        width: 55,
        height: 55,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    agencyCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    agencyTextContent: { flex: 1, marginRight: 10 },
    agencyName: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
    agencyService: { fontSize: 11, color: '#64748B', marginBottom: 8 },
    agencyNumber: { fontSize: 16, fontWeight: '700', color: '#2563EB' },
    agencyCallButton: {
        backgroundColor: '#2563EB',
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    }
});