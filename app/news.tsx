import Navbar from '@/components/navbar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    Image,
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

const NEWS_DATA = [
    {
        id: '1',
        tag: 'RISING LEVEL',
        tagColor: '#C2410C',
        tagBg: '#FFF7ED',
        time: '10 mins ago',
        title: 'Critical Water Level at Guadalupe Bridge',
        desc: 'The Philippine Atmospheric, Geophysical and Astronomical Services Administration (PAGASA) has issued a Red Rainfall Warning for Guadalupe and surrounding areas. Extremely heavy rainfall (exceeding 30mm/hour) is expected to continue for the next 3 hours.',
        image: 'https://images.unsplash.com/photo-1545048702-79362596cdc9?w=400',
        category: 'Rising Level',
        location: 'Guadalupe Bridge, Cebu City'
    },
    {
        id: '2',
        tag: 'TRAFFIC ALERT',
        tagColor: '#EF4444',
        tagBg: '#FEF2F2',
        time: '45 mins ago',
        title: 'Main Highway Impassable Due to Severe Flooding',
        desc: 'The North Reclamation Area is currently inaccessible to light vehicles. Severe flooding has reached 2 feet in depth near major intersections. Traffic enforcers are rerouting vehicles.',
        image: 'https://images.unsplash.com/photo-1510443424121-7243c9451457?w=400',
        category: 'Traffic Alert',
        location: 'North Reclamation Area'
    },
    {
        id: '3',
        tag: 'RELIEF UPDATE',
        tagColor: '#2563EB',
        tagBg: '#EFF6FF',
        time: '2 hours ago',
        title: 'Relief Operations Underway in Mandaue City',
        desc: 'LGU teams and volunteers are currently distributing food packs and clean drinking water to displaced families. Evacuation centers have been established at the Mandaue Sports Complex.',
        image: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=400',
        category: 'Relief Update',
        location: 'Mandaue City'
    }
];

export default function NewsScreen() {
    const router = useRouter();
    const [selectedCategory, setSelectedCategory] = useState('All Updates');
    const [selectedNews, setSelectedNews] = useState<any>(null); // State for the selected news item
    const [modalVisible, setModalVisible] = useState(false);

    const categories = ['All Updates', 'Rising Level', 'Traffic Alert', 'Relief Update'];

    const filteredNews = selectedCategory === 'All Updates'
        ? NEWS_DATA
        : NEWS_DATA.filter(item => item.category === selectedCategory);

    const handleNewsPress = (item: any) => {
        setSelectedNews(item);
        setModalVisible(true);
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* News Header */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <View style={styles.logoRow}>
                        <MaterialCommunityIcons name="water-outline" size={24} color="#2563EB" />
                        <Text style={styles.headerTitle}>Flood News & Updates</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => router.push('/notifications')}
                    >
                        <Ionicons name="notifications-outline" size={24} color="#1E293B" />
                    </TouchableOpacity>
                </View>

                <View style={styles.searchContainer}>
                    <View style={styles.searchBar}>
                        <Ionicons name="search-outline" size={20} color="#94A3B8" />
                        <TextInput
                            placeholder="Search news and updates"
                            style={styles.searchInput}
                            placeholderTextColor="#94A3B8"
                        />
                    </View>
                    <TouchableOpacity style={styles.filterButton} onPress={() => Alert.alert("Filters", "Filter options coming soon!")}>
                        <Ionicons name="options-outline" size={20} color="#1E293B" />
                    </TouchableOpacity>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                    {categories.map((cat) => (
                        <TouchableOpacity
                            key={cat}
                            onPress={() => setSelectedCategory(cat)}
                            style={[styles.categoryBadge, selectedCategory === cat && styles.activeCategory]}
                        >
                            <Text style={[styles.categoryText, selectedCategory === cat && styles.activeCategoryText]}>
                                {cat}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* News List */}
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {filteredNews.length > 0 ? (
                    filteredNews.map((item) => (
                        <TouchableOpacity key={item.id} onPress={() => handleNewsPress(item)}>
                            <NewsItem
                                tag={item.tag}
                                tagColor={item.tagColor}
                                tagBg={item.tagBg}
                                time={item.time}
                                title={item.title}
                                desc={item.desc}
                                image={item.image}
                            />
                        </TouchableOpacity>
                    ))
                ) : (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No updates for this category yet.</Text>
                    </View>
                )}
            </ScrollView>

            {/* News Detail Modal (as seen in Notif Modal.png) */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHandle} />

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={styles.modalHeader}>
                                <View style={styles.warningIconCircle}>
                                    <Ionicons name="warning-outline" size={28} color="#EF4444" />
                                </View>
                                <View style={{ flex: 1, marginLeft: 15 }}>
                                    <Text style={styles.modalTitle}>{selectedNews?.title}</Text>
                                    <Text style={styles.modalSubtitle}>Today, {selectedNews?.time} • {selectedNews?.location}</Text>
                                </View>
                            </View>

                            <Text style={styles.modalDesc}>
                                {selectedNews?.desc}
                            </Text>

                            <View style={styles.affectedSection}>
                                <Text style={styles.affectedLabel}>AFFECTED LOCATION</Text>
                                <Text style={styles.affectedValue}>Radius: 5km around {selectedNews?.location}</Text>
                            </View>

                            <TouchableOpacity
                                style={styles.acknowledgeButton}
                                onPress={() => setModalVisible(false)}
                            >
                                <Text style={styles.acknowledgeText}>Acknowledge Alert</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.shareButton}>
                                <Ionicons name="share-outline" size={20} color="#1E293B" style={{ marginRight: 8 }} />
                                <Text style={styles.shareText}>Share Warning</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <Navbar />
        </SafeAreaView>
    );
}

