import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface BannerNotif {
    id: string;
    title: string;
    message: string;
    type: string;
}

function getBannerStyle(title: string, type: string) {
    const t = (title || '').toLowerCase();

    if (t.includes('verified') || t.includes('complete') || t.includes('resolved') || t.includes('approved')) {
        return {
            accent:   '#10B981',
            iconBg:   '#D1FAE5',
            iconColor:'#059669',
            icon:     'checkmark-circle' as const,
            tag:      'SUCCESS',
            tagBg:    '#ECFDF5',
            tagColor: '#059669',
        };
    }
    if (t.includes('failed') || t.includes('rejected') || t.includes('not accepted')) {
        return {
            accent:   '#EF4444',
            iconBg:   '#FEE2E2',
            iconColor:'#DC2626',
            icon:     'close-circle' as const,
            tag:      'ALERT',
            tagBg:    '#FEF2F2',
            tagColor: '#DC2626',
        };
    }
    if (t.includes('ongoing') || t.includes('progress') || t.includes('pending') || t.includes('review')) {
        return {
            accent:   '#F59E0B',
            iconBg:   '#FEF3C7',
            iconColor:'#D97706',
            icon:     'time' as const,
            tag:      'IN PROGRESS',
            tagBg:    '#FFFBEB',
            tagColor: '#D97706',
        };
    }
    if (type === 'Emergency' || t.includes('evacuation') || t.includes('flood') || t.includes('urgent')) {
        return {
            accent:   '#EF4444',
            iconBg:   '#FEE2E2',
            iconColor:'#DC2626',
            icon:     'alert-circle' as const,
            tag:      'EMERGENCY',
            tagBg:    '#FEF2F2',
            tagColor: '#DC2626',
        };
    }
    // Default — Updates/Info
    return {
        accent:   '#2563EB',
        iconBg:   '#EFF6FF',
        iconColor:'#2563EB',
        icon:     'notifications' as const,
        tag:      'NOTIFICATION',
        tagBg:    '#EFF6FF',
        tagColor: '#2563EB',
    };
}

