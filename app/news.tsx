import { SafeAreaView } from 'react-native-safe-area-context';
import Navbar from '@/components/navbar';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Image, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Modal, Animated, Dimensions, StatusBar, Switch, FlatList, RefreshControl, Linking } from 'react-native';
interface NewsItem {
    id: string;
    headline: string;
    tags: string[];
    cover_image: string | null;
    created_at: string;
    external_reference_link: string | null;
    detailed_content: string | null;
    profile_id: string;
    views: number;
}

export default function NewsScreen() {
    const router = useRouter();
    const [selectedCategory, setSelectedCategory] = useState('All Updates');
    const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [newsData, setNewsData] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const categories = ['All Updates', 'flood', 'weather', 'advisory', 'emergency'];
    const categoryLabels: Record<string, string> = {
        'All Updates': 'All Updates',
        'flood': 'Flood Alert',
        'weather': 'Weather Update',
        'advisory': 'Advisory',
        'emergency': 'Emergency'
    };

    // Fetch news from Supabase
    const fetchNews = async () => {
        try {
            const { data, error } = await supabase
                .from('news_board')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setNewsData(data || []);
        } catch (err: any) {
            console.error('❌ Error fetching news:', err);
            Alert.alert('Error', 'Failed to load news. Please try again.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchNews();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchNews();
    };

    const filteredNews = selectedCategory === 'All Updates'
        ? newsData
        : newsData.filter(item => {
            const allTags = item.tags ? item.tags.join(' ').toLowerCase() : '';
            return allTags.includes(selectedCategory.toLowerCase());
        });

    const handleNewsPress = (item: NewsItem) => {
        setSelectedNews(item);
        setModalVisible(true);
    };

    const getCategoryStyle = (category: string) => {
        const styles: Record<string, { color: string; bg: string }> = {
            flood: { color: '#C2410C', bg: '#FFF7ED' },
            weather: { color: '#2563EB', bg: '#EFF6FF' },
            advisory: { color: '#059669', bg: '#ECFDF5' },
            emergency: { color: '#EF4444', bg: '#FEF2F2' }
        };
        return styles[category] || { color: '#64748B', bg: '#F1F5F9' };
    };

    const getTimeAgo = (dateString: string) => {
        const now = new Date();
        const published = new Date(dateString);
        const diffMs = now.getTime() - published.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 60) return `${diffMins} mins ago`;
        if (diffHours < 24) return `${diffHours} hours ago`;
        return `${diffDays} days ago`;
    };

    const getCategoryFromTags = (tags: string[] | null) => {
        if (!tags || tags.length === 0) return 'advisory';
        const allTags = tags.join(' ').toLowerCase();
        if (allTags.includes('flood')) return 'flood';
        if (allTags.includes('weather')) return 'weather';
        if (allTags.includes('emergency')) return 'emergency';
        return 'advisory';
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
            <ScrollView 
                contentContainerStyle={styles.scrollContent} 
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#2563EB" />
                        <Text style={styles.loadingText}>Loading news...</Text>
                    </View>
                ) : filteredNews.length > 0 ? (
                    filteredNews.map((item) => {
                        const category = getCategoryFromTags(item.tags);
                        const categoryStyle = getCategoryStyle(category);
                        return (
                            <TouchableOpacity 
                                key={item.id} 
                                onPress={() => handleNewsPress(item)}
                                activeOpacity={0.7}
                            >
                                <NewsItemComponent
                                    tag={item.tags && item.tags.length > 0 ? item.tags.join(', ') : 'UPDATE'}
                                    tagColor={categoryStyle.color}
                                    tagBg={categoryStyle.bg}
                                    time={getTimeAgo(item.created_at)}
                                    title={item.headline}
                                    desc={item.detailed_content || item.headline}
                                    image={item.cover_image}
                                />
                            </TouchableOpacity>
                        );
                    })
                ) : (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="newspaper-outline" size={48} color="#CBD5E1" />
                        <Text style={styles.emptyText}>No updates for this category yet.</Text>
                    </View>
                )}
            </ScrollView>

            {/* News Detail Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {/* Close X Button */}
                        <TouchableOpacity 
                            style={styles.closeButton}
                            onPress={() => setModalVisible(false)}
                        >
                            <Ionicons name="close" size={24} color="#64748B" />
                        </TouchableOpacity>

                        <View style={styles.modalHandle} />

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Image */}
                            {selectedNews?.cover_image && (
                                <Image 
                                    source={{ uri: selectedNews.cover_image }} 
                                    style={styles.modalImage}
                                />
                            )}

                            {/* Header */}
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>{selectedNews?.headline}</Text>
                                <Text style={styles.modalSubtitle}>
                                    {selectedNews && getTimeAgo(selectedNews.created_at)} • Cebu City
                                </Text>
                            </View>

                            {/* Detailed Content */}
                            <Text style={styles.modalDesc}>
                                {selectedNews?.detailed_content || selectedNews?.headline}
                            </Text>

                            {/* Tags */}
                            {selectedNews?.tags && selectedNews.tags.length > 0 && (
                                <View style={styles.tagsSection}>
                                    <Text style={styles.tagsLabel}>TAGS</Text>
                                    <View style={styles.tagsContainer}>
                                        {selectedNews.tags.map((tag: string, index: number) => (
                                            <View key={index} style={styles.tagBadge}>
                                                <Text style={styles.tagText}>{tag}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}

                            {/* Reference Link */}
                            {selectedNews?.external_reference_link && (
                                <View style={styles.affectedSection}>
                                    <Text style={styles.affectedLabel}>REFERENCE LINK</Text>
                                    <Text style={styles.affectedValue} numberOfLines={2}>
                                        {selectedNews.external_reference_link}
                                    </Text>
                                </View>
                            )}

                            {/* Close Button */}
                            <TouchableOpacity
                                style={styles.acknowledgeButton}
                                onPress={() => setModalVisible(false)}
                            >
                                <Text style={styles.acknowledgeText}>Close</Text>
                            </TouchableOpacity>

                            {/* Share Button */}
                            <TouchableOpacity style={styles.shareButton}>
                                <Ionicons name="share-outline" size={20} color="#1E293B" style={{ marginRight: 8 }} />
                                <Text style={styles.shareText}>Share News</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <Navbar />
        </SafeAreaView>
    );
}

// NewsItemComponent
function NewsItemComponent({ tag, tagColor, tagBg, time, title, desc, image }: any) {
    const defaultImage = 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400';
    
    return (
        <View style={styles.newsCard}>
            <View style={styles.imageContainer}>
                <Image source={{ uri: image || defaultImage }} style={styles.newsImage} />
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
    newsCard: { 
        backgroundColor: '#FFFFFF', 
        borderRadius: 20, 
        marginBottom: 25, 
        overflow: 'hidden', 
        borderWidth: 1, 
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
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
    emptyText: { color: '#94A3B8', fontSize: 16, marginTop: 12 },
    loadingContainer: { alignItems: 'center', marginTop: 50 },
    loadingText: { color: '#94A3B8', fontSize: 14, marginTop: 12 },

    // Modal Styles based on Notif Modal.png
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, maxHeight: '90%', position: 'relative' },
    closeButton: { position: 'absolute', top: 20, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    modalHandle: { width: 40, height: 5, backgroundColor: '#E2E8F0', borderRadius: 10, alignSelf: 'center', marginBottom: 20 },
    modalImage: { width: '100%', height: 200, borderRadius: 16, marginBottom: 20 },
    modalHeader: { marginBottom: 20 },
    modalTitle: { fontSize: 22, fontWeight: '800', color: '#1E293B', marginBottom: 8 },
    modalSubtitle: { fontSize: 14, color: '#64748B' },
    modalDesc: { fontSize: 16, color: '#475569', lineHeight: 24, marginBottom: 25 },
    tagsSection: { marginBottom: 20 },
    tagsLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginBottom: 8 },
    tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tagBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE' },
    tagText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },
    affectedSection: { marginBottom: 25 },
    affectedLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginBottom: 8 },
    affectedValue: { fontSize: 14, color: '#475569' },
    acknowledgeButton: { backgroundColor: '#2563EB', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginBottom: 12 },
    acknowledgeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    shareButton: { flexDirection: 'row', paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 20 },
    shareText: { color: '#1E293B', fontSize: 16, fontWeight: '700' }
});