// NewsItem Component
function NewsItem({ tag, tagColor, tagBg, time, title, desc, image }: any) {
    return (
        <View style={styles.newsCard}>
            <View style={styles.imageContainer}>
                <Image source={{ uri: image }} style={styles.newsImage} />
                <View style={[styles.newsTag, { backgroundColor: tagBg }]}>
                    <Text style={[styles.newsTagText, { color: tagColor }]}>{tag}</Text>
                </View>
            </View>
            <View style={styles.newsInfo}>
                <View style={styles.newsMeta}>
                    <Text style={styles.newsTime}>{time}</Text>
                    <Ionicons name="share-social-outline" size={18} color="#94A3B8" />
                </View>
                <Text style={styles.newsTitle}>{title}</Text>
                <Text style={styles.newsDesc} numberOfLines={2}>{desc}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },
    header: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 15 },
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
    iconButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    searchContainer: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 15, height: 48, borderWidth: 1, borderColor: '#F1F5F9' },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#1E293B' },
    filterButton: { width: 48, height: 48, backgroundColor: '#F8FAFC', borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    categoryScroll: { flexDirection: 'row' },
    categoryBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', marginRight: 10 },
    activeCategory: { backgroundColor: '#2563EB' },
    categoryText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
    activeCategoryText: { color: '#FFFFFF' },
    scrollContent: { padding: 20, paddingBottom: 120 },
    newsCard: { backgroundColor: '#FFFFFF', borderRadius: 20, marginBottom: 25, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9' },
    imageContainer: { width: '100%', height: 200, position: 'relative' },
    newsImage: { width: '100%', height: '100%' },
    newsTag: { position: 'absolute', top: 15, left: 15, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
    newsTagText: { fontSize: 10, fontWeight: '800' },
    newsInfo: { padding: 15 },
    newsMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    newsTime: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
    newsTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 8 },
    newsDesc: { fontSize: 14, color: '#64748B', lineHeight: 20 },
    emptyContainer: { alignItems: 'center', marginTop: 50 },
    emptyText: { color: '#94A3B8', fontSize: 16 },

    // Modal Styles based on Notif Modal.png
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, maxHeight: '80%' },
    modalHandle: { width: 40, height: 5, backgroundColor: '#E2E8F0', borderRadius: 10, alignSelf: 'center', marginBottom: 20 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    warningIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
    modalTitle: { fontSize: 22, fontWeight: '800', color: '#1E293B' },
    modalSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },
    modalDesc: { fontSize: 16, color: '#475569', lineHeight: 24, marginBottom: 25 },
    affectedSection: { marginBottom: 30 },
    affectedLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginBottom: 8 },
    affectedValue: { fontSize: 14, color: '#475569' },
    acknowledgeButton: { backgroundColor: '#2563EB', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginBottom: 12 },
    acknowledgeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    shareButton: { flexDirection: 'row', paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9' },
    shareText: { color: '#1E293B', fontSize: 16, fontWeight: '700' }
});