export default function NotificationBanner() {
    const router     = useRouter();
    const [visible, setVisible] = useState(false);
    const [banner, setBanner]   = useState<BannerNotif | null>(null);
    const translateY = useRef(new Animated.Value(-220)).current;
    const hideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
    const shownIds   = useRef<Set<string>>(new Set());
    const userId     = useRef<string | null>(null);

    const hideBanner = useCallback(() => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        Animated.timing(translateY, {
            toValue: -220,
            duration: 300,
            useNativeDriver: true,
        }).start(() => setVisible(false));
    }, [translateY]);

    const showBanner = useCallback((notif: BannerNotif) => {
        if (shownIds.current.has(notif.id)) return;
        shownIds.current.add(notif.id);

        translateY.setValue(-220);
        setBanner(notif);
        setVisible(true);

        Animated.spring(translateY, {
            toValue: 0,
            tension: 60,
            friction: 10,
            useNativeDriver: true,
        }).start();

        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(hideBanner, 5000);
    }, [translateY, hideBanner]);

    const poll = useCallback(async () => {
        if (!userId.current) return;
        try {
            const since = new Date(Date.now() - 15000).toISOString();
            const { data } = await supabase
                .from('notifications')
                .select('id, title, message, type, target_role')
                .eq('user_id', userId.current)
                .eq('target_role', 'user')
                .gte('created_at', since)
                .order('created_at', { ascending: false })
                .limit(1);
            if (data && data.length > 0) {
                const row = data[0];
                showBanner({ id: row.id, title: row.title || 'New Notification', message: row.message || '', type: row.type || 'Updates' });
            }
        } catch (e) {}
    }, [showBanner]);

    useEffect(() => {
        let channel: any = null;
        let pollInterval: ReturnType<typeof setInterval> | null = null;

        const setup = async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            const uid = sessionData?.session?.user?.id;
            if (!uid) return;
            userId.current = uid;

            channel = supabase
                .channel(`notif-banner-${uid}`)
                .on('postgres_changes' as any, {
                    event: 'INSERT', schema: 'public',
                    table: 'notifications', filter: `user_id=eq.${uid}`,
                }, (payload: any) => {
                    const row = payload.new;
                    if (row.target_role && row.target_role !== 'user') return;
                    showBanner({ id: row.id, title: row.title || 'New Notification', message: row.message || '', type: row.type || 'Updates' });
                })
                .subscribe();

            pollInterval = setInterval(poll, 10000);
        };

        setup();
        return () => {
            if (channel) supabase.removeChannel(channel);
            if (pollInterval) clearInterval(pollInterval);
            if (hideTimer.current) clearTimeout(hideTimer.current);
        };
    }, [showBanner, poll]);

    const style = getBannerStyle(banner?.title || '', banner?.type || '');

    return (
        <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={hideBanner}>
            <View style={styles.overlay} pointerEvents="box-none">
                <Animated.View style={[styles.container, { transform: [{ translateY }] }]} pointerEvents="auto">
                    <TouchableOpacity
                        style={[styles.card, { borderLeftColor: style.accent }]}
                        activeOpacity={0.95}
                        onPress={() => { hideBanner(); router.push('/notifications' as any); }}
                    >
                        {/* Left accent bar is handled by borderLeft on card */}

                        <View style={[styles.iconCircle, { backgroundColor: style.iconBg }]}>
                            <Ionicons name={style.icon} size={26} color={style.iconColor} />
                        </View>

                        <View style={styles.textArea}>
                            {/* Tag pill */}
                            <View style={[styles.tagPill, { backgroundColor: style.tagBg }]}>
                                <Text style={[styles.tagText, { color: style.tagColor }]}>{style.tag}</Text>
                            </View>
                            <Text style={styles.title} numberOfLines={1}>{banner?.title}</Text>
                            <Text style={styles.message} numberOfLines={2}>{banner?.message}</Text>
                        </View>

                        <TouchableOpacity
                            style={styles.closeBtn}
                            onPress={hideBanner}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                            <Ionicons name="close" size={18} color="#94A3B8" />
                        </TouchableOpacity>
                    </TouchableOpacity>

                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    container: {
        position: 'absolute',
        top:      Platform.OS === 'ios' ? 52 : 42,
        left:     12,
        right:    12,
    },
    card: {
        flexDirection:    'row',
        alignItems:       'center',
        backgroundColor:  '#FFFFFF',
        borderRadius:     20,
        padding:          16,
        paddingLeft:      14,
        shadowColor:      '#000',
        shadowOffset:     { width: 0, height: 10 },
        shadowOpacity:    0.15,
        shadowRadius:     24,
        elevation:        20,
        borderWidth:      1,
        borderColor:      '#F1F5F9',
        borderLeftWidth:  4,
    },
    iconCircle: {
        width:          50,
        height:         50,
        borderRadius:   25,
        justifyContent: 'center',
        alignItems:     'center',
        marginRight:    14,
        flexShrink:     0,
    },
    textArea: {
        flex:        1,
        marginRight: 8,
    },
    tagPill: {
        alignSelf:       'flex-start',
        paddingHorizontal: 8,
        paddingVertical:  3,
        borderRadius:    20,
        marginBottom:    5,
    },
    tagText: {
        fontSize:   9,
        fontWeight: '900',
        letterSpacing: 0.8,
    },
    title: {
        fontSize:     14,
        fontWeight:   '800',
        color:        '#0F172A',
        marginBottom: 3,
        letterSpacing: -0.2,
    },
    message: {
        fontSize:   12,
        color:      '#64748B',
        lineHeight: 17,
    },
    closeBtn: {
        width:          28,
        height:         28,
        borderRadius:   14,
        backgroundColor: '#F8FAFC',
        justifyContent: 'center',
        alignItems:     'center',
        flexShrink:     0,
    },
    progressBg: {
        display: 'none',
    },
    progressBar: {
        display: 'none',
    },
});
