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

export default function NotificationBanner() {
    const router   = useRouter();
    const [visible, setVisible] = useState(false);
    const [banner, setBanner]   = useState<BannerNotif | null>(null);
    const translateY = useRef(new Animated.Value(-200)).current;
    const hideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
    const shownIds   = useRef<Set<string>>(new Set());
    const userId     = useRef<string | null>(null);

    // ── Hide banner ──────────────────────────────────────────────────────────
    const hideBanner = useCallback(() => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        Animated.timing(translateY, {
            toValue: -200,
            duration: 280,
            useNativeDriver: true,
        }).start(() => {
            setVisible(false);
        });
    }, [translateY]);

    // ── Show banner ──────────────────────────────────────────────────────────
    const showBanner = useCallback((notif: BannerNotif) => {
        if (shownIds.current.has(notif.id)) return;
        shownIds.current.add(notif.id);

        translateY.setValue(-200);
        setBanner(notif);
        setVisible(true);

        Animated.spring(translateY, {
            toValue: 0,
            tension: 55,
            friction: 9,
            useNativeDriver: true,
        }).start();

        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(hideBanner, 5000);
    }, [translateY, hideBanner]);

    // ── Poll for new notifications every 10s as fallback ────────────────────
    const poll = useCallback(async () => {
        if (!userId.current) return;
        try {
            const since = new Date(Date.now() - 15000).toISOString(); // last 15s
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
                showBanner({
                    id:      row.id,
                    title:   row.title   || 'New Notification',
                    message: row.message || '',
                    type:    row.type    || 'Updates',
                });
            }
        } catch (e) {}
    }, [showBanner]);

    // ── Setup: get userId, realtime + polling ────────────────────────────────
    useEffect(() => {
        let channel: any = null;
        let pollInterval: ReturnType<typeof setInterval> | null = null;

        const setup = async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            const uid = sessionData?.session?.user?.id;
            if (!uid) return;
            userId.current = uid;

            // Real-time subscription
            channel = supabase
                .channel(`notif-banner-${uid}`)
                .on(
                    'postgres_changes' as any,
                    {
                        event:  'INSERT',
                        schema: 'public',
                        table:  'notifications',
                        filter: `user_id=eq.${uid}`,
                    },
                    (payload: any) => {
                        const row = payload.new;
                        if (row.target_role && row.target_role !== 'user') return;
                        console.log('🔔 Real-time banner:', row.title);
                        showBanner({
                            id:      row.id,
                            title:   row.title   || 'New Notification',
                            message: row.message || '',
                            type:    row.type    || 'Updates',
                        });
                    }
                )
                .subscribe((status: string) => {
                    console.log('📡 Banner channel:', status);
                });

            // Polling fallback every 10 seconds
            pollInterval = setInterval(poll, 10000);
        };

        setup();

        return () => {
            if (channel) supabase.removeChannel(channel);
            if (pollInterval) clearInterval(pollInterval);
            if (hideTimer.current) clearTimeout(hideTimer.current);
        };
    }, [showBanner, poll]);

    const isEmergency = banner?.type === 'Emergency';
    const iconName    = isEmergency ? 'alert-circle' : 'close-circle';
    const iconColor   = isEmergency ? '#EF4444' : '#EA580C';
    const iconBg      = isEmergency ? '#FEE2E2' : '#FED7AA';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={hideBanner}
        >
            <View style={styles.overlay} pointerEvents="box-none">
                <Animated.View
                    style={[styles.container, { transform: [{ translateY }] }]}
                    pointerEvents="auto"
                >
                    <TouchableOpacity
                        style={styles.card}
                        activeOpacity={0.92}
                        onPress={() => {
                            hideBanner();
                            router.push('/notifications' as any);
                        }}
                    >
                        <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
                            <Ionicons name={iconName as any} size={22} color={iconColor} />
                        </View>

                        <View style={styles.textArea}>
                            <Text style={styles.title} numberOfLines={1}>{banner?.title}</Text>
                            <Text style={styles.message} numberOfLines={2}>{banner?.message}</Text>
                        </View>

                        <TouchableOpacity
                            style={styles.closeBtn}
                            onPress={hideBanner}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                            <Ionicons name="close" size={16} color="#64748B" />
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
        top:      Platform.OS === 'ios' ? 54 : 44,
        left:     16,
        right:    16,
    },
    card: {
        flexDirection:   'row',
        alignItems:      'center',
        backgroundColor: '#FFFFFF',
        borderRadius:    18,
        padding:         14,
        shadowColor:     '#000',
        shadowOffset:    { width: 0, height: 8 },
        shadowOpacity:   0.2,
        shadowRadius:    20,
        elevation:       20,
        borderWidth:     1,
        borderColor:     '#E2E8F0',
    },
    iconCircle: {
        width:          44,
        height:         44,
        borderRadius:   22,
        justifyContent: 'center',
        alignItems:     'center',
        marginRight:    12,
        flexShrink:     0,
    },
    textArea: {
        flex:        1,
        marginRight: 8,
    },
    title: {
        fontSize:     14,
        fontWeight:   '800',
        color:        '#1E293B',
        marginBottom: 2,
    },
    message: {
        fontSize:   12,
        color:      '#64748B',
        lineHeight: 17,
    },
    closeBtn: {
        padding:    4,
        flexShrink: 0,
    },
});
